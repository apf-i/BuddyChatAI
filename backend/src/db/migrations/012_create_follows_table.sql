-- Migration: Create Follows Table
-- Run this in your Supabase SQL editor

-- Follows table (D-002, B-008)
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_user_id, following_user_id) -- Prevent duplicate follows
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_created_at ON follows(created_at DESC);

-- Prevent users from following themselves
ALTER TABLE follows ADD CONSTRAINT check_no_self_follow 
  CHECK (follower_user_id != following_user_id);

-- Add comment for documentation
COMMENT ON TABLE follows IS 'User follow relationships - follower follows following';
COMMENT ON COLUMN follows.follower_user_id IS 'User who is following';
COMMENT ON COLUMN follows.following_user_id IS 'User being followed';
