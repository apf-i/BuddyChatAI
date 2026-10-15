import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './FollowButton.css';

interface FollowButtonProps {
  userId: string;
  username: string;
  onFollowChange?: () => void;
}

export default function FollowButton({ userId, username, onFollowChange }: FollowButtonProps) {
  const { isAuthenticated, user: currentUser } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isAuthenticated && currentUser?.id !== userId) {
      checkFollowStatus();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, userId, currentUser]);

  const checkFollowStatus = async () => {
    try {
      const response = await apiClient.get(`/follows/check/${userId}`);
      setIsFollowing(response.data.isFollowing);
    } catch (error) {
      console.error('Error checking follow status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      return;
    }

    if (currentUser?.id === userId) {
      return; // Can't follow yourself
    }

    setProcessing(true);
    try {
      if (isFollowing) {
        await apiClient.delete(`/follows/${userId}`);
        setIsFollowing(false);
      } else {
        await apiClient.post('/follows', { following_user_id: userId });
        setIsFollowing(true);
      }
      if (onFollowChange) {
        onFollowChange();
      }
    } catch (error: any) {
      console.error('Error toggling follow:', error);
      alert(error.response?.data?.error || 'Failed to update follow status');
    } finally {
      setProcessing(false);
    }
  };

  if (!isAuthenticated || currentUser?.id === userId || loading) {
    return null;
  }

  return (
    <button
      className={`follow-button ${isFollowing ? 'following' : ''}`}
      onClick={handleToggleFollow}
      disabled={processing}
    >
      {processing ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
