import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import sessionRoutes from './routes/sessions';
import chatRoutes from './routes/chat';
import characterRoutes from './routes/characters';
import adminRoutes from './routes/admin';
import tokenRoutes from './routes/tokens';
import userRoutes from './routes/users';
import favoriteRoutes from './routes/favorites';
import communityRoutes from './routes/community';
import followRoutes from './routes/follows';
import messageRoutes from './routes/messages';
import blockRoutes from './routes/blocks';
import reportRoutes from './routes/reports';
import showcaseRoutes from './routes/showcases';
import passwordResetRoutes from './routes/passwordReset';
import tagsRoutes from './routes/tags';
import affiliateRoutes from './routes/affiliates';
import { paymentWebhookRouter } from './routes/payment-webhook';
import { testConnection } from './db/supabase';
import { initializeSocket } from './services/socket';
import { apiRateLimiter } from './middleware/rateLimit';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// NOWPayments IPN webhook (before express.json)
app.use('/payment', paymentWebhookRouter);

// Security headers (helmet)
// Configure Helmet to allow cross-origin image loading
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http:"], // Allow images from any source
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for Socket.io
  crossOriginResourcePolicy: false, // Allow cross-origin image loading (disabled, handled by explicit headers)
}));

// Rate limiting
app.use('/api', apiRateLimiter);

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without origin for:
    // 1. Health checks and static file requests
    // 2. Direct image access (browsers don't send Origin for direct image loads)
    // 3. Development environment
    if (!origin) {
      // Allow no-origin requests (for static files, health checks, direct image loads)
      // These are safe GET requests and don't pose CSRF risk
      return callback(null, true);
    }
    
    // Allow localhost on any port (for development)
    if (process.env.NODE_ENV !== 'production') {
      if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
        return callback(null, true);
      }
      // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/) || 
          origin.match(/^http:\/\/10\.\d+\.\d+\.\d+:\d+$/) ||
          origin.match(/^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+:\d+$/)) {
        return callback(null, true);
      }
    }
    
    // Allow the configured frontend URL
    if (FRONTEND_URL && origin === FRONTEND_URL) {
      return callback(null, true);
    }
    
    // Allow custom domains that match FRONTEND_URL (with or without www)
    if (FRONTEND_URL) {
      const frontendDomain = FRONTEND_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const originDomain = origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
      
      // Exact match
      if (originDomain === frontendDomain) {
        return callback(null, true);
      }
      
      // Match with/without www prefix
      const frontendWithoutWww = frontendDomain.replace(/^www\./, '');
      const originWithoutWww = originDomain.replace(/^www\./, '');
      if (frontendWithoutWww === originWithoutWww) {
        return callback(null, true);
      }
    }
    
    // Allow Vercel preview and production domains
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // Allow Railway preview domains (if needed)
    if (origin.includes('.railway.app')) {
      return callback(null, true);
    }
    
    // Allow Render domains (if needed)
    if (origin.includes('.onrender.com')) {
      return callback(null, true);
    }
    
    // In development, be more permissive
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Routes
app.use('/auth', authRoutes);
app.use('/public', publicRoutes);
app.use('/sessions', sessionRoutes);
app.use('/chat', chatRoutes);
app.use('/characters', characterRoutes);
app.use('/admin', adminRoutes);
app.use('/tokens', tokenRoutes);
app.use('/users', userRoutes);
app.use('/favorites', favoriteRoutes);
app.use('/community', communityRoutes);
app.use('/follows', followRoutes);
app.use('/messages', messageRoutes);
app.use('/blocks', blockRoutes);
app.use('/reports', reportRoutes);
app.use('/showcases', showcaseRoutes);
app.use('/password-reset', passwordResetRoutes);
app.use('/tags', tagsRoutes);
app.use('/affiliates', affiliateRoutes);

// Serve uploaded images with proper CORS headers
app.use('/uploads', (req, res, next) => {
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.sendStatus(204);
  }
  
  // Set CORS headers for static file requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(process.cwd(), 'uploads')));

// Basic error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  // SECURITY: Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({ 
    error: 'Internal server error',
    // Only show error message in development
    ...(isDevelopment && { message: err.message })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize Socket.io
initializeSocket(server);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`🌐 Network access: http://0.0.0.0:${PORT} (accessible from other devices on your network)`);
  console.log(`🔌 Socket.io server initialized`);
  // Test database connection on startup (non-blocking)
  testConnection().catch(err => {
    console.error('⚠️  Database connection test failed (server still running):', err.message);
  });
});
