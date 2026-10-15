import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TokenDisplay from '../components/TokenDisplay';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import '../components/CharacterCard.css';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SessionData {
  session: any;
  character: {
    id: string;
    name: string;
    image_url: string;
    images?: string[];
    personality?: string;
    age?: number;
    location?: string;
    tags?: string[];
  };
}

interface ChatListItem {
  id: string;
  character: {
    id: string;
    name: string;
    image_url: string;
  };
  latestMessage: {
    content: string;
    role: 'user' | 'assistant';
    created_at: string;
  } | null;
  updated_at: string;
}

export default function Chat() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [chatList, setChatList] = useState<ChatListItem[]>([]);
  const [loadingChatList, setLoadingChatList] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, user, updateUserBalance } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    loadChatList();

    if (sessionId && sessionId !== 'new') {
      loadSession();
      loadMessages();
    } else if (sessionId === 'new') {
      const urlParams = new URLSearchParams(window.location.search);
      const characterId = urlParams.get('character');
      if (characterId) {
        startNewSession(characterId);
      }
    } else {
      setSessionData(null);
      setMessages([]);
    }
  }, [sessionId, isAuthenticated]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setCurrentImageIndex(0);
    setProfileOpen(false);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionData?.character?.images || sessionData.character.images.length <= 1) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : sessionData.character.images!.length - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentImageIndex((prev) => (prev < sessionData.character.images!.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [sessionData?.character?.images]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadChatList(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatList = async (silent = false) => {
    try {
      if (!silent) setLoadingChatList(true);
      const response = await apiClient.get('/sessions');
      setChatList(response.data.sessions || []);
    } catch (err: any) {
      console.error('Error loading chat list:', err);
    } finally {
      if (!silent) setLoadingChatList(false);
    }
  };

  const handleChatClick = (chatSessionId: string) => {
    navigate(`/chat/${chatSessionId}`);
  };

  const handleBackToInbox = () => {
    navigate('/chat');
  };

  const formatMessagePreview = (content: string, maxLength: number = 56) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '…';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatMessageContent = (content: string, isCharacter: boolean) => {
    if (!isCharacter) return content;

    const parts: (string | JSX.Element)[] = [];
    const regex = /\*([^*]+)\*/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      parts.push(
        <span key={key++} className="message-purple-text">
          {match[1]}
        </span>
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  const loadSession = async () => {
    try {
      const response = await apiClient.get(`/sessions/${sessionId}`);
      const data = response.data;

      if (data.character) {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

        if (data.character.image_url) {
          let imageUrl = data.character.image_url;
          if (imageUrl.startsWith('/')) imageUrl = `${apiUrl}${imageUrl}`;
          if (imageUrl.includes('localhost:3001') && import.meta.env.VITE_API_URL) {
            imageUrl = imageUrl.replace(/http:\/\/localhost:3001/g, import.meta.env.VITE_API_URL);
          }
          data.character.image_url = imageUrl;
        }

        if (data.character.images && Array.isArray(data.character.images)) {
          data.character.images = data.character.images.map((img: string) => {
            if (img && img.startsWith('/')) return `${apiUrl}${img}`;
            if (img && img.includes('localhost:3001') && import.meta.env.VITE_API_URL) {
              return img.replace(/http:\/\/localhost:3001/g, import.meta.env.VITE_API_URL);
            }
            return img;
          });
        } else if (data.character.image_url) {
          data.character.images = [data.character.image_url];
        }
      }

      setSessionData(data);
      setIsShared(data.session?.is_shared || false);
      setCurrentImageIndex(0);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Your session has expired. Redirecting to login...');
      } else {
        setError(err.response?.data?.error || 'Failed to load session');
      }
    }
  };

  const loadMessages = async () => {
    try {
      const response = await apiClient.get(`/chat/${sessionId}/history`);
      setMessages(response.data.messages || []);
    } catch (err: any) {
      console.error('Error loading messages:', err);
      if (err.response?.status === 401) {
        setError('Your session has expired. Redirecting to login...');
      }
    }
  };

  const startNewSession = async (characterId: string) => {
    try {
      setLoading(true);
      const response = await apiClient.post('/sessions/start', {
        template_id: characterId,
      });
      navigate(`/chat/${response.data.sessionId}`, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || sending || !sessionId || sessionId === 'new') return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setError(null);

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const response = await apiClient.post('/chat/send', {
        session_id: sessionId,
        user_message: userMessage,
      });

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
        return [
          ...filtered,
          tempUserMessage,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant' as const,
            content: response.data.reply,
            created_at: new Date().toISOString(),
          },
        ];
      });

      if (response.data.tokenBalance !== undefined) {
        updateUserBalance(response.data.tokenBalance);
      }

      setTimeout(() => {
        loadMessages();
        loadChatList(true);
      }, 500);
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));

      if (err.response?.status === 401) {
        setError('Your session has expired. Redirecting to login...');
      } else if (err.response?.status === 403) {
        setError('Insufficient tokens. Please purchase more tokens to continue chatting.');
      } else {
        setError(err.response?.data?.error || 'Message failed. Try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleOpenShareModal = () => {
    setShowShareModal(true);
    setSelectedMessages(new Set());
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) newSet.delete(messageId);
      else newSet.add(messageId);
      return newSet;
    });
  };

  const handleShareToCommunity = async () => {
    if (!sessionId || sessionId === 'new') return;
    if (selectedMessages.size === 0) {
      alert('Please select at least one message to share');
      return;
    }

    const title = prompt('Enter a title for your shared chat (optional):');
    if (title === null) return;
    const description = prompt('Enter a description (optional):');
    if (description === null) return;

    try {
      setSharing(true);
      await apiClient.post(`/community/chats/${sessionId}/share`, {
        title: title || undefined,
        description: description || undefined,
        messageIds: Array.from(selectedMessages),
      });
      setIsShared(true);
      setShowShareModal(false);
      setSelectedMessages(new Set());
      alert('Chat shared to community successfully!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to share chat');
    } finally {
      setSharing(false);
    }
  };

  const handleUnshareFromCommunity = async () => {
    if (!sessionId || sessionId === 'new') return;
    if (!confirm('Are you sure you want to remove this chat from the community?')) return;

    try {
      setSharing(true);
      await apiClient.post(`/community/chats/${sessionId}/unshare`);
      setIsShared(false);
      alert('Chat removed from community');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to unshare chat');
    } finally {
      setSharing(false);
    }
  };

  const characterAvatar =
    sessionData?.character?.image_url ||
    sessionData?.character?.images?.[0] ||
    '';

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <AppLayout className="chat-page" hideFooter fullBleed>
        <div className="chat-shell">
          <div className="chat-state-center">
            <div className="chat-loading-spinner" aria-hidden="true" />
            <p>Loading conversation…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error && !sessionData && sessionId) {
    return (
      <AppLayout className="chat-page" hideFooter fullBleed>
        <div className="chat-shell">
          <div className="chat-state-center chat-state-error">
            <p>{error}</p>
            <button type="button" className="btn-ui btn-ui-secondary" onClick={handleBackToInbox}>
              Back to DMs
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="chat-page" hideFooter fullBleed>
      <div className={`chat-shell ${sessionId ? 'has-active-chat' : ''}`}>
        {/* Inbox */}
        <aside className={`chat-inbox ${sessionId ? 'chat-inbox-mobile-hidden' : ''}`}>
          <div className="chat-inbox-header">
            <div>
              <h1 className="chat-inbox-title">Messages</h1>
              <p className="chat-inbox-subtitle">Your character conversations</p>
            </div>
            <Link to="/" className="btn-ui btn-ui-primary chat-inbox-new">
              + New
            </Link>
          </div>

          <div className="chat-inbox-list">
            {loadingChatList ? (
              <div className="chat-inbox-status">Loading…</div>
            ) : chatList.length === 0 ? (
              <div className="chat-inbox-empty">
                <div className="chat-inbox-empty-icon" aria-hidden="true">
                  💬
                </div>
                <p className="chat-inbox-empty-title">No conversations yet</p>
                <p className="chat-inbox-empty-text">Pick a character from the gallery and start chatting.</p>
                <Link to="/" className="btn-ui btn-ui-primary">
                  Browse characters
                </Link>
              </div>
            ) : (
              chatList.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  className={`chat-inbox-item ${sessionId === chat.id ? 'is-active' : ''}`}
                  onClick={() => handleChatClick(chat.id)}
                >
                  <div className="chat-inbox-avatar">
                    <img src={chat.character.image_url} alt="" />
                  </div>
                  <div className="chat-inbox-item-body">
                    <div className="chat-inbox-item-top">
                      <span className="chat-inbox-item-name">{chat.character.name}</span>
                      {chat.latestMessage && (
                        <span className="chat-inbox-item-time">
                          {formatTime(chat.latestMessage.created_at)}
                        </span>
                      )}
                    </div>
                    {chat.latestMessage ? (
                      <p className="chat-inbox-item-preview">
                        {chat.latestMessage.role === 'user' ? 'You: ' : ''}
                        {formatMessagePreview(chat.latestMessage.content)}
                      </p>
                    ) : (
                      <p className="chat-inbox-item-preview is-muted">Say hello</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className={`chat-conversation ${sessionId ? 'is-visible' : ''}`}>
          {sessionData ? (
            <>
              <header className="chat-conversation-header">
                <button
                  type="button"
                  className="chat-back-btn"
                  onClick={handleBackToInbox}
                  aria-label="Back to inbox"
                >
                  ←
                </button>
                <div className="chat-conversation-header-info">
                  <div className="chat-conversation-avatar">
                    <img src={characterAvatar} alt="" />
                  </div>
                  <div>
                    <h2 className="chat-conversation-name">{sessionData.character.name}</h2>
                    <span className="character-online-badge chat-online-badge">
                      <span className="character-online-dot" aria-hidden="true" />
                      Online
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="chat-profile-toggle"
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-label="Toggle character profile"
                  aria-expanded={profileOpen}
                >
                  <img src={characterAvatar} alt="" />
                </button>
              </header>

              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="chat-messages-empty">
                    <div className="chat-messages-empty-avatar">
                      <img src={characterAvatar} alt="" />
                    </div>
                    <p className="chat-messages-empty-title">Say hi to {sessionData.character.name}</p>
                    <p className="chat-messages-empty-text">Send a message to start the conversation.</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                    >
                      <div className="chat-bubble-content">
                        {message.role === 'assistant'
                          ? formatMessageContent(message.content, true)
                          : message.content}
                      </div>
                    </div>
                  ))
                )}
                {sending && (
                  <div className="chat-bubble is-assistant">
                    <div className="chat-bubble-content typing-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {error && <div className="chat-inline-error">{error}</div>}

              <form onSubmit={sendMessage} className="chat-composer">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Message ${sessionData.character.name}…`}
                  disabled={sending}
                  className="chat-composer-input"
                />
                <button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  className="btn-ui btn-ui-primary chat-composer-send"
                >
                  {sending ? '…' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="chat-conversation-placeholder">
              <div className="chat-conversation-placeholder-inner">
                <div className="chat-conversation-placeholder-icon" aria-hidden="true">
                  ✦
                </div>
                <h2>Select a conversation</h2>
                <p>Choose a chat from the list, or find someone new to talk to.</p>
                <Link to="/" className="btn-ui btn-ui-primary">
                  Browse characters
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Character profile panel */}
        {sessionData && (
          <aside className={`chat-profile ${profileOpen ? 'is-open' : ''}`}>
            <div className="chat-profile-header">
              <h3>Profile</h3>
              <button
                type="button"
                className="chat-profile-close"
                onClick={() => setProfileOpen(false)}
                aria-label="Close profile"
              >
                ×
              </button>
            </div>

            <div className="chat-profile-media">
              {sessionData.character.images && sessionData.character.images.length > 0 ? (
                <div className="chat-profile-carousel">
                  <img
                    src={sessionData.character.images[currentImageIndex]}
                    alt={sessionData.character.name}
                    className="chat-profile-image"
                  />
                  {sessionData.character.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="chat-carousel-nav chat-carousel-prev"
                        onClick={() =>
                          setCurrentImageIndex((prev) =>
                            prev > 0 ? prev - 1 : sessionData.character.images!.length - 1
                          )
                        }
                        aria-label="Previous photo"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="chat-carousel-nav chat-carousel-next"
                        onClick={() =>
                          setCurrentImageIndex((prev) =>
                            prev < sessionData.character.images!.length - 1 ? prev + 1 : 0
                          )
                        }
                        aria-label="Next photo"
                      >
                        ›
                      </button>
                      <span className="chat-carousel-counter">
                        {currentImageIndex + 1} / {sessionData.character.images.length}
                      </span>
                    </>
                  )}
                </div>
              ) : characterAvatar ? (
                <div className="chat-profile-carousel">
                  <img src={characterAvatar} alt={sessionData.character.name} className="chat-profile-image" />
                </div>
              ) : (
                <div className="chat-profile-carousel chat-profile-no-image">No photo</div>
              )}
            </div>

            <div className="chat-profile-body">
              <h4 className="chat-profile-name">{sessionData.character.name}</h4>

              <div className="chat-profile-meta">
                {sessionData.character.age != null && (
                  <span className="chat-profile-pill">{sessionData.character.age} yrs</span>
                )}
                {sessionData.character.location && (
                  <span className="chat-profile-pill">{sessionData.character.location}</span>
                )}
              </div>

              {sessionData.character.personality && (
                <p className="chat-profile-bio">{sessionData.character.personality}</p>
              )}

              {sessionData.character.tags && sessionData.character.tags.length > 0 && (
                <div className="chat-profile-tags">
                  {sessionData.character.tags.map((tag, idx) => (
                    <span key={idx} className="chat-profile-tag">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="chat-profile-tokens surface-card">
                <span className="chat-profile-tokens-label">Your tokens</span>
                <TokenDisplay amount={user?.tokenBalance || 0} size="medium" />
              </div>

              {messages.length > 0 && (
                <div className="chat-profile-share">
                  {isShared ? (
                    <button
                      type="button"
                      onClick={handleUnshareFromCommunity}
                      disabled={sharing}
                      className="btn-ui btn-ui-secondary chat-profile-share-btn"
                    >
                      {sharing ? 'Removing…' : 'Remove from Community'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenShareModal}
                      disabled={sharing}
                      className="btn-ui btn-ui-primary chat-profile-share-btn"
                    >
                      Share to Community
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {profileOpen && sessionData && (
          <button
            type="button"
            className="chat-profile-backdrop"
            onClick={() => setProfileOpen(false)}
            aria-label="Close profile"
          />
        )}
      </div>

      {showShareModal && (
        <div className="chat-share-overlay" onClick={() => setShowShareModal(false)}>
          <div className="chat-share-modal surface-card" onClick={(e) => e.stopPropagation()}>
            <div className="chat-share-modal-header">
              <h2>Share to Community</h2>
              <button
                type="button"
                className="chat-share-close"
                onClick={() => setShowShareModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="chat-share-hint">Select messages you want to share publicly.</p>
            <div className="chat-share-list">
              {messages.map((message) => (
                <label
                  key={message.id}
                  className={`chat-share-item ${selectedMessages.has(message.id) ? 'is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMessages.has(message.id)}
                    onChange={() => toggleMessageSelection(message.id)}
                  />
                  <div className="chat-share-item-body">
                    <span className="chat-share-item-role">
                      {message.role === 'user' ? 'You' : sessionData?.character.name}
                    </span>
                    <p>{message.content}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="chat-share-footer">
              <button type="button" className="btn-ui btn-ui-secondary" onClick={() => setShowShareModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-ui btn-ui-primary"
                onClick={handleShareToCommunity}
                disabled={sharing || selectedMessages.size === 0}
              >
                {sharing ? 'Sharing…' : `Share ${selectedMessages.size} message${selectedMessages.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
