import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiClient.post('/password-reset/request', { email });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AppLayout className="auth-page">
        
        <div className="container">
          <div className="auth-container">
            <div className="auth-card">
              <h1>Check Your Email</h1>
              <p className="auth-subtitle">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <p className="auth-info">
                Click the link in the email to reset your password. The link will expire in 1 hour.
              </p>
              <p className="auth-info">
                Didn't receive the email? Check your spam folder or{' '}
                <button
                  onClick={() => {
                    setSuccess(false);
                    setEmail('');
                  }}
                  className="link-button"
                >
                  try again
                </button>
              </p>
              <Link to="/login" className="btn btn-primary auth-submit">
                Back to Login
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
            <h1>Forgot Password?</h1>
            <p className="auth-subtitle">Enter your email and we'll send you a reset link</p>

            {error && <div className="error-message">{error}</div>}

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

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p className="auth-footer">
              Remember your password? <Link to="/login">Login</Link>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
