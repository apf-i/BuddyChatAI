import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import FlagIcon from '../components/FlagIcon';
import FavoriteButton from '../components/FavoriteButton';
import './Gallery.css'; // Reuse gallery styles

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

export default function Favorites() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchFavorites();
  }, [isAuthenticated]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/favorites');
      setFavorites(response.data.favorites || []);
    } catch (err: any) {
      console.error('Error fetching favorites:', err);
      setError(err.response?.data?.error || 'Failed to load favorites');
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
    return (
      <div className="gallery-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading favorites...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gallery-page">
        
        <div className="container">
          <div className="error">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gallery-page">
      
      <div className="container">
        <div className="gallery-header">
          <h1>My Favorites</h1>
          {favorites.length > 0 && (
            <p className="subtitle">{favorites.length} favorite{favorites.length !== 1 ? 's' : ''}</p>
          )}
        </div>

        {favorites.length === 0 ? (
          <div className="empty-state">
            <h3>No favorites yet</h3>
            <p>Start favoriting characters to see them here!</p>
          </div>
        ) : (
          <div className="character-grid">
            {favorites.map((favorite) => (
              <div
                key={favorite.id}
                className="character-card"
                onClick={() => handleCharacterClick(favorite)}
              >
                <div className="character-image">
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
                  <FavoriteButton
                    characterType={favorite.characterType as 'template' | 'community'}
                    characterId={favorite.characterId}
                  />
                  <div className="character-info-overlay">
                    <h3 className="character-name-overlay">{favorite.character.name}</h3>
                    {favorite.character.location && (
                      <p className="character-location-overlay">
                        {favorite.character.location}
                        <FlagIcon location={favorite.character.location} className="location-flag" size={16} />
                      </p>
                    )}
                    {favorite.character.age && (
                      <p className="character-age-overlay">{favorite.character.age} years old</p>
                    )}
                  </div>
                  {favorite.character.personality && (
                    <div className="character-description-overlay">
                      <p className="character-description-text">{favorite.character.personality}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
