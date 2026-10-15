import { Server as HTTPServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

// CRITICAL: JWT_SECRET must be set in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || (process.env.NODE_ENV === 'production' && JWT_SECRET === 'your-secret-key-change-in-production')) {
  throw new Error('JWT_SECRET environment variable must be set and must not be the default value');
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketServer | null = null;

// Map to track online users
const onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds
const userSockets = new Map<string, string>(); // socketId -> userId

export function initializeSocket(server: HTTPServer) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  
  io = new SocketServer(server, {
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Allow localhost on any port (for development)
        if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
          return callback(null, true);
        }
        
        // Allow the configured frontend URL
        if (origin === FRONTEND_URL) {
          return callback(null, true);
        }
        
        // Allow Vercel preview and production domains
        if (origin.includes('.vercel.app')) {
          return callback(null, true);
        }
        
        // Allow Railway preview domains (if needed)
        if (origin.includes('.railway.app')) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true, // Allow Engine.IO v3 clients
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        console.log('Socket auth: No token provided');
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as { userId: string; email: string };
        socket.userId = decoded.userId;
        console.log(`Socket auth: User ${decoded.userId} authenticated`);
        next();
      } catch (err) {
        console.log('Socket auth: Invalid token', err);
        return next(new Error('Authentication error: Invalid token'));
      }
    } catch (error) {
      console.log('Socket auth: Error', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const socketId = socket.id;

    console.log(`User ${userId} connected (socket: ${socketId})`);

    // Track user as online
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socketId);
    userSockets.set(socketId, userId);

    // Notify others that user is online
    socket.broadcast.emit('user:online', { userId });

    // Join user's personal room for notifications
    socket.join(`user:${userId}`);

    // Handle joining thread room
    socket.on('thread:join', (threadId: string) => {
      socket.join(`thread:${threadId}`);
      console.log(`User ${userId} joined thread ${threadId}`);
    });

    // Handle leaving thread room
    socket.on('thread:leave', (threadId: string) => {
      socket.leave(`thread:${threadId}`);
      console.log(`User ${userId} left thread ${threadId}`);
    });

    // Handle typing indicator
    socket.on('typing:start', (data: { threadId: string }) => {
      socket.to(`thread:${data.threadId}`).emit('typing:start', {
        userId,
        threadId: data.threadId,
      });
    });

    socket.on('typing:stop', (data: { threadId: string }) => {
      socket.to(`thread:${data.threadId}`).emit('typing:stop', {
        userId,
        threadId: data.threadId,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected (socket: ${socketId})`);
      
      // Remove from online users
      const userSocketsSet = onlineUsers.get(userId);
      if (userSocketsSet) {
        userSocketsSet.delete(socketId);
        if (userSocketsSet.size === 0) {
          onlineUsers.delete(userId);
          // Notify others that user is offline
          socket.broadcast.emit('user:offline', { userId });
        }
      }
      userSockets.delete(socketId);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

// Helper functions to emit events
export function emitNewMessage(threadId: string, message: any) {
  if (io) {
    io.to(`thread:${threadId}`).emit('message:new', message);
  }
}

export function emitMessageRead(threadId: string, messageId: string, userId: string) {
  if (io) {
    io.to(`thread:${threadId}`).emit('message:read', {
      messageId,
      userId,
      threadId,
    });
  }
}

export function emitNotification(userId: string, notification: any) {
  if (io) {
    io.to(`user:${userId}`).emit('notification:new', notification);
  }
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}
