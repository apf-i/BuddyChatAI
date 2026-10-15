-- Migration: Create Showcased Chats Table
-- Run this in your Supabase SQL editor
-- B-007: Showcase Chats (F-004, D-009)

-- ShowcasedChats table (D-009, B-007)
CREATE TABLE IF NOT EXISTS showcased_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  title TEXT, -- Optional title for the showcased chat
  selected_message_ids UUID[] NOT NULL DEFAULT '{}', -- Array of message IDs to show
  is_public BOOLEAN DEFAULT TRUE, -- Whether the showcase is public (can be toggled)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session_id) -- One showcase per session per user
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_showcased_chats_user_id ON showcased_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_showcased_chats_session_id ON showcased_chats(session_id);
CREATE INDEX IF NOT EXISTS idx_showcased_chats_is_public ON showcased_chats(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_showcased_chats_created_at ON showcased_chats(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE showcased_chats IS 'Chats that users have selected to showcase on their profile';
COMMENT ON COLUMN showcased_chats.selected_message_ids IS 'Array of chat message IDs that should be displayed (hides system prompt and unselected messages)';
COMMENT ON COLUMN showcased_chats.is_public IS 'Whether this showcase is visible to others (respects privacy settings)';
