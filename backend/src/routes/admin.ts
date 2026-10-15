import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabase } from '../db/supabase';
import { adminMiddleware } from '../middleware/admin';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validateCharacterInput } from '../services/moderation';
import { uploadBufferToSupabaseStorage, deleteFromSupabaseStorage, BUCKETS } from '../utils/supabaseStorage';
import { validateFileBufferMagicBytes } from '../utils/fileValidation';
import { CHARACTER_CATEGORIES } from '../config/characterCategories';

const router = express.Router();

function tryParseSupabasePublicUrl(publicUrl: string): { bucket: string; path: string } | null {
  // Expected: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  try {
    const parts = publicUrl.split('/storage/v1/object/public/');
    if (parts.length !== 2) return null;
    const rest = parts[1];
    const [bucket, ...pathParts] = rest.split('/');
    const path = pathParts.join('/');
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

// Configure multer for memory storage (for Supabase Storage uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept image files only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Validation schema
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  age: z.number().int().min(18, 'Age must be 18 or older'),
  location: z.string().min(1, 'Location is required').max(100),
  personality: z.string().min(10, 'Personality description is required'),
  system_prompt: z.string().min(10, 'System prompt is required'),
  tags: z.array(z.string()).optional(),
  category: z.enum(CHARACTER_CATEGORIES).optional(),
});

