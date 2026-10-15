import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validateCharacterInput } from '../services/moderation';
import { uploadBufferToSupabaseStorage, deleteFromSupabaseStorage, BUCKETS } from '../utils/supabaseStorage';
import { validateFileBufferMagicBytes } from '../utils/fileValidation';
import { CHARACTER_CATEGORIES } from '../config/characterCategories';

const router = express.Router();

// Configure multer for memory storage (for Supabase Storage uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Validation schema
const uploadCharacterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  age: z.number().int().min(18, 'Age must be 18 or older').optional(),
  location: z.string().max(100).optional(),
  personality: z.string().max(2000).default(''),
  system_prompt: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(CHARACTER_CATEGORIES).optional(),
});

// Upload community character
router.post('/characters', authMiddleware, upload.array('images', 10), async (req: AuthRequest, res) => {
  const uploadedStoragePaths: Array<{ bucket: string; path: string }> = []; // To store storage paths for cleanup
  
  try {
    const userId = req.userId!;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    // SECURITY: Validate file magic bytes to prevent MIME type spoofing
    try {
      for (const file of files) {
        if (!file.buffer) {
          return res.status(400).json({ error: 'File buffer is missing' });
        }
        await validateFileBufferMagicBytes(file.buffer, file.mimetype);
      }
    } catch (fileError: any) {
      return res.status(400).json({ error: `File validation failed: ${fileError.message}` });
    }

    // SECURITY: Sanitize user inputs
    const { sanitizeUserInput, sanitizePlainText } = await import('../utils/sanitize');

    // Parse form data
    const formData = {
      name: sanitizePlainText(req.body.name),
      age: req.body.age ? parseInt(req.body.age) : undefined,
      location: req.body.location ? sanitizePlainText(req.body.location) : undefined,
      personality: req.body.personality ? sanitizeUserInput(req.body.personality) : '',
      system_prompt: req.body.system_prompt ? sanitizeUserInput(req.body.system_prompt) : undefined,
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      category: req.body.category,
    };

    const validated = uploadCharacterSchema.parse(formData);

    // Moderation check
    const moderationCheck = validateCharacterInput({
      name: validated.name,
      age: validated.age,
      personality: validated.personality,
    });

    if (!moderationCheck.valid) {
      return res.status(400).json({ error: moderationCheck.error });
    }

    // Upload files to Supabase Storage
    const uploadedImageUrls: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.buffer) {
          throw new Error('File buffer is missing');
        }
        
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = file.originalname.split('.').pop() || 'png';
        const storagePath = `community/community_${uniqueSuffix}.${ext}`;
        
        // Upload to Supabase Storage
        const publicUrl = await uploadBufferToSupabaseStorage(
          file.buffer,
          BUCKETS.CHARACTERS,
          storagePath,
          file.mimetype
        );
        
        uploadedImageUrls.push(publicUrl);
        uploadedStoragePaths.push({ bucket: BUCKETS.CHARACTERS, path: storagePath });
      }
    } catch (uploadError: any) {
      // Clean up any uploaded files
      for (const storagePath of uploadedStoragePaths) {
        try {
          await deleteFromSupabaseStorage(storagePath.bucket, storagePath.path);
        } catch (e) {
          console.error('Error cleaning up uploaded file:', e);
        }
      }
      return res.status(500).json({ error: `Failed to upload images: ${uploadError.message}` });
    }

    // Use first image as main and preview
    const mainImageUrl = uploadedImageUrls[0];
    const previewImageUrl = mainImageUrl;

    // Create community character with pending status
    const { data: character, error: charError } = await supabase
      .from('community_characters')
      .insert({
        uploader_user_id: userId,
        name: validated.name,
        age: validated.age || null,
        location: validated.location || null,
        personality: validated.personality,
        system_prompt: validated.system_prompt || null,
        image_url: mainImageUrl,
        preview_image_url: previewImageUrl,
        tags: validated.tags || [],
        status: 'pending',
      })
      .select('id, name, status, created_at')
      .single();

    if (charError || !character) {
      console.error('Error creating community character:', charError);
      // Delete uploaded files from Supabase Storage if database insert fails
      for (const storagePath of uploadedStoragePaths) {
        try {
          await deleteFromSupabaseStorage(storagePath.bucket, storagePath.path);
        } catch (err) {
          console.error('Error deleting uploaded file:', err);
        }
      }
      return res.status(500).json({ error: 'Failed to upload character' });
    }

    // Save all images to community_character_images table
    if (uploadedImageUrls.length > 1) {
      const imageInserts = uploadedImageUrls.map((url, index) => ({
        character_id: character.id,
        image_url: url,
        image_order: index,
      }));

      const { error: imagesError } = await supabase
        .from('community_character_images')
        .insert(imageInserts);

      if (imagesError) {
        console.error('Error saving character images:', imagesError);
        // Continue anyway - main character is created
      }
    }

    res.status(201).json({
      character: {
        id: character.id,
        name: character.name,
        status: character.status,
        createdAt: character.created_at,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Upload community character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's uploads
router.get('/characters/my-uploads', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: characters, error } = await supabase
      .from('community_characters')
      .select('id, name, age, location, personality, image_url, preview_image_url, tags, status, moderation_reason, created_at, approved_at')
      .eq('uploader_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user uploads:', error);
      return res.status(500).json({ error: 'Failed to fetch uploads' });
    }

    // Fetch all images for each character
    const charactersWithImages = await Promise.all(
      (characters || []).map(async (char) => {
        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('community_character_images')
            .select('image_url, image_order')
            .eq('character_id', char.id)
            .order('image_order', { ascending: true });

          if (images && images.length > 0) {
            allImages = images.map(img => img.image_url);
          }
        } catch (err) {
          console.warn(`Error fetching images for character ${char.id}:`, err);
        }

        if (allImages.length === 0 && char.image_url) {
          allImages = [char.image_url];
        }

        return {
          id: char.id,
          name: char.name,
          age: char.age || null,
          location: char.location || null,
          personality: char.personality,
          imageUrl: allImages[0] || null,
          images: allImages,
          tags: char.tags || [],
          status: char.status,
          moderationReason: char.moderation_reason || null,
          createdAt: char.created_at,
          approvedAt: char.approved_at || null,
        };
      })
    );

    res.json({ characters: charactersWithImages });
  } catch (error) {
    console.error('Get user uploads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a user's own community character
router.delete('/characters/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify the character exists and belongs to the user
    const { data: character, error: fetchError } = await supabase
      .from('community_characters')
      .select('id, uploader_user_id')
      .eq('id', id)
      .single();

    if (fetchError || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.uploader_user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this character' });
    }

    // Delete associated images records (storage cleanup can be added later)
    const { error: imagesError } = await supabase
      .from('community_character_images')
      .delete()
      .eq('character_id', id);

    if (imagesError) {
      console.error('Error deleting character images:', imagesError);
      // Continue anyway – main character delete is more important
    }

    // Delete the character itself
    const { error: deleteError } = await supabase
      .from('community_characters')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting character:', deleteError);
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Delete user character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Share a chat session
const shareChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  messageIds: z.array(z.string()).min(1, 'At least one message must be selected'),
});

router.post('/chats/:sessionId/share', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { sessionId } = req.params;
    const validated = shareChatSchema.parse(req.body);

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, user_id, character_type, character_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    // Verify that all message IDs belong to this session
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('session_id', sessionId)
      .in('id', validated.messageIds);

    if (messagesError) {
      console.error('Error verifying messages:', messagesError);
      return res.status(500).json({ error: 'Failed to verify messages' });
    }

    if (!messages || messages.length !== validated.messageIds.length) {
      return res.status(400).json({ error: 'Some selected messages do not belong to this session' });
    }

    // Update session to mark as shared with selected message IDs
    const { data: updatedSession, error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        is_shared: true,
        shared_at: new Date().toISOString(),
        share_title: validated.title || null,
        share_description: validated.description || null,
        shared_message_ids: validated.messageIds, // Store array of message IDs
      })
      .eq('id', sessionId)
      .select('id, is_shared, shared_at, share_title, share_description, shared_message_ids')
      .single();

    if (updateError) {
      console.error('Error sharing chat:', updateError);
      return res.status(500).json({ error: 'Failed to share chat' });
    }

    res.json({ message: 'Chat shared successfully', session: updatedSession });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Share chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unshare a chat session
router.post('/chats/:sessionId/unshare', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { sessionId } = req.params;

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    // Update session to unshare
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        is_shared: false,
        shared_at: null,
        share_title: null,
        share_description: null,
        shared_message_ids: null,
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Error unsharing chat:', updateError);
      return res.status(500).json({ error: 'Failed to unshare chat' });
    }

    res.json({ message: 'Chat unshared successfully' });
  } catch (error) {
    console.error('Unshare chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all shared chats
router.get('/chats/shared', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        user_id,
        character_type,
        character_id,
        share_title,
        share_description,
        shared_at,
        created_at,
        shared_message_ids,
        users!chat_sessions_user_id_fkey(username, profile_picture_url)
      `)
      .eq('is_shared', true)
      .order('shared_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching shared chats:', error);
      return res.status(500).json({ error: 'Failed to fetch shared chats' });
    }

    // Fetch character info and messages for each session
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const sharedChats = await Promise.all(
      (sessions || []).map(async (session: any) => {
        // Get character info
        let character: any = null;
        if (session.character_type === 'template') {
          const { data } = await supabase
            .from('character_templates')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          if (data) {
            let imageUrl = data.image_url;
            if (imageUrl && imageUrl.startsWith('/')) {
              imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            character = { ...data, image_url: imageUrl };
          }
        } else if (session.character_type === 'user_character') {
          const { data } = await supabase
            .from('user_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          if (data) {
            let imageUrl = data.image_url;
            if (imageUrl && imageUrl.startsWith('/')) {
              imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            character = { ...data, image_url: imageUrl };
          }
        } else if (session.character_type === 'community') {
          const { data } = await supabase
            .from('community_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          if (data) {
            let imageUrl = data.image_url;
            if (imageUrl && imageUrl.startsWith('/')) {
              imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            character = { ...data, image_url: imageUrl };
          }
        }

        // Get selected messages (or all if shared_message_ids is null for backward compatibility)
        let messages: any[] = [];
        if (session.shared_message_ids && Array.isArray(session.shared_message_ids) && session.shared_message_ids.length > 0) {
          const { data: selectedMessages } = await supabase
            .from('chat_messages')
            .select('role, content, created_at')
            .eq('session_id', session.id)
            .in('id', session.shared_message_ids)
            .order('created_at', { ascending: true });
          messages = selectedMessages || [];
        } else {
          // Backward compatibility: if no shared_message_ids, get first 10 messages
          const { data: allMessages } = await supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true })
          .limit(10);
          messages = allMessages || [];
        }

        return {
          id: session.id,
          userId: session.user_id,
          username: session.users?.username || 'Anonymous',
          profilePictureUrl: session.users?.profile_picture_url || null,
          character,
          title: session.share_title,
          description: session.share_description,
          sharedAt: session.shared_at,
          createdAt: session.created_at,
          messagePreview: messages || [],
        };
      })
    );

    res.json({ chats: sharedChats });
  } catch (error) {
    console.error('Get shared chats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get shared chats for a specific user (by username)
router.get('/chats/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        user_id,
        character_type,
        character_id,
        share_title,
        share_description,
        shared_at,
        created_at,
        shared_message_ids,
        users!chat_sessions_user_id_fkey(username, profile_picture_url)
      `)
      .eq('is_shared', true)
      .eq('users.username', username)
      .order('shared_at', { ascending: false });

    if (error) {
      console.error('Error fetching user shared chats:', error);
      return res.status(500).json({ error: 'Failed to fetch user shared chats' });
    }

    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const sharedChats = await Promise.all(
      (sessions || []).map(async (session: any) => {
        // Get character info
        let character: any = null;
        if (session.character_type === 'template') {
          const { data } = await supabase
            .from('character_templates')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          if (data) {
            let imageUrl = data.image_url;
            if (imageUrl && imageUrl.startsWith('/')) {
              imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            character = { ...data, image_url: imageUrl };
          }
        } else if (session.character_type === 'user_character') {
          const { data } = await supabase
            .from('user_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          if (data) {
            let imageUrl = data.image_url;
            if (imageUrl && imageUrl.startsWith('/')) {
              imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            character = { ...data, image_url: imageUrl };
          }
        } else if (session.character_type === 'community') {
          const { data } = await supabase
            .from('community_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          if (data) {
            let imageUrl = data.image_url;
            if (imageUrl && imageUrl.startsWith('/')) {
              imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            character = { ...data, image_url: imageUrl };
          }
        }

        // Get selected messages (or all if shared_message_ids is null for backward compatibility)
        let messages: any[] = [];
        if (session.shared_message_ids && Array.isArray(session.shared_message_ids) && session.shared_message_ids.length > 0) {
          const { data: selectedMessages } = await supabase
            .from('chat_messages')
            .select('role, content, created_at')
            .eq('session_id', session.id)
            .in('id', session.shared_message_ids)
            .order('created_at', { ascending: true });
          messages = selectedMessages || [];
        } else {
          const { data: allMessages } = await supabase
            .from('chat_messages')
            .select('role, content, created_at')
            .eq('session_id', session.id)
            .order('created_at', { ascending: true })
            .limit(10);
          messages = allMessages || [];
        }

        const user = Array.isArray(session.users) ? session.users[0] : session.users;

        return {
          id: session.id,
          userId: session.user_id,
          username: user?.username || 'Anonymous',
          profilePictureUrl: user?.profile_picture_url || null,
          character,
          title: session.share_title,
          description: session.share_description,
          sharedAt: session.shared_at,
          createdAt: session.created_at,
          messagePreview: messages || [],
        };
      })
    );

    res.json({ chats: sharedChats });
  } catch (error) {
    console.error('Get user shared chats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific shared chat
router.get('/chats/shared/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        user_id,
        character_type,
        character_id,
        share_title,
        share_description,
        shared_at,
        created_at,
        shared_message_ids,
        users!chat_sessions_user_id_fkey(username, profile_picture_url)
      `)
      .eq('id', sessionId)
      .eq('is_shared', true)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Shared chat not found' });
    }

    // Get character info
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    let character: any = null;
    if (session.character_type === 'template') {
      const { data } = await supabase
        .from('character_templates')
        .select('id, name, image_url, personality')
        .eq('id', session.character_id)
        .single();
      if (data) {
        let imageUrl = data.image_url;
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${BACKEND_URL}${imageUrl}`;
        }
        character = { ...data, image_url: imageUrl };
      }
    } else if (session.character_type === 'user_character') {
      const { data } = await supabase
        .from('user_characters')
        .select('id, name, image_url, personality')
        .eq('id', session.character_id)
        .single();
      if (data) {
        let imageUrl = data.image_url;
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${BACKEND_URL}${imageUrl}`;
        }
        character = { ...data, image_url: imageUrl };
      }
    } else if (session.character_type === 'community') {
      const { data } = await supabase
        .from('community_characters')
        .select('id, name, image_url, personality')
        .eq('id', session.character_id)
        .single();
      if (data) {
        let imageUrl = data.image_url;
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${BACKEND_URL}${imageUrl}`;
        }
        character = { ...data, image_url: imageUrl };
      }
    }

    // Get selected messages (or all if shared_message_ids is null for backward compatibility)
    let messages: any[] = [];
    if (session.shared_message_ids && Array.isArray(session.shared_message_ids) && session.shared_message_ids.length > 0) {
      const { data: selectedMessages } = await supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('session_id', sessionId)
        .in('id', session.shared_message_ids)
        .order('created_at', { ascending: true });
      messages = selectedMessages || [];
    } else {
      // Backward compatibility: if no shared_message_ids, get all messages
      const { data: allMessages } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
      messages = allMessages || [];
    }

    const user = Array.isArray(session.users) ? session.users[0] : session.users;
    res.json({
      id: session.id,
      userId: session.user_id,
      username: user?.username || 'Anonymous',
      profilePictureUrl: user?.profile_picture_url || null,
      character,
      title: session.share_title,
      description: session.share_description,
      sharedAt: session.shared_at,
      createdAt: session.created_at,
      messages: messages || [],
    });
  } catch (error) {
    console.error('Get shared chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
