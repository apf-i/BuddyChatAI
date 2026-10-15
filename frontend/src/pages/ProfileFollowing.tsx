import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import VIPBadge from '../components/VIPBadge';
import './ProfileFollowing.css';

interface Following {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  followedAt: string;
  isVIP?: boolean;
}

export default function ProfileFollowing() {
  const { username } = useParams<{ username: string }>();
  const [following, setFollowing] = useState<Following[]>([]);
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
        const followingResponse = await apiClient.get(`/follows/following/${profileData.id}`);
        setFollowing(followingResponse.data.following || []);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load following');
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
      <div className="profile-following-page">
        
        <div className="container">
          <div className="loading">Loading following...</div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-following-page">
        
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
    <div className="profile-following-page">
      
      <div className="container">
        <div className="following-header">
          <Link to={`/profile/${username}`} className="back-button">
            ← Back to Profile
          </Link>
          <h1>{profile.username} is Following ({following.length})</h1>
        </div>

        {following.length === 0 ? (
          <div className="empty-state">
            <p>Not following anyone yet.</p>
          </div>
        ) : (
          <div className="following-grid">
            {following.map((user) => (
              <Link
                key={user.id}
                to={`/profile/${user.username}`}
                className="following-card"
              >
                {user.profilePictureUrl ? (
                  <img
                    src={getImageUrl(user.profilePictureUrl) || ''}
                    alt={user.username}
                    className="following-avatar"
                  />
                ) : (
                  <div className="following-avatar-placeholder">
                    {user.username[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="following-info">
                  <span className="following-username">
                    {user.username}
                    <VIPBadge isVIP={user.isVIP} size="small" />
                  </span>
                  <span className="following-date">
                    Since {new Date(user.followedAt).toLocaleDateString()}
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
