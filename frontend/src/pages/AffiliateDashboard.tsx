import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './AffiliateDashboard.css';

export default function AffiliateDashboard() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/affiliates/dashboard');
        setDashboardData(response.data);
        setError(null);
      } catch (err: any) {
        if (err.response?.status === 403 || err.response?.status === 404) {
          navigate('/affiliate/apply');
        } else {
          setError(err.response?.data?.error || 'Failed to load dashboard');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [isAuthenticated, navigate]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <AppLayout className="affiliate-dashboard-page">
        
        <div className="container">
          <div className="loading">Loading dashboard...</div>
        </div>
      </AppLayout>
    );
  }

  if (error && !dashboardData) {
    return (
      <AppLayout className="affiliate-dashboard-page">
        <div className="container">
          <div className="error-message">{error}</div>
        </div>
      </AppLayout>
    );
  }

  if (!dashboardData) {
    return null;
  }

  const { affiliate, commissions } = dashboardData;
  const minimumPayout = 1000; // $10.00 in cents

  return (
    <AppLayout className="affiliate-dashboard-page">
      <div className="container">
        <div className="affiliate-dashboard-container">
          <h1>Affiliate Dashboard</h1>

          {error && <div className="error-message">{error}</div>}

          <div className="dashboard-stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Earnings</div>
              <div className="stat-value">{formatCurrency(affiliate.totalEarningsCents)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pending Balance</div>
              <div className="stat-value pending">{formatCurrency(affiliate.pendingBalanceCents)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Paid Out</div>
              <div className="stat-value paid">{formatCurrency(affiliate.paidOutCents)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Referrals</div>
              <div className="stat-value">{affiliate.referralCount}</div>
            </div>
          </div>

          <div className="affiliate-link-section">
            <h2>Your Affiliate Link</h2>
            <div className="link-container">
              <input
                type="text"
                readOnly
                value={affiliate.link}
                className="affiliate-link-input"
              />
              <button
                className="btn btn-secondary copy-button"
                onClick={() => copyToClipboard(affiliate.link)}
              >
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>
            <p className="link-help-text">
              Share this link with others. When they sign up and make a purchase, you'll earn 25% commission!
            </p>
          </div>

          <div className="payout-info">
            <h2>Payout Information</h2>
            <div className="payout-details">
              <p><strong>Minimum Payout:</strong> {formatCurrency(minimumPayout)}</p>
              <p><strong>Current Pending:</strong> {formatCurrency(affiliate.pendingBalanceCents)}</p>
              {affiliate.pendingBalanceCents >= minimumPayout ? (
                <p className="payout-ready">✓ You're eligible for payout! Contact admin to request payment.</p>
              ) : (
                <p className="payout-pending">
                  You need {formatCurrency(minimumPayout - affiliate.pendingBalanceCents)} more to reach the minimum payout threshold.
                </p>
              )}
            </div>
          </div>

          <div className="commissions-section">
            <h2>Recent Commissions</h2>
            {commissions && commissions.length > 0 ? (
              <div className="commissions-list">
                {commissions.map((commission: any) => (
                  <div key={commission.id} className="commission-item">
                    <div className="commission-info">
                      <div className="commission-type">
                        {commission.purchaseType === 'token_package' ? '📦 Token Package' : '🔄 Subscription'}
                      </div>
                      <div className="commission-amount">
                        {formatCurrency(commission.commissionCents)}
                      </div>
                    </div>
                    <div className="commission-details">
                      <span className={`commission-status status-${commission.status}`}>
                        {commission.status === 'pending' && '⏳ Pending'}
                        {commission.status === 'paid' && '✅ Paid'}
                        {commission.status === 'cancelled' && '❌ Cancelled'}
                      </span>
                      <span className="commission-date">
                        {new Date(commission.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-commissions">No commissions yet. Start sharing your link to earn!</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
