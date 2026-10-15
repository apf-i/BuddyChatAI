import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import './CreateCharacter.css';

export default function CreateCharacter() {
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [hair, setHair] = useState('');
  const [styleOutfit, setStyleOutfit] = useState('');
  const [personality, setPersonality] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, updateUserBalance } = useAuth();
  const navigate = useNavigate();

  // Redirect if not authenticated
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!age || age < 18) {
      setError('Age must be 18 or older');
      return;
    }

    if (personality.length < 10) {
      setError('Personality description must be at least 10 characters');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Generate images
      const response = await apiClient.post('/characters/generate-images', {
        name,
        age: Number(age),
        hair: hair || undefined,
        style_outfit: styleOutfit || undefined,
        personality,
      });

      // Navigate to image selection page with generated images and character data
      navigate('/select-image', {
        state: {
          images: response.data.images,
          tempFilePaths: response.data.tempFilePaths,
          characterData: response.data.characterData,
        },
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate character images. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-character-page">
      
      <div className="container">
        <div className="create-character-container">
          <div className="create-character-card">
            <h1>Create Your Character</h1>
            <p className="subtitle">Design a unique AI buddy</p>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit} className="create-character-form">
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
                  onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : '')}
                  required
                  min={18}
                />
              </div>

              <div className="form-group">
                <label htmlFor="hair">Hair Description</label>
                <input
                  type="text"
                  id="hair"
                  value={hair}
                  onChange={(e) => setHair(e.target.value)}
                  placeholder="e.g., long blonde hair, short black hair"
                />
                <small className="form-hint">Cannot be changed after creation</small>
              </div>

              <div className="form-group">
                <label htmlFor="style">Style/Outfit</label>
                <input
                  type="text"
                  id="style"
                  value={styleOutfit}
                  onChange={(e) => setStyleOutfit(e.target.value)}
                  placeholder="e.g., casual jeans and t-shirt, elegant dress"
                />
                <small className="form-hint">Cannot be changed after creation</small>
              </div>

              <div className="form-group">
                <label htmlFor="personality">Personality *</label>
                <textarea
                  id="personality"
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  required
                  minLength={10}
                  rows={6}
                  placeholder="Describe the character's personality, traits, and behavior. This will shape how they interact in chat."
                />
                <small className="form-hint">At least 10 characters. This defines how your character behaves.</small>
              </div>

              <div className="form-warning">
                <p>⚠️ Note: Once created, the character's appearance and personality cannot be edited.</p>
              </div>

              <button
                type="submit"
                className="btn btn-primary submit-button"
                disabled={loading || !name || !age || personality.length < 10}
              >
                {loading ? 'Creating Character...' : 'Create Character'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
