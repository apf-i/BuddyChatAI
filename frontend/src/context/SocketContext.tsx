import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Set<string>;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  onlineUsers: new Set(),
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Disconnect if not authenticated
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('auth_token');

    if (!token) {
      return;
    }

    // Check if backend is reachable before connecting
    // This prevents excessive connection attempts
    let isMounted = true;

    // Initialize socket connection with better error handling
    const newSocket = io(apiUrl, {
      auth: {
        token,
      },
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionDelay: 2000, // Increased delay
      reconnectionAttempts: 3, // Reduced attempts to avoid spam
      timeout: 10000, // Reduced timeout
      forceNew: false,
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });


    newSocket.on('connect_error', (error) => {
      // Only log once to avoid spam
      if (isMounted && !socket) {
        console.warn('Socket.io connection failed. Real-time features will be unavailable. Error:', error.message);
      }
      setIsConnected(false);
    });

    newSocket.on('error', (error) => {
      console.warn('Socket error:', error);
    });

    // Handle disconnection
    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      // If it's a transport error, don't worry - it will retry
      if (reason === 'transport close' || reason === 'transport error') {
        console.log('Transport error - will retry connection');
      }
    });

    // Handle online/offline status updates
    newSocket.on('user:online', (data: { userId: string }) => {
      setOnlineUsers(prev => new Set(prev).add(data.userId));
    });

    newSocket.on('user:offline', (data: { userId: string }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
    });

    if (isMounted) {
      setSocket(newSocket);
    } else {
      newSocket.disconnect();
    }

    return () => {
      isMounted = false;
      newSocket.disconnect();
    };
  }, [isAuthenticated, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
}
