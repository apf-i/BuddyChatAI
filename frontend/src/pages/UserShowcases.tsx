import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './UserShowcases.css';

interface ShowcasedChat {
  id: string;
  sessionId: string;
  title: string | null;
  character: {
    id: string;
    name: string;
    imageUrl: string | null;
  } | null;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  createdAt: string;
}

interface ProfileData {
  id: string;
  username: string | null;
  profilePictureUrl: string | null;
}

export default function UserShowcases() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showcasedChats, setShowcasedChats] = useState<ShowcasedChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (username) {
      fetchData();
    }
  }, [username]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch profile info
      const profileResponse = await apiClient.get(`/users/${username}`);
      setProfile(profileResponse.data.profile);

      // Fetch showcased chats
      const showcasesResponse = await apiClient.get(`/showcases/user/${username}`);
      setShowcasedChats(showcasesResponse.data.showcases || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load showcased chats');
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

  if (loading) {
    return (
      <div className="user-showcases-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading showcased chats...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="user-showcases-page">
        
        <div className="container">
          <div className="error">
            <p>{error || 'Profile not found'}</p>
            <Link to="/" className="back-link">Go to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-showcases-page">
      
      <div className="container">
        <div className="showcases-header">
          <Link to={`/profile/${username}`} className="back-button">
            ← Back to Profile
          </Link>
          <div className="showcases-title-section">
            {profile.profilePictureUrl && (
              <img
                src={getImageUrl(profile.profilePictureUrl) || ''}
                alt={profile.username || 'Profile'}
                className="profile-picture-small"
              />
            )}
            <div>
              <h1>{profile.username}'s Showcased Chats</h1>
              <p className="showcases-subtitle">
                {showcasedChats.length} {showcasedChats.length === 1 ? 'chat' : 'chats'} showcased
              </p>
            </div>
          </div>
        </div>

        {showcasedChats.length === 0 ? (
          <div className="empty-state">
            <p>This user hasn't showcased any chats yet.</p>
            <Link to={`/profile/${username}`} className="back-to-profile-link">
              View Profile
            </Link>
          </div>
        ) : (
          <div className="showcased-chats-list">
            {showcasedChats.map((showcase) => (
              <div key={showcase.id} className="showcased-chat-card">
                <div className="showcased-chat-header">
                  {showcase.character?.imageUrl && (
                    <img
                      src={getImageUrl(showcase.character.imageUrl) || ''}
                      alt={showcase.character.name}
                      className="showcased-chat-character-image"
                    />
                  )}
                  <div className="showcased-chat-info">
                    <h3>{showcase.title || `Chat with ${showcase.character?.name || 'Character'}`}</h3>
                    <p className="showcased-chat-character-name">
                      {showcase.character?.name || 'Unknown Character'}
                    </p>
                  </div>
                </div>
                <div className="showcased-chat-messages">
                  {showcase.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`showcased-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                    >
                      <span className="message-role">
                        {message.role === 'user' ? profile.username || 'User' : showcase.character?.name || 'AI'}:
                      </span>
                      <span className="message-content">{message.content}</span>
                    </div>
                  ))}
                </div>
                <div className="showcased-chat-footer">
                  <span className="showcased-chat-date">
                    {new Date(showcase.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
