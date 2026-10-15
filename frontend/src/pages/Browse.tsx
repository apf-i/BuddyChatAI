import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import CharacterCard, { CharacterCardData } from '../components/CharacterCard';
import SectionHeader from '../components/ui/SectionHeader';
import { SkeletonGrid } from '../components/ui/Skeleton';
import { CHARACTER_CATEGORIES, CharacterCategory } from '../constants/characterCategories';
import '../components/ui/SectionHeader.css';
import './Browse.css';

interface Character extends CharacterCardData {
  category?: string;
}

const CATEGORIES = CHARACTER_CATEGORIES;
type Category = CharacterCategory;

export default function Browse() {
  const [charactersByCategory, setCharactersByCategory] = useState<Record<string, Character[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all characters
      const response = await apiClient.get('/public/characters');
      
      const publicChars = (response.data.characters || []).map((char: any) => {
        let imageUrl = char.image_url || null;
        if (imageUrl && imageUrl.startsWith('/')) {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          imageUrl = `${apiUrl}${imageUrl}`;
        }
        // Handle image URLs - convert relative to absolute
        const allImages = (char.images || []).map((img: string) => {
          if (img && img.startsWith('/')) {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
            return `${apiUrl}${img}`;
          }
          return img;
        });
        
        return {
          id: char.id,
          name: char.name,
          age: char.age,
          location: char.location,
          previewImage: imageUrl,
          images: allImages.length > 0 ? allImages : (imageUrl ? [imageUrl] : []),
          tags: char.tags || [],
          isUserCharacter: false,
          isCommunity: char.isCommunity || false,
          category: char.category || null,
          personality: char.personality || null,
        };
      });

      // Group characters by category
      const grouped: Record<string, Character[]> = {};
      CATEGORIES.forEach(cat => {
        grouped[cat] = [];
      });
      
      publicChars.forEach((char: Character) => {
        const category = char.category || 'Uncategorized';
        if (CATEGORIES.includes(category as Category)) {
          if (!grouped[category]) {
            grouped[category] = [];
          }
          grouped[category].push(char);
        }
      });

      setCharactersByCategory(grouped);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching characters:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load characters';
      setError(errorMessage);
      console.error('Full error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        url: err.config?.url
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterClick = (character: Character) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    let type = 'template';
    if (character.isUserCharacter) type = 'user';
    else if (character.isCommunity) type = 'community';
    navigate(`/character/${type}/${character.id}`);
  };

  return (
    <AppLayout className="browse-page">
      
      <div className="container">
        <div className="browse-header">
          <h1 className="section-title text-gradient">Browse</h1>
          <p className="browse-subtitle">Explore characters by category and start chatting</p>
        </div>

        {loading && <SkeletonGrid count={6} />}
        
        {error && <div className="error">{error}</div>}

        {!loading && !error && (
          <div className="browse-sections">
            {CATEGORIES.map((category) => {
              const categoryCharacters = charactersByCategory[category] || [];
              
              if (categoryCharacters.length === 0) {
                return null;
              }

              return (
                <div key={category} className="category-section">
                  <SectionHeader title={category} actionLabel="Home" actionTo="/" />
                  <div className="scroll-row browse-scroll-row">
                    {categoryCharacters.map((character) => (
                      <CharacterCard
                        key={character.id}
                        character={character}
                        onClick={() => handleCharacterClick(character)}
                        compact
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && Object.keys(charactersByCategory).every(cat => (charactersByCategory[cat] || []).length === 0) && (
          <div className="empty-state">
            <h3>No characters found</h3>
            <p>No characters available yet</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
