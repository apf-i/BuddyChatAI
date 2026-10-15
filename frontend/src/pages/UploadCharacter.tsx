import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import TagSelector from '../components/TagSelector';
import { CHARACTER_CATEGORIES, CharacterCategory } from '../constants/characterCategories';
import './UploadCharacter.css';

export default function UploadCharacter() {
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [location, setLocation] = useState('');
  const [personality, setPersonality] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState<CharacterCategory | ''>('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setImageFiles([...imageFiles, ...validFiles]);
    
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setImagePreviews(prev => [...prev, e.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    setError(null);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (imageFiles.length === 0) {
      setError('Please select at least one image file');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      
      imageFiles.forEach((file) => {
        formData.append('images', file);
      });
      
      formData.append('name', name);
      if (age) {
        formData.append('age', age.toString());
      }
      if (location) {
        formData.append('location', location);
      }
      if (personality) {
        formData.append('personality', personality);
      }
      if (systemPrompt) {
        formData.append('system_prompt', systemPrompt);
      }
      if (category) {
        formData.append('category', category);
      }
      if (tags.length > 0) {
        formData.append('tags', JSON.stringify(tags));
      }

      const response = await apiClient.post('/community/characters', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess(true);
      
      // Reset form
      setName('');
      setAge('');
      setLocation('');
      setPersonality('');
      setSystemPrompt('');
      setTags([]);
      setCategory('');
      setImageFiles([]);
      setImagePreviews([]);
      
      const fileInput = document.getElementById('image') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      // Navigate to my-uploads after 2 seconds
      setTimeout(() => {
        navigate('/my-uploads');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload character. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-character-page">
      
      <div className="container">
        <div className="upload-character-container">
          <div className="upload-character-card">
            <h1>Upload Community Character</h1>
            <p className="subtitle">Share your character with the community. All uploads require moderation before going public.</p>

            {error && <div className="error-message">{error}</div>}
            {success && (
              <div className="success-message">
                Character uploaded successfully! It's now pending moderation. Redirecting to your uploads...
              </div>
            )}

            <form onSubmit={handleSubmit} className="upload-character-form">
              <div className="form-group">
                <label htmlFor="image">Character Images *</label>
                <input
                  type="file"
                  id="image"
                  accept="image/*"
                  onChange={handleImageChange}
                  multiple
                />
                {imageFiles.length > 0 && (
                  <div className="images-count">
                    {imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''} selected
                  </div>
                )}
                {imagePreviews.length > 0 && (
                  <div className="image-previews-grid">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="image-preview-item">
                        <div className="image-preview">
                          <img src={preview} alt={`Preview ${index + 1}`} />
                        </div>
                        <button
                          type="button"
                          className="remove-image-btn"
                          onClick={() => removeImage(index)}
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

              <div className="form-group">
                <label htmlFor="name">Character Name *</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Enter character name"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="age">Age (Optional)</label>
                <input
                  type="number"
                  id="age"
                  value={age}
                  onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : '')}
                  min={18}
                  max={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="location">Location (Optional)</label>
                <input
                  type="text"
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., New York, NY"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="category">Category (Optional)</label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CharacterCategory | '')}
                >
                  <option value="">Select a category (optional)</option>
                  {CHARACTER_CATEGORIES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <small className="form-hint">Optional: Select which category this character belongs to</small>
              </div>

              <div className="form-group">
                <label htmlFor="personality">Personality (Optional)</label>
                <textarea
                  id="personality"
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  rows={4}
                  placeholder="Describe the character's personality, traits, and behavior..."
                />
                <small className="form-hint">Optional: This helps define how the character behaves.</small>
              </div>

              <div className="form-group">
                <label htmlFor="system_prompt">AI System Prompt (Optional)</label>
                <textarea
                  id="system_prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                  placeholder="Custom AI system prompt that defines how the character should act and respond. If not provided, will be generated from personality..."
                />
                <small className="form-hint">Optional: Advanced AI prompt to customize character behavior. Leave empty to auto-generate from personality.</small>
              </div>

              <div className="form-group">
                <label htmlFor="tags">Tags (Optional)</label>
                <TagSelector
                  selectedTags={tags}
                  onChange={setTags}
                  maxTags={20}
                />
                <small className="form-hint">Optional: Add tags to help users find this character. Search by category or type to filter.</small>
              </div>

              <button
                type="submit"
                className="btn btn-primary submit-button"
                disabled={loading || !name || imageFiles.length === 0}
              >
                {loading ? 'Uploading...' : 'Upload Character'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
