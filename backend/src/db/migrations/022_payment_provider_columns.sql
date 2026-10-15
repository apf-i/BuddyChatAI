-- Payment provider columns (migrate off Stripe-specific IDs)
-- Run in Supabase SQL editor

ALTER TABLE token_purchases
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'nowpayments',
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

-- Backfill from legacy Stripe column
UPDATE token_purchases
SET provider = 'stripe',
    provider_transaction_id = stripe_payment_intent_id
WHERE stripe_payment_intent_id IS NOT NULL
  AND provider_transaction_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_purchases_provider_txn
  ON token_purchases(provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'nowpayments',
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;

UPDATE subscriptions
SET provider = 'stripe',
    provider_subscription_id = stripe_subscription_id,
    provider_customer_id = stripe_customer_id
WHERE stripe_subscription_id IS NOT NULL
  AND provider_subscription_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id
  ON subscriptions(provider_subscription_id);

COMMENT ON COLUMN token_purchases.provider IS 'Payment processor: nowpayments, stripe (legacy), etc.';
COMMENT ON COLUMN token_purchases.provider_transaction_id IS 'Processor transaction / subscription id for idempotent webhooks';
