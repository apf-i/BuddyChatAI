import axios from 'axios';

// Get API URL - use environment variable or detect from current location
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    let apiUrl = import.meta.env.VITE_API_URL.trim();
    // Ensure it's an absolute URL (starts with http:// or https://)
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      // If missing protocol, assume https for production
      apiUrl = `https://${apiUrl}`;
    }
    // Remove trailing slash if present
    apiUrl = apiUrl.replace(/\/+$/, '');
    return apiUrl;
  }
  
  // In development, use proxy path which Vite handles
  // This works for both localhost and network access
  if (import.meta.env.DEV) {
    // Vite proxy handles /api routes, so use relative path
    return '/api';
  }
  
  // Production fallback - should be set via VITE_API_URL
  return '';
};

// Get base URL for constructing absolute URLs (for images, etc.)
// This uses the current origin so it works on network access
export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    let apiUrl = import.meta.env.VITE_API_URL.trim();
    // Ensure it's an absolute URL (starts with http:// or https://)
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      // If missing protocol, assume https for production
      apiUrl = `https://${apiUrl}`;
    }
    // Remove trailing slash if present
    apiUrl = apiUrl.replace(/\/+$/, '');
    return apiUrl;
  }
  
  // In development, use current origin + /api for proxy
  // This way it works for both localhost and network IP access
  if (import.meta.env.DEV) {
    const origin = window.location.origin;
    return `${origin}/api`;
  }
  
  // Production fallback
  return '';
};

const API_URL = getApiUrl();

// Log API configuration for debugging
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:', {
    baseURL: API_URL,
    mode: import.meta.env.DEV ? 'development' : 'production',
    viteApiUrl: import.meta.env.VITE_API_URL || 'not set',
    origin: typeof window !== 'undefined' ? window.location.origin : 'N/A'
  });
}

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Log request in development
  if (import.meta.env.DEV) {
    console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  }
  return config;
}, (error) => {
  console.error('❌ Request interceptor error:', error);
  return Promise.reject(error);
});

// Handle 401 errors (invalid/expired tokens) and network errors
apiClient.interceptors.response.use(
  (response) => {
    // Log successful responses in development
    if (import.meta.env.DEV) {
      console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    }
    return response;
  },
  (error) => {
    // Enhanced error logging
    if (import.meta.env.DEV) {
      if (error.code === 'ECONNABORTED') {
        console.error(`⏱️ Request timeout: ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
        console.error('This usually means the backend server is not running or not accessible.');
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        console.error(`🌐 Network error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
        console.error('Possible causes:');
        console.error('  1. Backend server is not running (check http://localhost:3001)');
        console.error('  2. CORS issue (check backend CORS configuration)');
        console.error('  3. Firewall blocking the connection');
        console.error('  4. Proxy configuration issue (check vite.config.ts)');
      } else if (error.response) {
        console.error(`❌ API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response.status}`);
        console.error('Response:', error.response.data);
      } else {
        console.error('❌ Unknown error:', error);
      }
    }

    if (error.response?.status === 401) {
      // Clear authentication data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      
      // Only redirect if not already on login/signup page
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login') && !currentPath.includes('/signup') && !currentPath.includes('/auth/')) {
        // Dispatch a custom event to notify AuthContext
        window.dispatchEvent(new CustomEvent('auth:token-expired'));
        
        // Show a more user-friendly message
        const errorMessage = error.response?.data?.error || 'Your session has expired';
        console.warn('Authentication error:', errorMessage);
        
        // Delay redirect slightly to allow error message to display
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
