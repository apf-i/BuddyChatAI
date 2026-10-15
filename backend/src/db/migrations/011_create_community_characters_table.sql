-- Migration: Create Community Characters Table
-- Run this in your Supabase SQL editor

-- Community Characters table (D-006)
CREATE TABLE IF NOT EXISTS community_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER CHECK (age >= 18),
  location TEXT,
  personality TEXT NOT NULL,
  image_url TEXT NOT NULL,
  preview_image_url TEXT,
  tags TEXT[],
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  moderation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id)
);

-- Community Character Images table (similar to character_images)
CREATE TABLE IF NOT EXISTS community_character_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES community_characters(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_community_characters_uploader ON community_characters(uploader_user_id);
CREATE INDEX IF NOT EXISTS idx_community_characters_status ON community_characters(status);
CREATE INDEX IF NOT EXISTS idx_community_characters_created_at ON community_characters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_character_images_character ON community_character_images(character_id, image_order);

-- Add comment for documentation
COMMENT ON TABLE community_characters IS 'User-uploaded community characters that require moderation before going public';
COMMENT ON COLUMN community_characters.status IS 'pending: awaiting moderation, approved: public, rejected: not public';
COMMENT ON COLUMN community_characters.moderation_reason IS 'Reason provided when character is rejected';
