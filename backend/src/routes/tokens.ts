import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getPaymentProvider } from '../services/payment';
import { completeTokenPurchase, syncTokenPurchaseFromDb } from '../services/payment/fulfillment';
import { SUBSCRIPTION_PLANS, getSubscriptionPlan } from '../config/subscriptionPlans';

const router = express.Router();

// Token packages (tokens per dollar)
const TOKEN_PACKAGES = [
  { id: 'free', name: 'Free Test Pack', tokens: 50, price_cents: 0, original_price_cents: null }, // $0.00 for 50 tokens (free test - requires card)
  { id: 'test', name: 'Test Pack', tokens: 100, price_cents: 100, original_price_cents: null }, // $1.00 for 100 tokens (test package)
  { id: 'small', name: 'Starter Pack', tokens: 1000, price_cents: 999, original_price_cents: null }, // $9.99 for 1000 tokens
  { id: 'medium', name: 'Standard Pack', tokens: 2500, price_cents: 1999, original_price_cents: 2499 }, // $19.99 for 2500 tokens (was $24.99)
  { id: 'large', name: 'Power Pack', tokens: 5000, price_cents: 3499, original_price_cents: 4999 }, // $34.99 for 5000 tokens (was $49.99)
  { id: 'xlarge', name: 'Ultra Pack', tokens: 10000, price_cents: 5999, original_price_cents: 9999 }, // $59.99 for 10000 tokens (was $99.99)
];

// Get available token packages (with optional auth for member discount)
router.get('/packages', async (req, res) => {
  try {
    let packages = [...TOKEN_PACKAGES];
    let isMember = false;

    // Check if user is authenticated and has active subscription
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || '';
        if (JWT_SECRET) {
          const token = authHeader.substring(7);
          const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
          const userId = decoded.userId;

          // Check if user has active subscription (member/VIP status)
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

          isMember = subscription && 
                     subscription.current_period_end && 
                     new Date(subscription.current_period_end) > new Date();
        }
      } catch (err) {
        // Invalid token, continue without discount
      }
    }

    // Apply 25% discount for members
    if (isMember) {
      packages = packages.map(pkg => {
        const discountedPrice = Math.round(pkg.price_cents * 0.75); // 25% off
        return {
          ...pkg,
          original_price_cents: pkg.price_cents,
          price_cents: discountedPrice,
        };
      });
    }

    res.json({ packages, isMember });
  } catch (error) {
    console.error('Get packages error:', error);
    // Fallback to regular packages if error
    res.json({ packages: TOKEN_PACKAGES, isMember: false });
  }
});

// Purchase tokens (simplified - in production, integrate with Stripe)
const purchaseTokensSchema = z.object({
  package_id: z.string(),
  affiliate_code: z.string().optional(),
});

