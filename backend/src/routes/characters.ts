import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { parseSearchQuery } from '../utils/searchKeywords';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { validateCharacterInput } from '../services/moderation';

const router = express.Router();

// Configure multer for additional image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = join(process.cwd(), 'uploads', 'characters', 'temp');
    await mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop() || 'png';
    cb(null, `upload_${uniqueSuffix}.${ext}`);
  },
});

const upload = multer({
  storage,
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

// Constants (kept for reference, character generation removed)
// const TOKENS_PER_CHARACTER = 500; // Cost per character generation (deprecated)

// Validation schema
const createCharacterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  age: z.number().int().min(18, 'Age must be 18 or older'),
  location: z.string().min(1, 'Location is required').max(100),
  hair: z.string().optional(),
  style_outfit: z.string().optional(),
  personality: z.string().min(10, 'Personality description is required'),
});

// CHARACTER GENERATION ENDPOINTS REMOVED - AI generation using AUTOMATIC1111/SDXL has been removed
// Users can upload characters manually via /upload-character (community route)

/**
 * @deprecated - Character generation removed. This endpoint returns an error.
 */
router.post('/generate-images', authMiddleware, async (req: AuthRequest, res) => {
  return res.status(410).json({ 
    error: 'Character generation has been removed. Please use the manual upload feature at /upload-character' 
  });
});

/**
 * @deprecated - Character generation removed. This endpoint returns an error.
 */
router.post('/confirm-selection', authMiddleware, upload.array('additionalImages', 10), async (req: AuthRequest, res: any) => {
  return res.status(410).json({ 
    error: 'Character generation has been removed. Please use the manual upload feature at /upload-character' 
  });
});


// Get user's characters
router.get('/my-characters', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const { search } = req.query;

    let query = supabase
      .from('user_characters')
      .select('id, name, age, location, image_url, personality, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Search functionality with keyword support
    let ageRangeFilter: { min: number; max: number } | null = null;
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchQuery = parseSearchQuery(search);
      
      // Age range search
      if (searchQuery.ageRange) {
        if (searchQuery.ageRange.min === searchQuery.ageRange.max) {
          // Exact age
          query = query.eq('age', searchQuery.ageRange.min);
        } else {
          // Age range - will filter after fetching
          ageRangeFilter = searchQuery.ageRange;
        }
      } else {
        // If no age keyword, try exact age match
        const ageMatch = parseInt(searchQuery.originalQuery);
        if (!isNaN(ageMatch) && ageMatch >= 18 && ageMatch <= 100) {
          query = query.eq('age', ageMatch);
        }
      }
      
      // Location keywords search
      if (searchQuery.locationKeywords && searchQuery.locationKeywords.length > 0) {
        const locationConditions = searchQuery.locationKeywords.map(loc => `location.ilike.%${loc}%`).join(',');
        if (searchQuery.nameSearch) {
          query = query.or(`${locationConditions},name.ilike.%${searchQuery.nameSearch}%`);
        } else {
          query = query.or(locationConditions);
        }
      } else if (searchQuery.nameSearch) {
        // Name search only
        query = query.ilike('name', `%${searchQuery.nameSearch}%`);
      } else if (!searchQuery.ageRange && !ageRangeFilter) {
        // General search if no keywords matched
        const searchTerm = search.trim().toLowerCase();
        query = query.or(`name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`);
      }
    }

    const { data: characters, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch characters' });
    }

    // Filter by age range if needed (post-query filtering for ranges)
    let filteredCharacters = characters || [];
    if (ageRangeFilter) {
      filteredCharacters = filteredCharacters.filter((char: any) => {
        if (!char.age) return false;
        return char.age >= ageRangeFilter!.min && char.age <= ageRangeFilter!.max;
      });
    }

    // Fetch all images for each character
    const charactersWithImages = await Promise.all(
      (filteredCharacters || []).map(async (char) => {
        // Get all images from character_images table
        const { data: images } = await supabase
          .from('character_images')
          .select('image_url, image_order')
          .eq('character_type', 'user_character')
          .eq('character_id', char.id)
          .order('image_order', { ascending: true });

        // Build array of all images
        let allImages: string[] = [];
        if (images && images.length > 0) {
          allImages = images.map(img => {
            const imgUrl = img.image_url;
            return imgUrl && imgUrl.startsWith('/') ? `${BACKEND_URL}${imgUrl}` : imgUrl;
          });
        } else {
          // Fallback to main image_url if no images in character_images table
          const mainImage = char.image_url && char.image_url.startsWith('/')
            ? `${BACKEND_URL}${char.image_url}`
            : char.image_url;
          if (mainImage) {
            allImages = [mainImage];
          }
        }

        return {
          ...char,
          image_url: allImages[0] || null,
          images: allImages
        };
      })
    );

    res.json({ characters: charactersWithImages });
  } catch (error) {
    console.error('Get characters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user character details with all images
router.get('/my-characters/:characterId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.userId!;
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

    // Get character
    const { data: character, error: charError } = await supabase
      .from('user_characters')
      .select('id, name, age, location, personality, image_url, hair, style_outfit')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Get all images for this character
    const { data: images, error: imagesError } = await supabase
      .from('character_images')
      .select('id, image_url, image_order')
      .eq('character_type', 'user_character')
      .eq('character_id', characterId)
      .order('image_order', { ascending: true });

    // If no images in character_images table, use the main image_url
    let allImages: string[] = [];
    if (images && images.length > 0) {
      allImages = images.map(img => {
        const imgUrl = img.image_url;
        return imgUrl && imgUrl.startsWith('/') ? `${BACKEND_URL}${imgUrl}` : imgUrl;
      });
    } else if (character.image_url) {
      // Ensure absolute URL
      const imageUrl = character.image_url.startsWith('/')
        ? `${BACKEND_URL}${character.image_url}`
        : character.image_url;
      allImages = [imageUrl];
    }

    res.json({
      character: {
        id: character.id,
        name: character.name,
        age: character.age || null,
        location: character.location || null,
        personality: character.personality,
        hair: character.hair || null,
        style_outfit: character.style_outfit || null,
        images: allImages,
        previewImage: allImages[0] || null
      }
    });
  } catch (error) {
    console.error('Get character details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Delete user character
 */
router.delete('/:characterId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { characterId } = req.params;
    const userId = req.userId!;

    // Verify character belongs to user
    const { data: character, error: fetchError } = await supabase
      .from('user_characters')
      .select('id, image_url')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Extract filename from image URL
    let imagePath: string | null = null;
    if (character.image_url) {
      try {
        // Extract filename from URL (e.g., http://localhost:3001/uploads/characters/userid_timestamp.png)
        const urlParts = character.image_url.split('/');
        const filename = urlParts[urlParts.length - 1];
        
        if (filename) {
          const imagesDir = join(process.cwd(), 'uploads', 'characters');
          imagePath = join(imagesDir, filename);
        }
      } catch (err) {
        console.error('Error parsing image URL:', err);
        // Continue with deletion even if file path parsing fails
      }
    }

    // Delete from database (this will cascade delete related chat sessions)
    const { error: deleteError } = await supabase
      .from('user_characters')
      .delete()
      .eq('id', characterId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    // Delete image file if it exists
    if (imagePath) {
      try {
        await unlink(imagePath);
      } catch (fileError: any) {
        // Log but don't fail if file doesn't exist
        if (fileError.code !== 'ENOENT') {
          console.error('Error deleting image file:', fileError);
        }
      }
    }

    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Delete character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
