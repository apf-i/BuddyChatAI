import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { isBlocked } from './blocks';
import { sendNewFollowerEmail } from '../services/email';

const router = express.Router();

const followSchema = z.object({
  following_user_id: z.string().uuid('Invalid user ID'),
});

// Follow a user (B-008)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const validated = followSchema.parse(req.body);
    const { following_user_id } = validated;

    // Prevent self-follow
    if (userId === following_user_id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    // Verify target user exists and get their email
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('id', following_user_id)
      .maybeSingle();

    if (userError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if either user has blocked the other
    if (await isBlocked(userId, following_user_id)) {
      return res.status(403).json({ error: 'Cannot follow this user' });
    }

    // Check if already following
    const { data: existing, error: existingError } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_user_id', userId)
      .eq('following_user_id', following_user_id)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing follow:', existingError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existing) {
      return res.status(409).json({ error: 'Already following this user' });
    }

    // Create follow relationship
    const { data: follow, error } = await supabase
      .from('follows')
      .insert({
        follower_user_id: userId,
        following_user_id: following_user_id,
      })
      .select('id, follower_user_id, following_user_id, created_at')
      .single();

    if (error) {
      console.error('Error creating follow:', error);
      return res.status(500).json({ error: 'Failed to follow user' });
    }

    res.status(201).json({
      message: 'Successfully followed user',
      follow,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Follow user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unfollow a user (B-008)
router.delete('/:followingUserId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { followingUserId } = req.params;

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_user_id', userId)
      .eq('following_user_id', followingUserId);

    if (error) {
      console.error('Error unfollowing user:', error);
      return res.status(500).json({ error: 'Failed to unfollow user' });
    }

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if current user is following a specific user (B-008)
router.get('/check/:followingUserId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { followingUserId } = req.params;

    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_user_id', userId)
      .eq('following_user_id', followingUserId)
      .maybeSingle();

    if (error) {
      console.error('Error checking follow status:', error);
      return res.status(500).json({ error: 'Failed to check follow status' });
    }

    res.json({ isFollowing: !!data });
  } catch (error) {
    console.error('Check follow status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's followers (B-008)
router.get('/followers/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: followers, error } = await supabase
      .from('follows')
      .select(`
        id,
        follower_user_id,
        created_at,
        users!follows_follower_user_id_fkey(id, username, profile_picture_url)
      `)
      .eq('following_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching followers:', error);
      return res.status(500).json({ error: 'Failed to fetch followers' });
    }

    // Get VIP status for each follower
    const followersList = await Promise.all((followers || []).map(async (f: any) => {
      // Check for active subscription
      const { data: activeSubscription } = await supabase
        .from('subscriptions')
        .select('id, status, current_period_end')
        .eq('user_id', f.users.id)
        .eq('status', 'active')
        .maybeSingle();

      const isVIP = activeSubscription && 
                    activeSubscription.current_period_end && 
                    new Date(activeSubscription.current_period_end) > new Date();

      return {
        id: f.users.id,
        username: f.users.username,
        profilePictureUrl: f.users.profile_picture_url,
        followedAt: f.created_at,
        isVIP: isVIP || false,
      };
    }));

    res.json({ followers: followersList });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get users that a user is following (B-008)
router.get('/following/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: following, error } = await supabase
      .from('follows')
      .select(`
        id,
        following_user_id,
        created_at,
        users!follows_following_user_id_fkey(id, username, profile_picture_url)
      `)
      .eq('follower_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching following:', error);
      return res.status(500).json({ error: 'Failed to fetch following' });
    }

    // Get VIP status for each user being followed
    const followingList = await Promise.all((following || []).map(async (f: any) => {
      // Check for active subscription
      const { data: activeSubscription } = await supabase
        .from('subscriptions')
        .select('id, status, current_period_end')
        .eq('user_id', f.users.id)
        .eq('status', 'active')
        .maybeSingle();

      const isVIP = activeSubscription && 
                    activeSubscription.current_period_end && 
                    new Date(activeSubscription.current_period_end) > new Date();

      return {
        id: f.users.id,
        username: f.users.username,
        profilePictureUrl: f.users.profile_picture_url,
        followedAt: f.created_at,
        isVIP: isVIP || false,
      };
    }));

    res.json({ following: followingList });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get follower/following counts for a user (B-008)
router.get('/counts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { count: followersCount, error: followersError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_user_id', userId);

    const { count: followingCount, error: followingError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_user_id', userId);

    if (followersError || followingError) {
      console.error('Error fetching counts:', { followersError, followingError });
      return res.status(500).json({ error: 'Failed to fetch counts' });
    }

    res.json({
      followers: followersCount || 0,
      following: followingCount || 0,
    });
  } catch (error) {
    console.error('Get counts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
