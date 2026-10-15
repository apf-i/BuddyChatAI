import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import FollowButton from '../components/FollowButton';
import BlockButton from '../components/BlockButton';
import ReportButton from '../components/ReportButton';
import ProfileHomeTab from '../components/ProfileHomeTab';
import ProfileGalleryTab from '../components/ProfileGalleryTab';
import ProfileShowcaseTab from '../components/ProfileShowcaseTab';
import ProfileFavoritesTab from '../components/ProfileFavoritesTab';
import VIPBadge from '../components/VIPBadge';
import './Profile.css';

interface ProfileData {
  id: string;
  username: string | null;
  profilePictureUrl: string | null;
  bio: string | null;
  createdAt: string;
  isVIP?: boolean;
}

type TabType = 'home' | 'gallery' | 'showcase' | 'favorites';

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/users/${username}`);
      setProfile(response.data.profile);
      // Fetch follow counts after profile is loaded
      if (response.data.profile?.id) {
        fetchFollowCounts(response.data.profile.id);
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      setError(err.response?.data?.error || 'Profile not found');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowCounts = async (userId?: string) => {
    try {
      const targetUserId = userId || profile?.id;
      if (targetUserId) {
        const response = await apiClient.get(`/follows/counts/${targetUserId}`);
        setFollowCounts(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching follow counts:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!profile?.id || !currentUser) return;

    try {
      // Check if thread already exists
      const threadsResponse = await apiClient.get('/messages/threads');
      const existingThread = threadsResponse.data.threads.find((t: any) => 
        t.otherUser.id === profile.id
      );

      if (existingThread) {
        navigate(`/messages/${existingThread.id}`);
      } else {
        // Create or get thread and navigate to it
        try {
          const response = await apiClient.post(`/messages/threads/with/${profile.id}`);
          navigate(`/messages/${response.data.thread.id}`);
        } catch (err: any) {
          console.error('Error creating thread:', err);
          const errorMsg = err.response?.data?.error || 'Failed to start conversation';
          alert(errorMsg);
        }
      }
    } catch (err: any) {
      console.error('Error checking threads:', err);
      // Try to create thread anyway
      try {
        const response = await apiClient.post(`/messages/threads/with/${profile.id}`);
        navigate(`/messages/${response.data.thread.id}`);
      } catch (createErr: any) {
        const errorMsg = createErr.response?.data?.error || 'Failed to start conversation';
        alert(errorMsg);
      }
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

  const formatJoinDate = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.toLocaleString('default', { month: 'long' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  if (loading) {
    return (
      <AppLayout className="profile-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading profile...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !profile) {
    return (
      <AppLayout className="profile-page">
        
        <div className="container">
          <div className="error">
            <p>{error || 'Profile not found'}</p>
            <Link to="/" className="back-link">Go to Home</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="profile-page">
      
      <div className="container">
        <div className="profile-container">
          <div className="profile-header">
            <div className="profile-picture-container">
              {profile.profilePictureUrl ? (
                <img
                  src={getImageUrl(profile.profilePictureUrl) || ''}
                  alt={profile.username || 'Profile'}
                  className="profile-picture"
                />
              ) : (
                <div className="profile-picture-placeholder">
                  {profile.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="profile-info">
              <div className="profile-header-row">
                <h1 className="profile-username">
                  {profile.username || 'No username'}
                  <VIPBadge isVIP={profile.isVIP} size="medium" />
                </h1>
                <div className="profile-actions">
                  {isOwnProfile ? (
                    <Link to="/settings/profile" className="edit-profile-button">
                      Edit Profile
                    </Link>
                  ) : (
                    profile.id && (
                      <>
                        <FollowButton
                          userId={profile.id}
                          username={profile.username || ''}
                          onFollowChange={fetchFollowCounts}
                        />
                        <button
                          className="send-message-button"
                          onClick={handleSendMessage}
                        >
                          Send Message
                        </button>
                        <BlockButton
                          userId={profile.id}
                          username={profile.username || ''}
                          onBlockChange={() => {
                            fetchProfile();
                            fetchFollowCounts();
                          }}
                        />
                        <ReportButton
                          targetType="user"
                          targetId={profile.id}
                          targetName={profile.username || undefined}
                        />
                      </>
                    )
                  )}
                </div>
              </div>
              <div className="profile-stats">
                <div className="stat-item">
                  <span className="stat-value">{followCounts.followers}</span>
                  <span className="stat-label">Followers</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{followCounts.following}</span>
                  <span className="stat-label">Following</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">Joined</span>
                  <span className="stat-label">{formatJoinDate(profile.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {profile.bio && (
            <div className="profile-bio">
              <p>{profile.bio}</p>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="profile-tabs">
            <button
              className={`profile-tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              Home
            </button>
            <button
              className={`profile-tab ${activeTab === 'gallery' ? 'active' : ''}`}
              onClick={() => setActiveTab('gallery')}
            >
              Gallery
            </button>
            <button
              className={`profile-tab ${activeTab === 'showcase' ? 'active' : ''}`}
              onClick={() => setActiveTab('showcase')}
            >
              Chat Showcase
            </button>
            <button
              className={`profile-tab ${activeTab === 'favorites' ? 'active' : ''}`}
              onClick={() => setActiveTab('favorites')}
            >
              Favorites
            </button>
          </div>

          {/* Tab Content */}
          <div className="profile-tab-content">
            {activeTab === 'home' && (
              <ProfileHomeTab
                userId={profile.id}
                username={username || ''}
                onFollowChange={fetchFollowCounts}
              />
            )}
            {activeTab === 'gallery' && (
              <ProfileGalleryTab userId={profile.id} username={username || ''} />
            )}
            {activeTab === 'showcase' && (
              <ProfileShowcaseTab username={username || ''} />
            )}
            {activeTab === 'favorites' && (
              <ProfileFavoritesTab username={username || ''} />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
