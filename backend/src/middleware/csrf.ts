import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Store CSRF tokens in memory (in production, use Redis or similar)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (value.expiresAt < now) {
      csrfTokens.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * CSRF Protection Middleware
 * For state-changing operations (POST, PUT, DELETE, PATCH)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only apply to state-changing methods
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API endpoints that use Bearer tokens (already protected)
  // CSRF is mainly for cookie-based auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Bearer token auth doesn't need CSRF protection
    return next();
  }

  // Skip in development for easier testing (remove in production)
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  // Get CSRF token from header
  const csrfToken = req.headers['x-csrf-token'] as string;
  const sessionId = req.headers['x-session-id'] as string || req.ip;

  if (!csrfToken || !sessionId) {
    return res.status(403).json({ error: 'CSRF token required' });
  }

  const storedToken = csrfTokens.get(sessionId);

  if (!storedToken || storedToken.token !== csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  if (storedToken.expiresAt < Date.now()) {
    csrfTokens.delete(sessionId);
    return res.status(403).json({ error: 'CSRF token expired' });
  }

  next();
}

/**
 * Generate a CSRF token for a session
 */
export function generateCsrfToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour

  csrfTokens.set(sessionId, { token, expiresAt });
  return token;
}

/**
 * Get CSRF token endpoint (for frontend to retrieve token)
 */
export function getCsrfToken(req: Request, res: Response) {
  const sessionId = (req.headers['x-session-id'] as string) || req.ip || 'default';
  const token = generateCsrfToken(sessionId);

  res.json({ csrfToken: token });
}
