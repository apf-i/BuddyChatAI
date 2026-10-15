import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './Auth.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Verify token on mount
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      setVerifying(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await apiClient.get(`/password-reset/verify/${token}`);
        if (response.data.valid) {
          setVerifying(false);
        } else {
          setError('Invalid or expired reset token');
          setVerifying(false);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Invalid or expired reset token');
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!token) {
      setError('Invalid reset token');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/password-reset/reset', {
        token,
        password,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <AppLayout className="auth-page">
        
        <div className="container">
          <div className="auth-container">
            <div className="auth-card">
              <h1>Verifying...</h1>
              <p className="auth-subtitle">Please wait while we verify your reset link</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (success) {
    return (
      <AppLayout className="auth-page">
        
        <div className="container">
          <div className="auth-container">
            <div className="auth-card">
              <h1>Password Reset Successful!</h1>
              <p className="auth-subtitle">Your password has been reset successfully.</p>
              <p className="auth-info">Redirecting to login page...</p>
              <Link to="/login" className="btn btn-primary auth-submit">
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="auth-page">
      
      <div className="container">
        <div className="auth-container">
          <div className="auth-card">
            <h1>Reset Password</h1>
            <p className="auth-subtitle">Enter your new password</p>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="password">New Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <p className="auth-footer">
              <Link to="/login">Back to Login</Link>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
