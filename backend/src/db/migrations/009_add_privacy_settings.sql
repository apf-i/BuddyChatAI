-- Migration: Add Privacy Settings
-- Run this in your Supabase SQL editor

-- Add privacy_settings JSONB column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{
  "show_favorites": true,
  "show_showcased_chats": true,
  "allow_dms": true,
  "profile_public": true
}'::jsonb;

-- Create index for privacy settings queries
CREATE INDEX IF NOT EXISTS idx_users_privacy_settings ON users USING GIN (privacy_settings);

-- Add comment for documentation
COMMENT ON COLUMN users.privacy_settings IS 'User privacy preferences: show_favorites, show_showcased_chats, allow_dms, profile_public';
