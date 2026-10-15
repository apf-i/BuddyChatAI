import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { 
  FaPlus, 
  FaSignInAlt, 
  FaUserPlus, 
  FaSignOutAlt,
  FaHome,
  FaSearch,
  FaCog,
  FaGavel,
  FaEnvelope,
  FaUsers,
  FaCrown,
  FaChevronRight,
  FaComments,
  FaHandshake,
  FaChartLine
} from 'react-icons/fa';
import './Header.css';

export default function Header() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVIP, setIsVIP] = useState(false);
  const [affiliateStatus, setAffiliateStatus] = useState<any>(null);

  // Fetch unread message count and VIP status
  useEffect(() => {
    if (isAuthenticated) {
      const fetchUnreadCount = async () => {
        try {
          const response = await apiClient.get('/messages/unread-count');
          setUnreadCount(response.data.unreadCount || 0);
        } catch (error: any) {
          // Silently fail - don't spam console if backend is not available
          if (error.code !== 'ERR_NETWORK' && error.response?.status !== 401) {
            console.warn('Error fetching unread count:', error.message);
          }
          // Set to 0 on error to avoid showing stale data
          setUnreadCount(0);
        }
      };

      const fetchVIPStatus = async () => {
        try {
          const response = await apiClient.get('/tokens/subscriptions/status');
          const subscription = response.data.subscription;
          if (subscription && subscription.isActive) {
            setIsVIP(true);
          } else {
            setIsVIP(false);
          }
        } catch (error: any) {
          // Silently fail - don't show VIP if we can't check
          setIsVIP(false);
        }
      };

      const fetchAffiliateStatus = async () => {
        try {
          const response = await apiClient.get('/affiliates/status');
          if (response.data.affiliate) {
            setAffiliateStatus(response.data.affiliate);
          } else {
            setAffiliateStatus(null);
          }
        } catch (err: any) {
          // Silently fail - don't show affiliate if we can't check
          setAffiliateStatus(null);
        }
      };

      fetchUnreadCount();
      fetchVIPStatus();
      fetchAffiliateStatus();
      // Poll for updates every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadCount();
        fetchVIPStatus();
        fetchAffiliateStatus();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadCount(0);
      setIsVIP(false);
      setAffiliateStatus(null);
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const getImageUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('/')) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      return `${apiUrl}${url}`;
    }
    return url;
  };

  const getProfileLink = () => {
    if (user?.username) {
      return `/profile/${user.username}`;
    }
    return '/settings/profile';
  };

  return (
    <header className="header">
      {/* Mobile sidebar toggle button - only visible on mobile */}
      <button 
        className={`mobile-sidebar-toggle ${menuOpen ? 'open' : ''}`}
        onClick={toggleMenu}
        aria-label="Toggle menu"
      >
        <FaChevronRight />
      </button>
      {!isAuthenticated ? (
        <Link to="/login" className="sign-in-button" title="Sign In">
          <FaSignInAlt />
          <span>Sign In</span>
        </Link>
      ) : (
        <div className="header-right-actions">
          <Link to="/purchase-tokens" className="upgrade-button" title="Upgrade">
            Upgrade
          </Link>
          <Link to="/upload-character" className="upload-character-button" title="Upload Character">
            <FaPlus className="upload-icon" />
          </Link>
          <Link to="/purchase-tokens" className="header-token-balance" title={`Tokens: ${user?.tokenBalance || 0} - Click to buy more`}>
            <img src="/coin.png" alt="Token" className="header-token-icon" onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              if (!target.nextElementSibling) {
                const fallback = document.createElement('span');
                fallback.className = 'header-token-icon-fallback';
                fallback.textContent = '🪙';
                target.parentElement?.insertBefore(fallback, target);
              }
            }} />
            <span className="header-token-value">{(user?.tokenBalance || 0).toLocaleString()} tokens</span>
          </Link>
          <Link to={getProfileLink()} className="profile-picture-button" title={user?.username ? `View ${user.username}'s profile` : 'View Profile'}>
            {user?.profilePictureUrl ? (
              <img 
                src={getImageUrl(user.profilePictureUrl) || ''} 
                alt={user.username || 'Profile'} 
                className="profile-picture-img"
              />
            ) : (
              <div className="profile-picture-placeholder">
                {user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </Link>
        </div>
      )}
      <div className="container">
        <div className="header-content">
          <div className="logo-section">
            <Link to="/" className="logo" onClick={closeMenu}>
              <img 
                src="/logo.png" 
                alt="BuddyChatAI Logo" 
                className="logo-image"
                onError={(e) => {
                  // Hide logo image if it doesn't exist
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </Link>
            {isAuthenticated && isVIP && (
              <div className="vip-badge" title="VIP Member - 50% off chat costs">
                <FaCrown className="vip-crown" />
                <span className="vip-text">VIP</span>
              </div>
            )}
          </div>
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder="Search by name, age, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="search-button" aria-label="Search">
              <FaSearch />
            </button>
          </form>
          <nav className={`sidebar-menu ${menuOpen ? 'open' : ''}`}>
            <div className="menu-header">
              <button 
                className={`hamburger-menu ${menuOpen ? 'open' : ''}`} 
                onClick={toggleMenu} 
                aria-label="Toggle menu"
              >
                <span></span>
                <span></span>
                <span></span>
              </button>
              {menuOpen && (
                <button className="close-menu" onClick={closeMenu} aria-label="Close menu">
                  ×
                </button>
              )}
            </div>
            <div className="menu-content">
              <Link to="/" className="menu-item" onClick={closeMenu} title="Home">
                <FaHome className="menu-icon" />
                {menuOpen && <span className="menu-text">Home</span>}
              </Link>
              <Link to="/community" className="menu-item" onClick={closeMenu} title="Community">
                <FaUsers className="menu-icon" />
                {menuOpen && <span className="menu-text">Community</span>}
              </Link>
              {isAuthenticated ? (
                <>
                  <Link to="/chat" className="menu-item" onClick={closeMenu} title="My Chats">
                    <FaComments className="menu-icon" />
                    {menuOpen && <span className="menu-text">My Chats</span>}
                  </Link>
                  {user?.isAdmin && (
                    <>
                      <Link to="/admin/upload-template" className="menu-item" onClick={closeMenu} title="Add Character">
                        <FaPlus className="menu-icon" />
                        {menuOpen && <span className="menu-text">Add Character</span>}
                      </Link>
                      <Link to="/admin/moderation" className="menu-item" onClick={closeMenu} title="Moderation Dashboard">
                        <FaGavel className="menu-icon" />
                        {menuOpen && <span className="menu-text">Moderation</span>}
                      </Link>
                      <Link to="/admin/affiliates" className="menu-item" onClick={closeMenu} title="Manage Affiliates">
                        <FaHandshake className="menu-icon" />
                        {menuOpen && <span className="menu-text">Manage Affiliates</span>}
                      </Link>
                    </>
                  )}
                  {!affiliateStatus && (
                    <Link to="/affiliate/apply" className="menu-item" onClick={closeMenu} title="Join Affiliate Program">
                      <FaHandshake className="menu-icon" />
                      {menuOpen && <span className="menu-text">Join Affiliate</span>}
                    </Link>
                  )}
                  {affiliateStatus?.status === 'approved' && (
                    <Link to="/affiliate/dashboard" className="menu-item" onClick={closeMenu} title="Affiliate Dashboard">
                      <FaChartLine className="menu-icon" />
                      {menuOpen && <span className="menu-text">Affiliate Dashboard</span>}
                    </Link>
                  )}
                  <Link to="/messages" className="menu-item messages-menu-item" onClick={closeMenu} title="Messages">
                    <div className="menu-icon-wrapper">
                      <FaEnvelope className="menu-icon" />
                      {unreadCount > 0 && (
                        <span className="message-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                      )}
                    </div>
                    {menuOpen && <span className="menu-text">Messages</span>}
                  </Link>
                  <Link to="/upload-character" className="menu-item" onClick={closeMenu} title="Upload Character">
                    <FaPlus className="menu-icon" />
                    {menuOpen && <span className="menu-text">Upload Character</span>}
                  </Link>
                  {menuOpen ? (
                    <Link to="/purchase-tokens" className="token-balance-menu" onClick={closeMenu} title="Buy Tokens">
                      <span className="token-label">Tokens:</span>
                      <span className="token-value">{(user?.tokenBalance || 0).toLocaleString()}</span>
                    </Link>
                  ) : (
                    <Link to="/purchase-tokens" className="token-balance-icon" onClick={closeMenu} title={`Tokens: ${user?.tokenBalance || 0} - Click to buy more`}>
                      <img src="/coin.png" alt="Token" className="menu-icon menu-coin-icon" onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        if (!target.nextElementSibling) {
                          const fallback = document.createElement('span');
                          fallback.className = 'menu-icon-fallback';
                          fallback.textContent = '🪙';
                          target.parentElement?.insertBefore(fallback, target);
                        }
                      }} />
                      <span className="token-badge">{(user?.tokenBalance || 0).toLocaleString()}</span>
                    </Link>
                  )}
                  <div className="menu-bottom">
                    <Link to="/settings/profile" className="menu-item" onClick={closeMenu} title="Settings">
                      <FaCog className="menu-icon" />
                      {menuOpen && <span className="menu-text">Settings</span>}
                    </Link>
                    <button onClick={handleLogout} className="menu-item menu-item-button" title="Logout">
                      <FaSignOutAlt className="menu-icon" />
                      {menuOpen && <span className="menu-text">Logout</span>}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" className="menu-item" onClick={closeMenu} title="Login">
                    <FaSignInAlt className="menu-icon" />
                    {menuOpen && <span className="menu-text">Login</span>}
                  </Link>
                  <Link to="/signup" className="menu-item" onClick={closeMenu} title="Sign Up">
                    <FaUserPlus className="menu-icon" />
                    {menuOpen && <span className="menu-text">Sign Up</span>}
                  </Link>
                </>
              )}
            </div>
          </nav>
          {menuOpen && <div className="menu-overlay" onClick={closeMenu}></div>}
        </div>
      </div>
    </header>
  );
}
