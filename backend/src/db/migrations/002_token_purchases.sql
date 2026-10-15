-- Migration: Add token purchases table
-- Run this in your Supabase SQL editor

-- Token purchases table
CREATE TABLE IF NOT EXISTS token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paid_cents INTEGER NOT NULL, -- Amount in cents (e.g., 999 = $9.99)
  tokens_purchased INTEGER NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE, -- Stripe payment intent ID
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_token_purchases_user_id ON token_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_status ON token_purchases(status);
CREATE INDEX IF NOT EXISTS idx_token_purchases_stripe_id ON token_purchases(stripe_payment_intent_id);
