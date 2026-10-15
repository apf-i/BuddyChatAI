import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './TagSelector.css';

interface TagSelectorProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
}

interface TagLibrary {
  categories: Record<string, string[]>;
  allTags: string[];
}

export default function TagSelector({ selectedTags, onChange, maxTags = 20 }: TagSelectorProps) {
  const [tagLibrary, setTagLibrary] = useState<TagLibrary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await apiClient.get('/tags');
        setTagLibrary(response.data);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching tags:', err);
        setError('Failed to load tags');
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, []);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag));
    } else {
      if (selectedTags.length < maxTags) {
        onChange([...selectedTags, tag]);
      }
    }
  };

  const removeTag = (tag: string) => {
    onChange(selectedTags.filter(t => t !== tag));
  };

  const getDisplayTags = () => {
    if (!tagLibrary) return [];

    let tags: string[] = [];

    if (selectedCategory) {
      tags = tagLibrary.categories[selectedCategory] || [];
    } else {
      tags = tagLibrary.allTags;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tags = tags.filter(tag => tag.toLowerCase().includes(query));
    }

    return tags;
  };

  const categories = tagLibrary ? Object.keys(tagLibrary.categories) : [];

  if (loading) {
    return <div className="tag-selector-loading">Loading tags...</div>;
  }

  if (error || !tagLibrary) {
    return <div className="tag-selector-error">Error loading tags. You can still type tags manually.</div>;
  }

  return (
    <div className="tag-selector">
      <div className="tag-selector-selected">
        <label>Selected Tags ({selectedTags.length}/{maxTags})</label>
        <div className="selected-tags-list">
          {selectedTags.length === 0 ? (
            <span className="no-tags-hint">No tags selected</span>
          ) : (
            selectedTags.map(tag => (
              <span key={tag} className="selected-tag">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="remove-tag-btn"
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="tag-selector-controls">
        <input
          type="text"
          className="tag-search-input"
          placeholder="Search tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <select
          className="tag-category-select"
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="tag-selector-options">
        {getDisplayTags().map(tag => {
          const isSelected = selectedTags.includes(tag);
          const isDisabled = !isSelected && selectedTags.length >= maxTags;
          
          return (
            <button
              key={tag}
              type="button"
              className={`tag-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => toggleTag(tag)}
              disabled={isDisabled}
            >
              {tag}
              {isSelected && ' ✓'}
            </button>
          );
        })}
      </div>

      {selectedTags.length >= maxTags && (
        <div className="tag-limit-warning">Maximum {maxTags} tags allowed</div>
      )}
    </div>
  );
}
