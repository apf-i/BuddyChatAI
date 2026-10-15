-- Migration: Add Monthly Subscription Support
-- Run this in your Supabase SQL editor
-- Monthly Subscriptions: Users can pay monthly for tokens and get reduced chat costs

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE, -- Stripe subscription ID
  stripe_customer_id TEXT, -- Stripe customer ID
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')) DEFAULT 'incomplete',
  monthly_price_cents INTEGER NOT NULL, -- Monthly price in cents
  monthly_tokens INTEGER NOT NULL, -- Tokens granted each month
  current_period_start TIMESTAMP WITH TIME ZONE, -- Current billing period start
  current_period_end TIMESTAMP WITH TIME ZONE, -- Current billing period end
  cancel_at_period_end BOOLEAN DEFAULT FALSE, -- Whether to cancel at period end
  canceled_at TIMESTAMP WITH TIME ZONE, -- When subscription was canceled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

-- Add comments for documentation
COMMENT ON TABLE subscriptions IS 'Monthly token subscriptions that grant tokens and reduce chat costs to 50 tokens per message';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status: active, canceled, past_due, incomplete, trialing';
COMMENT ON COLUMN subscriptions.monthly_tokens IS 'Number of tokens granted each month';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'If true, subscription will cancel at the end of current period';