// Create Stripe payment intent for token purchase
router.post('/purchase', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const validated = purchaseTokensSchema.parse(req.body);
    const userId = req.userId!;

    // Find the package
    let tokenPackage = TOKEN_PACKAGES.find(pkg => pkg.id === validated.package_id);
    if (!tokenPackage) {
      return res.status(400).json({ error: 'Invalid package ID' });
    }

    // Check if user has active subscription (member/VIP status)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const isMember = subscription && 
                     subscription.current_period_end && 
                     new Date(subscription.current_period_end) > new Date();

    // Apply 25% discount for members
    if (isMember) {
      tokenPackage = {
        ...tokenPackage,
        original_price_cents: tokenPackage.price_cents,
        price_cents: Math.round(tokenPackage.price_cents * 0.75), // 25% off
      };
    }

    // Get current user balance and affiliate referral
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('token_balance, email, referred_by_affiliate_id, has_used_first_purchase_discount')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // Handle manually entered affiliate code
    let affiliateId = user.referred_by_affiliate_id || null;
    if (validated.affiliate_code && validated.affiliate_code.trim()) {
      // Look up affiliate by code
      const { data: affiliate, error: affiliateError } = await supabase
        .from('affiliates')
        .select('id, status')
        .eq('affiliate_code', validated.affiliate_code.trim().toUpperCase())
        .eq('status', 'approved')
        .maybeSingle();

      if (!affiliateError && affiliate) {
        // If user doesn't have an affiliate yet, link them
        if (!user.referred_by_affiliate_id) {
          await supabase
            .from('users')
            .update({ referred_by_affiliate_id: affiliate.id })
            .eq('id', userId);
          affiliateId = affiliate.id;
        } else {
          // User already has an affiliate, use the manually entered one for this purchase only
          affiliateId = affiliate.id;
        }
      }
    }

    // Check if user is eligible for 10% first purchase discount
    const isEligibleForFirstPurchaseDiscount = 
      affiliateId && 
      !user.has_used_first_purchase_discount;

    // Apply 10% discount for first purchase if eligible
    if (isEligibleForFirstPurchaseDiscount) {
      tokenPackage = {
        ...tokenPackage,
        original_price_cents: tokenPackage.price_cents,
        price_cents: Math.round(tokenPackage.price_cents * 0.9), // 10% off
      };
    }

    // Create a pending purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('token_purchases')
      .insert({
        user_id: userId,
        amount_paid_cents: tokenPackage.price_cents,
        tokens_purchased: tokenPackage.tokens,
        status: 'pending',
        affiliate_id: affiliateId,
      })
      .select()
      .single();

    if (purchaseError || !purchase) {
      console.error('Error creating purchase record:', purchaseError);
      console.error('Purchase error details:', JSON.stringify(purchaseError, null, 2));
      
      // Check if table doesn't exist
      if (purchaseError?.code === '42P01' || purchaseError?.message?.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Database table not found. Please run the token_purchases migration.',
          details: 'The token_purchases table does not exist. Run migration 002_token_purchases.sql in your Supabase SQL editor.'
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to create purchase record',
        details: purchaseError?.message || 'Unknown database error'
      });
    }

    const provider = getPaymentProvider();

    if (!provider.isConfigured()) {
      await supabase.from('token_purchases').update({ status: 'failed' }).eq('id', purchase.id);
      return res.status(500).json({
        error: 'Payment system not configured. Please contact support.',
      });
    }

    // Free packs: fulfill immediately without redirect
    if (tokenPackage.price_cents === 0) {
      await completeTokenPurchase({
        purchaseId: purchase.id,
        userId,
        tokens: tokenPackage.tokens,
        amountCents: 0,
        providerTransactionId: `free-${purchase.id}`,
      });
      const { data: updatedUser } = await supabase
        .from('users')
        .select('token_balance')
        .eq('id', userId)
        .single();
      return res.json({
        checkoutUrl: null,
        purchaseId: purchase.id,
        package: tokenPackage,
        currentBalance: updatedUser?.token_balance ?? user.token_balance,
        completed: true,
      });
    }

    try {
      const { data: userEmailRow } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

      const checkout = await provider.createTokenCheckout({
        purchaseId: purchase.id,
        userId,
        userEmail: userEmailRow?.email || '',
        amountCents: tokenPackage.price_cents,
        tokens: tokenPackage.tokens,
        packageId: validated.package_id,
        packageName: tokenPackage.name,
      });

      await supabase
        .from('token_purchases')
        .update({
          provider: 'nowpayments',
          provider_transaction_id: checkout.providerTransactionId || `pending-${purchase.id}`,
        })
        .eq('id', purchase.id);

      res.json({
        checkoutUrl: checkout.checkoutUrl,
        purchaseId: purchase.id,
        package: tokenPackage,
        currentBalance: user.token_balance,
      });
    } catch (paymentError: any) {
      console.error('Payment checkout error:', paymentError);
      await supabase.from('token_purchases').update({ status: 'failed' }).eq('id', purchase.id);
      return res.status(500).json({
        error: 'Failed to start checkout',
        details: paymentError.message,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Purchase tokens error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's current token balance
router.get('/balance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: user, error } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(500).json({ error: 'Failed to fetch token balance' });
    }

    res.json({ balance: user.token_balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/purchase/:purchaseId/sync', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { purchaseId } = req.params;
    const userId = req.userId!;

    const { data: purchase } = await supabase
      .from('token_purchases')
      .select('*')
      .eq('id', purchaseId)
      .eq('user_id', userId)
      .single();

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.status === 'completed') {
      const { data: user } = await supabase
        .from('users')
        .select('token_balance')
        .eq('id', userId)
        .single();
      return res.json({
        message: 'Purchase already completed',
        purchase,
        currentBalance: user?.token_balance || 0,
      });
    }

    const synced = await syncTokenPurchaseFromDb(purchaseId, userId);
    if (!synced && purchase.amount_paid_cents > 0) {
      return res.status(400).json({
        error: 'Payment not confirmed yet. Crypto payments can take a few minutes to confirm.',
        status: purchase.status,
      });
    }

    const { data: updatedPurchase } = await supabase
      .from('token_purchases')
      .select('*')
      .eq('id', purchaseId)
      .single();
    const { data: user } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();

    res.json({
      message: 'Purchase synced successfully',
      purchase: updatedPurchase,
      currentBalance: user?.token_balance || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Check purchase status and sync if needed (called from frontend after payment)
router.get('/purchase/:purchaseId/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { purchaseId } = req.params;
    const userId = req.userId!;

    // Get purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('token_purchases')
      .select('*')
      .eq('id', purchaseId)
      .eq('user_id', userId)
      .single();

    if (purchaseError || !purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // If already completed, return status
    if (purchase.status === 'completed') {
      const { data: user } = await supabase
        .from('users')
        .select('token_balance')
        .eq('id', userId)
        .single();

      return res.json({
        status: 'completed',
        purchase,
        balance: user?.token_balance || 0,
      });
    }

    if (purchase.status === 'pending') {
      const synced = await syncTokenPurchaseFromDb(purchaseId, userId);
      if (synced) {
        const { data: updatedPurchase } = await supabase
          .from('token_purchases')
          .select('*')
          .eq('id', purchaseId)
          .single();
        const { data: user } = await supabase
          .from('users')
          .select('token_balance')
          .eq('id', userId)
          .single();
        return res.json({
          status: 'completed',
          purchase: updatedPurchase,
          balance: user?.token_balance || 0,
          synced: true,
        });
      }
    }

    res.json({
      status: purchase.status,
      purchase,
    });
  } catch (error: any) {
    console.error('Get purchase status error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Subscription routes

// Get available subscription plans
router.get('/subscriptions/plans', (req, res) => {
  res.json({ plans: SUBSCRIPTION_PLANS });
});

// Create subscription checkout session
const createSubscriptionSchema = z.object({
  plan_id: z.string(),
});

router.post('/subscriptions/create', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const validated = createSubscriptionSchema.parse(req.body);
    const userId = req.userId!;

    // Find the plan
    const plan = getSubscriptionPlan(validated.plan_id);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Get user email and affiliate referral
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, referred_by_affiliate_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // Check if user already has an active subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (existingSubscription) {
      return res.status(400).json({ 
        error: 'You already have an active subscription',
        subscriptionId: existingSubscription.id
      });
    }

    const provider = getPaymentProvider();
    if (!provider.isConfigured()) {
      return res.status(500).json({ error: 'Payment system not configured. Please contact support.' });
    }

    try {
      const checkout = await provider.createSubscriptionCheckout({
        userId,
        userEmail: user.email,
        planId: plan.id,
        planName: plan.name,
        amountCents: plan.price_cents,
        tokens: plan.tokens,
      });

      res.json({
        url: checkout.checkoutUrl,
        plan: {
          id: plan.id,
          name: plan.name,
          tokens: plan.tokens,
          price_cents: plan.price_cents,
        },
      });
    } catch (paymentError: any) {
      console.error('Subscription checkout error:', paymentError);
      return res.status(500).json({
        error: 'Failed to create subscription checkout',
        details: paymentError.message,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Create subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subscription status
router.get('/subscriptions/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching subscription:', error);
      return res.status(500).json({ error: 'Failed to fetch subscription status' });
    }

    if (!subscription) {
      return res.json({ subscription: null });
    }

    // Check if subscription is still active based on period end
    const isActive = subscription.status === 'active' && 
                     (subscription as any).current_period_end && 
                     new Date((subscription as any).current_period_end) > new Date();

    res.json({ 
      subscription: {
        ...subscription,
        isActive,
      }
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync subscription after return from NOWPayments (if IPN is delayed)
router.post('/subscriptions/sync', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const planId = (req.body.planId || req.body.plan_id) as string | undefined;

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription?.status === 'active') {
      const { data: user } = await supabase
        .from('users')
        .select('token_balance')
        .eq('id', userId)
        .single();
      return res.json({
        success: true,
        message: 'Subscription is active.',
        subscription,
        newBalance: user?.token_balance,
      });
    }

    const plan = planId ? getSubscriptionPlan(planId) : null;
    if (!plan) {
      return res.status(400).json({
        error:
          'Subscription not active yet. Wait a moment for crypto payment confirmation.',
      });
    }

    return res.json({
      success: false,
      message:
        'Payment is still processing. Tokens will be added when NOWPayments confirms payment.',
      planId,
    });
  } catch (error: any) {
    console.error('Sync subscription error:', error);
    res.status(500).json({ error: 'Failed to sync subscription', details: error.message });
  }
});

// Cancel subscription
router.post('/subscriptions/cancel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get active subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel at period end in app (user can re-subscribe each month via crypto invoice)
    await supabase
      .from('subscriptions')
      .update({ 
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    res.json({
      message:
        'Subscription will end at the close of your current billing period.',
      subscription: {
        ...subscription,
        cancel_at_period_end: true,
      }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SECURITY: Free token endpoint removed - this was a critical vulnerability
// If you need to add tokens for testing, use the admin endpoint instead
// This endpoint allowed any authenticated user to add unlimited tokens

export default router;
