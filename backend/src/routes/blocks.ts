import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Helper function to check if user A is blocked by user B (or vice versa)
export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocks')
    .select('id')
    .or(`and(blocker_id.eq.${blockerId},blocked_id.eq.${blockedId}),and(blocker_id.eq.${blockedId},blocked_id.eq.${blockerId})`)
    .maybeSingle();

  if (error) {
    console.error('Error checking block status:', error);
    return false; // On error, don't block (fail open)
  }

  return !!data;
}

// Block a user (F-007)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const blockSchema = z.object({
      blocked_user_id: z.string().uuid('Invalid user ID'),
    });
    const validated = blockSchema.parse(req.body);
    const { blocked_user_id } = validated;

    // Prevent self-block
    if (userId === blocked_user_id) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    // Verify target user exists
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', blocked_user_id)
      .maybeSingle();

    if (userError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already blocked
    const { data: existing, error: existingError } = await supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', userId)
      .eq('blocked_id', blocked_user_id)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing block:', existingError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existing) {
      return res.status(409).json({ error: 'User is already blocked' });
    }

    // Create block relationship
    const { data: block, error } = await supabase
      .from('blocks')
      .insert({
        blocker_id: userId,
        blocked_id: blocked_user_id,
      })
      .select('id, blocker_id, blocked_id, created_at')
      .single();

    if (error) {
      console.error('Error creating block:', error);
      return res.status(500).json({ error: 'Failed to block user' });
    }

    res.status(201).json({
      message: 'User blocked successfully',
      block,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unblock a user (F-007)
router.delete('/:blockedUserId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { blockedUserId } = req.params;

    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', blockedUserId);

    if (error) {
      console.error('Error unblocking user:', error);
      return res.status(500).json({ error: 'Failed to unblock user' });
    }

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if current user has blocked a specific user (F-007)
router.get('/check/:userId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('blocks')
      .select('id, blocker_id')
      .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${currentUserId})`)
      .maybeSingle();

    if (error) {
      console.error('Error checking block status:', error);
      return res.status(500).json({ error: 'Failed to check block status' });
    }

    const isBlocked = !!data;
    const isBlockedBy = data?.blocker_id === userId;
    const hasBlocked = data?.blocker_id === currentUserId;

    res.json({ 
      isBlocked,
      isBlockedBy,
      hasBlocked,
    });
  } catch (error) {
    console.error('Check block status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of blocked users (F-007)
router.get('/blocked', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: blocks, error } = await supabase
      .from('blocks')
      .select(`
        id,
        blocked_id,
        created_at,
        users!blocks_blocked_id_fkey(id, username, profile_picture_url)
      `)
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blocked users:', error);
      return res.status(500).json({ error: 'Failed to fetch blocked users' });
    }

    const blockedUsers = (blocks || []).map((b: any) => ({
      id: b.users.id,
      username: b.users.username,
      profilePictureUrl: b.users.profile_picture_url,
      blockedAt: b.created_at,
    }));

    res.json({ blockedUsers });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
