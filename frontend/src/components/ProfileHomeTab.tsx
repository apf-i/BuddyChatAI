import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import VIPBadge from './VIPBadge';
import './ProfileHomeTab.css';

interface Follower {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  followedAt: string;
  isVIP?: boolean;
}

interface ProfileHomeTabProps {
  userId: string;
  username: string;
  onFollowChange?: () => void;
}

export default function ProfileHomeTab({ userId, username, onFollowChange }: ProfileHomeTabProps) {
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [following, setFollowing] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [followersRes, followingRes] = await Promise.all([
        apiClient.get(`/follows/followers/${userId}`),
        apiClient.get(`/follows/following/${userId}`),
      ]);
      
      // Get 10 most recent followers
      const allFollowers = followersRes.data.followers || [];
      setFollowers(allFollowers.slice(0, 10));
      
      // Get 10 most recent following
      const allFollowing = followingRes.data.following || [];
      setFollowing(allFollowing.slice(0, 10));
    } catch (err: any) {
      console.error('Error fetching followers/following:', err);
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
    return <div className="profile-home-tab loading">Loading...</div>;
  }

  return (
    <div className="profile-home-tab">
      <div className="followers-section">
        <div className="section-header">
          <h2>Followers</h2>
          <Link to={`/profile/${username}/followers`} className="see-all-link">
            See All →
          </Link>
        </div>
        {followers.length === 0 ? (
          <p className="empty-state">No followers yet</p>
        ) : (
          <div className="users-grid">
            {followers.map((follower) => (
              <Link
                key={follower.id}
                to={`/profile/${follower.username}`}
                className="user-card"
              >
                {follower.profilePictureUrl ? (
                  <img
                    src={getImageUrl(follower.profilePictureUrl) || ''}
                    alt={follower.username}
                    className="user-avatar"
                  />
                ) : (
                  <div className="user-avatar-placeholder">
                    {follower.username[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <span className="user-username">
                  {follower.username}
                  <VIPBadge isVIP={follower.isVIP} size="small" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="following-section">
        <div className="section-header">
          <h2>Following</h2>
          <Link to={`/profile/${username}/following`} className="see-all-link">
            See All →
          </Link>
        </div>
        {following.length === 0 ? (
          <p className="empty-state">Not following anyone yet</p>
        ) : (
          <div className="users-grid">
            {following.map((user) => (
              <Link
                key={user.id}
                to={`/profile/${user.username}`}
                className="user-card"
              >
                {user.profilePictureUrl ? (
                  <img
                    src={getImageUrl(user.profilePictureUrl) || ''}
                    alt={user.username}
                    className="user-avatar"
                  />
                ) : (
                  <div className="user-avatar-placeholder">
                    {user.username[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <span className="user-username">
                  {user.username}
                  <VIPBadge isVIP={user.isVIP} size="small" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
