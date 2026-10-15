-- Migration: Create Blocks and Reports Tables
-- Run this in your Supabase SQL editor
-- F-007: Blocking & Reporting

-- Blocks table - Users blocking other users
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- Reports table (D-010, F-007)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'character', 'message')),
  target_id UUID NOT NULL, -- Can be user_id, character_id, or message_id
  reason TEXT NOT NULL,
  additional_details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES users(id), -- Admin/moderator who reviewed
  reviewed_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE blocks IS 'User blocking relationships - blocked users cannot DM or interact with blocker';
COMMENT ON TABLE reports IS 'Reports submitted by users for moderation review';
COMMENT ON COLUMN reports.target_type IS 'Type of entity being reported: user, character, or message';
COMMENT ON COLUMN reports.status IS 'open: new report, reviewing: being looked at, resolved: action taken, dismissed: no action needed';
