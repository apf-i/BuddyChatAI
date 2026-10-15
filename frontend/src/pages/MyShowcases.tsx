import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './MyShowcases.css';

interface Session {
  id: string;
  characterType: string;
  character: {
    id: string;
    name: string;
    imageUrl: string | null;
  } | null;
  messageCount: number;
  isShowcased: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Showcase {
  id: string;
  sessionId: string;
  title: string | null;
  selectedMessageIds: string[];
  isPublic: boolean;
  character: {
    id: string;
    name: string;
    imageUrl: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export default function MyShowcases() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isCommunityMode = searchParams.get('community') === '1';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [showcaseTitle, setShowcaseTitle] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingShowcase, setEditingShowcase] = useState<Showcase | null>(null);
  const [communityDescription, setCommunityDescription] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchData();
  }, [isAuthenticated]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sessionsRes, showcasesRes] = await Promise.all([
        apiClient.get('/showcases/my-sessions'),
        apiClient.get('/showcases/my-showcases'),
      ]);
      setSessions(sessionsRes.data.sessions || []);
      setShowcases(showcasesRes.data.showcases || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      alert(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShowcase = async (session: Session) => {
    try {
      // Load messages for this session
      const response = await apiClient.get(`/chat/${session.id}/history`);
      const sessionMessages = response.data.messages || [];
      
      if (sessionMessages.length === 0) {
        alert('This session has no messages');
        return;
      }

      setSelectedSession(session);
      setMessages(sessionMessages);
      setSelectedMessageIds([]);
      setShowcaseTitle('');
      setCommunityDescription('');
      setEditingShowcase(null);
      setShowModal(true);
    } catch (err: any) {
      console.error('Error loading messages:', err);
      alert(err.response?.data?.error || 'Failed to load messages');
    }
  };

  const handleEditShowcase = async (showcase: Showcase) => {
    try {
      // Load messages for this session
      const response = await apiClient.get(`/chat/${showcase.sessionId}/history`);
      const sessionMessages = response.data.messages || [];

      // Find the session
      const session = sessions.find(s => s.id === showcase.sessionId);
      if (!session) {
        alert('Session not found');
        return;
      }

      setSelectedSession(session);
      setMessages(sessionMessages);
      setSelectedMessageIds(showcase.selectedMessageIds);
      setShowcaseTitle(showcase.title || '');
      setCommunityDescription('');
      setEditingShowcase(showcase);
      setShowModal(true);
    } catch (err: any) {
      console.error('Error loading messages:', err);
      alert(err.response?.data?.error || 'Failed to load messages');
    }
  };

  const handleToggleMessage = (messageId: string) => {
    setSelectedMessageIds(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleSaveShowcase = async () => {
    if (selectedMessageIds.length === 0) {
      alert('Please select at least one message to showcase');
      return;
    }

    try {
      if (isCommunityMode) {
        // Share to community page
        await apiClient.post(`/community/chats/${selectedSession!.id}/share`, {
          title: showcaseTitle || undefined,
          description: communityDescription || undefined,
          messageIds: selectedMessageIds,
        });
        setShowModal(false);
        alert('Chat shared to Community successfully!');
        navigate('/community');
      } else {
        if (editingShowcase) {
          // Update existing showcase
          await apiClient.post('/showcases', {
            session_id: selectedSession!.id,
            title: showcaseTitle || undefined,
            selected_message_ids: selectedMessageIds,
          });
        } else {
          // Create new showcase
          await apiClient.post('/showcases', {
            session_id: selectedSession!.id,
            title: showcaseTitle || undefined,
            selected_message_ids: selectedMessageIds,
          });
        }

        setShowModal(false);
        fetchData();
        alert('Showcase saved successfully');
      }
    } catch (err: any) {
      console.error('Error saving showcase:', err);
      alert(err.response?.data?.error || 'Failed to save showcase');
    }
  };

  const handleDeleteShowcase = async (showcaseId: string) => {
    if (!window.confirm('Are you sure you want to delete this showcase?')) {
      return;
    }

    try {
      await apiClient.delete(`/showcases/${showcaseId}`);
      fetchData();
      alert('Showcase deleted successfully');
    } catch (err: any) {
      console.error('Error deleting showcase:', err);
      alert(err.response?.data?.error || 'Failed to delete showcase');
    }
  };

  const handleToggleVisibility = async (showcase: Showcase) => {
    try {
      await apiClient.patch(`/showcases/${showcase.id}/visibility`, {
        is_public: !showcase.isPublic,
      });
      fetchData();
    } catch (err: any) {
      console.error('Error toggling visibility:', err);
      alert(err.response?.data?.error || 'Failed to update visibility');
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
      <div className="my-showcases-page">
        
        <div className="container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-showcases-page">
      
      <div className="container">
        <div className="my-showcases-header">
          <h1>{isCommunityMode ? 'Share Chats to Community' : 'My Showcased Chats'}</h1>
          <p className="subtitle">
            {isCommunityMode
              ? 'Pick your favorite moments from chats with characters to appear on the Community page.'
              : 'Select chats to display on your profile'}
          </p>
        </div>

        {!isCommunityMode && (
          <div className="showcases-section">
            <h2>Current Showcases ({showcases.length})</h2>
            {showcases.length === 0 ? (
              <p className="empty-state">You haven't showcased any chats yet.</p>
            ) : (
              <div className="showcases-list">
                {showcases.map((showcase) => (
                  <div key={showcase.id} className="showcase-item">
                    <div className="showcase-item-header">
                      {showcase.character?.imageUrl && (
                        <img
                          src={getImageUrl(showcase.character.imageUrl) || ''}
                          alt={showcase.character.name}
                          className="showcase-character-image"
                        />
                      )}
                      <div className="showcase-item-info">
                        <h3>{showcase.title || `Chat with ${showcase.character?.name || 'Character'}`}</h3>
                        <p>{showcase.character?.name || 'Unknown Character'}</p>
                        <p className="showcase-meta">
                          {showcase.selectedMessageIds.length} message{showcase.selectedMessageIds.length !== 1 ? 's' : ''} • 
                          {new Date(showcase.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="showcase-item-actions">
                      <button
                        className="toggle-visibility-button"
                        onClick={() => handleToggleVisibility(showcase)}
                      >
                        {showcase.isPublic ? '🔓 Public' : '🔒 Private'}
                      </button>
                      <button
                        className="edit-button"
                        onClick={() => handleEditShowcase(showcase)}
                      >
                        Edit
                      </button>
                      <button
                        className="delete-button"
                        onClick={() => handleDeleteShowcase(showcase.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sessions-section">
          <h2>{isCommunityMode ? 'Chats to Share to Community' : 'Available Sessions'} ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p className="empty-state">You don't have any chat sessions yet.</p>
          ) : (
            <div className="sessions-list">
              {sessions.map((session) => (
                <div key={session.id} className="session-item">
                  {session.character?.imageUrl && (
                    <img
                      src={getImageUrl(session.character.imageUrl) || ''}
                      alt={session.character.name}
                      className="session-character-image"
                    />
                  )}
                  <div className="session-item-info">
                    <h3>{session.character?.name || 'Unknown Character'}</h3>
                    <p>{session.messageCount} message{session.messageCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="session-item-actions">
                    {!isCommunityMode && session.isShowcased ? (
                      <span className="showcased-badge">Showcased</span>
                    ) : (
                      <button
                        className="create-showcase-button"
                        onClick={() => handleCreateShowcase(session)}
                      >
                        {isCommunityMode ? 'Share to Community' : 'Create Showcase'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal for creating/editing showcase */}
      {showModal && selectedSession && (
        <div className="showcase-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="showcase-modal" onClick={(e) => e.stopPropagation()}>
            <div className="showcase-modal-header">
              <h2>
                {isCommunityMode
                  ? 'Select Messages to Share to Community'
                  : editingShowcase
                    ? 'Edit Showcase'
                    : 'Create Showcase'}
              </h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="showcase-modal-content">
              <div className="modal-section">
                <label>
                  Title (optional):
                  <input
                    type="text"
                    value={showcaseTitle}
                    onChange={(e) => setShowcaseTitle(e.target.value)}
                    placeholder={`Chat with ${selectedSession.character?.name || 'Character'}`}
                    maxLength={100}
                  />
                </label>

                {isCommunityMode && (
                  <label>
                    Short description (optional):
                    <textarea
                      value={communityDescription}
                      onChange={(e) => setCommunityDescription(e.target.value)}
                      placeholder="Describe what this chat is about for the Community page..."
                      maxLength={240}
                    />
                  </label>
                )}
              </div>

              <div className="modal-section">
                <label>
                  {isCommunityMode ? 'Select messages to share to Community:' : 'Select messages to showcase:'}
                </label>
                <div className="messages-selection">
                  {messages.map((message) => {
                    const isSelected = selectedMessageIds.includes(message.id);
                    return (
                      <div
                        key={message.id}
                        className={`message-selection-item ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                          // Don't toggle if clicking directly on the checkbox
                          if ((e.target as HTMLElement).tagName !== 'INPUT') {
                            handleToggleMessage(message.id);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleMessage(message.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="message-selection-content">
                          <span className="message-role-label">
                            {message.role === 'user' ? 'You' : selectedSession.character?.name || 'AI'}:
                          </span>
                          <span className="message-content-preview">
                            {message.content.length > 100
                              ? `${message.content.substring(0, 100)}...`
                              : message.content}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="selection-hint">
                  Selected: {selectedMessageIds.length} of {messages.length} messages
                </p>
              </div>
            </div>

            <div className="showcase-modal-actions">
              <button className="cancel-button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="save-button"
                onClick={handleSaveShowcase}
                disabled={selectedMessageIds.length === 0}
              >
                {isCommunityMode
                  ? `Share ${selectedMessageIds.length || ''} ${selectedMessageIds.length === 1 ? 'Message' : 'Messages'}`
                  : `${editingShowcase ? 'Update' : 'Create'} Showcase`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
