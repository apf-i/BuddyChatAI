import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { generateToken } from '../middleware/auth';
import { sendWelcomeEmail } from '../services/email';
import { authRateLimiter } from '../middleware/rateLimit';

const router = express.Router();

// Track failed login attempts per email (in-memory, consider Redis for production)
const failedLoginAttempts = new Map<string, { count: number; lockUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Initialize Google OAuth client
// Support multiple redirect URIs for development and production
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const getRedirectUri = () => {
  // If FRONTEND_URL is set, use it
  if (process.env.FRONTEND_URL) {
    const redirectUri = `${process.env.FRONTEND_URL}/auth/google/callback`;
    console.log('🔐 Google OAuth Redirect URI:', redirectUri);
    return redirectUri;
  }
  // Default to localhost for development
  const redirectUri = 'http://localhost:5173/auth/google/callback';
  console.log('🔐 Google OAuth Redirect URI (default):', redirectUri);
  return redirectUri;
};

const redirectUri = getRedirectUri();
console.log('🔐 Initializing Google OAuth with redirect URI:', redirectUri);
console.log('🔐 FRONTEND_URL environment variable:', process.env.FRONTEND_URL || 'NOT SET (using default)');

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
);

// Validation schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  affiliate_code: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// T-005: User Signup Endpoint
router.post('/signup', authRateLimiter, async (req, res) => {
  try {
    // SECURITY: Sanitize email input
    const { sanitizePlainText } = await import('../utils/sanitize');
    const sanitizedBody = {
      ...req.body,
      email: sanitizePlainText(req.body.email).toLowerCase().trim(),
    };
    
    const validated = signupSchema.parse(sanitizedBody);
    const { email, password, affiliate_code } = validated;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate and get affiliate if code provided
    let affiliateId: string | null = null;
    if (affiliate_code) {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('id')
        .eq('affiliate_code', affiliate_code.trim().toUpperCase())
        .eq('status', 'approved')
        .maybeSingle();

      if (affiliate) {
        affiliateId = affiliate.id;
      }
      // If affiliate code is invalid, we silently ignore it (don't block signup)
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user with starter tokens (1000)
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        token_balance: 1000,
        is_admin: false,
        referred_by_affiliate_id: affiliateId
      })
      .select('id, email, token_balance, is_admin, username, profile_picture_url, bio, referred_by_affiliate_id')
      .single();

    if (error) {
      console.error('Signup error:', error);
      return res.status(500).json({ error: 'Failed to create account' });
    }

    if (!newUser) {
      return res.status(500).json({ error: 'Failed to create account' });
    }

    // If user was referred by affiliate, create referral record and update affiliate count
    if (affiliateId) {
      try {
        // Create referral record
        await supabase
          .from('affiliate_referrals')
          .insert({
            affiliate_id: affiliateId,
            referred_user_id: newUser.id,
          });

        // Increment affiliate referral count
        try {
          const { error: rpcError } = await supabase.rpc('increment', {
            table_name: 'affiliates',
            id_column: 'id',
            id_value: affiliateId,
            column_name: 'referral_count',
          });

          if (rpcError) {
            throw rpcError; // Fall through to fallback
          }
        } catch (rpcErr) {
          // Fallback if RPC doesn't exist - use update query
          const { data: affiliate } = await supabase
            .from('affiliates')
            .select('referral_count')
            .eq('id', affiliateId)
            .single();

          if (affiliate) {
            await supabase
              .from('affiliates')
              .update({
                referral_count: (affiliate.referral_count || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', affiliateId);
          }
        }
      } catch (err) {
        // Log error but don't block signup if affiliate tracking fails
        console.error('Error tracking affiliate referral:', err);
      }
    }

    // Generate token
    const token = generateToken(newUser.id, newUser.email);

    // Send welcome email
    await sendWelcomeEmail(newUser.email, newUser.username || undefined);

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        tokenBalance: newUser.token_balance,
        isAdmin: newUser.is_admin || false,
        username: newUser.username,
        profilePictureUrl: newUser.profile_picture_url,
        bio: newUser.bio,
        referredByAffiliateId: newUser.referred_by_affiliate_id || null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// T-006: User Login Endpoint
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const validated = loginSchema.parse(req.body);
    const { email, password } = validated;
    const emailLower = email.toLowerCase();

    // Check for account lockout
    const attemptData = failedLoginAttempts.get(emailLower);
    if (attemptData && attemptData.lockUntil > Date.now()) {
      const remainingMinutes = Math.ceil((attemptData.lockUntil - Date.now()) / 60000);
      return res.status(429).json({ 
        error: `Account temporarily locked due to too many failed attempts. Please try again in ${remainingMinutes} minute(s).` 
      });
    }

    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash, token_balance, is_admin, username, profile_picture_url, bio, referred_by_affiliate_id')
      .eq('email', emailLower)
      .single();

    if (error || !user) {
      // Don't reveal if user exists (security best practice)
      // But still track failed attempts to prevent enumeration
      const currentAttempts = failedLoginAttempts.get(emailLower) || { count: 0, lockUntil: 0 };
      currentAttempts.count++;
      
      if (currentAttempts.count >= MAX_FAILED_ATTEMPTS) {
        currentAttempts.lockUntil = Date.now() + LOCKOUT_DURATION;
      }
      failedLoginAttempts.set(emailLower, currentAttempts);
      
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Track failed attempt
      const currentAttempts = failedLoginAttempts.get(emailLower) || { count: 0, lockUntil: 0 };
      currentAttempts.count++;
      
      if (currentAttempts.count >= MAX_FAILED_ATTEMPTS) {
        currentAttempts.lockUntil = Date.now() + LOCKOUT_DURATION;
      }
      failedLoginAttempts.set(emailLower, currentAttempts);
      
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Clear failed attempts on successful login
    failedLoginAttempts.delete(emailLower);

    // Generate token
    const token = generateToken(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        tokenBalance: user.token_balance,
        isAdmin: user.is_admin || false,
        username: user.username,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user info (refresh user data)
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, token_balance, is_admin, username, profile_picture_url, bio, referred_by_affiliate_id')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        tokenBalance: user.token_balance,
        isAdmin: user.is_admin || false,
        username: user.username,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
        referredByAffiliateId: user.referred_by_affiliate_id || null
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth: Get authorization URL
router.get('/google', (req, res) => {
  try {
    console.log('🔐 Generating Google OAuth URL with redirect URI:', redirectUri);
    
    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      prompt: 'consent',
    });
    
    console.log('🔐 Generated OAuth URL (first 100 chars):', authUrl.substring(0, 100) + '...');
    res.json({ authUrl, redirectUri }); // Also return redirectUri for debugging
  } catch (error) {
    console.error('Google OAuth URL error:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// Diagnostic endpoint to check OAuth configuration
router.get('/google/config', (req, res) => {
  res.json({
    redirectUri,
    frontendUrl: process.env.FRONTEND_URL || 'NOT SET (using default: http://localhost:5173)',
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    clientIdPrefix: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET',
    message: 'Add this redirect URI to Google Cloud Console: ' + redirectUri
  });
});

// Google OAuth: Handle callback and create/login user
router.post('/google/callback', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Get user info from Google
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'Failed to get user info from Google' });
    }

    const googleId = payload.sub;
    const email = payload.email?.toLowerCase();
    const name = payload.name;

    if (!email) {
      return res.status(400).json({ error: 'Email is required from Google account' });
    }

    // Check if user exists with this Google account
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, token_balance, is_admin, username, profile_picture_url, bio')
      .eq('oauth_provider', 'google')
      .eq('oauth_id', googleId)
      .maybeSingle();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Database error:', userError);
      return res.status(500).json({ error: 'Database error' });
    }

    // If user doesn't exist, check if email is already registered
    if (!user) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email, oauth_provider')
        .eq('email', email)
        .maybeSingle();

      if (existingUser) {
        // Email exists but not with Google OAuth - link accounts
        if (!existingUser.oauth_provider) {
          // Update existing user to link Google account
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
              oauth_provider: 'google',
              oauth_id: googleId,
            })
            .eq('id', existingUser.id)
            .select('id, email, token_balance, is_admin, username, profile_picture_url, bio')
            .single();

          if (updateError) {
            console.error('Update user error:', updateError);
            return res.status(500).json({ error: 'Failed to link Google account' });
          }

          user = updatedUser;
        } else {
          return res.status(400).json({ 
            error: 'This email is already registered with a different sign-in method' 
          });
        }
      } else {
        // Create new user with Google OAuth
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email,
            password_hash: null, // OAuth users don't have passwords
            oauth_provider: 'google',
            oauth_id: googleId,
            token_balance: 1000, // Starter tokens
            is_admin: false,
          })
          .select('id, email, token_balance, is_admin, username, profile_picture_url, bio')
          .single();

        if (createError) {
          console.error('Create user error:', createError);
          return res.status(500).json({ error: 'Failed to create account' });
        }

        user = newUser;
      }
    }

    if (!user) {
      return res.status(500).json({ error: 'Failed to authenticate' });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        tokenBalance: user.token_balance,
        isAdmin: user.is_admin || false,
        username: user.username,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

export default router;
