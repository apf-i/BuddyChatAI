-- Migration 007: Add OAuth support for Google sign-in

-- Add OAuth provider and OAuth ID columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255) DEFAULT NULL;

-- Make password_hash nullable for OAuth users (they don't have passwords)
ALTER TABLE users 
ALTER COLUMN password_hash DROP NOT NULL;

-- Add unique constraint for OAuth users (one Google account = one user)
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_unique 
ON users(oauth_provider, oauth_id) 
WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

-- Add index for faster OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);
