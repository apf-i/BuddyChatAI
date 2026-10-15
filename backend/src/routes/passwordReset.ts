import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { supabase } from '../db/supabase';
import { sendPasswordResetEmail } from '../services/email';
import { passwordResetRateLimiter } from '../middleware/rateLimit';

const router = express.Router();

const requestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Request password reset
router.post('/request', passwordResetRateLimiter, async (req, res) => {
  try {
    const validated = requestResetSchema.parse(req.body);
    const { email } = validated;

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    // Don't reveal if user exists or not (security best practice)
    if (userError || !user) {
      // Still return success to prevent email enumeration
      return res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    // Delete any existing tokens for this user
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('used', false);

    // Create new reset token
    const { error: tokenError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (tokenError) {
      console.error('Error creating reset token:', tokenError);
      return res.status(500).json({ error: 'Failed to create reset token' });
    }

    // Send email
    const emailSent = await sendPasswordResetEmail(user.email, token);
    
    if (!emailSent) {
      console.warn('⚠️  Email could not be sent. Check SMTP configuration or see console for email details.');
    }

    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Request password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify reset token
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: resetToken, error } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used')
      .eq('token', token)
      .single();

    if (error || !resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token is used
    if (resetToken.used) {
      return res.status(400).json({ error: 'This reset token has already been used' });
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(resetToken.expires_at);
    if (now > expiresAt) {
      return res.status(400).json({ error: 'This reset token has expired' });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password
router.post('/reset', async (req, res) => {
  try {
    const validated = resetPasswordSchema.parse(req.body);
    const { token, password } = validated;

    // Find and verify token
    const { data: resetToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used')
      .eq('token', token)
      .single();

    if (tokenError || !resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token is used
    if (resetToken.used) {
      return res.status(400).json({ error: 'This reset token has already been used' });
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(resetToken.expires_at);
    if (now > expiresAt) {
      return res.status(400).json({ error: 'This reset token has expired' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', resetToken.user_id);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', resetToken.id);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
