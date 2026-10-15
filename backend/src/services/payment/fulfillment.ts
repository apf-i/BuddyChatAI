import { supabase } from '../../db/supabase';
import { sendPaymentConfirmationEmail } from '../email';
import { getSubscriptionPlan } from '../../config/subscriptionPlans';
import type { SubscriptionIpnPayload, TokenPurchaseIpnPayload } from './types';

export async function completeTokenPurchase(payload: TokenPurchaseIpnPayload): Promise<boolean> {
  const { purchaseId, userId, tokens, amountCents, providerTransactionId } = payload;

  const { data: existingPurchase } = await supabase
    .from('token_purchases')
    .select('status, tokens_purchased, affiliate_id, amount_paid_cents')
    .eq('id', purchaseId)
    .single();

  if (existingPurchase?.status === 'completed') {
    console.log(`Purchase ${purchaseId} already completed`);
    return true;
  }

  const { data: purchase, error: purchaseFetchError } = await supabase
    .from('token_purchases')
    .select('affiliate_id, amount_paid_cents')
    .eq('id', purchaseId)
    .single();

  if (purchaseFetchError) {
    console.error('Error fetching purchase:', purchaseFetchError);
    return false;
  }

  await supabase
    .from('token_purchases')
    .update({
      status: 'completed',
      provider: 'nowpayments',
      provider_transaction_id: providerTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseId);

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('token_balance, has_used_first_purchase_discount, referred_by_affiliate_id')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    console.error('Error fetching user:', userError);
    return false;
  }

  const newBalance = user.token_balance + tokens;
  const updateData: Record<string, unknown> = { token_balance: newBalance };
  if (user.referred_by_affiliate_id && !user.has_used_first_purchase_discount) {
    updateData.has_used_first_purchase_discount = true;
  }

  const { error: updateBalanceError } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId);

  if (updateBalanceError) {
    console.error('Error updating token balance:', updateBalanceError);
    return false;
  }

  const { data: userData } = await supabase.from('users').select('email').eq('id', userId).single();
  if (userData?.email) {
    await sendPaymentConfirmationEmail(userData.email, amountCents, tokens);
  }

  const affiliateId = purchase?.affiliate_id;
  const paidCents = purchase?.amount_paid_cents ?? amountCents;
  if (affiliateId && paidCents) {
    await createAffiliateCommission({
      affiliateId,
      userId,
      purchaseId,
      purchaseType: 'token_package',
      amountCents: paidCents,
    });
  }

  console.log(`Token purchase completed: +${tokens} for user ${userId}`);
  return true;
}

