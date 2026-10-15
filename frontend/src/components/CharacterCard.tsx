import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FavoriteButton from './FavoriteButton';
import FlagIcon from './FlagIcon';
import './CharacterCard.css';

export interface CharacterCardData {
  id: string;
  name: string;
  age?: number | null;
  location?: string | null;
  previewImage: string | null;
  images?: string[];
  tags?: string[];
  isUserCharacter?: boolean;
  isCommunity?: boolean;
  personality?: string | null;
  featured?: boolean;
}

interface CharacterCardProps {
  character: CharacterCardData;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  isAdmin?: boolean;
  onToggleFeatured?: (characterId: string, characterType: 'template' | 'community', currentFeatured: boolean) => void;
  onTagClick?: (tag: string) => void;
  compact?: boolean;
}

export default function CharacterCard({
  character,
  onClick,
  onDelete,
  isAdmin,
  onToggleFeatured,
  onTagClick,
  compact = false,
}: CharacterCardProps) {
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [prevImageIndex, setPrevImageIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const initialDelayRef = useRef<number | null>(null);

  const images =
    character.images && character.images.length > 0
      ? character.images
      : character.previewImage
        ? [character.previewImage]
        : [];

  useEffect(() => {
    if (images.length > 1) {
      const randomDelay = Math.random() * 3000;
      initialDelayRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          setCurrentImageIndex((prev) => {
            setPrevImageIndex(prev);
            return (prev + 1) % images.length;
          });
        }, 3000);
      }, randomDelay);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (initialDelayRef.current) clearTimeout(initialDelayRef.current);
      };
    }
  }, [images.length]);

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (onTagClick) {
      onTagClick(tag);
    } else {
      navigate(`/?tag=${encodeURIComponent(tag)}`);
    }
  };

  return (
    <div
      className={`character-card-premium ${compact ? 'character-card-compact' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="character-card-image">
        {images.length > 0 ? (
          <div className="image-slider-container">
            {images.map((img, index) => (
              <img
                key={`${character.id}-${index}`}
                src={img}
                alt={character.name}
                className={`sliding-image ${
                  index === currentImageIndex ? 'active' : index === prevImageIndex ? 'prev' : 'hidden'
                }`}
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <div className="image-placeholder">
            <span>No Image</span>
          </div>
        )}

        {isAdmin && !character.isUserCharacter && onToggleFeatured && (
          <button
            type="button"
            className={`featured-toggle-button ${character.featured ? 'featured-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFeatured(
                character.id,
                character.isCommunity ? 'community' : 'template',
                character.featured || false
              );
            }}
            title={character.featured ? 'Remove from Featured' : 'Mark as Featured'}
          >
            {character.featured ? '★' : '☆'}
          </button>
        )}

        {character.featured && <div className="featured-model-badge">Featured</div>}

        {!character.isUserCharacter && (
          <FavoriteButton
            characterType={character.isCommunity ? 'community' : 'template'}
            characterId={character.id}
          />
        )}

        {(isAdmin || character.isUserCharacter) && onDelete && (
          <button
            type="button"
            className="delete-character-button"
            onClick={onDelete}
            title={isAdmin ? 'Admin: Delete character' : 'Delete character'}
          >
            ×
          </button>
        )}

        <div className="character-card-hover-cta">
          <span>Start chat</span>
        </div>

        <div className="character-info-overlay">
          <span className="character-online-badge">
            <span className="character-online-dot" aria-hidden="true" />
            Online
          </span>
          <h3 className="character-name-overlay">{character.name}</h3>
          {character.location && (
            <p className="character-location-overlay">
              {character.location}
              <FlagIcon location={character.location} className="location-flag" size={14} />
            </p>
          )}
          {character.age && <p className="character-age-overlay">{character.age} years old</p>}
          {character.tags && character.tags.length > 0 && (
            <div className="character-tags-overlay">
              {character.tags.slice(0, 3).map((tag, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="character-tag"
                  onClick={(e) => handleTagClick(e, tag)}
                >
                  #{tag}
                </button>
              ))}
              {character.tags.length > 3 && (
                <span className="character-tag-more">+{character.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {character.personality && !compact && (
          <div className="character-description-overlay">
            <p className="character-description-text">{character.personality}</p>
          </div>
        )}
      </div>
    </div>
  );
}
