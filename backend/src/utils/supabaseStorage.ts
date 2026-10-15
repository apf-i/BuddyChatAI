import { supabase } from '../db/supabase';
import { readFile } from 'fs/promises';

// Storage bucket names
export const BUCKETS = {
  CHARACTERS: 'character-images',
  PROFILES: 'profile-pictures',
} as const;

/**
 * Upload a file to Supabase Storage
 * @param filePath - Local file path to upload
 * @param bucket - Storage bucket name
 * @param storagePath - Path in storage bucket (e.g., 'templates/file.png' or 'community/file.png')
 * @param contentType - MIME type of the file
 * @returns Public URL of the uploaded file
 */
export async function uploadToSupabaseStorage(
  filePath: string,
  bucket: string,
  storagePath: string,
  contentType: string
): Promise<string> {
  try {
    // Read file from local filesystem
    const fileBuffer = await readFile(filePath);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      // If file already exists, try with a different name
      if (error.message.includes('already exists')) {
        const timestamp = Date.now();
        const pathParts = storagePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        const ext = fileName.split('.').pop();
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        const newPath = `${pathParts.slice(0, -1).join('/')}/${nameWithoutExt}_${timestamp}.${ext}`;
        
        const { data: retryData, error: retryError } = await supabase.storage
          .from(bucket)
          .upload(newPath, fileBuffer, {
            contentType,
            upsert: false,
          });

        if (retryError) {
          throw new Error(`Failed to upload file to Supabase Storage: ${retryError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(newPath);
        return urlData.publicUrl;
      }
      throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (error: any) {
    throw new Error(`Error uploading to Supabase Storage: ${error.message}`);
  }
}

/**
 * Upload a file buffer directly to Supabase Storage
 * @param fileBuffer - File buffer
 * @param bucket - Storage bucket name
 * @param storagePath - Path in storage bucket
 * @param contentType - MIME type of the file
 * @returns Public URL of the uploaded file
 */
export async function uploadBufferToSupabaseStorage(
  fileBuffer: Buffer,
  bucket: string,
  storagePath: string,
  contentType: string
): Promise<string> {
  try {
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      // If file already exists, try with a different name
      if (error.message.includes('already exists')) {
        const timestamp = Date.now();
        const pathParts = storagePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        const ext = fileName.split('.').pop();
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
        const newPath = `${pathParts.slice(0, -1).join('/')}/${nameWithoutExt}_${timestamp}.${ext}`;
        
        const { data: retryData, error: retryError } = await supabase.storage
          .from(bucket)
          .upload(newPath, fileBuffer, {
            contentType,
            upsert: false,
          });

        if (retryError) {
          throw new Error(`Failed to upload file to Supabase Storage: ${retryError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(newPath);
        return urlData.publicUrl;
      }
      throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (error: any) {
    throw new Error(`Error uploading to Supabase Storage: ${error.message}`);
  }
}

/**
 * Delete a file from Supabase Storage
 * @param bucket - Storage bucket name
 * @param storagePath - Path in storage bucket
 */
export async function deleteFromSupabaseStorage(
  bucket: string,
  storagePath: string
): Promise<void> {
  try {
    const { error } = await supabase.storage.from(bucket).remove([storagePath]);
    if (error) {
      throw new Error(`Failed to delete file from Supabase Storage: ${error.message}`);
    }
  } catch (error: any) {
    throw new Error(`Error deleting from Supabase Storage: ${error.message}`);
  }
}
