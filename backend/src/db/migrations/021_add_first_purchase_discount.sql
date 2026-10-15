-- Migration: Add first purchase discount tracking
-- Run this in your Supabase SQL editor

-- Add column to track if user has used their first purchase discount
ALTER TABLE users
ADD COLUMN IF NOT EXISTS has_used_first_purchase_discount BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_first_purchase_discount ON users(has_used_first_purchase_discount);

-- Comment for documentation
COMMENT ON COLUMN users.has_used_first_purchase_discount IS 'Tracks if a referred user has used their 10% first purchase discount';
