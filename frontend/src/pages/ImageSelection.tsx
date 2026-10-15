import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './ImageSelection.css';

interface LocationState {
  images: string[];
  tempFilePaths: string[];
  characterData: {
    name: string;
    age: number;
    hair?: string;
    style_outfit?: string;
    personality: string;
  };
}

export default function ImageSelection() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, updateUserBalance } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [tempFilePaths, setTempFilePaths] = useState<string[]>([]);
  const [characterData, setCharacterData] = useState<LocationState['characterData'] | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const state = location.state as LocationState;
    if (!state || !state.images || !state.tempFilePaths || !state.characterData) {
      // If no state, redirect back to create character
      navigate('/create-character');
      return;
    }

    setImages(state.images);
    setTempFilePaths(state.tempFilePaths);
    setCharacterData(state.characterData);
  }, [location, isAuthenticated, navigate]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploadedImages([...uploadedImages, ...validFiles]);
    
    // Create previews
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setUploadedPreviews(prev => [...prev, e.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    setError(null);
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    setUploadedPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (selectedIndex === null || !characterData) {
      setError('Please select an image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create FormData to send files
      const formData = new FormData();
      formData.append('selectedImageIndex', selectedIndex.toString());
      formData.append('tempFilePaths', JSON.stringify(tempFilePaths));
      formData.append('characterData', JSON.stringify(characterData));
      
      // Append uploaded images
      uploadedImages.forEach((file, index) => {
        formData.append('additionalImages', file);
      });

      const response = await apiClient.post('/characters/confirm-selection', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Update token balance in context
      if (response.data.tokenBalance !== undefined) {
        updateUserBalance(response.data.tokenBalance);
      }

      // Navigate to gallery
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create character. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!characterData || images.length === 0) {
    return (
      <div className="image-selection-page">
        
        <div className="container">
          <div className="loading">Loading images...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="image-selection-page">
      
      <div className="container">
        <div className="image-selection-container">
          <div className="image-selection-header">
            <h1>Select Your Character Image</h1>
            <p className="subtitle">
              Choose the best image for <strong>{characterData.name}</strong>
            </p>
            <p className="instruction">
              Click on an image to select it. The selected image will be saved and the rest will be deleted.
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="images-grid">
            {images.map((imageUrl, index) => (
              <div
                key={index}
                className={`image-card ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handleSelect(index)}
              >
                <div className="image-wrapper">
                  <img src={imageUrl} alt={`Character option ${index + 1}`} />
                  {selectedIndex === index && (
                    <div className="selected-overlay">
                      <div className="selected-checkmark">✓</div>
                    </div>
                  )}
                </div>
                <div className="image-number">Option {index + 1}</div>
              </div>
            ))}
            {uploadedPreviews.map((preview, index) => (
              <div
                key={`uploaded-${index}`}
                className="image-card uploaded"
              >
                <div className="image-wrapper">
                  <img src={preview} alt={`Uploaded image ${index + 1}`} />
                  <button
                    className="remove-image-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeUploadedImage(index);
                    }}
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
                <div className="image-number">Uploaded {index + 1}</div>
              </div>
            ))}
          </div>

          <div className="upload-section">
            <label htmlFor="additional-images" className="upload-label">
              <span>+ Upload Additional Images</span>
              <input
                type="file"
                id="additional-images"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <small className="upload-hint">You can upload multiple images (max 10MB each)</small>
          </div>

          <div className="selection-actions">
            <button
              onClick={() => navigate('/create-character')}
              className="btn btn-outline"
              disabled={loading}
            >
              Go Back
            </button>
            <button
              onClick={handleConfirm}
              className="btn btn-primary"
              disabled={loading || selectedIndex === null}
            >
              {loading ? 'Creating Character...' : 'Confirm Selection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
