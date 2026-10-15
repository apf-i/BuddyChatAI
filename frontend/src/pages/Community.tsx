import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import Banner from '../components/Banner';
import FlagIcon from '../components/FlagIcon';
import FavoriteButton from '../components/FavoriteButton';
import '../components/CharacterCard.css';
import './Community.css';

interface CommunityCharacter {
  id: string;
  name: string;
  age?: number | null;
  location?: string | null;
  previewImage: string | null;
  images?: string[];
  tags: string[];
  personality?: string | null;
  uploaderUsername?: string;
  featured?: boolean;
  createdAt?: string | null;
  popularity?: number;
}

interface SharedChat {
  id: string;
  userId: string;
  username: string;
  profilePictureUrl: string | null;
  character: {
    id: string;
    name: string;
    image_url: string;
    personality?: string;
  } | null;
  title: string | null;
  description: string | null;
  sharedAt: string;
  createdAt: string;
  messagePreview: Array<{
    role: string;
    content: string;
    created_at: string;
  }>;
}

export default function Community() {
  const [characters, setCharacters] = useState<CommunityCharacter[]>([]);
  const [sharedChats, setSharedChats] = useState<SharedChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<SharedChat | null>(null);
  const [selectedChatMessages, setSelectedChatMessages] = useState<
    { role: string; content: string; created_at: string }[]
  >([]);
  const [chatModalLoading, setChatModalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'random' | 'recent' | 'popular'>('random');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.isAdmin || false;

  useEffect(() => {
    fetchCommunityCharacters();
    fetchSharedChats();
  }, []);

  const fetchCommunityCharacters = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/public/characters');
      const allCharacters = response.data.characters || [];
      
      // Filter to only show community characters
      const communityChars = allCharacters
        .filter((char: any) => char.isCommunity)
        .map((char: any) => {
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
            previewImage: imageUrl,
            images: allImages.length > 0 ? allImages : (imageUrl ? [imageUrl] : []),
            tags: char.tags || [],
            personality: char.personality || null,
            uploaderUsername: char.uploaderUsername || 'Anonymous',
            featured: char.featured || false,
            createdAt: char.createdAt || null,
            popularity: typeof char.popularity === 'number' ? char.popularity : 0,
          };
        });
      
      // Randomize initial order for default view
      const shuffled = [...communityChars].sort(() => Math.random() - 0.5);
      console.log('Community characters (shuffled):', shuffled); // Debug log
      setCharacters(shuffled);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching community characters:', err);
      setError(err.response?.data?.error || 'Failed to load community characters');
    } finally {
      setLoading(false);
    }
  };

  const fetchSharedChats = async () => {
    try {
      setChatsLoading(true);
      const response = await apiClient.get('/community/chats/shared');
      const chats = response.data.chats || [];
      setSharedChats(chats);
    } catch (err: any) {
      console.error('Error fetching shared chats:', err);
    } finally {
      setChatsLoading(false);
    }
  };

  const handleCharacterClick = (character: CommunityCharacter) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate(`/character/community/${character.id}`);
  };

  const handleChatClick = async (chatId: string) => {
    try {
      setChatModalLoading(true);
      // Fetch full shared chat details including all messages
      const response = await apiClient.get(`/community/chats/shared/${chatId}`);
      const data = response.data as {
        id: string;
        userId: string;
        username: string;
        profilePictureUrl: string | null;
        character: SharedChat['character'];
        title: string | null;
        description: string | null;
        sharedAt: string;
        createdAt: string;
        messages: { role: string; content: string; created_at: string }[];
      };

      const chat: SharedChat = {
        id: data.id,
        userId: data.userId,
        username: data.username,
        profilePictureUrl: data.profilePictureUrl,
        character: data.character,
        title: data.title,
        description: data.description,
        sharedAt: data.sharedAt,
        createdAt: data.createdAt,
        messagePreview: [], // full messages are in selectedChatMessages
      };

      const messages = data.messages || [];

      setSelectedChat(chat);
      setSelectedChatMessages(messages);
    } catch (err: any) {
      console.error('Error loading shared chat details:', err);
      alert(err.response?.data?.error || 'Failed to load full chat');
    } finally {
      setChatModalLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, characterId: string, characterName: string) => {
    e.stopPropagation(); // Prevent triggering the card click

    if (!confirm(`Are you sure you want to delete "${characterName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await apiClient.delete(`/admin/community-characters/${characterId}`);
      // Refresh the character list
      fetchCommunityCharacters();
    } catch (err: any) {
      console.error('Error deleting character:', err);
      setError(err.response?.data?.error || 'Failed to delete character');
    }
  };

  const handleToggleFeatured = async (characterId: string, currentFeatured: boolean) => {
    try {
      const response = await apiClient.post(`/admin/characters/${characterId}/featured`, {
        type: 'community',
      });
      
      // Update the character in the characters array
      setCharacters(prevChars => 
        prevChars.map(char => 
          char.id === characterId 
            ? { ...char, featured: response.data.character.featured }
            : char
        )
      );
    } catch (err: any) {
      console.error('Error toggling featured status:', err);
      alert(err.response?.data?.error || 'Failed to update featured status');
    }
  };

  // Derive sorted characters based on sort mode
  const getSortedCharacters = () => {
    if (sortMode === 'random') {
      return characters;
    }
    const sorted = [...characters];
    if (sortMode === 'recent') {
      sorted.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    } else if (sortMode === 'popular') {
      sorted.sort((a, b) => {
        const aPop = a.popularity ?? 0;
        const bPop = b.popularity ?? 0;
        if (bPop !== aPop) {
          return bPop - aPop;
        }
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return sorted;
  };

  const displayedCharacters = getSortedCharacters();

  return (
    <AppLayout className="community-page">
      
      <Banner />
      <div className="container">
        <div className="community-header-row">
          <h1 className="community-title-left">Community</h1>
          <div className="community-header-actions">
            <div
              className="community-sort-wrapper"
              onClick={() => setSortMenuOpen((open) => !open)}
            >
              <span className="community-sort-label">Sort:</span>
              <span className="community-sort-current">
                {sortMode === 'random'
                  ? 'Random'
                  : sortMode === 'recent'
                  ? 'Most Recent'
                  : 'Most Popular'}
              </span>
              <span className="community-sort-chevron">{sortMenuOpen ? '▲' : '▼'}</span>
              {sortMenuOpen && (
                <div
                  className="community-sort-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className={`community-sort-option ${
                      sortMode === 'random' ? 'active' : ''
                    }`}
                    onClick={() => {
                      setSortMode('random');
                      setSortMenuOpen(false);
                    }}
                  >
                    Random
                  </button>
                  <button
                    type="button"
                    className={`community-sort-option ${
                      sortMode === 'recent' ? 'active' : ''
                    }`}
                    onClick={() => {
                      setSortMode('recent');
                      setSortMenuOpen(false);
                    }}
                  >
                    Most Recent
                  </button>
                  <button
                    type="button"
                    className={`community-sort-option ${
                      sortMode === 'popular' ? 'active' : ''
                    }`}
                    onClick={() => {
                      setSortMode('popular');
                      setSortMenuOpen(false);
                    }}
                  >
                    Most Popular
                  </button>
                </div>
              )}
            </div>
            <button
              className="community-upload-button"
              onClick={() => navigate(isAuthenticated ? '/upload-character' : '/login')}
            >
              Upload Character
            </button>
            <button
              className="community-share-button"
              onClick={() => navigate(isAuthenticated ? '/my-showcases?community=1' : '/login')}
            >
              Share Chat
            </button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}

        {(loading || chatsLoading) ? (
          <div className="loading">Loading community content...</div>
        ) : (characters.length === 0 && sharedChats.length === 0) ? (
          <div className="empty-state">
            <h3>No community content yet</h3>
            <p>Be the first to share characters or conversations!</p>
            {isAuthenticated && (
              <button className="btn btn-primary" onClick={() => navigate('/upload-character')}>
                Upload Character
              </button>
            )}
          </div>
        ) : (
          <div className="community-unified-grid">
            {displayedCharacters.map((character) => {
              // Character Card Component with Image Rotation
              const CharacterCard = ({ character }: { character: CommunityCharacter }) => {
                const [currentImageIndex, setCurrentImageIndex] = useState(0);
                const [prevImageIndex, setPrevImageIndex] = useState(0);
                const intervalRef = useRef<number | null>(null);
                const initialDelayRef = useRef<number | null>(null);
                const images = character.images && character.images.length > 0 
                  ? character.images 
                  : (character.previewImage ? [character.previewImage] : []);

                useEffect(() => {
                  if (images.length > 1) {
                    // Random initial delay between 0-3 seconds to desynchronize rotations
                    const randomDelay = Math.random() * 3000;
                    
                    initialDelayRef.current = window.setTimeout(() => {
                      // Start the rotation interval after the initial delay
                      intervalRef.current = window.setInterval(() => {
                        setCurrentImageIndex((prev) => {
                          setPrevImageIndex(prev);
                          return (prev + 1) % images.length;
                        });
                      }, 3000); // Change image every 3 seconds
                    }, randomDelay);

                    return () => {
                      if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                      }
                      if (initialDelayRef.current) {
                        clearTimeout(initialDelayRef.current);
                      }
                    };
                  }
                }, [images.length]);

                const currentImage = images[currentImageIndex] || character.previewImage;

                return (
                  <div
                className="character-card"
                onClick={() => handleCharacterClick(character)}
              >
                <div className="character-image">
                      {currentImage ? (
                        <div className="image-slider-container">
                          {images.map((img, index) => (
                    <img
                              key={`${character.id}-${index}`}
                              src={img}
                      alt={character.name}
                              className={`sliding-image ${
                                index === currentImageIndex ? 'active' : 
                                index === prevImageIndex ? 'prev' : 
                                'hidden'
                              }`}
                            />
                          ))}
                        </div>
                  ) : (
                    <div className="image-placeholder">
                      <span>No Image</span>
                    </div>
                  )}
                  {isAdmin && (
                    <button
                      className={`featured-toggle-button ${character.featured ? 'featured-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFeatured(character.id, character.featured || false);
                      }}
                      title={character.featured ? 'Remove from Featured' : 'Mark as Featured'}
                    >
                      {character.featured ? '⭐' : '☆'}
                    </button>
                  )}
                  <FavoriteButton
                    characterType="community"
                    characterId={character.id}
                  />
                  {isAdmin && (
                    <button
                      className="delete-character-button"
                      onClick={(e) => handleDelete(e, character.id, character.name)}
                      title="Delete character"
                    >
                      ×
                    </button>
                  )}
                  <div className="character-info-overlay">
                    <div className="character-online-badge">
                      <span className="character-online-dot" aria-hidden="true" />
                      Online
                    </div>
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
                    {character.tags && character.tags.length > 0 && (
                      <div className="character-tags-overlay">
                        {character.tags.slice(0, 3).map((tag, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="character-tag"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/?tag=${encodeURIComponent(tag)}`);
                            }}
                          >
                            #{tag}
                          </button>
                        ))}
                        {character.tags.length > 3 && (
                          <span className="character-tag-more">+{character.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                    {character.uploaderUsername && (
                      <p className="character-uploader-overlay">
                        Uploaded by: {character.uploaderUsername}
                      </p>
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

              return <CharacterCard key={`character-${character.id}`} character={character} />;
            })}
            {sharedChats.map((chat) => (
              <div
                key={`chat-${chat.id}`}
                className="shared-chat-card"
                onClick={() => handleChatClick(chat.id)}
              >
                <div className="chat-header">
                  {chat.character && (
                    <img
                      src={chat.character.image_url}
                      alt={chat.character.name}
                      className="chat-character-image"
                    />
                  )}
                  <div className="chat-meta">
                    <h3 className="chat-title">{chat.title || `Chat with ${chat.character?.name || 'Character'}`}</h3>
                    <div className="chat-user-info">
                      {chat.profilePictureUrl ? (
                        <img
                          src={chat.profilePictureUrl}
                          alt={chat.username}
                          className="user-avatar-small"
                        />
                      ) : (
                        <div className="user-avatar-placeholder-small">
                          {chat.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="chat-username">{chat.username}</span>
                    </div>
                  </div>
                </div>
                {chat.description && (
                  <p className="chat-description">{chat.description}</p>
                )}
                {chat.messagePreview && chat.messagePreview.length > 0 && (
                  <div className="chat-preview">
                    <div className="chat-messages-preview">
                      {chat.messagePreview.slice(0, 3).map((msg, idx) => (
                        <div key={idx} className={`preview-message ${msg.role}`}>
                          <span className="message-role">{msg.role === 'user' ? 'You' : chat.character?.name || 'Character'}:</span>
                          <span className="message-content">{msg.content.substring(0, 100)}{msg.content.length > 100 ? '...' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="chat-footer">
                  <span className="chat-date">
                    Shared {new Date(chat.sharedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Full Shared Chat Modal */}
        {selectedChat && (
          <div
            className="share-modal-overlay"
            onClick={() => {
              setSelectedChat(null);
              setSelectedChatMessages([]);
            }}
          >
            <div
              className="share-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="share-modal-header">
                <h2>
                  {selectedChat.title || `Chat with ${selectedChat.character?.name || 'Character'}`}
                </h2>
                <button
                  className="close-modal-button"
                  onClick={() => {
                    setSelectedChat(null);
                    setSelectedChatMessages([]);
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="share-modal-content">
                <div className="full-chat-header">
                  {selectedChat.character && (
                    <img
                      src={selectedChat.character.image_url}
                      alt={selectedChat.character.name}
                      className="chat-character-image"
                    />
                  )}
                  <div className="full-chat-meta">
                    <div className="full-chat-title-row">
                      <span className="chat-username">
                        {selectedChat.username}
                      </span>
                      <span className="chat-date">
                        Shared {new Date(selectedChat.sharedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {selectedChat.description && (
                      <p className="chat-description">{selectedChat.description}</p>
                    )}
                  </div>
                </div>

                <div className="full-chat-messages">
                  {chatModalLoading ? (
                    <div className="loading">Loading full chat...</div>
                  ) : selectedChatMessages.length === 0 ? (
                    <p className="empty-state">No messages available for this chat.</p>
                  ) : (
                    selectedChatMessages.map((msg, idx) => (
                      <div
                        key={`${msg.created_at}-${idx}`}
                        className={`preview-message ${msg.role}`}
                      >
                        <span className="message-role">
                          {msg.role === 'user'
                            ? 'You'
                            : selectedChat.character?.name || 'Character'}
                          :
                        </span>
                        <span className="message-content">{msg.content}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
