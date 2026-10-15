import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './Messages.css';

interface User {
  id: string;
  username: string;
  profilePictureUrl: string | null;
}

interface Thread {
  id: string;
  otherUser: {
    id: string;
    username: string | null;
    profilePictureUrl: string | null;
  };
  lastMessage: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string;
}

export default function Messages() {
  const { isAuthenticated } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchThreads();
    
    // Listen for real-time message updates
    if (socket) {
      const handleNewMessage = (message: any) => {
        // Refresh threads when a new message arrives
        fetchThreads();
      };

      socket.on('message:new', handleNewMessage);
      socket.on('notification:new', handleNewMessage);

      return () => {
        socket.off('message:new', handleNewMessage);
        socket.off('notification:new', handleNewMessage);
      };
    }
  }, [isAuthenticated, socket]);

  const fetchThreads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/messages/threads');
      setThreads(response.data.threads || []);
    } catch (err: any) {
      console.error('Error fetching threads:', err);
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError(err.response?.data?.error || 'Failed to load messages');
      }
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSearchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const response = await apiClient.get(`/public/users?search=${encodeURIComponent(query)}`);
      setSearchResults(response.data.users || []);
    } catch (err: any) {
      console.error('Error searching users:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleStartConversation = async (userId: string, username: string) => {
    try {
      // Check if thread already exists
      const existingThread = threads.find(t => t.otherUser.id === userId);
      
      if (existingThread) {
        navigate(`/messages/${existingThread.id}`);
      } else {
        // Create or get thread and navigate to it
        try {
          const response = await apiClient.post(`/messages/threads/with/${userId}`);
          navigate(`/messages/${response.data.thread.id}`);
          setShowNewMessage(false);
          setSearchQuery('');
          setSearchResults([]);
        } catch (err: any) {
          console.error('Error creating thread:', err);
          let errorMsg = err.response?.data?.error || 'Failed to start conversation';
          if (err.response?.status === 401) {
            errorMsg = 'Your session has expired. Please log in again.';
          }
          alert(errorMsg);
        }
      }
    } catch (err: any) {
      console.error('Error starting conversation:', err);
    }
  };

  useEffect(() => {
    if (searchQuery) {
      const timeoutId = setTimeout(() => {
        handleSearchUsers(searchQuery);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  if (loading) {
    return (
      <AppLayout className="messages-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading messages...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="messages-page">
      
      <div className="container">
        <div className="messages-hero">
          <div className="messages-hero-content">
            <h1>Messages</h1>
            <p className="messages-subtitle">Connect and chat with other users</p>
          </div>
          <button
            className="new-message-button"
            onClick={() => setShowNewMessage(!showNewMessage)}
          >
            {showNewMessage ? 'Cancel' : '+ New Message'}
          </button>
        </div>

        {showNewMessage && (
          <div className="new-message-card">
            <h2 className="new-message-title">Start a New Conversation</h2>
            <div className="search-wrapper">
              <input
                type="text"
                className="user-search-input"
                placeholder="Search for a user by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searching && (
                <div className="searching-indicator">
                  <span className="spinner"></span>
                  <span>Searching...</span>
                </div>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="user-search-results">
                {searchResults.map((user) => {
                  const existingThread = threads.find(t => t.otherUser.id === user.id);
                  return (
                    <div
                      key={user.id}
                      className="user-search-result-item"
                      onClick={() => {
                        if (existingThread) {
                          navigate(`/messages/${existingThread.id}`);
                        } else {
                          handleStartConversation(user.id, user.username);
                        }
                      }}
                    >
                      <div className="search-result-avatar-wrapper">
                        {user.profilePictureUrl ? (
                          <img
                            src={getImageUrl(user.profilePictureUrl) || ''}
                            alt={user.username}
                            className="search-result-avatar"
                          />
                        ) : (
                          <div className="search-result-avatar-placeholder">
                            {user.username[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div className="search-result-info">
                        <span className="search-result-username">{user.username}</span>
                        {existingThread && (
                          <span className="existing-thread-badge">Existing conversation</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {searchQuery && !searching && searchResults.length === 0 && (
              <div className="no-results">
                <p className="no-results-text">No users found</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="error-card">
            <p>{error}</p>
          </div>
        )}

        {threads.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">💬</div>
            <h3>No messages yet</h3>
            <p>Start a conversation by visiting someone's profile and sending them a message!</p>
          </div>
        ) : (
          <div className="threads-section">
            <h2 className="threads-section-title">Your Conversations</h2>
            <div className="threads-list">
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  to={`/messages/${thread.id}`}
                  className="thread-card"
                >
                  <div className="thread-avatar-wrapper">
                    {thread.otherUser.profilePictureUrl ? (
                      <img
                        src={getImageUrl(thread.otherUser.profilePictureUrl) || ''}
                        alt={thread.otherUser.username || 'User'}
                        className="thread-avatar-img"
                      />
                    ) : (
                      <div className="thread-avatar-placeholder">
                        {thread.otherUser.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    {onlineUsers.has(thread.otherUser.id) && (
                      <span className="online-indicator" title="Online"></span>
                    )}
                    {thread.unreadCount > 0 && (
                      <span className="unread-badge">{thread.unreadCount}</span>
                    )}
                  </div>
                  <div className="thread-card-content">
                    <div className="thread-card-header">
                      <h3 className="thread-username">
                        {thread.otherUser.username || 'Unknown User'}
                      </h3>
                      {thread.lastMessage && (
                        <span className="thread-time">
                          {formatTime(thread.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    {thread.lastMessage && (
                      <p className={`thread-preview ${thread.unreadCount > 0 ? 'unread' : ''}`}>
                        {thread.lastMessage.content.length > 80
                          ? `${thread.lastMessage.content.substring(0, 80)}...`
                          : thread.lastMessage.content}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
