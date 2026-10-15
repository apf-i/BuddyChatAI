import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { uploadBufferToSupabaseStorage, deleteFromSupabaseStorage, BUCKETS } from '../utils/supabaseStorage';
import { validateFileBufferMagicBytes } from '../utils/fileValidation';

const router = express.Router();

// Configure multer for memory storage (for Supabase Storage uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Validation schemas
const updateProfileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username must be less than 30 characters').regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens').optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
});

// Get public user profile by username
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, profile_picture_url, bio, created_at')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if user has active subscription (VIP status)
    const { data: activeSubscription } = await supabase
      .from('subscriptions')
      .select('id, status, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    const isVIP = activeSubscription && 
                  activeSubscription.current_period_end && 
                  new Date(activeSubscription.current_period_end) > new Date();

    // Don't expose email in public profile
    res.json({
      profile: {
        id: user.id,
        username: user.username,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
        createdAt: user.created_at,
        isVIP: isVIP || false,
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user's own profile (for editing)
router.get('/me/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, profile_picture_url, bio, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
        createdAt: user.created_at,
      }
    });
  } catch (error) {
    console.error('Get own profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update current user's profile
router.put('/me/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    // SECURITY: Sanitize inputs
    const { sanitizePlainText } = await import('../utils/sanitize');
    const sanitizedBody = {
      ...req.body,
      username: req.body.username ? sanitizePlainText(req.body.username) : undefined,
      bio: req.body.bio ? sanitizePlainText(req.body.bio) : undefined,
    };
    
    const validated = updateProfileSchema.parse(sanitizedBody);

    // Check if username is being changed and if it's already taken
    if (validated.username) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', validated.username)
        .neq('id', userId)
        .maybeSingle();

      if (existingUser) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    const updateData: any = {};
    if (validated.username !== undefined) {
      updateData.username = validated.username || null;
    }
    if (validated.bio !== undefined) {
      updateData.bio = validated.bio || null;
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('id, email, username, profile_picture_url, bio, created_at')
      .single();

    if (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({
      profile: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        profilePictureUrl: updatedUser.profile_picture_url,
        bio: updatedUser.bio,
        createdAt: updatedUser.created_at,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get privacy settings
router.get('/me/privacy', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: user, error } = await supabase
      .from('users')
      .select('privacy_settings')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Default privacy settings if not set
    const defaultSettings = {
      show_favorites: true,
      show_showcased_chats: true,
      allow_dms: true,
      profile_public: true,
    };

    const privacySettings = user.privacy_settings || defaultSettings;

    res.json({
      privacy: {
        showFavorites: privacySettings.show_favorites ?? defaultSettings.show_favorites,
        showShowcasedChats: privacySettings.show_showcased_chats ?? defaultSettings.show_showcased_chats,
        allowDms: privacySettings.allow_dms ?? defaultSettings.allow_dms,
        profilePublic: privacySettings.profile_public ?? defaultSettings.profile_public,
      }
    });
  } catch (error) {
    console.error('Get privacy settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update privacy settings
router.put('/me/privacy', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    const privacySchema = z.object({
      showFavorites: z.boolean().optional(),
      showShowcasedChats: z.boolean().optional(),
      allowDms: z.boolean().optional(),
      profilePublic: z.boolean().optional(),
    });

    const validated = privacySchema.parse(req.body);

    // Get current privacy settings
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('privacy_settings')
      .eq('id', userId)
      .single();

    if (fetchError || !currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Merge with existing settings
    const currentSettings = currentUser.privacy_settings || {};
    const updatedSettings = {
      ...currentSettings,
      ...(validated.showFavorites !== undefined && { show_favorites: validated.showFavorites }),
      ...(validated.showShowcasedChats !== undefined && { show_showcased_chats: validated.showShowcasedChats }),
      ...(validated.allowDms !== undefined && { allow_dms: validated.allowDms }),
      ...(validated.profilePublic !== undefined && { profile_public: validated.profilePublic }),
    };

    // Update privacy settings
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ privacy_settings: updatedSettings })
      .eq('id', userId)
      .select('privacy_settings')
      .single();

    if (error) {
      console.error('Update privacy settings error:', error);
      return res.status(500).json({ error: 'Failed to update privacy settings' });
    }

    const privacySettings = updatedUser.privacy_settings || {};

    res.json({
      privacy: {
        showFavorites: privacySettings.show_favorites ?? true,
        showShowcasedChats: privacySettings.show_showcased_chats ?? true,
        allowDms: privacySettings.allow_dms ?? true,
        profilePublic: privacySettings.profile_public ?? true,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload profile picture
router.post('/me/profile-picture', authMiddleware, upload.single('profilePicture'), async (req: AuthRequest, res) => {
  let uploadedStoragePath: { bucket: string; path: string } | null = null;

  try {
    const userId = req.userId!;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.buffer) {
      return res.status(400).json({ error: 'File buffer is missing' });
    }

    // SECURITY: Validate file magic bytes to prevent MIME type spoofing
    try {
      await validateFileBufferMagicBytes(req.file.buffer, req.file.mimetype);
    } catch (fileError: any) {
      return res.status(400).json({ error: `File validation failed: ${fileError.message}` });
    }

    // Get old profile picture URL before updating
    const { data: oldUser } = await supabase
      .from('users')
      .select('profile_picture_url')
      .eq('id', userId)
      .single();

    // Upload to Supabase Storage
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = req.file.originalname.split('.').pop() || 'png';
    const storagePath = `profiles/profile_${userId}_${uniqueSuffix}.${ext}`;
    
    let profilePictureUrl: string;
    try {
      profilePictureUrl = await uploadBufferToSupabaseStorage(
        req.file.buffer,
        BUCKETS.PROFILES,
        storagePath,
        req.file.mimetype
      );
      uploadedStoragePath = { bucket: BUCKETS.PROFILES, path: storagePath };
    } catch (uploadError: any) {
      return res.status(500).json({ error: `Failed to upload profile picture: ${uploadError.message}` });
    }

    // Update user's profile picture URL
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ profile_picture_url: profilePictureUrl })
      .eq('id', userId)
      .select('id, username, profile_picture_url')
      .single();

    if (error) {
      console.error('Update profile picture error:', error);
      // Clean up uploaded file if database update fails
      if (uploadedStoragePath) {
        try {
          await deleteFromSupabaseStorage(uploadedStoragePath.bucket, uploadedStoragePath.path);
        } catch (err) {
          console.error('Error cleaning up uploaded file:', err);
        }
      }
      return res.status(500).json({ error: 'Failed to update profile picture' });
    }

    // Delete old profile picture from Supabase Storage if it exists and is from Supabase Storage
    if (oldUser?.profile_picture_url && oldUser.profile_picture_url.includes('supabase.co/storage')) {
      try {
        // Extract path from Supabase Storage URL
        const urlParts = oldUser.profile_picture_url.split('/storage/v1/object/public/');
        if (urlParts.length === 2) {
          const pathParts = urlParts[1].split('/');
          const bucket = pathParts[0];
          const path = pathParts.slice(1).join('/');
          await deleteFromSupabaseStorage(bucket, path);
        }
      } catch (err) {
        // Don't fail if old file deletion fails - it's not critical
        console.warn('Error deleting old profile picture:', err);
      }
    }

    res.json({
      profilePictureUrl: updatedUser.profile_picture_url,
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (uploadedStoragePath) {
      try {
        await deleteFromSupabaseStorage(uploadedStoragePath.bucket, uploadedStoragePath.path);
      } catch (err) {
        console.error('Error cleaning up uploaded file:', err);
      }
    }
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
