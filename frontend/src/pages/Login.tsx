import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import GoogleSignIn from '../components/GoogleSignIn';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      login(response.data.token, response.data.user);
      navigate('/');
    } catch (err: any) {
      let errorMessage = 'Login failed. ';
      if (err?.code === 'ECONNABORTED') {
        errorMessage += 'Request timed out. The backend server may not be running.';
      } else if (err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error')) {
        errorMessage += 'Cannot connect to backend server. Please check:';
        errorMessage += '\n1. Backend is running on http://localhost:3001';
        errorMessage += '\n2. Check browser console for more details';
      } else {
        errorMessage += err.response?.data?.error || 'Please try again.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout className="auth-page">
      
      <div className="container">
        <div className="auth-container">
          <div className="auth-card">
            <h1>Login</h1>
            <p className="auth-subtitle">Welcome back</p>

            {error && <div className="error-message">{error}</div>}

            <GoogleSignIn />

            <div className="auth-divider">
              <span>or</span>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading}
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <p className="auth-footer">
              Don't have an account? <Link to="/signup">Sign up</Link>
            </p>
            <p className="auth-footer">
              <Link to="/forgot-password">Forgot your password?</Link>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
