-- Migration: Add Shared Message IDs Support
-- Run this in your Supabase SQL editor
-- Community: Selective Message Sharing Feature

-- Add column to store selected message IDs for shared chats
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS shared_message_ids TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN chat_sessions.shared_message_ids IS 'Array of message IDs that are included in the shared chat. If null, all messages are shared (backward compatibility).';
