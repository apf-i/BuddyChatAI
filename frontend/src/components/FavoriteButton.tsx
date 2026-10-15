import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import './FavoriteButton.css';

interface FavoriteButtonProps {
  characterType: 'template' | 'community';
  characterId: string;
  className?: string;
}

export default function FavoriteButton({ characterType, characterId, className = '' }: FavoriteButtonProps) {
  const { isAuthenticated } = useAuth();
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      checkFavoriteStatus();
    } else {
      setChecking(false);
    }
  }, [isAuthenticated, characterType, characterId]);

  const checkFavoriteStatus = async () => {
    try {
      const response = await apiClient.get(`/favorites/check/${characterType}/${characterId}`);
      setIsFavorited(response.data.isFavorited);
    } catch (error) {
      console.error('Error checking favorite status:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    
    if (!isAuthenticated) {
      return;
    }

    setLoading(true);
    try {
      if (isFavorited) {
        await apiClient.delete(`/favorites/${characterType}/${characterId}`);
        setIsFavorited(false);
      } else {
        await apiClient.post('/favorites', {
          characterType,
          characterId,
        });
        setIsFavorited(true);
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      alert(error.response?.data?.error || 'Failed to update favorite');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated || checking) {
    return null;
  }

  return (
    <button
      className={`favorite-button ${className} ${isFavorited ? 'favorited' : ''}`}
      onClick={handleToggleFavorite}
      disabled={loading}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFavorited ? (
        <FaHeart className="favorite-icon filled" />
      ) : (
        <FaRegHeart className="favorite-icon" />
      )}
    </button>
  );
}
