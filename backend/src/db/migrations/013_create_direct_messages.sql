-- Migration: Create Direct Messages Tables
-- Run this in your Supabase SQL editor

-- Direct Message Threads table (D-003, B-009)
CREATE TABLE IF NOT EXISTS dm_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_a_id, user_b_id) -- Prevent duplicate threads (order doesn't matter)
);

-- Direct Messages table (D-004, B-009)
CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT CHECK (status IN ('sent', 'deleted', 'reported')) DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_dm_threads_user_a ON dm_threads(user_a_id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user_b ON dm_threads(user_b_id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_last_message ON dm_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender ON dm_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_status ON dm_messages(status);

-- Function to ensure consistent thread ordering (smaller ID first)
-- This helps with the UNIQUE constraint
CREATE OR REPLACE FUNCTION get_thread_users(user1_id UUID, user2_id UUID)
RETURNS TABLE(user_a UUID, user_b UUID) AS $$
BEGIN
  IF user1_id < user2_id THEN
    RETURN QUERY SELECT user1_id, user2_id;
  ELSE
    RETURN QUERY SELECT user2_id, user1_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON TABLE dm_threads IS 'Direct message threads between two users';
COMMENT ON TABLE dm_messages IS 'Individual messages within a DM thread';
COMMENT ON COLUMN dm_messages.status IS 'sent: normal message, deleted: user deleted, reported: flagged for moderation';
