-- Migration: Add User Profile Fields
-- Run this in your Supabase SQL editor

-- Add profile fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.username IS 'Unique username for public profile URLs';
COMMENT ON COLUMN users.profile_picture_url IS 'URL to user profile picture';
COMMENT ON COLUMN users.bio IS 'User biography/description';
