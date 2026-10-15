-- Migration: Add featured field to character tables
-- Run this in your Supabase SQL editor

-- Add featured field to character_templates
ALTER TABLE character_templates 
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;

-- Add featured field to community_characters
ALTER TABLE community_characters 
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;

-- Create index for better query performance when filtering featured characters
CREATE INDEX IF NOT EXISTS idx_character_templates_featured ON character_templates(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_community_characters_featured ON community_characters(featured) WHERE featured = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN character_templates.featured IS 'Whether this character is featured on the homepage. Only admins can set this.';
COMMENT ON COLUMN community_characters.featured IS 'Whether this character is featured on the homepage. Only admins can set this.';
