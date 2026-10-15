import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './EditCharacter.css';

interface CharacterImage {
  id: string;
  image_url: string;
  image_order: number;
}

export default function EditCharacter() {
  const { type, characterId } = useParams<{ type: 'template' | 'community' | 'user'; characterId: string }>();
  const [systemPrompt, setSystemPrompt] = useState('');
  const [originalSystemPrompt, setOriginalSystemPrompt] = useState('');
  const [existingImages, setExistingImages] = useState<CharacterImage[]>([]);
  const [imagesToRemove, setImagesToRemove] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !user?.isAdmin) {
      navigate('/');
      return;
    }

    if (!type || !characterId) {
      setError('Invalid character type or ID');
      setLoading(false);
      return;
    }

    fetchCharacter();
  }, [type, characterId, isAuthenticated, user]);

  const fetchCharacter = async () => {
    try {
      setLoading(true);
      let endpoint = '';
      
      if (type === 'template') {
        endpoint = `/admin/templates/${characterId}`;
      } else if (type === 'community') {
        endpoint = `/admin/community-characters/${characterId}`;
      } else if (type === 'user') {
        endpoint = `/admin/characters/${characterId}`;
      } else {
        setError('Invalid character type');
        setLoading(false);
        return;
      }

      const response = await apiClient.get(endpoint);
      const character = response.data;

      setCharacterName(character.name || '');
      const currentPrompt = character.system_prompt || '';
      setSystemPrompt(currentPrompt);
      setOriginalSystemPrompt(currentPrompt);
      
      if (character.images && Array.isArray(character.images)) {
        setExistingImages(character.images);
      } else if (character.image_url && type === 'user') {
        // User characters might only have a single image_url
        setExistingImages([{ id: 'main', image_url: character.image_url, image_order: 0 }]);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load character');
    } finally {
      setLoading(false);
    }
  };

  const handleNewImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => file.type.startsWith('image/'));
    if (validFiles.length !== files.length) {
      setError('Only image files are allowed');
      return;
    }

    const oversizedFiles = validFiles.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError('Images must be smaller than 10MB');
      return;
    }

    setNewImageFiles([...newImageFiles, ...validFiles]);
    
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setNewImagePreviews(prev => [...prev, e.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    setError(null);
    e.target.value = '';
  };

  const removeExistingImage = (imageId: string) => {
    setImagesToRemove([...imagesToRemove, imageId]);
    setExistingImages(existingImages.filter(img => img.id !== imageId));
  };

  const removeNewImage = (index: number) => {
    setNewImageFiles(newImageFiles.filter((_, i) => i !== index));
    setNewImagePreviews(newImagePreviews.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Check if anything is being changed
    const hasSystemPromptChange = systemPrompt.trim() !== originalSystemPrompt.trim();
    const hasImageRemovals = imagesToRemove.length > 0;
    const hasNewImages = newImageFiles.length > 0;

    if (!hasSystemPromptChange && !hasImageRemovals && !hasNewImages) {
      setError('Please make at least one change');
      return;
    }

    // Validate system prompt if it's being changed
    if (hasSystemPromptChange && systemPrompt.length < 10) {
      setError('System prompt must be at least 10 characters');
      return;
    }

    // Check that we're not removing all images without adding new ones
    const remainingImages = existingImages.length - imagesToRemove.length;
    if (remainingImages === 0 && newImageFiles.length === 0) {
      setError('Character must have at least one image. Add new images before removing all existing ones.');
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      
      // Add new images if provided
      if (hasNewImages) {
        newImageFiles.forEach((file) => {
          formData.append('new_images', file);
        });
      }
      
      // Add system prompt only if it's being changed
      if (hasSystemPromptChange) {
        formData.append('system_prompt', systemPrompt);
      }
      
      // Add images to remove if any
      if (hasImageRemovals) {
        formData.append('image_urls_to_remove', JSON.stringify(imagesToRemove));
      }

      let endpoint = '';
      if (type === 'template') {
        endpoint = `/admin/templates/${characterId}`;
      } else if (type === 'community') {
        endpoint = `/admin/community-characters/${characterId}`;
      } else {
        setError('Editing user characters is not yet supported');
        setSaving(false);
        return;
      }

      await apiClient.put(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess(true);
      
      setTimeout(() => {
        navigate(`/character/${type}/${characterId}`);
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update character. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="edit-character-page">
        
        <div className="container">
          <div className="loading">Loading character...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.isAdmin) {
    return null;
  }

  return (
    <div className="edit-character-page">
      
      <div className="container">
        <div className="edit-character-container">
          <div className="edit-character-card">
            <h1>Edit Character: {characterName}</h1>
            <p className="subtitle">Update AI prompt and manage images</p>

            {error && <div className="error-message">{error}</div>}
            {success && (
              <div className="success-message">
                Character updated successfully! Redirecting...
              </div>
            )}

            <form onSubmit={handleSubmit} className="edit-character-form">
              <div className="form-group">
                <label htmlFor="systemPrompt">AI System Prompt (Optional)</label>
                <textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  minLength={10}
                  rows={8}
                  placeholder="Leave unchanged or update the system prompt for the AI model. This controls how the character responds in chat..."
                />
                <small className="form-hint">If updating, must be at least 10 characters. Leave unchanged to keep current prompt.</small>
              </div>

              <div className="form-group">
                <label>Existing Images</label>
                {existingImages.length > 0 ? (
                  <div className="existing-images-grid">
                    {existingImages.map((image) => (
                      <div key={image.id} className="existing-image-item">
                        <div className="image-preview">
                          <img src={image.image_url} alt={`Image ${image.image_order + 1}`} />
                        </div>
                        <button
                          type="button"
                          className="remove-image-btn"
                          onClick={() => removeExistingImage(image.id)}
                          aria-label="Remove image"
                        >
                          × Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-images">No existing images</p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="newImages">Add New Images</label>
                <input
                  type="file"
                  id="newImages"
                  accept="image/*"
                  onChange={handleNewImageChange}
                  multiple
                />
                {newImageFiles.length > 0 && (
                  <div className="images-count">
                    {newImageFiles.length} new image{newImageFiles.length !== 1 ? 's' : ''} selected
                  </div>
                )}
                {newImagePreviews.length > 0 && (
                  <div className="image-previews-grid">
                    {newImagePreviews.map((preview, index) => (
                      <div key={index} className="image-preview-item">
                        <div className="image-preview">
                          <img src={preview} alt={`New preview ${index + 1}`} />
                        </div>
                        <button
                          type="button"
                          className="remove-image-btn"
                          onClick={() => removeNewImage(index)}
                          aria-label="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <small className="form-hint">Max file size: 10MB per image. You can upload multiple images.</small>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
