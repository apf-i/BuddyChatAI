import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './ReportButton.css';

interface ReportButtonProps {
  targetType: 'user' | 'character' | 'message';
  targetId: string;
  targetName?: string;
  onReportSubmitted?: () => void;
}

const REPORT_REASONS = {
  user: [
    'Harassment or bullying',
    'Spam or fake account',
    'Inappropriate content',
    'Impersonation',
    'Other',
  ],
  character: [
    'Inappropriate content',
    'Violates community guidelines',
    'Copyright infringement',
    'Spam or misleading',
    'Other',
  ],
  message: [
    'Harassment or bullying',
    'Spam',
    'Inappropriate content',
    'Threats',
    'Other',
  ],
};

export default function ReportButton({ targetType, targetId, targetName, onReportSubmitted }: ReportButtonProps) {
  const { isAuthenticated } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  const handleOpenModal = () => {
    setShowModal(true);
    setReason('');
    setCustomReason('');
    setAdditionalDetails('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setReason('');
    setCustomReason('');
    setAdditionalDetails('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason && !customReason) {
      alert('Please select a reason or provide a custom reason');
      return;
    }

    const finalReason = reason === 'Other' ? customReason : reason;
    if (!finalReason || finalReason.trim().length === 0) {
      alert('Please provide a reason for reporting');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/reports', {
        target_type: targetType,
        target_id: targetId,
        reason: finalReason.trim(),
        additional_details: additionalDetails.trim() || undefined,
      });

      alert('Report submitted successfully. Thank you for helping keep our community safe.');
      handleCloseModal();
      if (onReportSubmitted) {
        onReportSubmitted();
      }
    } catch (error: any) {
      console.error('Error submitting report:', error);
      alert(error.response?.data?.error || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reasons = REPORT_REASONS[targetType] || REPORT_REASONS.user;

  return (
    <>
      <button className="report-button" onClick={handleOpenModal}>
        Report
      </button>

      {showModal && (
        <div className="report-modal-overlay" onClick={handleCloseModal}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>Report {targetType === 'user' ? 'User' : targetType === 'character' ? 'Character' : 'Message'}</h2>
              <button className="report-modal-close" onClick={handleCloseModal}>×</button>
            </div>

            <form onSubmit={handleSubmit} className="report-modal-form">
              <div className="report-modal-section">
                <label>
                  What's the reason for this report?
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required={!customReason}
                  >
                    <option value="">Select a reason</option>
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                {reason === 'Other' && (
                  <label>
                    Please provide details:
                    <textarea
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Describe the issue..."
                      rows={3}
                      required
                    />
                  </label>
                )}
              </div>

              <div className="report-modal-section">
                <label>
                  Additional details (optional):
                  <textarea
                    value={additionalDetails}
                    onChange={(e) => setAdditionalDetails(e.target.value)}
                    placeholder="Any additional information that might help..."
                    rows={4}
                    maxLength={1000}
                  />
                </label>
              </div>

              <div className="report-modal-actions">
                <button type="button" onClick={handleCloseModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting || (!reason && !customReason)}>
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
