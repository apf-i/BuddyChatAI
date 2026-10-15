import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import VIPBadge from '../components/VIPBadge';
import './ProfileFollowers.css';

interface Follower {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  followedAt: string;
  isVIP?: boolean;
}

export default function ProfileFollowers() {
  const { username } = useParams<{ username: string }>();
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: string; username: string | null } | null>(null);

  useEffect(() => {
    if (username) {
      fetchData();
    }
  }, [username]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get profile to get userId
      const profileResponse = await apiClient.get(`/users/${username}`);
      const profileData = profileResponse.data.profile;
      setProfile(profileData);

      if (profileData?.id) {
        const followersResponse = await apiClient.get(`/follows/followers/${profileData.id}`);
        setFollowers(followersResponse.data.followers || []);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load followers');
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
      <div className="profile-followers-page">
        
        <div className="container">
          <div className="loading">Loading followers...</div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-followers-page">
        
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
    <div className="profile-followers-page">
      
      <div className="container">
        <div className="followers-header">
          <Link to={`/profile/${username}`} className="back-button">
            ← Back to Profile
          </Link>
          <h1>{profile.username}'s Followers ({followers.length})</h1>
        </div>

        {followers.length === 0 ? (
          <div className="empty-state">
            <p>No followers yet.</p>
          </div>
        ) : (
          <div className="followers-grid">
            {followers.map((follower) => (
              <Link
                key={follower.id}
                to={`/profile/${follower.username}`}
                className="follower-card"
              >
                {follower.profilePictureUrl ? (
                  <img
                    src={getImageUrl(follower.profilePictureUrl) || ''}
                    alt={follower.username}
                    className="follower-avatar"
                  />
                ) : (
                  <div className="follower-avatar-placeholder">
                    {follower.username[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="follower-info">
                  <span className="follower-username">
                    {follower.username}
                    <VIPBadge isVIP={follower.isVIP} size="small" />
                  </span>
                  <span className="follower-date">
                    Since {new Date(follower.followedAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
