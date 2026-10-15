import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Generate unique affiliate code
function generateAffiliateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, I, 1
  let code = 'AFF-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Apply for affiliate program
router.post('/apply', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check if user already has an affiliate account
    const { data: existing } = await supabase
      .from('affiliates')
      .select('id, status, affiliate_code')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: 'You already have an affiliate account',
        affiliate: {
          code: existing.affiliate_code,
          status: existing.status,
        },
      });
    }

    // Generate unique affiliate code
    let affiliateCode: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      affiliateCode = generateAffiliateCode();
      const { data: check } = await supabase
        .from('affiliates')
        .select('id')
        .eq('affiliate_code', affiliateCode)
        .maybeSingle();

      if (!check) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate unique affiliate code' });
    }

    // Create affiliate record
    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .insert({
        user_id: userId,
        affiliate_code: affiliateCode!,
        status: 'pending',
      })
      .select('id, affiliate_code, status, created_at')
      .single();

    if (error) {
      console.error('Error creating affiliate:', error);
      return res.status(500).json({ error: 'Failed to create affiliate account' });
    }

    res.status(201).json({
      message: 'Affiliate application submitted successfully',
      affiliate: {
        code: affiliate.affiliate_code,
        status: affiliate.status,
        createdAt: affiliate.created_at,
      },
    });
  } catch (error) {
    console.error('Apply for affiliate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get affiliate status
router.get('/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching affiliate status:', error);
      return res.status(500).json({ error: 'Failed to fetch affiliate status' });
    }

    if (!affiliate) {
      return res.json({ affiliate: null });
    }

    res.json({
      affiliate: {
        id: affiliate.id,
        code: affiliate.affiliate_code,
        status: affiliate.status,
        totalEarningsCents: affiliate.total_earnings_cents || 0,
        paidOutCents: affiliate.paid_out_cents || 0,
        pendingBalanceCents: affiliate.pending_balance_cents || 0,
        referralCount: affiliate.referral_count || 0,
        createdAt: affiliate.created_at,
        approvedAt: affiliate.approved_at,
        rejectedAt: affiliate.rejected_at,
        rejectionReason: affiliate.rejection_reason,
      },
    });
  } catch (error) {
    console.error('Get affiliate status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get affiliate dashboard data
router.get('/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get affiliate record
    const { data: affiliate, error: affiliateError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (affiliateError || !affiliate) {
      return res.status(404).json({ error: 'Affiliate account not found' });
    }

    if (affiliate.status !== 'approved') {
      return res.status(403).json({
        error: 'Your affiliate account is not approved yet',
        status: affiliate.status,
      });
    }

    // Get recent commissions
    const { data: commissions, error: commissionsError } = await supabase
      .from('affiliate_commissions')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (commissionsError) {
      console.error('Error fetching commissions:', commissionsError);
    }

    // Get affiliate link
    const affiliateLink = `${FRONTEND_URL}?ref=${affiliate.affiliate_code}`;

    res.json({
      affiliate: {
        code: affiliate.affiliate_code,
        link: affiliateLink,
        totalEarningsCents: affiliate.total_earnings_cents || 0,
        paidOutCents: affiliate.paid_out_cents || 0,
        pendingBalanceCents: affiliate.pending_balance_cents || 0,
        referralCount: affiliate.referral_count || 0,
      },
      commissions: (commissions || []).map((c) => ({
        id: c.id,
        purchaseType: c.purchase_type,
        purchaseAmountCents: c.purchase_amount_cents,
        commissionCents: c.commission_cents,
        status: c.status,
        createdAt: c.created_at,
        paidAt: c.paid_at,
      })),
    });
  } catch (error) {
    console.error('Get affiliate dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get affiliate link
router.get('/link', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .select('affiliate_code, status')
      .eq('user_id', userId)
      .single();

    if (error || !affiliate) {
      return res.status(404).json({ error: 'Affiliate account not found' });
    }

    if (affiliate.status !== 'approved') {
      return res.status(403).json({
        error: 'Your affiliate account is not approved yet',
        status: affiliate.status,
      });
    }

    const affiliateLink = `${FRONTEND_URL}?ref=${affiliate.affiliate_code}`;

    res.json({ link: affiliateLink });
  } catch (error) {
    console.error('Get affiliate link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: List all affiliates
router.get('/admin/all', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { data: affiliates, error } = await supabase
      .from('affiliates')
      .select(`
        *,
        users!affiliates_user_id_fkey(id, email, username)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching affiliates:', error);
      return res.status(500).json({ error: 'Failed to fetch affiliates' });
    }

    res.json({
      affiliates: (affiliates || []).map((aff) => ({
        id: aff.id,
        userId: aff.user_id,
        userEmail: (aff.users as any)?.email || null,
        username: (aff.users as any)?.username || null,
        code: aff.affiliate_code,
        status: aff.status,
        totalEarningsCents: aff.total_earnings_cents || 0,
        paidOutCents: aff.paid_out_cents || 0,
        pendingBalanceCents: aff.pending_balance_cents || 0,
        referralCount: aff.referral_count || 0,
        createdAt: aff.created_at,
        approvedAt: aff.approved_at,
        rejectedAt: aff.rejected_at,
        rejectionReason: aff.rejection_reason,
      })),
    });
  } catch (error) {
    console.error('Admin list affiliates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Approve affiliate
router.post('/admin/:affiliateId/approve', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { affiliateId } = req.params;

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        rejected_at: null,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', affiliateId)
      .select()
      .single();

    if (error || !affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    res.json({
      message: 'Affiliate approved successfully',
      affiliate: {
        id: affiliate.id,
        code: affiliate.affiliate_code,
        status: affiliate.status,
      },
    });
  } catch (error) {
    console.error('Approve affiliate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Reject affiliate
const rejectAffiliateSchema = z.object({
  reason: z.string().optional(),
});

router.post('/admin/:affiliateId/reject', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { affiliateId } = req.params;
    const validated = rejectAffiliateSchema.parse(req.body);

    const { data: affiliate, error } = await supabase
      .from('affiliates')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: validated.reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', affiliateId)
      .select()
      .single();

    if (error || !affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    res.json({
      message: 'Affiliate rejected',
      affiliate: {
        id: affiliate.id,
        code: affiliate.affiliate_code,
        status: affiliate.status,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Reject affiliate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Payout to affiliate
const payoutSchema = z.object({
  amount_cents: z.number().int().positive(),
  commission_ids: z.array(z.string().uuid()).optional(),
});

router.post('/admin/:affiliateId/payout', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { affiliateId } = req.params;
    const validated = payoutSchema.parse(req.body);

    // Get affiliate
    const { data: affiliate, error: affiliateError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('id', affiliateId)
      .single();

    if (affiliateError || !affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    // Validate payout amount doesn't exceed pending balance
    if (validated.amount_cents > (affiliate.pending_balance_cents || 0)) {
      return res.status(400).json({
        error: 'Payout amount exceeds pending balance',
        pendingBalanceCents: affiliate.pending_balance_cents || 0,
      });
    }

    // Update commissions if specific IDs provided
    if (validated.commission_ids && validated.commission_ids.length > 0) {
      const { error: updateError } = await supabase
        .from('affiliate_commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('affiliate_id', affiliateId)
        .in('id', validated.commission_ids)
        .eq('status', 'pending');

      if (updateError) {
        console.error('Error updating commissions:', updateError);
        return res.status(500).json({ error: 'Failed to update commissions' });
      }
    } else {
      // Mark all pending commissions as paid (up to the payout amount)
      // This is a simplified approach - in production, you might want more granular control
      const { data: pendingCommissions } = await supabase
        .from('affiliate_commissions')
        .select('id, commission_cents')
        .eq('affiliate_id', affiliateId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (pendingCommissions) {
        let remainingAmount = validated.amount_cents;
        const commissionIdsToPay: string[] = [];

        for (const commission of pendingCommissions) {
          if (remainingAmount >= commission.commission_cents) {
            commissionIdsToPay.push(commission.id);
            remainingAmount -= commission.commission_cents;
          } else {
            break;
          }
        }

        if (commissionIdsToPay.length > 0) {
          const { error: updateError } = await supabase
            .from('affiliate_commissions')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .in('id', commissionIdsToPay);

          if (updateError) {
            console.error('Error updating commissions:', updateError);
            return res.status(500).json({ error: 'Failed to update commissions' });
          }
        }
      }
    }

    // Update affiliate balances
    const newPaidOut = (affiliate.paid_out_cents || 0) + validated.amount_cents;
    const newPending = (affiliate.pending_balance_cents || 0) - validated.amount_cents;

    const { error: updateError } = await supabase
      .from('affiliates')
      .update({
        paid_out_cents: newPaidOut,
        pending_balance_cents: newPending,
        updated_at: new Date().toISOString(),
      })
      .eq('id', affiliateId);

    if (updateError) {
      console.error('Error updating affiliate balances:', updateError);
      return res.status(500).json({ error: 'Failed to update affiliate balances' });
    }

    res.json({
      message: 'Payout processed successfully',
      payout: {
        amountCents: validated.amount_cents,
        newPaidOutCents: newPaidOut,
        newPendingBalanceCents: newPending,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Payout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get affiliate details with commissions
router.get('/admin/:affiliateId', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { affiliateId } = req.params;

    const { data: affiliate, error: affiliateError } = await supabase
      .from('affiliates')
      .select(`
        *,
        users!affiliates_user_id_fkey(id, email, username)
      `)
      .eq('id', affiliateId)
      .single();

    if (affiliateError || !affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    // Get all commissions
    const { data: commissions, error: commissionsError } = await supabase
      .from('affiliate_commissions')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (commissionsError) {
      console.error('Error fetching commissions:', commissionsError);
    }

    // Get referrals
    const { data: referrals, error: referralsError } = await supabase
      .from('affiliate_referrals')
      .select(`
        *,
        users!affiliate_referrals_referred_user_id_fkey(id, email, username, created_at)
      `)
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (referralsError) {
      console.error('Error fetching referrals:', referralsError);
    }

    res.json({
      affiliate: {
        id: affiliate.id,
        userId: affiliate.user_id,
        userEmail: (affiliate.users as any)?.email || null,
        username: (affiliate.users as any)?.username || null,
        code: affiliate.affiliate_code,
        status: affiliate.status,
        totalEarningsCents: affiliate.total_earnings_cents || 0,
        paidOutCents: affiliate.paid_out_cents || 0,
        pendingBalanceCents: affiliate.pending_balance_cents || 0,
        referralCount: affiliate.referral_count || 0,
        createdAt: affiliate.created_at,
        approvedAt: affiliate.approved_at,
        rejectedAt: affiliate.rejected_at,
        rejectionReason: affiliate.rejection_reason,
      },
      commissions: commissions || [],
      referrals: (referrals || []).map((r) => ({
        id: r.id,
        referredUser: {
          id: (r.users as any)?.id,
          email: (r.users as any)?.email,
          username: (r.users as any)?.username,
          createdAt: (r.users as any)?.created_at,
        },
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Get affiliate details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
