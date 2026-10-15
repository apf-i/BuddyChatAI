import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './AdminAffiliates.css';

export default function AdminAffiliates() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !user?.isAdmin) {
      navigate('/');
      return;
    }

    fetchAffiliates();
  }, [isAuthenticated, user, navigate]);

  const fetchAffiliates = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/affiliates/admin/all');
      setAffiliates(response.data.affiliates || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load affiliates');
    } finally {
      setLoading(false);
    }
  };

  const fetchAffiliateDetails = async (affiliateId: string) => {
    try {
      const response = await apiClient.get(`/affiliates/admin/${affiliateId}`);
      setSelectedAffiliate(response.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to load affiliate details');
    }
  };

  const handleApprove = async (affiliateId: string) => {
    if (!confirm('Approve this affiliate?')) return;

    try {
      await apiClient.post(`/affiliates/admin/${affiliateId}/approve`);
      await fetchAffiliates();
      if (selectedAffiliate?.affiliate?.id === affiliateId) {
        await fetchAffiliateDetails(affiliateId);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve affiliate');
    }
  };

  const handleReject = async (affiliateId: string) => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    if (!confirm('Reject this affiliate?')) return;

    try {
      await apiClient.post(`/affiliates/admin/${affiliateId}/reject`, {
        reason: rejectReason,
      });
      setRejectReason('');
      await fetchAffiliates();
      if (selectedAffiliate?.affiliate?.id === affiliateId) {
        await fetchAffiliateDetails(affiliateId);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject affiliate');
    }
  };

  const handlePayout = async (affiliateId: string) => {
    const amountCents = Math.round(parseFloat(payoutAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      alert('Please enter a valid payout amount');
      return;
    }

    if (!confirm(`Process payout of $${payoutAmount} to this affiliate?`)) return;

    try {
      await apiClient.post(`/affiliates/admin/${affiliateId}/payout`, {
        amount_cents: amountCents,
        commission_ids: selectedCommissions.length > 0 ? selectedCommissions : undefined,
      });
      setPayoutAmount('');
      setSelectedCommissions([]);
      await fetchAffiliates();
      if (selectedAffiliate?.affiliate?.id === affiliateId) {
        await fetchAffiliateDetails(affiliateId);
      }
      alert('Payout processed successfully');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to process payout');
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'approved':
        return 'status-approved';
      case 'pending':
        return 'status-pending';
      case 'rejected':
        return 'status-rejected';
      case 'suspended':
        return 'status-suspended';
      default:
        return '';
    }
  };

  if (!isAuthenticated || !user?.isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="admin-affiliates-page">
        
        <div className="container">
          <div className="loading">Loading affiliates...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-affiliates-page">
      
      <div className="container">
        <div className="admin-affiliates-container">
          <h1>Manage Affiliates</h1>

          {error && <div className="error-message">{error}</div>}

          <div className="affiliates-layout">
            <div className="affiliates-list">
              <h2>All Affiliates ({affiliates.length})</h2>
              {affiliates.length === 0 ? (
                <p className="no-affiliates">No affiliates yet</p>
              ) : (
                <div className="affiliates-table">
                  {affiliates.map((aff) => (
                    <div
                      key={aff.id}
                      className={`affiliate-row ${selectedAffiliate?.affiliate?.id === aff.id ? 'selected' : ''}`}
                      onClick={() => fetchAffiliateDetails(aff.id)}
                    >
                      <div className="affiliate-row-main">
                        <div className="affiliate-info">
                          <div className="affiliate-name">
                            {aff.username || aff.userEmail || 'Unknown User'}
                          </div>
                          <div className="affiliate-code">{aff.code}</div>
                        </div>
                        <div className={`status-badge ${getStatusBadgeClass(aff.status)}`}>
                          {aff.status}
                        </div>
                      </div>
                      <div className="affiliate-stats-row">
                        <span>Earnings: {formatCurrency(aff.totalEarningsCents)}</span>
                        <span>Pending: {formatCurrency(aff.pendingBalanceCents)}</span>
                        <span>Referrals: {aff.referralCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedAffiliate && (
              <div className="affiliate-details">
                <h2>Affiliate Details</h2>
                <div className="details-section">
                  <div className="detail-item">
                    <strong>User:</strong> {selectedAffiliate.affiliate.username || selectedAffiliate.affiliate.userEmail}
                  </div>
                  <div className="detail-item">
                    <strong>Code:</strong> <code>{selectedAffiliate.affiliate.code}</code>
                  </div>
                  <div className="detail-item">
                    <strong>Status:</strong>{' '}
                    <span className={`status-badge ${getStatusBadgeClass(selectedAffiliate.affiliate.status)}`}>
                      {selectedAffiliate.affiliate.status}
                    </span>
                  </div>
                  <div className="detail-item">
                    <strong>Total Earnings:</strong> {formatCurrency(selectedAffiliate.affiliate.totalEarningsCents)}
                  </div>
                  <div className="detail-item">
                    <strong>Pending Balance:</strong> {formatCurrency(selectedAffiliate.affiliate.pendingBalanceCents)}
                  </div>
                  <div className="detail-item">
                    <strong>Paid Out:</strong> {formatCurrency(selectedAffiliate.affiliate.paidOutCents)}
                  </div>
                  <div className="detail-item">
                    <strong>Referrals:</strong> {selectedAffiliate.affiliate.referralCount}
                  </div>
                </div>

                {selectedAffiliate.affiliate.status === 'pending' && (
                  <div className="action-section">
                    <h3>Actions</h3>
                    <div className="action-buttons">
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(selectedAffiliate.affiliate.id)}
                      >
                        Approve
                      </button>
                      <div className="reject-section">
                        <input
                          type="text"
                          placeholder="Rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="reject-input"
                        />
                        <button
                          className="btn btn-danger"
                          onClick={() => handleReject(selectedAffiliate.affiliate.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selectedAffiliate.affiliate.status === 'approved' && selectedAffiliate.affiliate.pendingBalanceCents > 0 && (
                  <div className="payout-section">
                    <h3>Process Payout</h3>
                    <div className="payout-form">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={(selectedAffiliate.affiliate.pendingBalanceCents / 100).toFixed(2)}
                        placeholder="Amount ($)"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        className="payout-input"
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePayout(selectedAffiliate.affiliate.id)}
                      >
                        Process Payout
                      </button>
                    </div>
                    <p className="payout-help">
                      Max: {formatCurrency(selectedAffiliate.affiliate.pendingBalanceCents)}
                    </p>
                  </div>
                )}

                {selectedAffiliate.commissions && selectedAffiliate.commissions.length > 0 && (
                  <div className="commissions-section">
                    <h3>Commissions ({selectedAffiliate.commissions.length})</h3>
                    <div className="commissions-list">
                      {selectedAffiliate.commissions.map((commission: any) => (
                        <div key={commission.id} className="commission-row">
                          <div className="commission-info">
                            <div>
                              {commission.purchase_type === 'token_package' ? '📦 Token Package' : '🔄 Subscription'}
                            </div>
                            <div className="commission-amount">{formatCurrency(commission.commission_cents)}</div>
                          </div>
                          <div className="commission-meta">
                            <span className={`status-badge ${getStatusBadgeClass(commission.status)}`}>
                              {commission.status}
                            </span>
                            <span className="commission-date">
                              {new Date(commission.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedAffiliate.referrals && selectedAffiliate.referrals.length > 0 && (
                  <div className="referrals-section">
                    <h3>Referrals ({selectedAffiliate.referrals.length})</h3>
                    <div className="referrals-list">
                      {selectedAffiliate.referrals.map((referral: any) => (
                        <div key={referral.id} className="referral-row">
                          <div>
                            {referral.referredUser.username || referral.referredUser.email || 'Unknown'}
                          </div>
                          <div className="referral-date">
                            {new Date(referral.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
