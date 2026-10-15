import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './AffiliateApply.css';

export default function AffiliateApply() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [affiliateStatus, setAffiliateStatus] = useState<any>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Check existing affiliate status
    const checkStatus = async () => {
      try {
        const response = await apiClient.get('/affiliates/status');
        if (response.data.affiliate) {
          setAffiliateStatus(response.data.affiliate);
          if (response.data.affiliate.status !== 'pending') {
            setApplied(true);
          }
        }
      } catch (err: any) {
        console.error('Error checking affiliate status:', err);
      }
    };

    checkStatus();
  }, [isAuthenticated, navigate]);

  const handleApply = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/affiliates/apply');
      setAffiliateStatus(response.data.affiliate);
      setApplied(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="affiliate-apply-page">
      
      <div className="container">
        <div className="affiliate-apply-container">
          <div className="affiliate-apply-card">
            <h1>Join Our Affiliate Program</h1>
            <p className="affiliate-subtitle">Earn 25% commission on every referral</p>

            {error && <div className="error-message">{error}</div>}

            {affiliateStatus ? (
              <div className="affiliate-status-section">
                <div className={`status-badge status-${affiliateStatus.status}`}>
                  {affiliateStatus.status === 'pending' && '⏳ Pending Approval'}
                  {affiliateStatus.status === 'approved' && '✅ Approved'}
                  {affiliateStatus.status === 'rejected' && '❌ Rejected'}
                  {affiliateStatus.status === 'suspended' && '⚠️ Suspended'}
                </div>

                <div className="affiliate-info">
                  <p><strong>Your Affiliate Code:</strong> <code>{affiliateStatus.code}</code></p>
                  <p><strong>Status:</strong> {affiliateStatus.status}</p>
                  {affiliateStatus.status === 'approved' && (
                    <div className="approved-message">
                      <p>🎉 Congratulations! Your affiliate account has been approved.</p>
                      <button
                        className="btn btn-primary"
                        onClick={() => navigate('/affiliate/dashboard')}
                      >
                        Go to Dashboard
                      </button>
                    </div>
                  )}
                  {affiliateStatus.status === 'rejected' && affiliateStatus.rejectionReason && (
                    <div className="rejection-message">
                      <p><strong>Reason:</strong> {affiliateStatus.rejectionReason}</p>
                    </div>
                  )}
                  {affiliateStatus.status === 'pending' && (
                    <div className="pending-message">
                      <p>Your application is being reviewed. We'll notify you once a decision has been made.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="affiliate-terms">
                <h2>How It Works</h2>
                <ul>
                  <li>Share your unique affiliate link with others</li>
                  <li>Earn 25% commission on every token package or subscription purchase</li>
                  <li>Commissions are tracked automatically</li>
                  <li>Minimum payout threshold: $10.00</li>
                  <li>Payouts are processed manually by admin</li>
                </ul>

                <h2>Terms & Conditions</h2>
                <ul>
                  <li>You must be an approved affiliate to earn commissions</li>
                  <li>Commissions are only paid on successful purchases</li>
                  <li>Affiliate links must be used at signup for attribution</li>
                  <li>We reserve the right to suspend or terminate affiliate accounts for violations</li>
                  <li>All payouts are subject to review and approval</li>
                </ul>

                <button
                  className="btn btn-primary btn-large"
                  onClick={handleApply}
                  disabled={loading || applied}
                >
                  {loading ? 'Submitting...' : 'Apply Now'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
