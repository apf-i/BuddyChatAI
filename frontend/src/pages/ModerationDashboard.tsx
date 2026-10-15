import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import FlagIcon from '../components/FlagIcon';
import './ModerationDashboard.css';
import './Gallery.css'; // Reuse gallery styles

interface PendingCharacter {
  id: string;
  name: string;
  age: number | null;
  location: string | null;
  personality: string;
  tags: string[];
  images: string[];
  previewImage: string | null;
  createdAt: string;
  uploader: {
    userId: string;
    username: string | null;
    email: string | null;
  };
}

interface ModerationStats {
  pending: number;
  approved: number;
  rejected: number;
}

interface Report {
  id: string;
  reporter_user_id: string;
  target_type: 'user' | 'character' | 'message';
  target_id: string;
  reason: string;
  additional_details: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution_notes: string | null;
  users?: {
    id: string;
    username: string | null;
    email: string;
  };
  targetDetails?: any;
}

interface ReportStats {
  open: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
  total: number;
}

type TabType = 'characters' | 'reports';

export default function ModerationDashboard() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const [characters, setCharacters] = useState<PendingCharacter[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<ModerationStats>({ pending: 0, approved: 0, rejected: 0 });
  const [reportStats, setReportStats] = useState<ReportStats>({ open: 0, reviewing: 0, resolved: 0, dismissed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>({});
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<{ status?: string; target_type?: string }>({});
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !user?.isAdmin) {
      navigate('/');
      return;
    }
    fetchPendingCharacters();
    fetchStats();
    fetchReports();
    fetchReportStats();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
    }
  }, [activeTab, reportFilter]);

  const fetchPendingCharacters = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/admin/moderation/pending');
      setCharacters(response.data.characters || []);
    } catch (err: any) {
      console.error('Error fetching pending characters:', err);
      setError(err.response?.data?.error || 'Failed to load pending characters');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/admin/moderation/stats');
      setStats(response.data.stats);
    } catch (err: any) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchReports = async () => {
    try {
      setReportsLoading(true);
      const params = new URLSearchParams();
      if (reportFilter.status) params.append('status', reportFilter.status);
      if (reportFilter.target_type) params.append('target_type', reportFilter.target_type);
      
      const response = await apiClient.get(`/reports/moderation?${params.toString()}`);
      setReports(response.data.reports || []);
    } catch (err: any) {
      console.error('Error fetching reports:', err);
      setError(err.response?.data?.error || 'Failed to load reports');
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchReportStats = async () => {
    try {
      const response = await apiClient.get('/reports/moderation/stats');
      setReportStats(response.data.stats);
    } catch (err: any) {
      console.error('Error fetching report stats:', err);
    }
  };

  const handleReportStatusChange = async (reportId: string, status: string, notes?: string) => {
    try {
      setProcessing(reportId);
      await apiClient.patch(`/reports/${reportId}/status`, {
        status,
        resolution_notes: notes || undefined,
      });
      fetchReports();
      fetchReportStats();
      setSelectedReport(null);
      alert('Report status updated successfully');
    } catch (err: any) {
      console.error('Error updating report status:', err);
      alert(err.response?.data?.error || 'Failed to update report status');
    } finally {
      setProcessing(null);
    }
  };

  const handleReportAction = async (reportId: string, action: string) => {
    try {
      setProcessing(reportId);
      await apiClient.post(`/reports/${reportId}/action`, {
        action,
        notes: actionNotes || undefined,
      });
      fetchReports();
      fetchReportStats();
      setSelectedReport(null);
      setActionNotes('');
      alert('Action taken successfully');
    } catch (err: any) {
      console.error('Error taking action:', err);
      alert(err.response?.data?.error || 'Failed to take action');
    } finally {
      setProcessing(null);
    }
  };

  const handleApprove = async (characterId: string) => {
    try {
      setProcessing(characterId);
      await apiClient.post(`/admin/moderation/approve/${characterId}`);
      
      // Remove from list and refresh stats
      setCharacters(prev => prev.filter(c => c.id !== characterId));
      fetchStats();
      
      alert('Character approved successfully!');
    } catch (err: any) {
      console.error('Error approving character:', err);
      alert(err.response?.data?.error || 'Failed to approve character');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (characterId: string) => {
    const reason = rejectReason[characterId]?.trim();
    
    if (!reason || reason.length === 0) {
      alert('Please provide a rejection reason');
      return;
    }

    if (reason.length > 500) {
      alert('Rejection reason must be less than 500 characters');
      return;
    }

    try {
      setProcessing(characterId);
      await apiClient.post(`/admin/moderation/reject/${characterId}`, { reason });
      
      // Remove from list and refresh stats
      setCharacters(prev => prev.filter(c => c.id !== characterId));
      setRejectReason(prev => {
        const newState = { ...prev };
        delete newState[characterId];
        return newState;
      });
      setShowRejectModal(null);
      fetchStats();
      
      alert('Character rejected successfully!');
    } catch (err: any) {
      console.error('Error rejecting character:', err);
      alert(err.response?.data?.error || 'Failed to reject character');
    } finally {
      setProcessing(null);
    }
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('/')) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      return `${apiUrl}${url}`;
    }
    return url;
  };

  if (loading) {
    return (
      <div className="moderation-dashboard-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading moderation dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="moderation-dashboard-page">
      
      <div className="container">
        <div className="moderation-header">
          <h1>Moderation Dashboard</h1>
          
          {/* Tab Navigation */}
          <div className="moderation-tabs">
            <button
              className={`moderation-tab ${activeTab === 'characters' ? 'active' : ''}`}
              onClick={() => setActiveTab('characters')}
            >
              Character Moderation
            </button>
            <button
              className={`moderation-tab ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              Reports Management
            </button>
          </div>

          {/* Stats */}
          {activeTab === 'characters' && (
            <div className="moderation-stats">
              <div className="stat-card stat-pending">
                <div className="stat-value">{stats.pending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-card stat-approved">
                <div className="stat-value">{stats.approved}</div>
                <div className="stat-label">Approved</div>
              </div>
              <div className="stat-card stat-rejected">
                <div className="stat-value">{stats.rejected}</div>
                <div className="stat-label">Rejected</div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="moderation-stats">
              <div className="stat-card stat-open">
                <div className="stat-value">{reportStats.open}</div>
                <div className="stat-label">Open</div>
              </div>
              <div className="stat-card stat-reviewing">
                <div className="stat-value">{reportStats.reviewing}</div>
                <div className="stat-label">Reviewing</div>
              </div>
              <div className="stat-card stat-resolved">
                <div className="stat-value">{reportStats.resolved}</div>
                <div className="stat-label">Resolved</div>
              </div>
              <div className="stat-card stat-dismissed">
                <div className="stat-value">{reportStats.dismissed}</div>
                <div className="stat-label">Dismissed</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {/* Reports Management Tab */}
        {activeTab === 'reports' && (
          <div className="reports-management-section">
            {/* Filters */}
            <div className="reports-filters">
              <select
                value={reportFilter.status || ''}
                onChange={(e) => setReportFilter(prev => ({
                  ...prev,
                  status: e.target.value || undefined
                }))}
                className="filter-select"
              >
                <option value="">All Statuses</option>
                <option value="active">Active (Open/Reviewing)</option>
                <option value="open">Open</option>
                <option value="reviewing">Reviewing</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
              <select
                value={reportFilter.target_type || ''}
                onChange={(e) => setReportFilter(prev => ({
                  ...prev,
                  target_type: e.target.value || undefined
                }))}
                className="filter-select"
              >
                <option value="">All Types</option>
                <option value="user">Users</option>
                <option value="character">Characters</option>
                <option value="message">Messages</option>
              </select>
            </div>

            {reportsLoading ? (
              <div className="loading">
                <p>Loading reports...</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="empty-state">
                <h3>No reports found</h3>
                <p>No reports match the current filters.</p>
              </div>
            ) : (
              <div className="reports-list">
                {reports.map((report) => (
                  <div key={report.id} className="report-card">
                    <div className="report-header">
                      <div className="report-meta">
                        <span className={`report-status-badge status-${report.status}`}>
                          {report.status}
                        </span>
                        <span className="report-type-badge">{report.target_type}</span>
                        <span className="report-date">
                          {new Date(report.created_at).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="view-report-button"
                        onClick={() => setSelectedReport(report)}
                      >
                        View Details
                      </button>
                    </div>
                    <div className="report-content">
                      <div className="report-reason">
                        <strong>Reason:</strong> {report.reason}
                      </div>
                      {report.additional_details && (
                        <div className="report-details">
                          <strong>Details:</strong> {report.additional_details}
                        </div>
                      )}
                      <div className="report-reporter">
                        <strong>Reported by:</strong> {report.users?.username || report.users?.email || 'Unknown'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Character Moderation Tab */}
        {activeTab === 'characters' && characters.length === 0 ? (
          <div className="empty-state">
            <h3>No pending characters</h3>
            <p>All community character uploads have been reviewed.</p>
          </div>
        ) : (
          <div className="pending-characters-list">
            {characters.map((character) => (
              <div key={character.id} className="moderation-character-card">
                <div className="character-preview-section">
                  <div className="character-images">
                    {character.images.length > 0 ? (
                      <div className="image-gallery">
                        {character.images.slice(0, 3).map((img, index) => (
                          <img
                            key={index}
                            src={getImageUrl(img) || ''}
                            alt={`${character.name} ${index + 1}`}
                            className="preview-image"
                          />
                        ))}
                        {character.images.length > 3 && (
                          <div className="more-images-indicator">
                            +{character.images.length - 3} more
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="image-placeholder">
                        <span>No Image</span>
                      </div>
                    )}
                  </div>

                  <div className="character-info-section">
                    <div className="character-header">
                      <h2>{character.name}</h2>
                      <div className="character-meta">
                        {character.age && <span className="meta-item">Age: {character.age}</span>}
                        {character.location && (
                          <span className="meta-item">
                            Location: {character.location}
                            <FlagIcon location={character.location} className="location-flag" size={14} />
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="character-personality">
                      <h3>Personality</h3>
                      <p>{character.personality}</p>
                    </div>

                    {character.tags && character.tags.length > 0 && (
                      <div className="character-tags">
                        <h3>Tags</h3>
                        <div className="tags-list">
                          {character.tags.map((tag, index) => (
                            <span key={index} className="tag">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="uploader-info">
                      <h3>Uploaded By</h3>
                      <p>
                        {character.uploader.username || character.uploader.email || 'Unknown User'}
                      </p>
                      <small>Uploaded: {new Date(character.createdAt).toLocaleString()}</small>
                    </div>
                  </div>
                </div>

                <div className="moderation-actions">
                  <button
                    className="btn-approve"
                    onClick={() => handleApprove(character.id)}
                    disabled={processing === character.id}
                  >
                    {processing === character.id ? 'Processing...' : '✓ Approve'}
                  </button>
                  <button
                    className="btn-reject"
                    onClick={() => setShowRejectModal(character.id)}
                    disabled={processing === character.id}
                  >
                    ✗ Reject
                  </button>
                </div>

                {showRejectModal === character.id && (
                  <div className="reject-modal-overlay" onClick={() => setShowRejectModal(null)}>
                    <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
                      <h3>Reject Character</h3>
                      <p>Please provide a reason for rejection. This will be shown to the uploader.</p>
                      <textarea
                        value={rejectReason[character.id] || ''}
                        onChange={(e) => setRejectReason(prev => ({
                          ...prev,
                          [character.id]: e.target.value
                        }))}
                        placeholder="Enter rejection reason..."
                        rows={4}
                        maxLength={500}
                      />
                      <div className="modal-actions">
                        <button
                          className="btn-cancel"
                          onClick={() => {
                            setShowRejectModal(null);
                            setRejectReason(prev => {
                              const newState = { ...prev };
                              delete newState[character.id];
                              return newState;
                            });
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn-confirm-reject"
                          onClick={() => handleReject(character.id)}
                          disabled={!rejectReason[character.id]?.trim()}
                        >
                          Confirm Rejection
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Report Detail Modal */}
        {selectedReport && (
          <div className="modal-overlay" onClick={() => {
            setSelectedReport(null);
            setActionNotes('');
          }}>
            <div className="report-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Report Details</h2>
                <button className="close-modal" onClick={() => {
                  setSelectedReport(null);
                  setActionNotes('');
                }}>×</button>
              </div>
              
              <div className="modal-content">
                <div className="report-detail-section">
                  <h3>Report Information</h3>
                  <div className="detail-row">
                    <strong>Status:</strong>
                    <span className={`report-status-badge status-${selectedReport.status}`}>
                      {selectedReport.status}
                    </span>
                  </div>
                  <div className="detail-row">
                    <strong>Type:</strong>
                    <span className="report-type-badge">{selectedReport.target_type}</span>
                  </div>
                  <div className="detail-row">
                    <strong>Reported by:</strong>
                    <span>{selectedReport.users?.username || selectedReport.users?.email || 'Unknown'}</span>
                  </div>
                  <div className="detail-row">
                    <strong>Date:</strong>
                    <span>{new Date(selectedReport.created_at).toLocaleString()}</span>
                  </div>
                  {selectedReport.reviewed_at && (
                    <div className="detail-row">
                      <strong>Reviewed:</strong>
                      <span>{new Date(selectedReport.reviewed_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="report-detail-section">
                  <h3>Reason</h3>
                  <p>{selectedReport.reason}</p>
                </div>

                {selectedReport.additional_details && (
                  <div className="report-detail-section">
                    <h3>Additional Details</h3>
                    <p>{selectedReport.additional_details}</p>
                  </div>
                )}

                {selectedReport.targetDetails && (
                  <div className="report-detail-section">
                    <h3>Target Details</h3>
                    {selectedReport.target_type === 'user' && (
                      <div>
                        <p><strong>Username:</strong> {selectedReport.targetDetails.username || 'N/A'}</p>
                        <p><strong>Email:</strong> {selectedReport.targetDetails.email || 'N/A'}</p>
                      </div>
                    )}
                    {selectedReport.target_type === 'character' && (
                      <div>
                        <p><strong>Name:</strong> {selectedReport.targetDetails.name || 'N/A'}</p>
                        <p><strong>Status:</strong> {selectedReport.targetDetails.status || 'N/A'}</p>
                        {selectedReport.targetDetails.image_url && (
                          <img
                            src={getImageUrl(selectedReport.targetDetails.image_url) || ''}
                            alt={selectedReport.targetDetails.name}
                            className="target-image"
                          />
                        )}
                      </div>
                    )}
                    {selectedReport.target_type === 'message' && (
                      <div>
                        <p><strong>Content:</strong> {selectedReport.targetDetails.content || 'N/A'}</p>
                        <p><strong>Sent:</strong> {selectedReport.targetDetails.created_at ? new Date(selectedReport.targetDetails.created_at).toLocaleString() : 'N/A'}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedReport.resolution_notes && (
                  <div className="report-detail-section">
                    <h3>Resolution Notes</h3>
                    <p>{selectedReport.resolution_notes}</p>
                  </div>
                )}

                {selectedReport.status === 'open' || selectedReport.status === 'reviewing' ? (
                  <div className="report-actions-section">
                    <h3>Actions</h3>
                    <textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="Add notes about the action taken..."
                      rows={3}
                      className="action-notes"
                    />
                    <div className="action-buttons">
                      {selectedReport.target_type === 'user' && (
                        <button
                          className="btn-action btn-ban"
                          onClick={() => handleReportAction(selectedReport.id, 'ban_user')}
                          disabled={processing === selectedReport.id}
                        >
                          Ban User
                        </button>
                      )}
                      {selectedReport.target_type === 'character' && (
                        <button
                          className="btn-action btn-remove"
                          onClick={() => handleReportAction(selectedReport.id, 'remove_character')}
                          disabled={processing === selectedReport.id}
                        >
                          Remove Character
                        </button>
                      )}
                      {selectedReport.target_type === 'message' && (
                        <button
                          className="btn-action btn-delete"
                          onClick={() => handleReportAction(selectedReport.id, 'delete_message')}
                          disabled={processing === selectedReport.id}
                        >
                          Delete Message
                        </button>
                      )}
                      <button
                        className="btn-action btn-resolve"
                        onClick={() => handleReportStatusChange(selectedReport.id, 'resolved', actionNotes)}
                        disabled={processing === selectedReport.id}
                      >
                        Mark Resolved
                      </button>
                      <button
                        className="btn-action btn-dismiss"
                        onClick={() => handleReportStatusChange(selectedReport.id, 'dismissed', actionNotes)}
                        disabled={processing === selectedReport.id}
                      >
                        Dismiss
                      </button>
                      <button
                        className="btn-action btn-reviewing"
                        onClick={() => handleReportStatusChange(selectedReport.id, 'reviewing')}
                        disabled={processing === selectedReport.id}
                      >
                        Mark as Reviewing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="report-actions-section">
                    <p className="resolved-message">This report has been {selectedReport.status}.</p>
                    <button
                      className="btn-action btn-reopen"
                      onClick={() => handleReportStatusChange(selectedReport.id, 'open')}
                      disabled={processing === selectedReport.id}
                    >
                      Reopen Report
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