// T-010: Create Public Character Template (Admin Only)
router.post('/templates/create', authMiddleware, adminMiddleware, upload.array('images', 10), async (req: AuthRequest, res: any) => {
  const uploadedStoragePaths: Array<{ bucket: string; path: string }> = []; // To store storage paths for cleanup

  try {
    // Check if images were uploaded
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }
    
    // NOTE: upload.array(...) always provides an array of Express.Multer.File
    const files = req.files as Express.Multer.File[];

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

    // Parse form data (name, age, location, personality, system_prompt, tags, category)
    const name = sanitizePlainText(req.body.name);
    const age = req.body.age ? parseInt(req.body.age) : undefined;
    const location = sanitizePlainText(req.body.location);
    const personality = sanitizeUserInput(req.body.personality);
    const system_prompt = sanitizeUserInput(req.body.system_prompt);
    const tags = req.body.tags ? (typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags) : [];
    const category = req.body.category;

    // Validate input
    if (!name || !age || !location || !personality || !system_prompt) {
      return res.status(400).json({ error: 'Name, age, location, personality, and system_prompt are required' });
    }

    const validated = createTemplateSchema.parse({
      name,
      age,
      location,
      personality,
      system_prompt,
      tags,
      category,
    });

    const userId = req.userId!;

    // T-022: Basic Moderation Rules
    const moderationCheck = validateCharacterInput({
      name: validated.name,
      age: validated.age, // Use validated age
      personality: validated.personality,
      hair: '',
      style_outfit: '',
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
        const storagePath = `templates/template_${uniqueSuffix}.${ext}`;
        
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

    // Save template to database
    const { data: newTemplate, error: dbError } = await supabase
      .from('character_templates')
      .insert({
        name: validated.name,
        age: validated.age,
        location: validated.location,
        personality: validated.personality,
        system_prompt: validated.system_prompt,
        image_url: mainImageUrl,
        preview_image_url: previewImageUrl,
        tags: validated.tags || [],
        category: validated.category || null,
        created_by: userId,
      })
      .select('id, name, image_url')
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Clean up uploaded files from Supabase Storage if database save fails
      for (const storagePath of uploadedStoragePaths) {
        try {
          await deleteFromSupabaseStorage(storagePath.bucket, storagePath.path);
        } catch (e) {
          console.error('Error cleaning up uploaded file:', e);
        }
      }
      // Provide more detailed error message
      const errorMessage = dbError.message || 'Failed to save template';
      // Check if it's a constraint violation (likely category issue)
      if (errorMessage.includes('check constraint') || errorMessage.includes('category')) {
        return res.status(400).json({ 
          error: 'Invalid category. Please make sure you have run the database migration to update category names.' 
        });
      }
      return res.status(500).json({ error: `Failed to save template: ${errorMessage}` });
    }

    // Save all images to character_images table
    const imageInserts = uploadedImageUrls.map((imageUrl, index) => ({
      character_type: 'template',
      character_id: newTemplate.id,
      image_url: imageUrl,
      image_order: index,
    }));

    const { error: imagesError } = await supabase
      .from('character_images')
      .insert(imageInserts);

    if (imagesError) {
      console.error('Error saving character images:', imagesError);
      // Clean up uploaded files from Supabase Storage if image save fails
      for (const storagePath of uploadedStoragePaths) {
        try {
          await deleteFromSupabaseStorage(storagePath.bucket, storagePath.path);
        } catch (e) {
          console.error('Error cleaning up uploaded file:', e);
        }
      }
      // Also delete the template we just created
      await supabase.from('character_templates').delete().eq('id', newTemplate.id);
      return res.status(500).json({ error: 'Failed to save character images' });
    }

    res.status(201).json({
      templateId: newTemplate.id,
      name: newTemplate.name,
      imageUrl: newTemplate.image_url,
    });
  } catch (error: any) {
    // General error handling, including Zod validation errors
    // Clean up uploaded files from Supabase Storage
    for (const storagePath of uploadedStoragePaths) {
      try {
        await deleteFromSupabaseStorage(storagePath.bucket, storagePath.path);
      } catch (e) {
        console.error('Error cleaning up uploaded file:', e);
      }
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all templates (admin view)
router.get('/templates', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { data: templates, error } = await supabase
      .from('character_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }

    res.json({ templates: templates || [] });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Delete any user character
router.delete('/characters/:characterId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { characterId } = req.params;

    // Get character info (including image path)
    const { data: character, error: fetchError } = await supabase
      .from('user_characters')
      .select('id, image_url')
      .eq('id', characterId)
      .single();

    if (fetchError || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Delete image file if it exists (Supabase Storage)
    if (character.image_url) {
      try {
        const parsed = tryParseSupabasePublicUrl(character.image_url);
        if (parsed) {
          await deleteFromSupabaseStorage(parsed.bucket, parsed.path);
        }
      } catch (err) {
        // Don't fail deletion if storage cleanup fails
        console.warn('Error deleting user character image from storage:', err);
      }
    }

    // Delete from database (this will cascade delete related chat sessions)
    const { error: deleteError } = await supabase
      .from('user_characters')
      .delete()
      .eq('id', characterId);

    if (deleteError) {
      console.error('Database error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Admin delete character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Delete any community character
router.delete('/community-characters/:characterId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { characterId } = req.params;

    // Get character info (including image path)
    const { data: character, error: fetchError } = await supabase
      .from('community_characters')
      .select('id, image_url, preview_image_url')
      .eq('id', characterId)
      .single();

    if (fetchError || !character) {
      return res.status(404).json({ error: 'Community character not found' });
    }

    // Delete image files if they exist (Supabase Storage)
    const imageUrls = [character.image_url, character.preview_image_url].filter(Boolean);
    for (const imageUrl of imageUrls) {
      if (imageUrl) {
        try {
          const parsed = tryParseSupabasePublicUrl(imageUrl);
          if (parsed) {
            await deleteFromSupabaseStorage(parsed.bucket, parsed.path);
          }
        } catch (err) {
          console.warn('Error deleting community character image from storage:', err);
        }
      }
    }

    // Delete all associated images from community_character_images
    const { error: imagesDeleteError } = await supabase
      .from('community_character_images')
      .delete()
      .eq('character_id', characterId);

    if (imagesDeleteError) {
      console.error('Error deleting community character images:', imagesDeleteError);
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('community_characters')
      .delete()
      .eq('id', characterId);

    if (deleteError) {
      console.error('Database error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete community character' });
    }

    res.json({ message: 'Community character deleted successfully' });
  } catch (error) {
    console.error('Admin delete community character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Delete any template
router.delete('/templates/:templateId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { templateId } = req.params;

    // Get template info (including image path)
    const { data: template, error: fetchError } = await supabase
      .from('character_templates')
      .select('id, image_url')
      .eq('id', templateId)
      .single();

    if (fetchError || !template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete image file if it exists (Supabase Storage)
    if (template.image_url) {
      try {
        const parsed = tryParseSupabasePublicUrl(template.image_url);
        if (parsed) {
          await deleteFromSupabaseStorage(parsed.bucket, parsed.path);
        }
      } catch (err) {
        console.warn('Error deleting template image from storage:', err);
      }
    }

    // Delete from database (this will cascade delete related chat sessions)
    const { error: deleteError } = await supabase
      .from('character_templates')
      .delete()
      .eq('id', templateId);

    if (deleteError) {
      console.error('Database error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete template' });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Admin delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get single template with images for editing
router.get('/templates/:templateId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { templateId } = req.params;

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('character_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get all images
    const { data: images, error: imagesError } = await supabase
      .from('character_images')
      .select('id, image_url, image_order')
      .eq('character_type', 'template')
      .eq('character_id', templateId)
      .order('image_order', { ascending: true });

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
    }

    res.json({
      ...template,
      images: images || [],
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get single community character with images for editing
router.get('/community-characters/:characterId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { characterId } = req.params;

    // Get character
    const { data: character, error: charError } = await supabase
      .from('community_characters')
      .select('*')
      .eq('id', characterId)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: 'Community character not found' });
    }

    // Get all images
    const { data: images, error: imagesError } = await supabase
      .from('community_character_images')
      .select('id, image_url, image_order')
      .eq('character_id', characterId)
      .order('image_order', { ascending: true });

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
    }

    res.json({
      ...character,
      images: images || [],
    });
  } catch (error) {
    console.error('Get community character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get single user character for editing
router.get('/characters/:characterId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { characterId } = req.params;

    // Get character
    const { data: character, error: charError } = await supabase
      .from('user_characters')
      .select('*')
      .eq('id', characterId)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json(character);
  } catch (error) {
    console.error('Get character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Update template (system_prompt, add/remove images)
const updateTemplateSchema = z.object({
  system_prompt: z.string().min(10, 'System prompt must be at least 10 characters').optional(),
  image_urls_to_remove: z.array(z.string().uuid()).optional(), // Array of image IDs to remove
});

router.put('/templates/:templateId', authMiddleware, adminMiddleware, upload.array('new_images', 10), async (req: AuthRequest, res: any) => {
  try {
    const { templateId } = req.params;
    const files = req.files as Express.Multer.File[];

    // Get existing template
    const { data: template, error: fetchError } = await supabase
      .from('character_templates')
      .select('id, image_url')
      .eq('id', templateId)
      .single();

    if (fetchError || !template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Parse body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const validated = updateTemplateSchema.parse({
      system_prompt: body.system_prompt || undefined,
      image_urls_to_remove: body.image_urls_to_remove ? JSON.parse(body.image_urls_to_remove) : undefined,
    });

    // Check if anything is being updated
    const hasSystemPromptUpdate = validated.system_prompt !== undefined && validated.system_prompt.trim() !== '';
    const hasImageRemovals = validated.image_urls_to_remove && validated.image_urls_to_remove.length > 0;
    const hasNewImages = files && files.length > 0;

    if (!hasSystemPromptUpdate && !hasImageRemovals && !hasNewImages) {
      return res.status(400).json({ error: 'No changes provided. Please update at least one field.' });
    }

    // Update system_prompt if provided
    if (hasSystemPromptUpdate) {
      const { error: updateError } = await supabase
        .from('character_templates')
        .update({ system_prompt: validated.system_prompt })
        .eq('id', templateId);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update system prompt' });
      }
    }

    // Remove images if specified
    if (validated.image_urls_to_remove && validated.image_urls_to_remove.length > 0) {
      for (const imageId of validated.image_urls_to_remove) {
        // Get image to delete from storage
        const { data: image, error: imageError } = await supabase
          .from('character_images')
          .select('image_url')
          .eq('id', imageId)
          .eq('character_type', 'template')
          .eq('character_id', templateId)
          .single();

        if (!imageError && image) {
          // Delete from storage
          const parsed = tryParseSupabasePublicUrl(image.image_url);
          if (parsed) {
            await deleteFromSupabaseStorage(parsed.bucket, parsed.path);
          }

          // Delete from database
          await supabase
            .from('character_images')
            .delete()
            .eq('id', imageId);
        }
      }
    }

    // Add new images if provided
    const uploadedImageUrls: string[] = [];
    if (files && files.length > 0) {
      // Validate files
      for (const file of files) {
        if (!file.buffer) {
          return res.status(400).json({ error: 'File buffer is missing' });
        }
        await validateFileBufferMagicBytes(file.buffer, file.mimetype);
      }

      // Upload new images
      for (const file of files) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = file.originalname.split('.').pop() || 'png';
        const storagePath = `templates/template_${uniqueSuffix}.${ext}`;

        const publicUrl = await uploadBufferToSupabaseStorage(
          file.buffer,
          BUCKETS.CHARACTERS,
          storagePath,
          file.mimetype
        );

        uploadedImageUrls.push(publicUrl);
      }

      // Get current max image_order
      const { data: existingImages } = await supabase
        .from('character_images')
        .select('image_order')
        .eq('character_type', 'template')
        .eq('character_id', templateId)
        .order('image_order', { ascending: false })
        .limit(1);

      const maxOrder = existingImages && existingImages.length > 0 ? existingImages[0].image_order : -1;

      // Insert new images
      const imageInserts = uploadedImageUrls.map((url, index) => ({
        character_type: 'template',
        character_id: templateId,
        image_url: url,
        image_order: maxOrder + 1 + index,
      }));

      await supabase.from('character_images').insert(imageInserts);
    }

    res.json({ message: 'Template updated successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Update community character (system_prompt, add/remove images)
router.put('/community-characters/:characterId', authMiddleware, adminMiddleware, upload.array('new_images', 10), async (req: AuthRequest, res: any) => {
  try {
    const { characterId } = req.params;
    const files = req.files as Express.Multer.File[];

    // Get existing character
    const { data: character, error: fetchError } = await supabase
      .from('community_characters')
      .select('id')
      .eq('id', characterId)
      .single();

    if (fetchError || !character) {
      return res.status(404).json({ error: 'Community character not found' });
    }

    // Parse body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const validated = updateTemplateSchema.parse({
      system_prompt: body.system_prompt || undefined,
      image_urls_to_remove: body.image_urls_to_remove ? JSON.parse(body.image_urls_to_remove) : undefined,
    });

    // Check if anything is being updated
    const hasSystemPromptUpdate = validated.system_prompt !== undefined && validated.system_prompt.trim() !== '';
    const hasImageRemovals = validated.image_urls_to_remove && validated.image_urls_to_remove.length > 0;
    const hasNewImages = files && files.length > 0;

    if (!hasSystemPromptUpdate && !hasImageRemovals && !hasNewImages) {
      return res.status(400).json({ error: 'No changes provided. Please update at least one field.' });
    }

    // Update system_prompt if provided
    if (hasSystemPromptUpdate) {
      const { error: updateError } = await supabase
        .from('community_characters')
        .update({ system_prompt: validated.system_prompt })
        .eq('id', characterId);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update system prompt' });
      }
    }

    // Remove images if specified
    if (validated.image_urls_to_remove && validated.image_urls_to_remove.length > 0) {
      for (const imageId of validated.image_urls_to_remove) {
        // Get image to delete from storage
        const { data: image, error: imageError } = await supabase
          .from('community_character_images')
          .select('image_url')
          .eq('id', imageId)
          .eq('character_id', characterId)
          .single();

        if (!imageError && image) {
          // Delete from storage
          const parsed = tryParseSupabasePublicUrl(image.image_url);
          if (parsed) {
            await deleteFromSupabaseStorage(parsed.bucket, parsed.path);
          }

          // Delete from database
          await supabase
            .from('community_character_images')
            .delete()
            .eq('id', imageId);
        }
      }
    }

    // Add new images if provided
    const uploadedImageUrls: string[] = [];
    if (files && files.length > 0) {
      // Validate files
      for (const file of files) {
        if (!file.buffer) {
          return res.status(400).json({ error: 'File buffer is missing' });
        }
        await validateFileBufferMagicBytes(file.buffer, file.mimetype);
      }

      // Upload new images
      for (const file of files) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = file.originalname.split('.').pop() || 'png';
        const storagePath = `community/community_${uniqueSuffix}.${ext}`;

        const publicUrl = await uploadBufferToSupabaseStorage(
          file.buffer,
          BUCKETS.CHARACTERS,
          storagePath,
          file.mimetype
        );

        uploadedImageUrls.push(publicUrl);
      }

      // Get current max image_order
      const { data: existingImages } = await supabase
        .from('community_character_images')
        .select('image_order')
        .eq('character_id', characterId)
        .order('image_order', { ascending: false })
        .limit(1);

      const maxOrder = existingImages && existingImages.length > 0 ? existingImages[0].image_order : -1;

      // Insert new images
      const imageInserts = uploadedImageUrls.map((url, index) => ({
        character_id: characterId,
        image_url: url,
        image_order: maxOrder + 1 + index,
      }));

      await supabase.from('community_character_images').insert(imageInserts);
    }

    res.json({ message: 'Community character updated successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Update community character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user tokens (admin only)
const updateTokensSchema = z.object({
  amount: z.number().int().min(0, 'Amount must be non-negative'),
});

router.post('/users/:userId/tokens', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { userId } = req.params;
    const validated = updateTokensSchema.parse(req.body);

    // Get current balance
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('token_balance, email')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update token balance
    const newBalance = validated.amount;
    const { error: updateError } = await supabase
      .from('users')
      .update({ token_balance: newBalance })
      .eq('id', userId);

    if (updateError) {
      console.error('Database error:', updateError);
      return res.status(500).json({ error: 'Failed to update token balance' });
    }

    res.json({ 
      message: `Token balance updated for ${user.email}`,
      newBalance 
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Update tokens error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add tokens to user balance (admin only)
router.post('/users/:userId/tokens/add', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { userId } = req.params;
    const validated = updateTokensSchema.parse(req.body);

    // Get current balance
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('token_balance, email')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add to token balance
    const newBalance = user.token_balance + validated.amount;
    const { error: updateError } = await supabase
      .from('users')
      .update({ token_balance: newBalance })
      .eq('id', userId);

    if (updateError) {
      console.error('Database error:', updateError);
      return res.status(500).json({ error: 'Failed to update token balance' });
    }

    res.json({ 
      message: `Added ${validated.amount} tokens to ${user.email}`,
      newBalance 
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Add tokens error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin only)
router.get('/users', authMiddleware, adminMiddleware, async (req: AuthRequest, res: any) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, token_balance, is_admin, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    res.json({ users: users || [] });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== MODERATION DASHBOARD =====

// Get pending community characters for moderation
router.get('/moderation/pending', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Verify admin status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all pending community characters with uploader info
    const { data: characters, error } = await supabase
      .from('community_characters')
      .select(`
        id,
        name,
        age,
        location,
        personality,
        image_url,
        preview_image_url,
        tags,
        created_at,
        uploader_user_id,
        users!community_characters_uploader_user_id_fkey(username, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending characters:', error);
      return res.status(500).json({ error: 'Failed to fetch pending characters' });
    }

    // Fetch all images for each character
    const charactersWithImages = await Promise.all(
      (characters || []).map(async (char: any) => {
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
        } else if (allImages.length === 0 && char.preview_image_url) {
          allImages = [char.preview_image_url];
        }

        return {
          id: char.id,
          name: char.name,
          age: char.age || null,
          location: char.location || null,
          personality: char.personality,
          tags: char.tags || [],
          images: allImages,
          previewImage: allImages[0] || null,
          createdAt: char.created_at,
          uploader: {
            userId: char.uploader_user_id,
            username: char.users?.username || null,
            email: char.users?.email || null,
          },
        };
      })
    );

    res.json({ characters: charactersWithImages });
  } catch (error) {
    console.error('Get pending characters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve a community character
router.post('/moderation/approve/:characterId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { characterId } = req.params;

    // Verify admin status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Update character status to approved
    const { data: updatedCharacter, error: updateError } = await supabase
      .from('community_characters')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .eq('id', characterId)
      .eq('status', 'pending')
      .select('id, name, status')
      .single();

    if (updateError || !updatedCharacter) {
      console.error('Error approving character:', updateError);
      return res.status(404).json({ error: 'Character not found or already processed' });
    }

    res.json({
      message: 'Character approved successfully',
      character: updatedCharacter,
    });
  } catch (error) {
    console.error('Approve character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject a community character
router.post('/moderation/reject/:characterId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { characterId } = req.params;
    const { reason } = req.body;

    // Verify admin status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Validate reason
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    if (reason.length > 500) {
      return res.status(400).json({ error: 'Rejection reason must be less than 500 characters' });
    }

    // Update character status to rejected
    const { data: updatedCharacter, error: updateError } = await supabase
      .from('community_characters')
      .update({
        status: 'rejected',
        moderation_reason: reason.trim(),
        approved_by: userId,
      })
      .eq('id', characterId)
      .eq('status', 'pending')
      .select('id, name, status, moderation_reason')
      .single();

    if (updateError || !updatedCharacter) {
      console.error('Error rejecting character:', updateError);
      return res.status(404).json({ error: 'Character not found or already processed' });
    }

    res.json({
      message: 'Character rejected successfully',
      character: updatedCharacter,
    });
  } catch (error) {
    console.error('Reject character error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get moderation stats
router.get('/moderation/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Verify admin status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get counts for each status
    const { count: pendingCount, error: pendingError } = await supabase
      .from('community_characters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: approvedCount, error: approvedError } = await supabase
      .from('community_characters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    const { count: rejectedCount, error: rejectedError } = await supabase
      .from('community_characters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected');

    if (pendingError || approvedError || rejectedError) {
      console.error('Error fetching moderation stats:', { pendingError, approvedError, rejectedError });
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    res.json({
      stats: {
        pending: pendingCount || 0,
        approved: approvedCount || 0,
        rejected: rejectedCount || 0,
      },
    });
  } catch (error) {
    console.error('Get moderation stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle featured status for a character (admin only)
router.post('/characters/:characterId/featured', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { characterId } = req.params;
    const { type } = req.body; // 'template' or 'community'

    if (!type || !['template', 'community'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be "template" or "community"' });
    }

    const tableName = type === 'template' ? 'character_templates' : 'community_characters';

    // Get current featured status
    // First check if character exists (without featured field)
    const { data: characterCheck, error: checkError } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', characterId)
      .single();

    if (checkError || !characterCheck) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Try to get featured status, but handle if column doesn't exist
    let currentFeaturedStatus = false;
    const { data: character, error: fetchError } = await supabase
      .from(tableName)
      .select('featured')
      .eq('id', characterId)
      .single();

    if (fetchError) {
      // If error is about featured column not existing, default to false
      if (fetchError.message?.includes('featured') || fetchError.message?.includes('column') || fetchError.code === 'PGRST116') {
        console.log('Featured column not found - migration may not be run yet');
        return res.status(400).json({ 
          error: 'Featured column does not exist. Please run the migration: backend/src/db/migrations/019_add_featured_field.sql' 
        });
      }
      // Other errors - character might not exist
      return res.status(404).json({ error: 'Character not found' });
    }

    // Toggle featured status
    const newFeaturedStatus = character?.featured ? !character.featured : true;

    const { data: updatedCharacter, error: updateError } = await supabase
      .from(tableName)
      .update({ featured: newFeaturedStatus })
      .eq('id', characterId)
      .select('id, name, featured')
      .single();

    if (updateError) {
      console.error('Error updating featured status:', updateError);
      return res.status(500).json({ error: 'Failed to update featured status' });
    }

    res.json({
      success: true,
      character: updatedCharacter,
      message: updatedCharacter.featured 
        ? 'Character marked as featured' 
        : 'Character removed from featured',
    });
  } catch (error) {
    console.error('Toggle featured error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
