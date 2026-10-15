import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import FlagIcon from '../components/FlagIcon';
import FavoriteButton from '../components/FavoriteButton';
import ReportButton from '../components/ReportButton';
import '../components/CharacterCard.css';
import './CharacterDetail.css';

interface CharacterDetail {
  id: string;
  name: string;
  age?: number | null;
  location?: string | null;
  personality?: string;
  system_prompt?: string;
  hair?: string | null;
  style_outfit?: string | null;
  tags?: string[];
  images: string[];
  previewImage: string | null;
  featured?: boolean;
  uploaderUserId?: string | null;
  uploaderUsername?: string | null;
  uploaderProfilePicture?: string | null;
}

export default function CharacterDetail() {
  const { characterId, type } = useParams<{ characterId: string; type: string }>();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const images = character?.images?.length
    ? character.images
    : character?.previewImage
      ? [character.previewImage]
      : [];

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const fetchCharacter = async () => {
      try {
        setLoading(true);
        let endpoint: string;

        if (type === 'user') {
          endpoint = `/characters/my-characters/${characterId}`;
        } else if (type === 'community') {
          endpoint = `/public/characters/${characterId}`;
        } else {
          endpoint = `/public/characters/${characterId}`;
        }

        const response = await apiClient.get(endpoint);
        setCharacter(response.data.character);
        setActiveImageIndex(0);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching character:', err);
        setError(err.response?.data?.error || 'Failed to load character');
      } finally {
        setLoading(false);
      }
    };

    if (characterId) {
      fetchCharacter();
    }
  }, [characterId, type, isAuthenticated, navigate]);

  const goToImage = useCallback(
    (delta: number) => {
      if (images.length <= 1) return;
      setActiveImageIndex((prev) => (prev + delta + images.length) % images.length);
    },
    [images.length]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        return;
      }

      if (images.length <= 1) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToImage(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToImage(1);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [images.length, goToImage]);

  const handleStartChat = async () => {
    if (!character) return;

    try {
      const response = await apiClient.post('/sessions/start', {
        ...(type === 'user'
          ? { user_character_id: character.id }
          : type === 'community'
            ? { community_character_id: character.id }
            : { template_id: character.id }),
      });
      navigate(`/chat/${response.data.sessionId}`);
    } catch (err: any) {
      console.error('Error starting session:', err);
      setError(err.response?.data?.error || 'Failed to start chat session');
    }
  };

  const handleToggleFeatured = async () => {
    if (!character || type === 'user') return;

    try {
      const response = await apiClient.post(`/admin/characters/${character.id}/featured`, {
        type: type === 'community' ? 'community' : 'template',
      });
      setCharacter({ ...character, featured: response.data.character.featured });
    } catch (err: any) {
      console.error('Error toggling featured status:', err);
      setError(err.response?.data?.error || 'Failed to update featured status');
    }
  };

  if (loading) {
    return (
      <AppLayout className="character-detail-page">
        <div className="character-detail-loading">Loading character...</div>
      </AppLayout>
    );
  }

  if (error || !character) {
    return (
      <AppLayout className="character-detail-page">
        <div className="character-detail-error">{error || 'Character not found'}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="character-detail-page">
      <div className="character-detail-container">
        <button
          type="button"
          className="character-detail-back"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/');
            }
          }}
        >
          ← Back
        </button>

        <div className="character-detail-layout">
          <section className="character-detail-gallery" aria-label={`Photos of ${character.name}`}>
            <div
              className="character-detail-hero"
              onClick={() => images.length > 0 && setLightboxOpen(true)}
              role={images.length > 0 ? 'button' : undefined}
              tabIndex={images.length > 0 ? 0 : undefined}
              onKeyDown={(e) => e.key === 'Enter' && images.length > 0 && setLightboxOpen(true)}
            >
              {images.length > 0 ? (
                <>
                  <img
                    src={images[activeImageIndex]}
                    alt={`${character.name} — photo ${activeImageIndex + 1}`}
                    className="character-detail-hero-img"
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="character-detail-nav character-detail-nav-prev"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToImage(-1);
                        }}
                        aria-label="Previous photo"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="character-detail-nav character-detail-nav-next"
                        onClick={(e) => {
                          e.stopPropagation();
                          goToImage(1);
                        }}
                        aria-label="Next photo"
                      >
                        ›
                      </button>
                      <span className="character-detail-counter">
                        {activeImageIndex + 1} / {images.length}
                      </span>
                    </>
                  )}
                  <span className="character-detail-expand-hint">Tap to enlarge</span>
                </>
              ) : (
                <div className="character-detail-no-image">No photos available</div>
              )}
            </div>

            {images.length > 1 && (
              <div className="character-detail-thumbs" role="tablist" aria-label="Photo thumbnails">
                {images.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeImageIndex}
                    aria-label={`Photo ${idx + 1}`}
                    className={`character-detail-thumb ${idx === activeImageIndex ? 'is-active' : ''}`}
                    onClick={() => setActiveImageIndex(idx)}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="character-detail-panel surface-card">
            <div className="character-detail-panel-header">
              <span className="character-online-badge">
                <span className="character-online-dot" aria-hidden="true" />
                Online
              </span>
              <h1 className="character-detail-name">{character.name}</h1>

              <div className="character-detail-meta">
                {character.age != null && (
                  <span className="character-detail-meta-item">{character.age} years old</span>
                )}
                {character.location && (
                  <span className="character-detail-meta-item">
                    <FlagIcon location={character.location} className="location-flag" size={16} />
                    {character.location}
                  </span>
                )}
              </div>

              {character.tags && character.tags.length > 0 && (
                <div className="character-detail-tags">
                  {character.tags.map((tag, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="character-detail-tag"
                      onClick={() => navigate(`/?tag=${encodeURIComponent(tag)}`)}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {character.personality && (
              <div className="character-detail-bio">
                <h2>About</h2>
                <p>{character.personality}</p>
              </div>
            )}

            {(character.hair || character.style_outfit) && (
              <div className="character-detail-traits">
                {character.hair && (
                  <div className="character-detail-trait">
                    <span className="character-detail-trait-label">Hair</span>
                    <span>{character.hair}</span>
                  </div>
                )}
                {character.style_outfit && (
                  <div className="character-detail-trait">
                    <span className="character-detail-trait-label">Style</span>
                    <span>{character.style_outfit}</span>
                  </div>
                )}
              </div>
            )}

            {type === 'community' && character.uploaderUsername && (
              <Link to={`/profile/${character.uploaderUsername}`} className="character-detail-creator">
                {character.uploaderProfilePicture ? (
                  <img
                    src={
                      character.uploaderProfilePicture.startsWith('/')
                        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${character.uploaderProfilePicture}`
                        : character.uploaderProfilePicture
                    }
                    alt=""
                    className="character-detail-creator-avatar"
                  />
                ) : (
                  <div className="character-detail-creator-avatar character-detail-creator-placeholder">
                    {character.uploaderUsername[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <span className="character-detail-creator-label">Created by</span>
                  <span className="character-detail-creator-name">{character.uploaderUsername}</span>
                </div>
              </Link>
            )}

            <div className="character-detail-actions">
              <button type="button" className="btn-ui btn-ui-primary character-detail-chat-btn" onClick={handleStartChat}>
                Start Chat
              </button>
              <div className="character-detail-secondary-actions">
                {type !== 'user' && (
                  <>
                    <FavoriteButton
                      characterType={type === 'community' ? 'community' : 'template'}
                      characterId={character.id}
                      className="detail-favorite-button"
                    />
                    {type === 'community' && (
                      <ReportButton
                        targetType="character"
                        targetId={character.id}
                        targetName={character.name}
                      />
                    )}
                  </>
                )}
                {user?.isAdmin && (
                  <>
                    <button
                      type="button"
                      className="character-detail-icon-btn"
                      onClick={() => navigate(`/admin/edit/${type}/${characterId}`)}
                      title="Edit Character"
                    >
                      ⚙️
                    </button>
                    {type !== 'user' && (
                      <button
                        type="button"
                        className={`character-detail-icon-btn ${character.featured ? 'is-featured' : ''}`}
                        onClick={handleToggleFeatured}
                        title={character.featured ? 'Remove from Featured' : 'Mark as Featured'}
                      >
                        {character.featured ? '⭐' : '☆'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {error && <p className="character-detail-inline-error">{error}</p>}
          </aside>
        </div>
      </div>

      {lightboxOpen && images.length > 0 && (
        <div
          className="character-detail-lightbox"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${character.name} photos`}
        >
          <div className="character-detail-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="character-detail-lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <img src={images[activeImageIndex]} alt={character.name} />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  className="character-detail-nav character-detail-nav-prev"
                  onClick={() => goToImage(-1)}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="character-detail-nav character-detail-nav-next"
                  onClick={() => goToImage(1)}
                  aria-label="Next photo"
                >
                  ›
                </button>
                <span className="character-detail-lightbox-counter">
                  {activeImageIndex + 1} / {images.length}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="character-detail-sticky-cta">
        <button type="button" className="btn-ui btn-ui-primary character-detail-chat-btn" onClick={handleStartChat}>
          Start Chat
        </button>
      </div>
    </AppLayout>
  );
}
