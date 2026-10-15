import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import FlagIcon from './FlagIcon';
import './ProfileFavoritesTab.css';

interface Favorite {
  id: string;
  characterType: string;
  characterId: string;
  character: {
    id: string;
    name: string;
    age: number | null;
    location: string | null;
    imageUrl: string | null;
    images: string[];
    tags: string[];
    personality: string | null;
  };
  createdAt: string;
}

interface ProfileFavoritesTabProps {
  username: string;
}

export default function ProfileFavoritesTab({ username }: ProfileFavoritesTabProps) {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFavorites();
  }, [username]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/favorites/user/${username}`);
      setFavorites(response.data.favorites || []);
    } catch (err: any) {
      console.error('Error fetching favorites:', err);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterClick = (favorite: Favorite) => {
    const type = favorite.characterType === 'template' ? 'template' : 'community';
    navigate(`/character/${type}/${favorite.characterId}`);
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
    return <div className="profile-favorites-tab loading">Loading favorites...</div>;
  }

  if (favorites.length === 0) {
    return (
      <div className="profile-favorites-tab">
        <div className="empty-state">
          <p>No favorite characters yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-favorites-tab">
      <div className="favorites-grid">
        {favorites.map((favorite) => (
          <div
            key={favorite.id}
            className="favorite-character-card"
            onClick={() => handleCharacterClick(favorite)}
          >
            <div className="favorite-character-image">
              {favorite.character.imageUrl ? (
                <img
                  src={getImageUrl(favorite.character.imageUrl) || ''}
                  alt={favorite.character.name}
                  className="character-image-img"
                />
              ) : (
                <div className="image-placeholder">
                  <span>No Image</span>
                </div>
              )}
              <div className="favorite-character-overlay">
                <h3 className="favorite-character-name">{favorite.character.name}</h3>
                {favorite.character.location && (
                  <p className="favorite-character-location">
                    {favorite.character.location}
                    <FlagIcon location={favorite.character.location} className="location-flag" size={16} />
                  </p>
                )}
                {favorite.character.age && (
                  <p className="favorite-character-age">{favorite.character.age} years old</p>
                )}
              </div>
              {favorite.character.personality && (
                <div className="favorite-character-description">
                  <p>{favorite.character.personality}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
