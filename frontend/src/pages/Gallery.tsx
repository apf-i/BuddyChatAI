import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient, { getApiBaseUrl } from '../api/client';
import AppLayout from '../layouts/AppLayout';
import Banner from '../components/Banner';
import TokenStoreBanner from '../components/TokenStoreBanner';
import CharacterCard, { CharacterCardData } from '../components/CharacterCard';
import { SkeletonGrid } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { FaFilter, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { CHARACTER_CATEGORIES } from '../constants/characterCategories';
import './Gallery.css';

interface Character extends CharacterCardData {
  category?: string | null;
  uploaderUserId?: string | null;
  uploaderUsername?: string | null;
}

const TRENDING_TAGS = ['friendly', 'funny', 'gaming', 'study buddy', 'adventurous', 'mysterious'];

export default function Gallery() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [filteredCharacters, setFilteredCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const { isAuthenticated, user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.isAdmin || false;
  
  // Refresh user data on mount to get latest admin status
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    }
  }, [isAuthenticated]);

  // Sync selected tag with URL query parameter
  useEffect(() => {
    const tagFromUrl = searchParams.get('tag');
    if (tagFromUrl) {
      setSelectedTag(tagFromUrl);
    } else {
      setSelectedTag(null);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchCharacters();
  }, [isAuthenticated]);

  // Apply filters when filters or characters change
  useEffect(() => {
    let filtered = [...characters];

    // On home page (no filters applied), only show featured models
    const hasNoFilters = selectedCategory === 'all' && 
                         selectedType === 'all' && 
                         !selectedTag;
    
    if (hasNoFilters) {
      // Filter to only show featured models (from database)
      filtered = filtered.filter(char => char.featured === true);
    } else {
      // Apply other filters when user has selected filters
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(char => char.category === selectedCategory);
    }

    // Filter by character type
    if (selectedType !== 'all') {
      if (selectedType === 'templates') {
        filtered = filtered.filter(char => !char.isUserCharacter && !char.isCommunity);
      } else if (selectedType === 'community') {
        filtered = filtered.filter(char => char.isCommunity);
      } else if (selectedType === 'my-characters') {
        filtered = filtered.filter(char => char.isUserCharacter);
      }
    }

    // Filter by selected tag (if any)
    if (selectedTag) {
      const tagLower = selectedTag.toLowerCase();
      filtered = filtered.filter(char =>
        (char.tags || []).some(t => t.toLowerCase() === tagLower)
      );
      }
    }

    setFilteredCharacters(filtered);
  }, [characters, selectedCategory, selectedType, selectedTag]);

  const fetchCharacters = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both public templates and user's own characters
      const [publicResponse, userResponse] = await Promise.allSettled([
        apiClient.get('/public/characters'),
        isAuthenticated ? apiClient.get('/characters/my-characters') : Promise.resolve(null)
      ]);
      
      // Log API errors for debugging
      if (publicResponse.status === 'rejected') {
        const error = publicResponse.reason;
        console.error('Failed to fetch public characters:', error);
        
        let errorMessage = 'Failed to load characters. ';
        if (error?.code === 'ECONNABORTED') {
          errorMessage += 'Request timed out. The backend server may not be running.';
        } else if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error')) {
          errorMessage += 'Cannot connect to backend server. Please check:';
          errorMessage += '\n1. Backend is running on http://localhost:3001';
          errorMessage += '\n2. No firewall is blocking the connection';
          errorMessage += '\n3. Check browser console for more details';
        } else {
          errorMessage += error?.message || 'Unknown error occurred.';
        }
        setError(errorMessage);
      }
      
      const publicChars = publicResponse.status === 'fulfilled' 
        ? (publicResponse.value.data.characters || []).map((char: any) => {
            // Handle both relative and absolute image URLs
            let imageUrl = char.image_url || null;
            if (imageUrl && imageUrl.startsWith('/')) {
              // Relative path - prepend backend URL
              const apiUrl = getApiBaseUrl();
              imageUrl = `${apiUrl}${imageUrl}`;
            }
            // Handle image URLs - convert relative to absolute
            const allImages = (char.images || []).map((img: string) => {
              if (img && img.startsWith('/')) {
                const apiUrl = getApiBaseUrl();
                return `${apiUrl}${img}`;
              }
              return img;
            });
            
            return {
              id: char.id,
              name: char.name,
              age: char.age || null,
              location: char.location || null,
              previewImage: imageUrl,
              images: allImages.length > 0 ? allImages : (imageUrl ? [imageUrl] : []),
              tags: char.tags || [],
              category: char.category || null,
              isUserCharacter: false,
              isCommunity: char.isCommunity || false,
              personality: char.personality || null,
              featured: char.featured || false,
              uploaderUserId: char.uploaderUserId || null,
              uploaderUsername: char.uploaderUsername || null
            };
          })
        : [];
      
      const userChars = userResponse.status === 'fulfilled' && userResponse.value
        ? (userResponse.value.data.characters || []).map((char: any) => {
            // Handle both relative and absolute image URLs
            let imageUrl = char.image_url || null;
            if (imageUrl && imageUrl.startsWith('/')) {
              // Relative path - prepend backend URL
              const apiUrl = getApiBaseUrl();
              imageUrl = `${apiUrl}${imageUrl}`;
            }
            const allImages = (char.images || []).length > 0 
              ? char.images 
              : (imageUrl ? [imageUrl] : []);
            
            return {
              id: char.id,
              name: char.name,
              age: char.age,
              location: char.location,
              previewImage: imageUrl,
              images: allImages,
              tags: [],
              isUserCharacter: true,
              personality: char.personality || null
            };
          })
        : [];
      
      const allChars = [...userChars, ...publicChars];
      setCharacters(allChars);
      setFilteredCharacters(allChars);
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

  const handleToggleFeatured = async (characterId: string, characterType: 'template' | 'community', currentFeatured: boolean) => {
    try {
      const response = await apiClient.post(`/admin/characters/${characterId}/featured`, {
        type: characterType,
      });
      
      // Update the character in the characters array
      setCharacters(prevChars => 
        prevChars.map(char => 
          char.id === characterId 
            ? { ...char, featured: response.data.character.featured }
            : char
        )
      );
      
      // Also update filtered characters
      setFilteredCharacters(prevChars => 
        prevChars.map(char => 
          char.id === characterId 
            ? { ...char, featured: response.data.character.featured }
            : char
        )
      );
    } catch (err: any) {
      console.error('Error toggling featured status:', err);
      alert(err.response?.data?.error || 'Failed to update featured status');
    }
  };

  const handleTagClick = (tag: string) => {
    setSelectedTag(tag);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('tag', tag);
      return params;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearTagFilter = () => {
    setSelectedTag(null);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.delete('tag');
      return params;
    });
  };

  const handleCharacterClick = (character: Character) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    // Navigate to character detail page
    let type = 'template';
    if (character.isUserCharacter) {
      type = 'user';
    } else if (character.isCommunity) {
      type = 'community';
    }
    navigate(`/character/${type}/${character.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, characterId: string, characterName: string, isUserCharacter: boolean, isCommunity: boolean) => {
    e.stopPropagation(); // Prevent triggering the card click

    if (!confirm(`Are you sure you want to delete "${characterName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (isAdmin) {
        // Admin can delete any character
        if (isUserCharacter) {
          await apiClient.delete(`/admin/characters/${characterId}`);
        } else if (isCommunity) {
          await apiClient.delete(`/admin/community-characters/${characterId}`);
        } else {
          await apiClient.delete(`/admin/templates/${characterId}`);
        }
      } else {
        // Regular user can only delete their own characters
        await apiClient.delete(`/characters/${characterId}`);
      }
      // Refresh the character list
      fetchCharacters();
    } catch (err: any) {
      console.error('Error deleting character:', err);
      setError(err.response?.data?.error || 'Failed to delete character');
    }
  };

  return (
    <AppLayout className="gallery-page">
      <div className="banners-row">
        <Banner />
        <TokenStoreBanner />
      </div>
      <div className="container">
        <div className="gallery-tag-chips">
          {TRENDING_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`gallery-tag-chip ${selectedTag === tag ? 'gallery-tag-chip-active' : ''}`}
              onClick={() => handleTagClick(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Filter Button */}
        <div className="filter-button-container">
          <button 
            className="filter-toggle-btn"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <FaFilter />
            <span>Filters</span>
            {filtersOpen ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>

        {/* Filter Section */}
        {filtersOpen && (
          <div className="gallery-filters">
          <div className="filter-group">
            <label htmlFor="category-filter">Category:</label>
            <select 
              id="category-filter"
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Categories</option>
              {CHARACTER_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="type-filter">Type:</label>
            <select 
              id="type-filter"
              value={selectedType} 
              onChange={(e) => setSelectedType(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="templates">Templates</option>
              <option value="community">Community</option>
              {isAuthenticated && <option value="my-characters">My Characters</option>}
            </select>
          </div>

          <button 
            className="filter-clear-btn"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedType('all');
            }}
          >
            Clear Filters
          </button>
          </div>
        )}

        {/* Active Tag Filter */}
        {selectedTag && (
          <div className="active-tag-filter">
            <span>Showing characters tagged with </span>
            <span className="active-tag-label">{selectedTag}</span>
            <button
              type="button"
              className="clear-tag-filter-btn"
              onClick={clearTagFilter}
            >
              Clear tag
            </button>
          </div>
        )}

        {loading && <SkeletonGrid count={8} />}
        
        {error && <div className="error">{error}</div>}

        {!loading && !error && filteredCharacters.length === 0 && (
          <div className="empty-state-premium">
            <h3>No characters found</h3>
            <p>Try adjusting your filters or browse all characters</p>
            <Button to="/browse" variant="primary">Browse all</Button>
          </div>
        )}

        {!loading && !error && filteredCharacters.length > 0 && (
          <div className="character-grid">
            {filteredCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onDelete={(e) => handleDelete(e, character.id, character.name, character.isUserCharacter || false, character.isCommunity || false)}
                onClick={() => handleCharacterClick(character)}
                isAdmin={isAdmin}
                onTagClick={handleTagClick}
                onToggleFeatured={handleToggleFeatured}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
