import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './ProfileSettings.css';

interface ProfileData {
  id: string;
  email: string;
  username: string | null;
  profilePictureUrl: string | null;
  bio: string | null;
  createdAt: string;
}

interface PrivacySettings {
  showFavorites: boolean;
  showShowcasedChats: boolean;
  allowDms: boolean;
  profilePublic: boolean;
}

export default function ProfileSettings() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    bio: '',
  });
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    showFavorites: true,
    showShowcasedChats: true,
    allowDms: true,
    profilePublic: true,
  });
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchProfile();
    fetchPrivacySettings();
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/users/me/profile');
      const profileData = response.data.profile;
      setProfile(profileData);
      setFormData({
        username: profileData.username || '',
        bio: profileData.bio || '',
      });
      setProfilePicturePreview(profileData.profilePictureUrl || null);
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
        // Redirect will be handled by the API interceptor
      } else {
        setError(err.response?.data?.error || 'Failed to load profile. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPrivacySettings = async () => {
    try {
      const response = await apiClient.get('/users/me/privacy');
      setPrivacySettings(response.data.privacy);
    } catch (err: any) {
      console.error('Error fetching privacy settings:', err);
      // Use defaults if fetch fails
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePrivacyChange = (setting: keyof PrivacySettings) => {
    setPrivacySettings(prev => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfilePictureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Upload profile picture first if selected
      if (profilePictureFile) {
        const formData = new FormData();
        formData.append('profilePicture', profilePictureFile);
        await apiClient.post('/users/me/profile-picture', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      // Update profile
      const response = await apiClient.put('/users/me/profile', formData);
      
      // Update privacy settings
      await apiClient.put('/users/me/privacy', privacySettings);
      
      // Refresh user data in context
      await refreshUser();
      
      // Navigate to profile page if username was set
      if (response.data.profile.username) {
        navigate(`/profile/${response.data.profile.username}`);
      } else {
        // Reload to show updated data
        fetchProfile();
      }
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
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
      <div className="profile-settings-page">
        
        <div className="container">
          <div className="loading">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile && !loading) {
    return (
      <div className="profile-settings-page">
        
        <div className="container">
          <div className="error">
            <p>{error || 'Failed to load profile'}</p>
            {error && error.includes('session has expired') ? (
              <p>Redirecting to login page...</p>
            ) : (
              <button 
                onClick={() => {
                  setError(null);
                  fetchProfile();
                }}
                className="save-button"
                style={{ marginTop: '1rem' }}
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-settings-page">
      
      <div className="container">
        <div className="settings-container">
          <h1>Edit Profile</h1>

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-section">
              <h2>Profile Picture</h2>
              <div className="profile-picture-upload">
                <div className="profile-picture-preview">
                  {profilePicturePreview ? (
                    <img
                      src={getImageUrl(profilePicturePreview) || profilePicturePreview}
                      alt="Profile preview"
                      className="preview-image"
                    />
                  ) : (
                    <div className="preview-placeholder">
                      {formData.username?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <label className="upload-button">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureChange}
                    style={{ display: 'none' }}
                  />
                  Choose Photo
                </label>
                {profilePictureFile && (
                  <p className="file-name">{profilePictureFile.name}</p>
                )}
              </div>
            </div>

            <div className="form-section">
              <h2>Profile Information</h2>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Choose a username"
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_-]+"
                />
                <p className="form-hint">
                  3-30 characters. Letters, numbers, underscores, and hyphens only.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="bio">Bio</label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="Tell us about yourself..."
                  maxLength={500}
                  rows={5}
                />
                <p className="form-hint">
                  {formData.bio.length}/500 characters
                </p>
              </div>
            </div>

            <div className="form-section">
              <h2>Privacy Settings</h2>
              <div className="privacy-toggles">
                <div className="privacy-toggle-item">
                  <div className="toggle-info">
                    <label htmlFor="showFavorites" className="toggle-label">
                      Show Favorites
                    </label>
                    <p className="toggle-description">
                      Display your favorite characters on your profile
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="showFavorites"
                      checked={privacySettings.showFavorites}
                      onChange={() => handlePrivacyChange('showFavorites')}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="privacy-toggle-item">
                  <div className="toggle-info">
                    <label htmlFor="showShowcasedChats" className="toggle-label">
                      Show Showcased Chats
                    </label>
                    <p className="toggle-description">
                      Display your showcased chat conversations on your profile
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="showShowcasedChats"
                      checked={privacySettings.showShowcasedChats}
                      onChange={() => handlePrivacyChange('showShowcasedChats')}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="privacy-toggle-item">
                  <div className="toggle-info">
                    <label htmlFor="allowDms" className="toggle-label">
                      Allow Direct Messages
                    </label>
                    <p className="toggle-description">
                      Let other users send you direct messages
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="allowDms"
                      checked={privacySettings.allowDms}
                      onChange={() => handlePrivacyChange('allowDms')}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="privacy-toggle-item">
                  <div className="toggle-info">
                    <label htmlFor="profilePublic" className="toggle-label">
                      Public Profile
                    </label>
                    <p className="toggle-description">
                      Make your profile visible to everyone (when disabled, only you can see it)
                    </p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="profilePublic"
                      checked={privacySettings.profilePublic}
                      onChange={() => handlePrivacyChange('profilePublic')}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Showcased Chats</h2>
              <p className="section-description">
                Manage which chat conversations appear on your profile. Select specific messages to showcase while keeping the rest private.
              </p>
              <Link to="/my-showcases" className="manage-showcases-link">
                Manage My Showcases →
              </Link>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="save-button" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {profile?.username && (
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    if (profile?.username) {
                      navigate(`/profile/${profile.username}`);
                    }
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