export async function failTokenPurchase(purchaseId: string, providerTransactionId?: string): Promise<void> {
  await supabase
    .from('token_purchases')
    .update({
      status: 'failed',
      provider: 'nowpayments',
      ...(providerTransactionId ? { provider_transaction_id: providerTransactionId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseId);
}

async function createAffiliateCommission(params: {
  affiliateId: string;
  userId: string;
  purchaseId: string;
  purchaseType: 'token_package' | 'subscription';
  amountCents: number;
}): Promise<void> {
  try {
    const commissionCents = Math.floor(params.amountCents * 0.25);
    const { error: commissionError } = await supabase.from('affiliate_commissions').insert({
      affiliate_id: params.affiliateId,
      referred_user_id: params.userId,
      purchase_type: params.purchaseType,
      purchase_id: params.purchaseId,
      purchase_amount_cents: params.amountCents,
      commission_cents: commissionCents,
      status: 'pending',
    });

    if (commissionError) {
      console.error('Error creating affiliate commission:', commissionError);
      return;
    }

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('total_earnings_cents, pending_balance_cents')
      .eq('id', params.affiliateId)
      .single();

    if (affiliate) {
      await supabase
        .from('affiliates')
        .update({
          total_earnings_cents: (affiliate.total_earnings_cents || 0) + commissionCents,
          pending_balance_cents: (affiliate.pending_balance_cents || 0) + commissionCents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.affiliateId);
    }
  } catch (err) {
    console.error('Affiliate commission error:', err);
  }
}

export async function activateOrRenewSubscription(payload: SubscriptionIpnPayload): Promise<void> {
  const {
    userId,
    planId,
    tokens,
    priceCents,
    providerSubscriptionId,
    providerCustomerId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    isRenewal,
  } = payload;

  const { data: user } = await supabase
    .from('users')
    .select('referred_by_affiliate_id, token_balance')
    .eq('id', userId)
    .single();

  const subscriptionData = {
    user_id: userId,
    provider: 'nowpayments',
    provider_subscription_id: providerSubscriptionId,
    provider_customer_id: providerCustomerId || null,
    stripe_subscription_id: providerSubscriptionId,
    stripe_customer_id: providerCustomerId || null,
    status,
    monthly_price_cents: priceCents,
    monthly_tokens: tokens,
    current_period_start: currentPeriodStart || new Date().toISOString(),
    current_period_end:
      currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: false,
    affiliate_id: user?.referred_by_affiliate_id || null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('provider_subscription_id', providerSubscriptionId)
    .maybeSingle();

  let subscriptionRecordId: string;
  if (existing) {
    await supabase.from('subscriptions').update(subscriptionData).eq('id', existing.id);
    subscriptionRecordId = existing.id;
  } else {
    const { data: newSub } = await supabase
      .from('subscriptions')
      .insert(subscriptionData)
      .select('id')
      .single();
    subscriptionRecordId = newSub?.id || '';
  }

  if ((status === 'active' || status === 'trialing') && user && tokens > 0) {
    const newBalance = user.token_balance + tokens;
    await supabase.from('users').update({ token_balance: newBalance }).eq('id', userId);
    console.log(`Subscription ${isRenewal ? 'renewal' : 'start'}: +${tokens} tokens for ${userId}`);
  }

  if (!isRenewal && user?.referred_by_affiliate_id && priceCents > 0 && subscriptionRecordId) {
    await createAffiliateCommission({
      affiliateId: user.referred_by_affiliate_id,
      userId,
      purchaseId: subscriptionRecordId,
      purchaseType: 'subscription',
      amountCents: priceCents,
    });
  } else if (isRenewal && subscriptionRecordId) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('affiliate_id, monthly_price_cents')
      .eq('id', subscriptionRecordId)
      .single();
    if (sub?.affiliate_id && sub.monthly_price_cents) {
      await createAffiliateCommission({
        affiliateId: sub.affiliate_id,
        userId,
        purchaseId: subscriptionRecordId,
        purchaseType: 'subscription',
        amountCents: sub.monthly_price_cents,
      });
    }
  }
}

export async function cancelSubscriptionByProviderId(providerSubscriptionId: string): Promise<void> {
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq('provider_subscription_id', providerSubscriptionId);
}

export async function syncTokenPurchaseFromDb(purchaseId: string, userId: string): Promise<boolean> {
  const { data: purchase } = await supabase
    .from('token_purchases')
    .select('*')
    .eq('id', purchaseId)
    .eq('user_id', userId)
    .single();

  if (!purchase || purchase.status === 'completed') {
    return purchase?.status === 'completed';
  }

  if (purchase.amount_paid_cents === 0) {
    return completeTokenPurchase({
      purchaseId,
      userId,
      tokens: purchase.tokens_purchased,
      amountCents: 0,
      providerTransactionId: purchase.provider_transaction_id || `free-${purchaseId}`,
    });
  }

  if (purchase.provider === 'nowpayments') {
    try {
      const { getPaymentsByOrderId } = await import('./nowpayments');
      const payments = await getPaymentsByOrderId(purchaseId);
      const paid = payments.find((p) => ['finished', 'confirmed'].includes(p.payment_status));
      if (paid) {
        return completeTokenPurchase({
          purchaseId,
          userId,
          tokens: purchase.tokens_purchased,
          amountCents: purchase.amount_paid_cents,
          providerTransactionId: String(paid.payment_id || purchase.provider_transaction_id || purchaseId),
        });
      }
    } catch (err) {
      console.warn('NOWPayments status sync failed:', err);
    }
  }

  return false;
}

export function resolvePlanFromId(planId: string) {
  return getSubscriptionPlan(planId);
}
