-- Migration: Add Community Character Support to Chat Sessions and System Prompt to Community Characters
-- Run this in your Supabase SQL editor

-- 1. Update chat_sessions to support 'community' character type
ALTER TABLE chat_sessions 
DROP CONSTRAINT IF EXISTS chat_sessions_character_type_check;

ALTER TABLE chat_sessions 
ADD CONSTRAINT chat_sessions_character_type_check 
CHECK (character_type IN ('template', 'user_character', 'community'));

-- 2. Add system_prompt column to community_characters table
ALTER TABLE community_characters 
ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Add comment for documentation
COMMENT ON COLUMN community_characters.system_prompt IS 'Custom AI system prompt for the character. If not provided, will be generated from personality.';
