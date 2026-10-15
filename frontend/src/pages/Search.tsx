import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import FlagIcon from '../components/FlagIcon';
import './Gallery.css';
import './Search.css';

interface Character {
  id: string;
  name: string;
  age?: number | null;
  location?: string | null;
  previewImage: string | null;
  images?: string[];
  tags: string[];
  isUserCharacter?: boolean;
  personality?: string | null;
}

interface User {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  bio: string | null;
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [characters, setCharacters] = useState<Character[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.isAdmin || false;

  useEffect(() => {
    if (query) {
      fetchSearchResults();
    } else {
      setCharacters([]);
      setLoading(false);
    }
  }, [query, isAuthenticated]);

  const fetchSearchResults = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch characters and users with search
      const searchParam = `?search=${encodeURIComponent(query)}`;
      const [publicResponse, userResponse, usersResponse] = await Promise.allSettled([
        apiClient.get(`/public/characters${searchParam}`),
        isAuthenticated ? apiClient.get(`/characters/my-characters${searchParam}`) : Promise.resolve(null),
        apiClient.get(`/public/users${searchParam}`)
      ]);
      
      // Check if responses have errors
      let hasError = false;
      let errorMessage = '';

      if (publicResponse.status === 'fulfilled' && publicResponse.value.data.error) {
        console.error('Public characters API error:', publicResponse.value.data.error);
        errorMessage = publicResponse.value.data.error;
        hasError = true;
      }

      if (publicResponse.status === 'rejected') {
        console.error('Public characters request failed:', publicResponse.reason);
        const errorMsg = publicResponse.reason?.response?.data?.error || publicResponse.reason?.message || 'Failed to load public characters';
        errorMessage = errorMsg;
        hasError = true;
      }

      if (isAuthenticated && userResponse.status === 'fulfilled' && userResponse.value?.data?.error) {
        console.error('User characters API error:', userResponse.value.data.error);
        if (!hasError) {
          errorMessage = userResponse.value.data.error;
          hasError = true;
        }
      }

      if (isAuthenticated && userResponse.status === 'rejected') {
        console.error('User characters request failed:', userResponse.reason);
        const errorMsg = userResponse.reason?.response?.data?.error || userResponse.reason?.message || 'Failed to load your characters';
        if (!hasError) {
          errorMessage = errorMsg;
          hasError = true;
        }
      }

      if (hasError) {
        setError(errorMessage);
        setCharacters([]);
        setLoading(false);
        return;
      }

      const publicChars = publicResponse.status === 'fulfilled' && !publicResponse.value.data.error
        ? (publicResponse.value.data.characters || []).map((char: any) => {
            // Handle both relative and absolute image URLs
            let imageUrl = char.image_url || null;
            if (imageUrl && imageUrl.startsWith('/')) {
              // Relative path - prepend backend URL
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
              imageUrl = `${apiUrl}${imageUrl}`;
            }
            // Handle image URLs - convert relative to absolute
            const allImages = (char.images || []).map((img: string) => {
              if (img && img.startsWith('/')) {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                return `${apiUrl}${img}`;
              }
              return img;
            });
            
            return {
              id: char.id,
              name: char.name,
              age: char.age || null,
              location: char.location || null,
              previewImage: imageUrl || allImages[0] || null,
              images: allImages.length > 0 ? allImages : (imageUrl ? [imageUrl] : []),
              tags: char.tags || [],
              category: char.category || null,
              isUserCharacter: false,
              personality: char.personality || null
            };
          })
        : [];

      const userChars = (isAuthenticated && userResponse.status === 'fulfilled' && userResponse.value && !userResponse.value.data?.error)
        ? (userResponse.value.data.characters || []).map((char: any) => {
            let imageUrl = char.image_url || null;
            if (imageUrl && imageUrl.startsWith('/')) {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
              imageUrl = `${apiUrl}${imageUrl}`;
            }
            const allImages = (char.images || []).map((img: string) => {
              if (img && img.startsWith('/')) {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                return `${apiUrl}${img}`;
              }
              return img;
            });
            return {
              id: char.id,
              name: char.name,
              age: char.age || null,
              location: char.location || null,
              previewImage: imageUrl || allImages[0] || null,
              images: allImages.length > 0 ? allImages : (imageUrl ? [imageUrl] : []),
              tags: char.tags || [],
              isUserCharacter: true,
              personality: char.personality || null
            };
          })
        : [];

      // Combine characters (backend already filters by search)
      const allChars = [...publicChars, ...userChars];
      
      // Get users from search
      const foundUsers = usersResponse.status === 'fulfilled' && !usersResponse.value.data.error
        ? (usersResponse.value.data.users || []).map((user: any) => ({
            id: user.id,
            username: user.username,
            profilePictureUrl: user.profilePictureUrl,
            bio: user.bio,
          }))
        : [];
      
      // Log for debugging
      console.log('Search results:', { query, publicChars: publicChars.length, userChars: userChars.length, users: foundUsers.length, total: allChars.length });
      
      setCharacters(allChars);
      setUsers(foundUsers);
    } catch (err: any) {
      console.error('Error fetching search results:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load search results');
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterClick = (character: Character) => {
    const type = character.isUserCharacter ? 'user' : 'template';
    navigate(`/character/${type}/${character.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, characterId: string, characterName: string, isUserCharacter: boolean) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${characterName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (isUserCharacter) {
        await apiClient.delete(`/characters/${characterId}`);
      } else {
        await apiClient.delete(`/admin/characters/${characterId}`);
      }
      
      // Refresh the list
      fetchSearchResults();
    } catch (err: any) {
      console.error('Error deleting character:', err);
      alert(`Failed to delete character: ${err.response?.data?.error || err.message}`);
    }
  };

  // CharacterCard component (reused from Gallery)
  const CharacterCard = ({ character, onDelete, onClick, isAdmin }: { 
    character: Character; 
    onDelete: (e: React.MouseEvent) => void;
    onClick: () => void;
    isAdmin: boolean;
  }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [prevImageIndex, setPrevImageIndex] = useState(0);
    const intervalRef = useRef<number | null>(null);
    const initialDelayRef = useRef<boolean>(false);

    useEffect(() => {
      if (!character.images || character.images.length <= 1) {
        return;
      }

      // Random initial delay to desynchronize
      const initialDelay = !initialDelayRef.current ? Math.random() * 3000 : 0;
      initialDelayRef.current = true;
      
      const timeout = setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          setPrevImageIndex(currentImageIndex);
          setCurrentImageIndex((prev) => {
            const next = (prev + 1) % character.images!.length;
            return next;
          });
        }, 3000);
      }, initialDelay);

      return () => {
        clearTimeout(timeout);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, [character.images]);

    return (
      <div className="character-card" onClick={onClick}>
        <div className="character-image">
          {character.images && character.images.length > 1 ? (
            <div className="image-slider-container">
              {character.images.map((img, index) => (
                <img
                  key={index}
                  src={img}
                  alt={character.name}
                  className={`sliding-image ${index === currentImageIndex ? 'active' : ''} ${index === prevImageIndex ? 'prev' : ''} ${index !== currentImageIndex && index !== prevImageIndex ? 'hidden' : ''}`}
                />
              ))}
            </div>
          ) : (
            <img
              src={character.previewImage || '/placeholder.jpg'}
              alt={character.name}
              className="character-image-img"
            />
          )}
          {(isAdmin || character.isUserCharacter) && (
            <button
              className="delete-character-button"
              onClick={onDelete}
              aria-label={`Delete ${character.name}`}
              title="Delete character"
            >
              ×
            </button>
          )}
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
          {character.personality && (
            <div className="character-description-overlay">
              <p className="character-description-text">{character.personality}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="gallery-page">
      
      <div className="container">
        <div className="gallery-header">
          <h1>Search Results</h1>
          {query && (
            <p className="subtitle">Searching for: &quot;{query}&quot;</p>
          )}
        </div>

        {loading && (
          <div className="loading">
            <p>Searching...</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && query && characters.length === 0 && users.length === 0 && (
          <div className="empty-state">
            <h3>No results found</h3>
            <p>No characters or users found matching &quot;{query}&quot;</p>
          </div>
        )}

        {!loading && !error && (characters.length > 0 || users.length > 0) && (
          <>
            {users.length > 0 && (
              <div className="search-section">
                <h2 className="search-section-title">Users</h2>
                <div className="users-grid">
                  {users.map((user) => (
                    <Link
                      key={user.id}
                      to={`/profile/${user.username}`}
                      className="user-card"
                    >
                      {user.profilePictureUrl ? (
                        <img
                          src={user.profilePictureUrl.startsWith('/') 
                            ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}${user.profilePictureUrl}`
                            : user.profilePictureUrl}
                          alt={user.username}
                          className="user-avatar"
                        />
                      ) : (
                        <div className="user-avatar-placeholder">
                          {user.username[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="user-info">
                        <h3 className="user-username">{user.username}</h3>
                        {user.bio && (
                          <p className="user-bio">{user.bio.length > 100 ? `${user.bio.substring(0, 100)}...` : user.bio}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {characters.length > 0 && (
              <div className="search-section">
                <h2 className="search-section-title">Characters</h2>
                <div className="character-grid">
                  {characters.map((character) => (
                    <CharacterCard
                      key={character.id}
                      character={character}
                      onDelete={(e) => handleDelete(e, character.id, character.name, character.isUserCharacter || false)}
                      onClick={() => handleCharacterClick(character)}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!query && (
          <div className="empty-state">
            <h3>Search for Characters</h3>
            <p>Enter a search query to find characters</p>
          </div>
        )}
      </div>
    </div>
  );
}
