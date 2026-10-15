import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../db/supabase';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

// CRITICAL: JWT_SECRET must be set in production
const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET || (process.env.NODE_ENV === 'production' && JWT_SECRET === 'your-secret-key-change-in-production')) {
  throw new Error('JWT_SECRET environment variable must be set and must not be the default value');
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { userId: string; email: string };
      req.userId = decoded.userId;
      req.userEmail = decoded.email;

      // Verify user still exists in database
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', decoded.userId)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token - user not found' });
      }

      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export function generateToken(userId: string, email: string): string {
  // Reduced from 7 days to 24 hours for better security
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '24h' });
}

export function generateRefreshToken(userId: string, email: string): string {
  // Refresh tokens last 7 days
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
}
