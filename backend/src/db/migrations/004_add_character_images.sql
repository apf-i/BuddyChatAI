-- Migration: Add support for multiple images per character
-- Run this in your Supabase SQL editor

-- Create character_images table to store multiple images per character
CREATE TABLE IF NOT EXISTS character_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_type TEXT NOT NULL CHECK (character_type IN ('template', 'user_character')),
  character_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  image_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(character_type, character_id, image_order)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_character_images_character ON character_images(character_type, character_id);
CREATE INDEX IF NOT EXISTS idx_character_images_order ON character_images(character_type, character_id, image_order);

-- Migrate existing single images to the new table
-- For character_templates
INSERT INTO character_images (character_type, character_id, image_url, image_order)
SELECT 'template', id, image_url, 0
FROM character_templates
WHERE image_url IS NOT NULL
ON CONFLICT DO NOTHING;

-- For user_characters
INSERT INTO character_images (character_type, character_id, image_url, image_order)
SELECT 'user_character', id, image_url, 0
FROM user_characters
WHERE image_url IS NOT NULL
ON CONFLICT DO NOTHING;
