import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Validation schema
const startSessionSchema = z.object({
  template_id: z.string().uuid().optional(),
  user_character_id: z.string().uuid().optional(),
  community_character_id: z.string().uuid().optional(),
}).refine(
  (data) => data.template_id || data.user_character_id || data.community_character_id,
  { message: 'Either template_id, user_character_id, or community_character_id must be provided' }
);

// T-011: Create Chat Session Endpoint
router.post('/start', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const validated = startSessionSchema.parse(req.body);
    const userId = req.userId!;

    let characterType: 'template' | 'user_character' | 'community';
    let characterId: string;

    if (validated.template_id) {
      characterType = 'template';
      characterId = validated.template_id;

      // Verify template exists
      const { data: template, error: templateError } = await supabase
        .from('character_templates')
        .select('id')
        .eq('id', characterId)
        .single();

      if (templateError || !template) {
        return res.status(404).json({ error: 'Character template not found' });
      }
    } else if (validated.user_character_id) {
      characterType = 'user_character';
      characterId = validated.user_character_id;

      // Verify user character exists and belongs to user
      const { data: userChar, error: charError } = await supabase
        .from('user_characters')
        .select('id')
        .eq('id', characterId)
        .eq('user_id', userId)
        .single();

      if (charError || !userChar) {
        return res.status(404).json({ error: 'Character not found or access denied' });
      }
    } else if (validated.community_character_id) {
      characterType = 'community';
      characterId = validated.community_character_id;

      // Verify community character exists and is approved
      const { data: communityChar, error: communityError } = await supabase
        .from('community_characters')
        .select('id, status')
        .eq('id', characterId)
        .eq('status', 'approved')
        .single();

      if (communityError || !communityChar) {
        return res.status(404).json({ error: 'Community character not found or not approved' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid character reference' });
    }

    // Check if session already exists
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('character_type', characterType)
      .eq('character_id', characterId)
      .single();

    if (existingSession) {
      return res.json({ sessionId: existingSession.id });
    }

    // Create new session
    const { data: newSession, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        character_type: characterType,
        character_id: characterId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return res.status(500).json({ error: 'Failed to create chat session' });
    }

    if (!newSession) {
      return res.status(500).json({ error: 'Failed to create chat session' });
    }

    res.json({ sessionId: newSession.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all user sessions with latest message
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

    // Get all sessions for the user
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('id, character_type, character_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    if (!sessions || sessions.length === 0) {
      return res.json({ sessions: [] });
    }

    // For each session, get character details and latest message
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session) => {
        // Get character details
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
            character = {
              ...data,
              image_url: imageUrl
            };
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
            character = {
              ...data,
              image_url: imageUrl
            };
          }
        } else {
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
            character = {
              ...data,
              image_url: imageUrl
            };
          }
        }

        // Get latest message
        const { data: latestMessage } = await supabase
          .from('chat_messages')
          .select('content, role, created_at')
          .eq('session_id', session.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          id: session.id,
          character: character ? {
            id: character.id,
            name: character.name,
            image_url: character.image_url
          } : null,
          latestMessage: latestMessage ? {
            content: latestMessage.content,
            role: latestMessage.role,
            created_at: latestMessage.created_at
          } : null,
          updated_at: session.updated_at
        };
      })
    );

    // Filter out sessions with no character (in case character was deleted)
    const validSessions = sessionsWithDetails.filter(s => s.character !== null);

    res.json({ sessions: validSessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get session details
router.get('/:sessionId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get character details
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    let character: any = null;
    if (session.character_type === 'template') {
      // First try with optional fields (age, location)
      let { data, error: queryError } = await supabase
        .from('character_templates')
        .select('id, name, image_url, personality, system_prompt, age, location, tags')
        .eq('id', session.character_id)
        .single();
      
      // If that fails due to missing columns, try without them
      if (queryError && (queryError.code === 'PGRST116' || queryError.message?.includes('column'))) {
        const { data: basicData, error: basicError } = await supabase
          .from('character_templates')
          .select('id, name, image_url, personality, system_prompt, tags')
          .eq('id', session.character_id)
          .single();
        
        if (basicError) {
          console.error('Error fetching template:', basicError);
          return res.status(404).json({ error: 'Character template not found' });
        }
        
        data = { ...basicData, age: null, location: null };
        queryError = null;
      }
      
      if (queryError) {
        console.error('Error fetching template:', queryError);
        return res.status(404).json({ error: 'Character template not found' });
      }
      
      if (data) {
        // Convert relative image URLs to absolute URLs
        let imageUrl = data.image_url;
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${BACKEND_URL}${imageUrl}`;
        }
        
        // Fetch all images from character_images table
        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('character_images')
            .select('image_url, image_order')
            .eq('character_type', 'template')
            .eq('character_id', session.character_id)
            .order('image_order', { ascending: true });
          
          if (images && images.length > 0) {
            allImages = images.map(img => {
              let imgUrl = img.image_url;
              if (imgUrl && imgUrl.startsWith('/')) {
                imgUrl = `${BACKEND_URL}${imgUrl}`;
              }
              return imgUrl;
            }).filter(url => url);
          }
        } catch (err) {
          console.warn('Error fetching character images:', err);
        }
        
        // Fallback to main image_url if no images found
        if (allImages.length === 0 && imageUrl) {
          allImages = [imageUrl];
        }
        
        character = {
          ...data,
          image_url: imageUrl,
          images: allImages
        };
      }
    } else if (session.character_type === 'community') {
      const { data, error: queryError } = await supabase
        .from('community_characters')
        .select('id, name, image_url, personality, system_prompt, age, location, tags')
        .eq('id', session.character_id)
        .single();
      
      if (queryError) {
        console.error('Error fetching community character:', queryError);
        return res.status(404).json({ error: 'Community character not found' });
      }
      
      if (data) {
        // Convert relative image URLs to absolute URLs
        let imageUrl = data.image_url;
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${BACKEND_URL}${imageUrl}`;
        }
        
        // Fetch all images from community_character_images table
        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('community_character_images')
            .select('image_url, image_order')
            .eq('character_id', session.character_id)
            .order('image_order', { ascending: true });
          
          if (images && images.length > 0) {
            allImages = images.map(img => {
              let imgUrl = img.image_url;
              if (imgUrl && imgUrl.startsWith('/')) {
                imgUrl = `${BACKEND_URL}${imgUrl}`;
              }
              return imgUrl;
            }).filter(url => url);
          }
        } catch (err) {
          console.warn('Error fetching community character images:', err);
        }
        
        // Fallback to main image_url if no images found
        if (allImages.length === 0 && imageUrl) {
          allImages = [imageUrl];
        }
        
        character = {
          ...data,
          image_url: imageUrl,
          images: allImages
        };
      }
    } else {
      const { data, error: queryError } = await supabase
        .from('user_characters')
        .select('id, name, image_url, personality, age, location')
        .eq('id', session.character_id)
        .single();
      
      if (queryError) {
        console.error('Error fetching user character:', queryError);
        return res.status(404).json({ error: 'User character not found' });
      }
      
      if (data) {
        // Convert relative image URLs to absolute URLs
        let imageUrl = data.image_url;
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${BACKEND_URL}${imageUrl}`;
        }
        
        // User characters typically only have one image (image_url)
        // But check if there's a character_images entry
        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('character_images')
            .select('image_url, image_order')
            .eq('character_type', 'user_character')
            .eq('character_id', session.character_id)
            .order('image_order', { ascending: true });
          
          if (images && images.length > 0) {
            allImages = images.map(img => {
              let imgUrl = img.image_url;
              if (imgUrl && imgUrl.startsWith('/')) {
                imgUrl = `${BACKEND_URL}${imgUrl}`;
              }
              return imgUrl;
            }).filter(url => url);
          }
        } catch (err) {
          console.warn('Error fetching user character images:', err);
        }
        
        // Fallback to main image_url if no images found
        if (allImages.length === 0 && imageUrl) {
          allImages = [imageUrl];
        }
        
        character = {
          ...data,
          image_url: imageUrl,
          images: allImages
        };
      }
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({ session, character });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
