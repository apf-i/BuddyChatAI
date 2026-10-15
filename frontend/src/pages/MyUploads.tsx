import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import FlagIcon from '../components/FlagIcon';
import './MyUploads.css';
import './Gallery.css'; // Reuse gallery styles

interface UploadedCharacter {
  id: string;
  name: string;
  age: number | null;
  location: string | null;
  personality: string;
  imageUrl: string | null;
  images: string[];
  tags: string[];
  status: 'pending' | 'approved' | 'rejected';
  moderationReason: string | null;
  createdAt: string;
  approvedAt: string | null;
}

export default function MyUploads() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<UploadedCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchUploads();
  }, [isAuthenticated]);

  const fetchUploads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/community/characters/my-uploads');
      setCharacters(response.data.characters || []);
    } catch (err: any) {
      console.error('Error fetching uploads:', err);
      setError(err.response?.data?.error || 'Failed to load uploads');
    } finally {
      setLoading(false);
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

  const handleDeleteUpload = async (characterId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await apiClient.delete(`/community/characters/${characterId}`);
      await fetchUploads();
    } catch (err: any) {
      console.error('Error deleting upload:', err);
      alert(err.response?.data?.error || 'Failed to delete upload');
    }
  };

  const getStatusBadge = (status: string, reason: string | null) => {
    switch (status) {
      case 'approved':
        return <span className="status-badge status-approved">✓ Approved</span>;
      case 'rejected':
        return (
          <div className="status-badge-container">
            <span className="status-badge status-rejected">✗ Rejected</span>
            {reason && (
              <div className="rejection-reason">
                <strong>Reason:</strong> {reason}
              </div>
            )}
          </div>
        );
      case 'pending':
      default:
        return <span className="status-badge status-pending">⏳ Pending</span>;
    }
  };

  const groupedCharacters = {
    pending: characters.filter(c => c.status === 'pending'),
    approved: characters.filter(c => c.status === 'approved'),
    rejected: characters.filter(c => c.status === 'rejected'),
  };

  if (loading) {
    return (
      <div className="my-uploads-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading your uploads...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-uploads-page">
        
        <div className="container">
          <div className="error">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-uploads-page">
      
      <div className="container">
        <div className="my-uploads-header">
          <h1>My Uploads</h1>
          <button
            className="upload-new-button"
            onClick={() => navigate('/upload-character')}
          >
            Upload New Character
          </button>
        </div>

        {characters.length === 0 ? (
          <div className="empty-state">
            <h3>No uploads yet</h3>
            <p>Upload your first character to share it with the community!</p>
            <button
              className="upload-new-button"
              onClick={() => navigate('/upload-character')}
            >
              Upload Character
            </button>
          </div>
        ) : (
          <>
            {groupedCharacters.pending.length > 0 && (
              <div className="uploads-section">
                <h2>Pending Review ({groupedCharacters.pending.length})</h2>
                <div className="character-grid">
                  {groupedCharacters.pending.map((character) => (
                    <div key={character.id} className="character-card">
                      <div className="character-image">
                        {character.imageUrl ? (
                          <img
                            src={getImageUrl(character.imageUrl) || ''}
                            alt={character.name}
                            className="character-image-img"
                          />
                        ) : (
                          <div className="image-placeholder">
                            <span>No Image</span>
                          </div>
                        )}
                        <div className="character-status-overlay">
                          {getStatusBadge(character.status, character.moderationReason)}
                        </div>
                        <button
                          className="delete-upload-button"
                          onClick={() => handleDeleteUpload(character.id, character.name)}
                          title="Delete upload"
                          type="button"
                        >
                          ×
                        </button>
                        <div className="character-info-overlay">
                          <h3 className="character-name-overlay">{character.name}</h3>
                          {character.location && (
                            <p className="character-location-overlay">
                              {character.location}
                              <FlagIcon location={character.location} className="location-flag" size={16} />
                            </p>
                          )}
                          {character.age && (
                            <p className="character-age-overlay">{character.age} years old</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groupedCharacters.approved.length > 0 && (
              <div className="uploads-section">
                <h2>Approved ({groupedCharacters.approved.length})</h2>
                <div className="character-grid">
                  {groupedCharacters.approved.map((character) => (
                    <div key={character.id} className="character-card">
                      <div className="character-image">
                        {character.imageUrl ? (
                          <img
                            src={getImageUrl(character.imageUrl) || ''}
                            alt={character.name}
                            className="character-image-img"
                          />
                        ) : (
                          <div className="image-placeholder">
                            <span>No Image</span>
                          </div>
                        )}
                        <div className="character-status-overlay">
                          {getStatusBadge(character.status, character.moderationReason)}
                        </div>
                        <button
                          className="delete-upload-button"
                          onClick={() => handleDeleteUpload(character.id, character.name)}
                          title="Delete upload"
                          type="button"
                        >
                          ×
                        </button>
                        <div className="character-info-overlay">
                          <h3 className="character-name-overlay">{character.name}</h3>
                          {character.location && (
                            <p className="character-location-overlay">
                              {character.location}
                              <FlagIcon location={character.location} className="location-flag" size={16} />
                            </p>
                          )}
                          {character.age && (
                            <p className="character-age-overlay">{character.age} years old</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groupedCharacters.rejected.length > 0 && (
              <div className="uploads-section">
                <h2>Rejected ({groupedCharacters.rejected.length})</h2>
                <div className="character-grid">
                  {groupedCharacters.rejected.map((character) => (
                    <div key={character.id} className="character-card">
                      <div className="character-image">
                        {character.imageUrl ? (
                          <img
                            src={getImageUrl(character.imageUrl) || ''}
                            alt={character.name}
                            className="character-image-img"
                          />
                        ) : (
                          <div className="image-placeholder">
                            <span>No Image</span>
                          </div>
                        )}
                        <div className="character-status-overlay">
                          {getStatusBadge(character.status, character.moderationReason)}
                        </div>
                        <button
                          className="delete-upload-button"
                          onClick={() => handleDeleteUpload(character.id, character.name)}
                          title="Delete upload"
                          type="button"
                        >
                          ×
                        </button>
                        <div className="character-info-overlay">
                          <h3 className="character-name-overlay">{character.name}</h3>
                          {character.location && (
                            <p className="character-location-overlay">
                              {character.location}
                              <FlagIcon location={character.location} className="location-flag" size={16} />
                            </p>
                          )}
                          {character.age && (
                            <p className="character-age-overlay">{character.age} years old</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
