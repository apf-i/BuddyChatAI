import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import './ProfileShowcaseTab.css';

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

interface ProfileShowcaseTabProps {
  username: string;
}

export default function ProfileShowcaseTab({ username }: ProfileShowcaseTabProps) {
  const [showcasedChats, setShowcasedChats] = useState<ShowcasedChat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchShowcases();
  }, [username]);

  const fetchShowcases = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/showcases/user/${username}`);
      setShowcasedChats(response.data.showcases || []);
    } catch (err: any) {
      console.error('Error fetching showcased chats:', err);
      setShowcasedChats([]);
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
    return <div className="profile-showcase-tab loading">Loading showcased chats...</div>;
  }

  if (showcasedChats.length === 0) {
    return (
      <div className="profile-showcase-tab">
        <div className="empty-state">
          <p>No showcased chats yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-showcase-tab">
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
              {showcase.messages.slice(0, 3).map((message) => (
                <div
                  key={message.id}
                  className={`showcased-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                >
                  <span className="message-role">
                    {message.role === 'user' ? username || 'User' : showcase.character?.name || 'AI'}:
                  </span>
                  <span className="message-content">
                    {message.content.length > 100
                      ? `${message.content.substring(0, 100)}...`
                      : message.content}
                  </span>
                </div>
              ))}
              {showcase.messages.length > 3 && (
                <p className="more-messages">+{showcase.messages.length - 3} more messages</p>
              )}
            </div>
            <div className="showcased-chat-footer">
              <Link
                to={`/profile/${username}/showcases`}
                className="view-full-chat-link"
              >
                View Full Chat →
              </Link>
              <span className="showcased-chat-date">
                {new Date(showcase.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
