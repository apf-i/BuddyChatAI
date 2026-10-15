import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import './NotificationBell.css';

interface Notification {
  id: string;
  type: string;
  message: string;
  threadId?: string;
  senderId?: string;
  senderUsername?: string;
  createdAt: string;
  read: boolean;
}

export default function NotificationBell() {
  const { socket, isConnected } = useSocket();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (notification: any) => {
      const newNotification: Notification = {
        id: `notif-${Date.now()}`,
        type: notification.type || 'info',
        message: notification.message || getNotificationMessage(notification),
        threadId: notification.threadId,
        senderId: notification.senderId,
        senderUsername: notification.senderUsername,
        createdAt: new Date().toISOString(),
        read: false,
      };

      setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50
      setUnreadCount(prev => prev + 1);
    };

    socket.on('notification:new', handleNotification);

    return () => {
      socket.off('notification:new', handleNotification);
    };
  }, [socket]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationMessage = (notification: any): string => {
    switch (notification.type) {
      case 'new_message':
        return `${notification.senderUsername || 'Someone'} sent you a message`;
      case 'new_follower':
        return `${notification.senderUsername || 'Someone'} started following you`;
      case 'mention':
        return `${notification.senderUsername || 'Someone'} mentioned you`;
      default:
        return 'You have a new notification';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    // Navigate based on notification type
    if (notification.threadId) {
      navigate(`/messages/${notification.threadId}`);
    } else if (notification.senderId) {
      navigate(`/profile/${notification.senderUsername || notification.senderId}`);
    }

    setShowDropdown(false);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const unreadNotifications = notifications.filter(n => !n.read);

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button
        className="notification-bell-button"
        onClick={() => setShowDropdown(!showDropdown)}
        title="Notifications"
      >
        <img 
          src="/notification-icon.png" 
          alt="Notifications" 
          className="notification-icon"
          onError={(e) => {
            // Fallback to emoji if image doesn't exist
            (e.target as HTMLImageElement).style.display = 'none';
            const fallback = document.createElement('span');
            fallback.textContent = '🔔';
            fallback.className = 'notification-fallback';
            (e.target as HTMLElement).parentElement?.appendChild(fallback);
          }}
        />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {showDropdown && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="mark-all-read" onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-content">
                    <p className="notification-message">{notification.message}</p>
                    <span className="notification-time">
                      {new Date(notification.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
