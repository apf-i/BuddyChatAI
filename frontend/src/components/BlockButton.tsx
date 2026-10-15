import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './BlockButton.css';

interface BlockButtonProps {
  userId: string;
  username: string;
  onBlockChange?: () => void;
}

export default function BlockButton({ userId, username, onBlockChange }: BlockButtonProps) {
  const { isAuthenticated, user: currentUser } = useAuth();
  const [hasBlocked, setHasBlocked] = useState(false);
  const [isBlockedBy, setIsBlockedBy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isAuthenticated && currentUser?.id !== userId) {
      checkBlockStatus();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, userId, currentUser]);

  const checkBlockStatus = async () => {
    try {
      const response = await apiClient.get(`/blocks/check/${userId}`);
      setHasBlocked(response.data.hasBlocked);
      setIsBlockedBy(response.data.isBlockedBy);
    } catch (error) {
      console.error('Error checking block status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!isAuthenticated) {
      return;
    }

    if (currentUser?.id === userId) {
      return; // Can't block yourself
    }

    const action = hasBlocked ? 'unblock' : 'block';
    const confirmMessage = hasBlocked
      ? `Are you sure you want to unblock ${username}?`
      : `Are you sure you want to block ${username}? They won't be able to message you or see your profile.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setProcessing(true);
    try {
      if (hasBlocked) {
        await apiClient.delete(`/blocks/${userId}`);
        setHasBlocked(false);
      } else {
        await apiClient.post('/blocks', { blocked_user_id: userId });
        setHasBlocked(true);
      }
      if (onBlockChange) {
        onBlockChange();
      }
    } catch (error: any) {
      console.error('Error toggling block:', error);
      alert(error.response?.data?.error || `Failed to ${action} user`);
    } finally {
      setProcessing(false);
    }
  };

  if (!isAuthenticated || currentUser?.id === userId || loading) {
    return null;
  }

  // If blocked by this user, show a different message
  if (isBlockedBy) {
    return (
      <div className="block-status-message">
        This user has blocked you
      </div>
    );
  }

  return (
    <button
      className={`block-button ${hasBlocked ? 'blocked' : ''}`}
      onClick={handleToggleBlock}
      disabled={processing}
    >
      {processing ? '...' : hasBlocked ? 'Unblock' : 'Block'}
    </button>
  );
}
