import { readFile } from 'fs/promises';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * Validates a file by checking its magic bytes (file signature)
 * This prevents MIME type spoofing attacks
 * 
 * @param filePath Path to the uploaded file
 * @param expectedMimeType Expected MIME type from multer
 * @returns true if valid, throws error if invalid
 */
export async function validateFileMagicBytes(
  filePath: string,
  expectedMimeType: string
): Promise<boolean> {
  try {
    // Use file-type to read magic bytes from file
    const { fileTypeFromFile } = await import('file-type');
    const fileType = await fileTypeFromFile(filePath);

    if (!fileType) {
      await unlink(filePath).catch(() => {}); // Clean up invalid file
      throw new Error('Unable to detect file type from magic bytes');
    }

    // Normalize MIME types (jpeg vs jpg)
    const normalizedDetected = fileType.mime === 'image/jpeg' ? 'image/jpeg' : fileType.mime;
    const normalizedExpected = expectedMimeType.toLowerCase() === 'image/jpg' 
      ? 'image/jpeg' 
      : expectedMimeType.toLowerCase();

    // Check if the detected MIME type matches the expected one
    if (normalizedDetected !== normalizedExpected) {
      await unlink(filePath).catch(() => {}); // Clean up mismatched file
      throw new Error(`File type mismatch: expected ${expectedMimeType}, got ${fileType.mime} (magic bytes check failed)`);
    }

    // Check if MIME type is in allowed list
    if (!ALLOWED_MIME_TYPES.includes(fileType.mime)) {
      await unlink(filePath).catch(() => {}); // Clean up disallowed file
      throw new Error(`File type not allowed: ${fileType.mime}`);
    }

    // Check if extension matches
    if (!ALLOWED_EXTENSIONS.includes(fileType.ext)) {
      await unlink(filePath).catch(() => {}); // Clean up invalid extension
      throw new Error(`File extension not allowed: ${fileType.ext}`);
    }

    return true;
  } catch (error: any) {
    // Clean up on any error
    await unlink(filePath).catch(() => {});
    throw error;
  }
}

/**
 * Validates multiple files by checking magic bytes
 */
export async function validateFilesMagicBytes(
  files: Array<{ path: string; mimetype: string }>
): Promise<boolean> {
  for (const file of files) {
    await validateFileMagicBytes(file.path, file.mimetype);
  }
  return true;
}

/**
 * Validates file buffer by checking magic bytes
 * Creates a temporary file for validation, then deletes it
 */
export async function validateFileBufferMagicBytes(
  fileBuffer: Buffer,
  expectedMimeType: string
): Promise<boolean> {
  // Create temp file
  const tempFilePath = join(tmpdir(), `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`);
  
  try {
    // Write buffer to temp file
    await writeFile(tempFilePath, fileBuffer);
    
    // Validate using existing function
    await validateFileMagicBytes(tempFilePath, expectedMimeType);
    
    // Clean up temp file
    await unlink(tempFilePath).catch(() => {});
    
    return true;
  } catch (error: any) {
    // Clean up temp file on error
    await unlink(tempFilePath).catch(() => {});
    throw error;
  }
}
