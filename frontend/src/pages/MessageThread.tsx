import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import apiClient from '../api/client';
import BlockButton from '../components/BlockButton';
import ReportButton from '../components/ReportButton';
import AppLayout from '../layouts/AppLayout';
import './MessageThread.css';

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  status: string;
  read_at: string | null;
}

interface ThreadUser {
  id: string;
  username: string | null;
  profilePictureUrl: string | null;
}

export default function MessageThread() {
  const { threadId } = useParams<{ threadId: string }>();
  const { isAuthenticated, user: currentUser } = useAuth();
  const { socket, isConnected, onlineUsers } = useSocket();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<ThreadUser | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (threadId && socket) {
      fetchMessages();
      
      // Join thread room for real-time updates
      socket.emit('thread:join', threadId);

      // Listen for new messages
      const handleNewMessage = (message: Message) => {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
      };

      // Listen for read receipts
      const handleMessageRead = (data: { messageId: string; userId: string }) => {
        if (data.userId === currentUser?.id) {
          setMessages(prev => prev.map(msg => 
            msg.id === data.messageId ? { ...msg, read_at: new Date().toISOString() } : msg
          ));
        }
      };

      // Listen for typing indicators
      const handleTypingStart = (data: { userId: string }) => {
        if (data.userId !== currentUser?.id && otherUser?.id === data.userId) {
          setIsTyping(true);
        }
      };

      const handleTypingStop = (data: { userId: string }) => {
        if (data.userId !== currentUser?.id && otherUser?.id === data.userId) {
          setIsTyping(false);
        }
      };

      socket.on('message:new', handleNewMessage);
      socket.on('message:read', handleMessageRead);
      socket.on('typing:start', handleTypingStart);
      socket.on('typing:stop', handleTypingStop);

      return () => {
        socket.emit('thread:leave', threadId);
        socket.off('message:new', handleNewMessage);
        socket.off('message:read', handleMessageRead);
        socket.off('typing:start', handleTypingStart);
        socket.off('typing:stop', handleTypingStop);
      };
    }
  }, [threadId, isAuthenticated, socket, currentUser, otherUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (skipLoading = false) => {
    try {
      if (!skipLoading) {
        setError(null);
      }
      
      // First, get thread info to get other user
      if (!otherUser) {
        try {
          const threadResponse = await apiClient.get(`/messages/threads/${threadId}`);
          if (threadResponse.data.thread) {
            setOtherUser(threadResponse.data.thread.otherUser);
          }
        } catch (err) {
          console.error('Error fetching thread info:', err);
          // Fallback: try getting from threads list
          try {
            const threadsResponse = await apiClient.get('/messages/threads');
            const thread = threadsResponse.data.threads.find((t: any) => t.id === threadId);
            if (thread) {
              setOtherUser(thread.otherUser);
            }
          } catch (fallbackErr) {
            console.error('Error fetching thread from list:', fallbackErr);
          }
        }
      }

      // Get messages
      const response = await apiClient.get(`/messages/threads/${threadId}/messages`);
      const fetchedMessages = response.data.messages || [];
      setMessages(fetchedMessages);
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      if (!skipLoading) {
        if (err.response?.status === 401) {
          setError('Your session has expired. Please log in again.');
        } else {
          setError(err.response?.data?.error || 'Failed to load messages');
        }
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || sending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      // Get other user ID from messages
      const otherUserId = messages.find(m => m.sender_id !== currentUser?.id)?.sender_id;
      if (!otherUserId && !otherUser) {
        setError('Cannot determine recipient');
        return;
      }

      const recipientId = otherUser?.id || otherUserId;
      
      const response = await apiClient.post('/messages/send', {
        recipient_id: recipientId,
        content: messageContent,
      });

      // Add new message to list optimistically
      const newMsg: Message = {
        id: response.data.message.id,
        sender_id: response.data.message.senderId,
        content: response.data.message.content,
        created_at: response.data.message.createdAt,
        status: 'sent',
        read_at: null,
      };

      setMessages(prev => [...prev, newMsg]);
      
      // Refresh to get updated thread info (skip loading state)
      setTimeout(() => fetchMessages(true), 500);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setNewMessage(messageContent); // Restore message on error
      let errorMsg = err.response?.data?.error || 'Failed to send message';
      if (err.response?.status === 401) {
        errorMsg = 'Your session has expired. Please log in again.';
      }
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setSending(false);
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <AppLayout className="message-thread-page" hideFooter fullBleed>
        <div className="container">
          <div className="loading">
            <p>Loading conversation...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="message-thread-page" hideFooter fullBleed>
      <div className="container">
        <div className="thread-header">
          <Link to="/messages" className="back-button">
            ← Back to Messages
          </Link>
          {otherUser ? (
            <div className="thread-user-info">
              {otherUser.profilePictureUrl ? (
                <img
                  src={getImageUrl(otherUser.profilePictureUrl) || ''}
                  alt={otherUser.username || 'User'}
                  className="user-avatar-small"
                />
              ) : (
                <div className="user-avatar-small-placeholder">
                  {otherUser.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <Link to={`/profile/${otherUser.username}`} className="thread-username-link">
                {otherUser.username || 'Unknown User'}
                {onlineUsers.has(otherUser.id) && (
                  <span className="online-indicator" title="Online">🟢</span>
                )}
              </Link>
              <div className="thread-actions">
                <BlockButton
                  userId={otherUser.id}
                  username={otherUser.username || ''}
                  onBlockChange={() => {
                    // Refresh or navigate away if blocked
                    navigate('/messages');
                  }}
                />
                <ReportButton
                  targetType="user"
                  targetId={otherUser.id}
                  targetName={otherUser.username || undefined}
                />
              </div>
            </div>
          ) : (
            <div className="thread-user-info">
              <div className="user-avatar-small-placeholder">?</div>
              <span className="thread-username-link">Loading...</span>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        <div className="messages-container" ref={messagesContainerRef}>
          {loading ? (
            <div className="empty-messages">
              <p>Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwnMessage = message.sender_id === currentUser?.id;
              return (
                <div
                  key={message.id}
                  className={`message-bubble ${isOwnMessage ? 'own' : 'other'}`}
                >
                  <div className="message-content">{message.content}</div>
                  <div className="message-footer">
                    <div className="message-time">{formatTime(message.created_at)}</div>
                    {!isOwnMessage && (
                      <ReportButton
                        targetType="message"
                        targetId={message.id}
                        targetName={otherUser?.username || undefined}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {isTyping && otherUser && (
          <div className="typing-indicator">
            <div className="typing-indicator-content">
              <span className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
              <span className="typing-text">{otherUser.username || 'User'} is typing</span>
            </div>
          </div>
        )}

        {!loading && (
          <form onSubmit={handleSendMessage} className="message-input-form">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              
              // Handle typing indicator
              if (socket && threadId) {
                if (e.target.value.trim()) {
                  socket.emit('typing:start', { threadId });
                  
                  // Clear existing timeout
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                  }
                  
                  // Stop typing after 3 seconds of inactivity
                  typingTimeoutRef.current = setTimeout(() => {
                    if (socket) {
                      socket.emit('typing:stop', { threadId });
                    }
                  }, 3000);
                } else {
                  if (socket) {
                    socket.emit('typing:stop', { threadId });
                  }
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                  }
                }
              }
            }}
            onBlur={() => {
              // Stop typing when input loses focus
              if (socket && threadId) {
                socket.emit('typing:stop', { threadId });
              }
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
              }
            }}
            placeholder="Type a message..."
            className="message-input"
            maxLength={2000}
            disabled={sending}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!newMessage.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
        )}
      </div>
    </AppLayout>
  );
}
