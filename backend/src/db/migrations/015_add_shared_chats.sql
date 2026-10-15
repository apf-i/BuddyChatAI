-- Migration: Add Shared Chat Support
-- Run this in your Supabase SQL editor
-- Community: Shared Chats Feature

-- Add columns to chat_sessions table for sharing
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS share_title TEXT,
ADD COLUMN IF NOT EXISTS share_description TEXT;

-- Create index for shared chats querying
CREATE INDEX IF NOT EXISTS idx_chat_sessions_shared ON chat_sessions(is_shared, shared_at DESC) 
WHERE is_shared = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN chat_sessions.is_shared IS 'Whether this chat session is publicly shared on the community page';
COMMENT ON COLUMN chat_sessions.shared_at IS 'Timestamp when the chat was shared';
COMMENT ON COLUMN chat_sessions.share_title IS 'Optional title for the shared chat';
COMMENT ON COLUMN chat_sessions.share_description IS 'Optional description for the shared chat';
