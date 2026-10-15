-- Migration: Create Affiliate Program Tables
-- Run this in your Supabase SQL editor

-- Affiliates table - Store affiliate information
CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  affiliate_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')) DEFAULT 'pending',
  total_earnings_cents INTEGER DEFAULT 0,
  paid_out_cents INTEGER DEFAULT 0,
  pending_balance_cents INTEGER DEFAULT 0,
  referral_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Affiliate referrals table - Track which users were referred
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Affiliate commissions table - Track each commission earned
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('token_package', 'subscription')),
  purchase_id UUID, -- Can reference token_purchases or subscriptions
  purchase_amount_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add referred_by_affiliate_id to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS referred_by_affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

-- Add affiliate_id to token_purchases table
ALTER TABLE token_purchases
ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

-- Add affiliate_id to subscriptions table
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id ON affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_user_id ON affiliate_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_id ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_affiliate_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_affiliate ON token_purchases(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_affiliate ON subscriptions(affiliate_id);

-- Comments for documentation
COMMENT ON TABLE affiliates IS 'Affiliate program participants who can earn commissions on referrals';
COMMENT ON COLUMN affiliates.status IS 'Affiliate status: pending (awaiting approval), approved (active), rejected, suspended';
COMMENT ON COLUMN affiliates.total_earnings_cents IS 'Total commissions ever earned (pending + paid)';
COMMENT ON COLUMN affiliates.pending_balance_cents IS 'Unpaid commissions available for payout';
COMMENT ON COLUMN affiliates.paid_out_cents IS 'Total commissions already paid out';
COMMENT ON TABLE affiliate_referrals IS 'Tracks which users were referred by which affiliates';
COMMENT ON TABLE affiliate_commissions IS 'Individual commission records for each purchase made by referred users';
