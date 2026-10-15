import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

const createShowcaseSchema = z.object({
  session_id: z.string().uuid('Invalid session ID'),
  title: z.string().max(100, 'Title too long').optional(),
  selected_message_ids: z.array(z.string().uuid('Invalid message ID')).min(1, 'Must select at least one message'),
});

// Create or update a showcased chat (B-007)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const validated = createShowcaseSchema.parse(req.body);
    const { session_id, title, selected_message_ids } = validated;

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, user_id')
      .eq('id', session_id)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    // Verify all selected messages belong to this session
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('session_id', session_id)
      .in('id', selected_message_ids);

    if (messagesError) {
      console.error('Error verifying messages:', messagesError);
      return res.status(500).json({ error: 'Failed to verify messages' });
    }

    if (!messages || messages.length !== selected_message_ids.length) {
      return res.status(400).json({ error: 'Some selected messages do not belong to this session' });
    }

    // Check if showcase already exists
    const { data: existing } = await supabase
      .from('showcased_chats')
      .select('id')
      .eq('user_id', userId)
      .eq('session_id', session_id)
      .maybeSingle();

    let showcase;
    if (existing) {
      // Update existing showcase
      const { data, error } = await supabase
        .from('showcased_chats')
        .update({
          title: title || null,
          selected_message_ids,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, session_id, title, selected_message_ids, is_public, created_at, updated_at')
        .single();

      if (error) {
        console.error('Error updating showcase:', error);
        return res.status(500).json({ error: 'Failed to update showcase' });
      }
      showcase = data;
    } else {
      // Create new showcase
      const { data, error } = await supabase
        .from('showcased_chats')
        .insert({
          user_id: userId,
          session_id,
          title: title || null,
          selected_message_ids,
          is_public: true,
        })
        .select('id, session_id, title, selected_message_ids, is_public, created_at, updated_at')
        .single();

      if (error) {
        console.error('Error creating showcase:', error);
        return res.status(500).json({ error: 'Failed to create showcase' });
      }
      showcase = data;
    }

    res.status(201).json({
      message: 'Showcase created successfully',
      showcase,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create showcase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's showcased chats (B-007)
router.get('/my-showcases', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: showcases, error } = await supabase
      .from('showcased_chats')
      .select(`
        id,
        session_id,
        title,
        selected_message_ids,
        is_public,
        created_at,
        updated_at,
        chat_sessions!inner(
          id,
          character_type,
          character_id
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching showcases:', error);
      return res.status(500).json({ error: 'Failed to fetch showcases' });
    }

    // Get character info for each showcase
    const showcasesWithCharacters = await Promise.all(
      (showcases || []).map(async (showcase: any) => {
        const session = showcase.chat_sessions;
        let character: any = null;

        if (session.character_type === 'template') {
          const { data } = await supabase
            .from('character_templates')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          character = data;
        } else {
          const { data } = await supabase
            .from('user_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          character = data;
        }

        return {
          id: showcase.id,
          sessionId: showcase.session_id,
          title: showcase.title,
          selectedMessageIds: showcase.selected_message_ids,
          isPublic: showcase.is_public,
          character: character ? {
            id: character.id,
            name: character.name,
            imageUrl: character.image_url,
          } : null,
          createdAt: showcase.created_at,
          updatedAt: showcase.updated_at,
        };
      })
    );

    res.json({ showcases: showcasesWithCharacters });
  } catch (error) {
    console.error('Get showcases error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get showcased chats for a specific user (public view) (B-007)
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, privacy_settings')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check privacy setting
    if (user.privacy_settings && user.privacy_settings.show_showcased_chats === false) {
      return res.json({ showcases: [] });
    }

    // Get public showcases
    const { data: showcases, error } = await supabase
      .from('showcased_chats')
      .select(`
        id,
        session_id,
        title,
        selected_message_ids,
        created_at,
        chat_sessions!inner(
          id,
          character_type,
          character_id
        )
      `)
      .eq('user_id', user.id)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching showcases:', error);
      return res.status(500).json({ error: 'Failed to fetch showcases' });
    }

    // Get character info and selected messages for each showcase
    const showcasesWithDetails = await Promise.all(
      (showcases || []).map(async (showcase: any) => {
        const session = showcase.chat_sessions;
        let character: any = null;

        if (session.character_type === 'template') {
          const { data } = await supabase
            .from('character_templates')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          character = data;
        } else {
          const { data } = await supabase
            .from('user_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          character = data;
        }

        // Get selected messages (hide system prompt, only show selected messages)
        const { data: messages } = await supabase
          .from('chat_messages')
          .select('id, role, content, created_at')
          .eq('session_id', showcase.session_id)
          .in('id', showcase.selected_message_ids)
          .order('created_at', { ascending: true });

        return {
          id: showcase.id,
          sessionId: showcase.session_id,
          title: showcase.title,
          character: character ? {
            id: character.id,
            name: character.name,
            imageUrl: character.image_url,
          } : null,
          messages: messages || [],
          createdAt: showcase.created_at,
        };
      })
    );

    res.json({ showcases: showcasesWithDetails });
  } catch (error) {
    console.error('Get user showcases error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a showcased chat (B-007)
router.delete('/:showcaseId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { showcaseId } = req.params;

    // Verify ownership
    const { data: showcase, error: findError } = await supabase
      .from('showcased_chats')
      .select('id')
      .eq('id', showcaseId)
      .eq('user_id', userId)
      .single();

    if (findError || !showcase) {
      return res.status(404).json({ error: 'Showcase not found or access denied' });
    }

    const { error: deleteError } = await supabase
      .from('showcased_chats')
      .delete()
      .eq('id', showcaseId);

    if (deleteError) {
      console.error('Error deleting showcase:', deleteError);
      return res.status(500).json({ error: 'Failed to delete showcase' });
    }

    res.json({ message: 'Showcase deleted successfully' });
  } catch (error) {
    console.error('Delete showcase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle showcase visibility (B-007)
router.patch('/:showcaseId/visibility', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { showcaseId } = req.params;
    const { is_public } = req.body;

    if (typeof is_public !== 'boolean') {
      return res.status(400).json({ error: 'is_public must be a boolean' });
    }

    // Verify ownership
    const { data: showcase, error: findError } = await supabase
      .from('showcased_chats')
      .select('id')
      .eq('id', showcaseId)
      .eq('user_id', userId)
      .single();

    if (findError || !showcase) {
      return res.status(404).json({ error: 'Showcase not found or access denied' });
    }

    const { error: updateError } = await supabase
      .from('showcased_chats')
      .update({ is_public, updated_at: new Date().toISOString() })
      .eq('id', showcaseId);

    if (updateError) {
      console.error('Error updating showcase visibility:', updateError);
      return res.status(500).json({ error: 'Failed to update showcase visibility' });
    }

    res.json({ message: 'Showcase visibility updated successfully' });
  } catch (error) {
    console.error('Update showcase visibility error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's sessions for showcasing selection (B-007)
router.get('/my-sessions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get all sessions with at least one message
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        character_type,
        character_id,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    // Get character info and message count for each session
    const sessionsWithDetails = await Promise.all(
      (sessions || []).map(async (session: any) => {
        let character: any = null;

        if (session.character_type === 'template') {
          const { data } = await supabase
            .from('character_templates')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          character = data;
        } else {
          const { data } = await supabase
            .from('user_characters')
            .select('id, name, image_url')
            .eq('id', session.character_id)
            .single();
          character = data;
        }

        // Count messages
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id);

        // Check if already showcased
        const { data: existingShowcase } = await supabase
          .from('showcased_chats')
          .select('id')
          .eq('user_id', userId)
          .eq('session_id', session.id)
          .maybeSingle();

        return {
          id: session.id,
          characterType: session.character_type,
          character: character ? {
            id: character.id,
            name: character.name,
            imageUrl: character.image_url,
          } : null,
          messageCount: count || 0,
          isShowcased: !!existingShowcase,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        };
      })
    );

    // Filter out sessions with no messages
    const validSessions = sessionsWithDetails.filter(s => s.messageCount > 0);

    res.json({ sessions: validSessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
