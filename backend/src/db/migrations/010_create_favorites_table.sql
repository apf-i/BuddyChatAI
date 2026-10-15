-- Migration: Create Favorites Table
-- Run this in your Supabase SQL editor

-- Favorites table (D-007)
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_type TEXT NOT NULL CHECK (character_type IN ('template', 'community')),
  character_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, character_type, character_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_character ON favorites(character_type, character_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(user_id, created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE favorites IS 'User favorites for characters (templates and community characters)';
