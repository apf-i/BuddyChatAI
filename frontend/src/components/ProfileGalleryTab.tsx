import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import './ProfileGalleryTab.css';

interface Character {
  id: string;
  name: string;
  age: number | null;
  location: string | null;
  personality: string;
  imageUrl: string | null;
  images: string[];
  tags: string[];
  status: string;
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

interface ProfileGalleryTabProps {
  userId: string;
  username: string;
}

export default function ProfileGalleryTab({ userId, username }: ProfileGalleryTabProps) {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharedChats, setSharedChats] = useState<SharedChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);

  useEffect(() => {
    fetchCharacters();
    fetchSharedChats();
  }, [userId]);

  const fetchCharacters = async () => {
    try {
      setLoading(true);
      // Use public endpoint to get approved characters for this user
      const response = await apiClient.get(`/public/users/${username}/characters`);
      setCharacters(response.data.characters || []);
    } catch (err: any) {
      console.error('Error fetching characters:', err);
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSharedChats = async () => {
    try {
      setLoadingChats(true);
      const response = await apiClient.get(`/community/chats/user/${username}`);
      setSharedChats(response.data.chats || []);
    } catch (err: any) {
      console.error('Error fetching user shared chats:', err);
      setSharedChats([]);
    } finally {
      setLoadingChats(false);
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

  const handleChatUnshare = async (chatId: string) => {
    if (!window.confirm('Remove this chat from the Community page?')) {
      return;
    }

    try {
      await apiClient.post(`/community/chats/${chatId}/unshare`);
      setSharedChats(prev => prev.filter(chat => chat.id !== chatId));
    } catch (err: any) {
      console.error('Error unsharing chat:', err);
      alert(err.response?.data?.error || 'Failed to remove chat from Community');
    }
  };

  const handleCharacterClick = (character: Character) => {
    navigate(`/character/community/${character.id}`);
  };

  if (loading) {
    return <div className="profile-gallery-tab loading">Loading gallery...</div>;
  }

  if (characters.length === 0 && sharedChats.length === 0) {
    return (
      <div className="profile-gallery-tab">
        <div className="empty-state">
          <p>No approved characters or community chats yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-gallery-tab">
      {characters.length > 0 && (
        <div className="gallery-section">
          <h2 className="gallery-section-title">Uploaded Characters</h2>
          <div className="gallery-grid">
            {characters.map((character) => (
              <div
                key={character.id}
                className="gallery-character-card"
                onClick={() => handleCharacterClick(character)}
              >
                <div className="gallery-character-image">
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
                  <div className="gallery-character-overlay">
                    <h3 className="gallery-character-name">{character.name}</h3>
                    {character.location && (
                      <p className="gallery-character-location">{character.location}</p>
                    )}
                    {character.age && (
                      <p className="gallery-character-age">{character.age} years old</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared Community Chats Section */}
      {loadingChats ? (
        <div className="loading">Loading shared chats...</div>
      ) : sharedChats.length > 0 ? (
        <div className="profile-shared-chats-section">
          <h2 className="gallery-section-title">Shared Community Chats</h2>
          <div className="profile-shared-chats-grid">
            {sharedChats.map((chat) => (
              <div key={chat.id} className="profile-shared-chat-card">
                <div className="profile-shared-chat-header">
                  {chat.character && (
                    <img
                      src={chat.character.image_url}
                      alt={chat.character.name}
                      className="profile-shared-chat-character-image"
                    />
                  )}
                  <div className="profile-shared-chat-meta">
                    <h3 className="profile-shared-chat-title">
                      {chat.title || `Chat with ${chat.character?.name || 'Character'}`}
                    </h3>
                    <p className="profile-shared-chat-date">
                      Shared {new Date(chat.sharedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="profile-shared-chat-delete"
                    onClick={() => handleChatUnshare(chat.id)}
                    title="Remove from Community"
                  >
                    ×
                  </button>
                </div>
                {chat.description && (
                  <p className="profile-shared-chat-description">{chat.description}</p>
                )}
                {chat.messagePreview && chat.messagePreview.length > 0 && (
                  <div className="profile-shared-chat-preview">
                    {chat.messagePreview.slice(0, 2).map((msg, idx) => (
                      <div
                        key={idx}
                        className={`profile-shared-chat-message ${msg.role}`}
                      >
                        <span className="message-role">
                          {msg.role === 'user' ? 'You' : chat.character?.name || 'Character'}:
                        </span>
                        <span className="message-content">
                          {msg.content.length > 100
                            ? `${msg.content.substring(0, 100)}...`
                            : msg.content}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
