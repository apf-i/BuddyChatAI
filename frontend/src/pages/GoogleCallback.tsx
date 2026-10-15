import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './Auth.css';

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Google sign-in was cancelled or failed');
        setLoading(false);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setLoading(false);
        return;
      }

      try {
        // Exchange code for token
        const response = await apiClient.post('/auth/google/callback', { code });

        // Login with the token
        login(response.data.token, response.data.user);
        navigate('/');
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to complete Google sign-in');
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, login, navigate]);

  return (
    <AppLayout className="auth-page">
      
      <div className="container">
        <div className="auth-container">
          <div className="auth-card">
            {loading ? (
              <>
                <h1>Completing sign-in...</h1>
                <p className="auth-subtitle">Please wait while we sign you in with Google</p>
              </>
            ) : (
              <>
                <h1>Sign-in failed</h1>
                <p className="auth-subtitle">{error || 'An error occurred'}</p>
                <button
                  onClick={() => navigate('/login')}
                  className="btn btn-primary auth-submit"
                >
                  Go to Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
