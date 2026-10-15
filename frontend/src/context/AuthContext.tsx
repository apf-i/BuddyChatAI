import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../api/client';

interface User {
  id: string;
  email: string;
  tokenBalance: number;
  isAdmin?: boolean;
  username?: string | null;
  profilePictureUrl?: string | null;
  bio?: string | null;
  referredByAffiliateId?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUserBalance: (newBalance: number) => void;
  refreshUserBalance: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Load from localStorage on mount
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }

    // Listen for token expiration events
    const handleTokenExpired = () => {
      // Clear authentication state
      setToken(null);
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    };

    window.addEventListener('auth:token-expired', handleTokenExpired);

    return () => {
      window.removeEventListener('auth:token-expired', handleTokenExpired);
    };
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  const updateUserBalance = (newBalance: number) => {
    if (user) {
      const updatedUser = { ...user, tokenBalance: newBalance };
      setUser(updatedUser);
      localStorage.setItem('auth_user', JSON.stringify(updatedUser));
    }
  };

  const refreshUserBalance = async () => {
    if (!token || !user) return;

    try {
      const response = await apiClient.get('/tokens/balance');
      if (response.data.balance !== undefined) {
        updateUserBalance(response.data.balance);
      }
    } catch (error) {
      console.error('Error refreshing token balance:', error);
    }
  };

  const refreshUser = async () => {
    if (!token) return;

    try {
      const response = await apiClient.get('/auth/me');
      if (response.data.user) {
        setUser(response.data.user);
        localStorage.setItem('auth_user', JSON.stringify(response.data.user));
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUserBalance, refreshUserBalance, refreshUser, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
