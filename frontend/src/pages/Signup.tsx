import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import GoogleSignIn from '../components/GoogleSignIn';
import './Auth.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Capture affiliate code from URL parameter and store in localStorage
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      localStorage.setItem('affiliate_ref', refCode.trim().toUpperCase());
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Get affiliate code from localStorage if available
      const affiliateCode = localStorage.getItem('affiliate_ref');

      const response = await apiClient.post('/auth/signup', {
        email,
        password,
        ...(affiliateCode && { affiliate_code: affiliateCode }),
      });

      // Clear affiliate code from localStorage after successful signup
      if (affiliateCode) {
        localStorage.removeItem('affiliate_ref');
      }

      login(response.data.token, response.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout className="auth-page">
      
      <div className="container">
        <div className="auth-container">
          <div className="auth-card">
            <h1>Create Account</h1>
            <p className="auth-subtitle">Join BuddyChatAI</p>

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
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Sign Up'}
              </button>
            </form>

            <p className="auth-footer">
              Already have an account? <Link to="/login">Login</Link>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
