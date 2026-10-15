import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import { CHARACTER_CATEGORIES, CharacterCategory } from '../constants/characterCategories';
import './AdminTemplateUpload.css';

export default function AdminTemplateUpload() {
  const [name, setName] = useState('');
  const [age, setAge] = useState(18);
  const [location, setLocation] = useState('');
  const [personality, setPersonality] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState<CharacterCategory | ''>('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if not authenticated
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    if (validFiles.length !== files.length) {
      setError('Only image files are allowed');
      return;
    }

    // Validate file sizes (10MB max)
    const oversizedFiles = validFiles.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError('Images must be smaller than 10MB');
      return;
    }

    setImageFiles([...imageFiles, ...validFiles]);
    
    // Create previews
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
    
    // Clear file input
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

    if (personality.length < 10) {
      setError('Personality description must be at least 10 characters');
      return;
    }

    if (systemPrompt.length < 10) {
      setError('System prompt must be at least 10 characters');
      return;
    }

    if (!location || location.trim().length === 0) {
      setError('Location is required');
      return;
    }

    if (!age || age < 18) {
      setError('Age must be 18 or older');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      
      // Append all image files
      imageFiles.forEach((file) => {
        formData.append('images', file);
      });
      
      formData.append('name', name);
      formData.append('age', age.toString());
      formData.append('location', location);
      formData.append('personality', personality);
      formData.append('system_prompt', systemPrompt);
      if (category) {
        formData.append('category', category);
      }
      if (tags.trim()) {
        // Parse tags (comma-separated) into array
        const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        formData.append('tags', JSON.stringify(tagsArray));
      }

      const response = await apiClient.post('/admin/templates/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess(true);
      
      // Reset form
      setName('');
      setAge(18);
      setLocation('');
      setPersonality('');
      setSystemPrompt('');
      setTags('');
      setCategory('');
      setImageFiles([]);
      setImagePreviews([]);
      
      // Clear file input
      const fileInput = document.getElementById('image') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      // Navigate to gallery after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create template. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-template-upload-page">
      
      <div className="container">
        <div className="admin-template-upload-container">
          <div className="admin-template-upload-card">
            <h1>Upload Public Character Template</h1>
            <p className="subtitle">Add a character that all users can chat with</p>

            {error && <div className="error-message">{error}</div>}
            {success && (
              <div className="success-message">
                Template created successfully! Redirecting to gallery...
              </div>
            )}

            <form onSubmit={handleSubmit} className="admin-template-upload-form">
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
                <small className="form-hint">Max file size: 10MB per image. All image formats accepted. You can upload multiple images.</small>
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
                <label htmlFor="age">Age *</label>
                <input
                  type="number"
                  id="age"
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value) || 18)}
                  min={18}
                  max={100}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="location">Location *</label>
                <input
                  type="text"
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  placeholder="e.g., New York, NY"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label htmlFor="category">Category *</label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CharacterCategory | '')}
                  required
                >
                  <option value="">Select a category</option>
                  {CHARACTER_CATEGORIES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <small className="form-hint">Select which topic this character belongs to</small>
              </div>

              <div className="form-group">
                <label htmlFor="personality">Personality *</label>
                <textarea
                  id="personality"
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  required
                  minLength={10}
                  rows={4}
                  placeholder="Describe the character's personality, traits, and behavior..."
                />
                <small className="form-hint">At least 10 characters. This defines how the character behaves.</small>
              </div>

              <div className="form-group">
                <label htmlFor="systemPrompt">System Prompt *</label>
                <textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  required
                  minLength={10}
                  rows={6}
                  placeholder="Detailed system prompt for the AI model. This controls how the character responds in chat..."
                />
                <small className="form-hint">At least 10 characters. This is the detailed instruction for the AI.</small>
              </div>

              <div className="form-group">
                <label htmlFor="tags">Tags (Optional)</label>
                <input
                  type="text"
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Comma-separated tags (e.g., fantasy, warrior, female)"
                />
                <small className="form-hint">Optional: Add tags to help users find this character</small>
              </div>

              <button
                type="submit"
                className="btn btn-primary submit-button"
                disabled={loading || !name || !age || !location || !category || !personality || !systemPrompt || imageFiles.length === 0}
              >
                {loading ? 'Creating Template...' : 'Create Template'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
