import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Validation schemas
const addFavoriteSchema = z.object({
  characterType: z.enum(['template', 'community']),
  characterId: z.string().uuid('Invalid character ID'),
});

// Add favorite
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const validated = addFavoriteSchema.parse(req.body);
    const { characterType, characterId } = validated;

    // Check if character exists
    let character: any = null;
    let charError: any = null;
    
    if (characterType === 'template') {
      const result = await supabase
        .from('character_templates')
        .select('id')
        .eq('id', characterId)
        .maybeSingle();
      character = result.data;
      charError = result.error;
    } else if (characterType === 'community') {
      const result = await supabase
        .from('community_characters')
        .select('id')
        .eq('id', characterId)
        .eq('status', 'approved')
        .maybeSingle();
      character = result.data;
      charError = result.error;
    } else {
      return res.status(400).json({ error: 'Invalid character type' });
    }

    if (charError || !character) {
      return res.status(404).json({ error: 'Character not found or not approved' });
    }

    // Check if already favorited
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('character_type', characterType)
      .eq('character_id', characterId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Character already favorited' });
    }

    // Add favorite
    const { data: favorite, error } = await supabase
      .from('favorites')
      .insert({
        user_id: userId,
        character_type: characterType,
        character_id: characterId,
      })
      .select('id, character_type, character_id, created_at')
      .single();

    if (error) {
      console.error('Add favorite error:', error);
      return res.status(500).json({ error: 'Failed to add favorite' });
    }

    res.status(201).json({ favorite });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove favorite
router.delete('/:characterType/:characterId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { characterType, characterId } = req.params;

    if (!['template', 'community'].includes(characterType)) {
      return res.status(400).json({ error: 'Invalid character type' });
    }

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('character_type', characterType)
      .eq('character_id', characterId);

    if (error) {
      console.error('Remove favorite error:', error);
      return res.status(500).json({ error: 'Failed to remove favorite' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's favorites
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: favorites, error } = await supabase
      .from('favorites')
      .select('id, character_type, character_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get favorites error:', error);
      return res.status(500).json({ error: 'Failed to fetch favorites' });
    }

    // Fetch character details for each favorite
    const favoritesWithDetails = await Promise.all(
      (favorites || []).map(async (fav) => {
        let character: any = null;
        let charError: any = null;
        
        if (fav.character_type === 'template') {
          const result = await supabase
            .from('character_templates')
            .select('id, name, age, location, image_url, preview_image_url, tags, personality')
            .eq('id', fav.character_id)
            .maybeSingle();
          character = result.data;
          charError = result.error;
        } else if (fav.character_type === 'community') {
          const result = await supabase
            .from('community_characters')
            .select('id, name, age, location, image_url, preview_image_url, tags, personality')
            .eq('id', fav.character_id)
            .eq('status', 'approved')
            .maybeSingle();
          character = result.data;
          charError = result.error;
        }

        if (charError || !character) {
          return null;
        }

        // Get all images for this character
        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('character_images')
            .select('image_url, image_order')
            .eq('character_type', fav.character_type === 'template' ? 'template' : 'community')
            .eq('character_id', fav.character_id)
            .order('image_order', { ascending: true });

          if (images && images.length > 0) {
            allImages = images.map(img => img.image_url);
          }
        } catch (err) {
          console.warn(`Error fetching images for favorite ${fav.id}:`, err);
        }

        if (allImages.length === 0) {
          if (character.image_url) {
            allImages = [character.image_url];
          } else if (character.preview_image_url) {
            allImages = [character.preview_image_url];
          }
        }

        return {
          id: fav.id,
          characterType: fav.character_type,
          characterId: fav.character_id,
          character: {
            id: character.id,
            name: character.name,
            age: character.age || null,
            location: character.location || null,
            imageUrl: allImages[0] || null,
            images: allImages,
            tags: character.tags || [],
            personality: character.personality || null,
          },
          createdAt: fav.created_at,
        };
      })
    );

    // Filter out null results (characters that were deleted)
    const validFavorites = favoritesWithDetails.filter(fav => fav !== null);

    res.json({ favorites: validFavorites });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if character is favorited
router.get('/check/:characterType/:characterId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { characterType, characterId } = req.params;

    if (!['template', 'community'].includes(characterType)) {
      return res.status(400).json({ error: 'Invalid character type' });
    }

    const { data: favorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('character_type', characterType)
      .eq('character_id', characterId)
      .maybeSingle();

    res.json({ isFavorited: !!favorite });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get public favorites for a user (respecting privacy)
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Get user by username
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, privacy_settings')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check privacy settings
    const privacySettings = user.privacy_settings || {};
    if (privacySettings.show_favorites === false) {
      return res.json({ favorites: [] }); // Return empty if privacy doesn't allow
    }

    // Get favorites
    const { data: favorites, error } = await supabase
      .from('favorites')
      .select('id, character_type, character_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get public favorites error:', error);
      return res.status(500).json({ error: 'Failed to fetch favorites' });
    }

    // Fetch character details (same as above)
    const favoritesWithDetails = await Promise.all(
      (favorites || []).map(async (fav) => {
        const tableName = fav.character_type === 'template' ? 'character_templates' : 'community_characters';
        
        const { data: character, error: charError } = await supabase
          .from(tableName)
          .select('id, name, age, location, image_url, preview_image_url, tags, personality')
          .eq('id', fav.character_id)
          .single();

        if (charError || !character) {
          return null;
        }

        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('character_images')
            .select('image_url, image_order')
            .eq('character_type', fav.character_type === 'template' ? 'template' : 'community')
            .eq('character_id', fav.character_id)
            .order('image_order', { ascending: true });

          if (images && images.length > 0) {
            allImages = images.map(img => img.image_url);
          }
        } catch (err) {
          console.warn(`Error fetching images for favorite ${fav.id}:`, err);
        }

        if (allImages.length === 0) {
          if (character.image_url) {
            allImages = [character.image_url];
          } else if (character.preview_image_url) {
            allImages = [character.preview_image_url];
          }
        }

        return {
          id: fav.id,
          characterType: fav.character_type,
          characterId: fav.character_id,
          character: {
            id: character.id,
            name: character.name,
            age: character.age || null,
            location: character.location || null,
            imageUrl: allImages[0] || null,
            images: allImages,
            tags: character.tags || [],
            personality: character.personality || null,
          },
          createdAt: fav.created_at,
        };
      })
    );

    const validFavorites = favoritesWithDetails.filter(fav => fav !== null);

    res.json({ favorites: validFavorites });
  } catch (error) {
    console.error('Get public favorites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
