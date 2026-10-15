import { Response, NextFunction } from 'express';
import { supabase } from '../db/supabase';
import { AuthRequest, authMiddleware } from './auth';

/**
 * Admin middleware - checks if user is admin
 * Must be used after authMiddleware
 */
export async function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authorization error' });
  }
}

/**
 * Combined auth + admin middleware
 */
export const requireAdmin = [authMiddleware, adminMiddleware];
