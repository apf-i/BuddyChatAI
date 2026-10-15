import express from 'express';
import { supabase } from '../db/supabase';
import { parseSearchQuery } from '../utils/searchKeywords';
import { locationMatchesCountryCode } from '../utils/flagMatching';
import { searchTags, getAllTags } from '../utils/tags';
import { isCharacterCategory } from '../config/characterCategories';

const router = express.Router();

// Helper function to normalize image URLs (replace localhost with actual backend URL)
const normalizeImageUrl = (imgUrl: string | null, backendUrl: string): string | null => {
  if (!imgUrl) return null;
  
  // If it's already a full URL with localhost, replace it
  if (imgUrl.includes('localhost:3001')) {
    return imgUrl.replace(/http:\/\/localhost:3001/g, backendUrl);
  }
  
  // If it's a relative path, prepend backend URL
  if (imgUrl.startsWith('/')) {
    return `${backendUrl}${imgUrl}`;
  }
  
  // If it's already a full URL (not localhost), return as-is
  return imgUrl;
};

// T-008: Public Character Gallery API
router.get('/characters', async (req, res) => {
  try {
    // Use BACKEND_URL if set, otherwise construct from request or use Railway URL
    const BACKEND_URL = process.env.BACKEND_URL || 
      (req.protocol + '://' + req.get('host')) || 
      `http://localhost:${process.env.PORT || 3001}`;
    const { category, search } = req.query;
    
    // Try to include featured field, but handle gracefully if column doesn't exist
    let query = supabase
      .from('character_templates')
      .select('id, name, age, location, image_url, preview_image_url, tags, category, personality, featured')
      .order('created_at', { ascending: false });

    // Filter by category if provided
    if (isCharacterCategory(category)) {
      query = query.eq('category', category);
    }

    // Search functionality with keyword support
    let ageRangeFilter: { min: number; max: number } | null = null;
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchQuery = parseSearchQuery(search);
      
      // Debug logging
      console.log('Search query parsed:', {
        original: search,
        ageRange: searchQuery.ageRange,
        locationKeywords: searchQuery.locationKeywords,
        nameSearch: searchQuery.nameSearch
      });
      
      // Age range search
      if (searchQuery.ageRange) {
        if (searchQuery.ageRange.min === searchQuery.ageRange.max) {
          // Exact age - can filter in query
          query = query.eq('age', searchQuery.ageRange.min);
        } else {
          // Age range - will filter after fetching (can't combine range with OR in Supabase)
          ageRangeFilter = searchQuery.ageRange;
        }
      } else {
        // If no age keyword, try exact age match from original query
        const ageMatch = parseInt(searchQuery.originalQuery);
        if (!isNaN(ageMatch) && ageMatch >= 18 && ageMatch <= 100) {
          query = query.eq('age', ageMatch);
        }
      }
      
      // Flag-based country search (preferred - uses same logic as frontend flag display)
      if (searchQuery.countryCode) {
        // For flag-based matching, we'll filter after fetching (skip Supabase OR query)
        // Just ensure location is not null
        query = query.not('location', 'is', null);
        console.log('Using flag-based matching for country:', searchQuery.countryCode);
      }
      // Location keywords search (fallback for non-country searches)
      else if (searchQuery.locationKeywords && searchQuery.locationKeywords.length > 0) {
        // First, ensure location is not null (important to avoid matching null values)
        query = query.not('location', 'is', null);
        
        // Build location OR conditions - Supabase OR syntax requires all conditions on same field
        // Format: field.ilike.%value1%,field.ilike.%value2%
        const locationConditions = searchQuery.locationKeywords.map((loc: string) => `location.ilike.%${loc}%`).join(',');
        
        console.log('Location conditions:', locationConditions);
        console.log('Location keywords:', searchQuery.locationKeywords);
        
        // If we have location keywords, ONLY search by location (not name unless explicitly provided)
        // This ensures "America" only matches US locations, not names containing "america"
        if (searchQuery.nameSearch) {
          // If there's also a name search, combine them with OR
          // Format: location.ilike.%loc1%,location.ilike.%loc2%,name.ilike.%name%
          query = query.or(`${locationConditions},name.ilike.%${searchQuery.nameSearch}%`);
        } else {
          // Only search by location when location keywords are present
          // Use or() with location conditions - this should match if location contains ANY of the keywords
          // But we need to ensure it's actually filtering, so let's verify the syntax
          query = query.or(locationConditions);
          console.log('Applied location-only filter with conditions:', locationConditions);
        }
      } else if (searchQuery.nameSearch) {
        // Name search only (no location keywords)
        query = query.ilike('name', `%${searchQuery.nameSearch}%`);
      } else if (!searchQuery.ageRange && !ageRangeFilter && !searchQuery.countryCode && !searchQuery.locationKeywords) {
        // General search if no keywords matched (no age, no country code, no location keywords)
        const searchTerm = search.trim().toLowerCase();
        query = query.or(`name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`);
      }
    }

    let { data: characters, error } = await query;

    // If error is about featured column not existing, retry without it
    if (error && (error.message?.includes('featured') || error.message?.includes('column') || error.code === 'PGRST116')) {
      console.log('Featured column not found, retrying without it');
      const retryQuery = supabase
        .from('character_templates')
        .select('id, name, age, location, image_url, preview_image_url, tags, category, personality')
        .order('created_at', { ascending: false });
      
      // Reapply filters to retry query
      if (isCharacterCategory(category)) {
        retryQuery.eq('category', category);
      }
      
      const retryResult = await retryQuery as any;
      characters = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.error('Error fetching characters:', error);
      return res.status(500).json({ error: 'Failed to fetch characters' });
    }

    console.log(`Found ${characters?.length || 0} characters before filtering`);

    // Parse search query again for post-query filtering
    let locationKeywordsToFilter: string[] | null = null;
    let countryCodeToFilter: string | null = null;
    let tagSearchTerms: string[] | null = null;
    if (search && typeof search === 'string' && search.trim()) {
      const searchQuery = parseSearchQuery(search);
      
      // Check if search contains tag-related terms (check for # or matching tag names)
      const searchLower = search.trim().toLowerCase();
      const allTags = getAllTags();
      
      // Check if search starts with # or contains tag names
      if (searchLower.startsWith('#') || searchLower.includes('#')) {
        // Extract hashtags
        const hashtags = search.match(/#(\w+)/gi) || [];
        tagSearchTerms = hashtags.map(tag => tag.substring(1)); // Remove #
      } else {
        // Check if search term matches any tag (case-insensitive)
        const matchingTags = allTags.filter(tag => 
          tag.toLowerCase().includes(searchLower) || searchLower.includes(tag.toLowerCase())
        );
        if (matchingTags.length > 0) {
          tagSearchTerms = matchingTags;
        }
      }
      
      // Check if we have a country code for flag-based matching (preferred method)
      if (searchQuery.countryCode) {
        countryCodeToFilter = searchQuery.countryCode;
        console.log('Using flag-based matching for country code:', countryCodeToFilter);
      } else if (searchQuery.locationKeywords && searchQuery.locationKeywords.length > 0 && !searchQuery.nameSearch && !tagSearchTerms) {
        // Fall back to location keyword matching if no country code and no tags
        locationKeywordsToFilter = searchQuery.locationKeywords;
      }
    }

    // Filter by age range if needed (post-query filtering for ranges)
    // This is done after fetching because Supabase doesn't support combining range filters with OR conditions
    let filteredCharacters = characters || [];
    
    // Tag-based filter (post-query filtering)
    if (tagSearchTerms && tagSearchTerms.length > 0) {
      const beforeTagFilter = filteredCharacters.length;
      filteredCharacters = filteredCharacters.filter((char: any) => {
        if (!char.tags || !Array.isArray(char.tags) || char.tags.length === 0) return false;
        const charTagsLower = char.tags.map((t: string) => t.toLowerCase());
        // Check if character has any of the searched tags
        return tagSearchTerms!.some(tag => 
          charTagsLower.includes(tag.toLowerCase())
        );
      });
      console.log(`After tag filter (tags: ${tagSearchTerms.join(', ')}): ${beforeTagFilter} -> ${filteredCharacters.length} characters`);
    }
    
    // Flag-based location filter (preferred - uses same logic as frontend flag display)
    if (countryCodeToFilter) {
      const beforeLocationFilter = filteredCharacters.length;
      filteredCharacters = filteredCharacters.filter((char: any) => {
        // Use flag matching utility to determine country code from location
        return locationMatchesCountryCode(char.location, countryCodeToFilter!);
      });
      console.log(`After flag-based filter (country: ${countryCodeToFilter}): ${beforeLocationFilter} -> ${filteredCharacters.length} characters`);
      if (filteredCharacters.length > 0) {
        console.log('Filtered locations:', filteredCharacters.map((c: any) => `${c.name}: "${c.location}"`));
      }
    }
    // Post-query location keyword filter (fallback for non-country searches)
    else if (locationKeywordsToFilter && locationKeywordsToFilter.length > 0) {
      const beforeLocationFilter = filteredCharacters.length;
      filteredCharacters = filteredCharacters.filter((char: any) => {
        if (!char.location) return false;
        const locationLower = char.location.toLowerCase();
        // Check if location contains any of the keywords
        return locationKeywordsToFilter!.some(keyword => 
          locationLower.includes(keyword.toLowerCase())
        );
      });
      console.log(`After location keyword filter: ${beforeLocationFilter} -> ${filteredCharacters.length} characters`);
      if (filteredCharacters.length > 0) {
        console.log('Filtered locations:', filteredCharacters.map((c: any) => `${c.name}: "${c.location}"`));
      }
    }
    
    if (ageRangeFilter) {
      // Filter age range after fetching (for ranges like 20-29)
      filteredCharacters = filteredCharacters.filter((char: any) => {
        if (!char.age) return false;
        return char.age >= ageRangeFilter!.min && char.age <= ageRangeFilter!.max;
      });
      console.log(`After age filter (${ageRangeFilter.min}-${ageRangeFilter.max}): ${filteredCharacters.length} characters`);
    }
    
    // Log sample locations for debugging
    if (filteredCharacters.length > 0) {
      console.log('Final sample locations:', filteredCharacters.slice(0, 5).map((c: any) => `${c.name}: "${c.location}"`));
    }

            // Fetch approved community characters with uploader info
            let communityQuery = supabase
              .from('community_characters')
              .select('id, name, age, location, image_url, preview_image_url, tags, personality, uploader_user_id, featured, approved_at, created_at, users!community_characters_uploader_user_id_fkey(username)')
              .eq('status', 'approved')
              .order('approved_at', { ascending: false });

            // Apply search to community characters (similar logic)
            if (search && typeof search === 'string' && search.trim()) {
              const searchQuery = parseSearchQuery(search);
              
              if (searchQuery.ageRange) {
                if (searchQuery.ageRange.min === searchQuery.ageRange.max) {
                  communityQuery = communityQuery.eq('age', searchQuery.ageRange.min);
                } else {
                  communityQuery = communityQuery.gte('age', searchQuery.ageRange.min).lte('age', searchQuery.ageRange.max);
                }
              } else {
                const ageMatch = parseInt(searchQuery.originalQuery);
                if (!isNaN(ageMatch) && ageMatch >= 18 && ageMatch <= 100) {
                  communityQuery = communityQuery.eq('age', ageMatch);
                }
              }
              
              if (searchQuery.countryCode) {
                communityQuery = communityQuery.not('location', 'is', null);
              } else if (searchQuery.locationKeywords && searchQuery.locationKeywords.length > 0) {
                communityQuery = communityQuery.not('location', 'is', null);
                const locationConditions = searchQuery.locationKeywords.map((loc: string) => `location.ilike.%${loc}%`).join(',');
                if (searchQuery.nameSearch) {
                  communityQuery = communityQuery.or(`${locationConditions},name.ilike.%${searchQuery.nameSearch}%`);
                } else {
                  communityQuery = communityQuery.or(locationConditions);
                }
              } else if (searchQuery.nameSearch) {
                communityQuery = communityQuery.ilike('name', `%${searchQuery.nameSearch}%`);
              } else if (!searchQuery.ageRange && !searchQuery.countryCode && !searchQuery.locationKeywords) {
                const searchTerm = search.trim().toLowerCase();
                communityQuery = communityQuery.or(`name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`);
              }
            }

            let { data: communityCharacters, error: communityError } = await communityQuery;

            // If error is about featured column not existing, retry without it
            if (communityError && (communityError.message?.includes('featured') || communityError.message?.includes('column') || communityError.code === 'PGRST116')) {
              console.log('Featured column not found in community_characters, retrying without it');
              const retryCommunityQuery = supabase
                .from('community_characters')
                .select('id, name, age, location, image_url, preview_image_url, tags, personality, uploader_user_id, users!community_characters_uploader_user_id_fkey(username)')
                .eq('status', 'approved')
                .order('approved_at', { ascending: false });
              
              if (search && typeof search === 'string' && search.trim()) {
                const searchQuery = parseSearchQuery(search);
                
                if (searchQuery.ageRange) {
                  if (searchQuery.ageRange.min === searchQuery.ageRange.max) {
                    retryCommunityQuery.eq('age', searchQuery.ageRange.min);
                  } else {
                    retryCommunityQuery.gte('age', searchQuery.ageRange.min).lte('age', searchQuery.ageRange.max);
                  }
                } else {
                  const ageMatch = parseInt(searchQuery.originalQuery);
                  if (!isNaN(ageMatch) && ageMatch >= 18 && ageMatch <= 100) {
                    retryCommunityQuery.eq('age', ageMatch);
                  }
                }
                
                if (searchQuery.countryCode) {
                  retryCommunityQuery.not('location', 'is', null);
                } else if (searchQuery.locationKeywords && searchQuery.locationKeywords.length > 0) {
                  retryCommunityQuery.not('location', 'is', null);
                  const locationConditions = searchQuery.locationKeywords.map((loc: string) => `location.ilike.%${loc}%`).join(',');
                  if (searchQuery.nameSearch) {
                    retryCommunityQuery.or(`${locationConditions},name.ilike.%${searchQuery.nameSearch}%`);
                  } else {
                    retryCommunityQuery.or(locationConditions);
                  }
                } else if (searchQuery.nameSearch) {
                  retryCommunityQuery.ilike('name', `%${searchQuery.nameSearch}%`);
                } else if (!searchQuery.ageRange && !searchQuery.countryCode && !searchQuery.locationKeywords) {
                  const searchTerm = search.trim().toLowerCase();
                  retryCommunityQuery.or(`name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`);
                }
              }
              
              const retryResult = await retryCommunityQuery as any;
              communityCharacters = retryResult.data;
              communityError = retryResult.error;
            }

            if (communityError) {
              console.error('Error fetching community characters:', communityError);
            }

            // Filter community characters by location/age if needed (post-query)
            // Community characters have no category, so they're excluded from category views
            let filteredCommunityCharacters = isCharacterCategory(category) ? [] : (communityCharacters || []);
            
            if (search && typeof search === 'string' && search.trim()) {
              const searchQuery = parseSearchQuery(search);
              
              if (searchQuery.countryCode) {
                filteredCommunityCharacters = filteredCommunityCharacters.filter((char: any) => {
                  return locationMatchesCountryCode(char.location, searchQuery.countryCode!);
                });
              } else if (searchQuery.locationKeywords && searchQuery.locationKeywords.length > 0 && !searchQuery.nameSearch) {
                filteredCommunityCharacters = filteredCommunityCharacters.filter((char: any) => {
                  if (!char.location) return false;
                  const locationLower = char.location.toLowerCase();
                  return searchQuery.locationKeywords!.some(keyword => 
                    locationLower.includes(keyword.toLowerCase())
                  );
                });
              }
              
              if (ageRangeFilter) {
                filteredCommunityCharacters = filteredCommunityCharacters.filter((char: any) => {
                  if (!char.age) return false;
                  return char.age >= ageRangeFilter!.min && char.age <= ageRangeFilter!.max;
                });
              }
            }

            // Fetch all images for template characters
            const templateCharactersWithImages = await Promise.all(
              (filteredCharacters || []).map(async (char) => {
                // Get all images from character_images table
                let allImages: string[] = [];
                try {
                  const { data: images, error: imagesError } = await supabase
                    .from('character_images')
                    .select('image_url, image_order')
                    .eq('character_type', 'template')
                    .eq('character_id', char.id)
                    .order('image_order', { ascending: true });

                  if (imagesError) {
                    console.warn(`Error fetching images for character ${char.id}:`, imagesError);
                    // Continue with fallback
                  } else if (images && images.length > 0) {
                    allImages = images.map(img => {
                      const imgUrl = img.image_url;
                      return normalizeImageUrl(imgUrl, BACKEND_URL) || '';
                    }).filter(url => url);
                  }
                } catch (err) {
                  console.warn(`Error querying character_images for ${char.id}:`, err);
                  // Continue with fallback
                }

                // Fallback to main image_url if no images in character_images table
                if (allImages.length === 0) {
                  if (char.image_url) {
                    const normalizedUrl = normalizeImageUrl(char.image_url, BACKEND_URL);
                    if (normalizedUrl) allImages = [normalizedUrl];
                  } else if (char.preview_image_url) {
                    const normalizedUrl = normalizeImageUrl(char.preview_image_url, BACKEND_URL);
                    if (normalizedUrl) allImages = [normalizedUrl];
                  }
                }

                return {
                  id: char.id,
                  name: char.name,
                  age: char.age || null,
                  location: char.location || null,
                  image_url: allImages[0] || null,
                  images: allImages,
                  tags: char.tags || [],
                  category: char.category || null,
                  personality: char.personality || null,
                  featured: char.featured || false,
                  isCommunity: false,
                };
              })
            );

            // Compute popularity (number of unique users who have chatted with each community character)
            let popularityMap: Record<string, number> = {};
            try {
              const communityIds = (filteredCommunityCharacters || []).map((c: any) => c.id);
              if (communityIds.length > 0) {
                const { data: sessions, error: sessionsError } = await supabase
                  .from('chat_sessions')
                  .select('character_id, user_id')
                  .eq('character_type', 'community')
                  .in('character_id', communityIds);

                if (sessionsError) {
                  console.warn('Error fetching community character popularity:', sessionsError);
                } else if (sessions && sessions.length > 0) {
                  const userSets: Record<string, Set<string>> = {};
                  for (const session of sessions as any[]) {
                    const cid = session.character_id;
                    const uid = session.user_id;
                    if (!cid || !uid) continue;
                    if (!userSets[cid]) userSets[cid] = new Set<string>();
                    userSets[cid].add(uid);
                  }
                  popularityMap = Object.fromEntries(
                    Object.entries(userSets).map(([cid, set]) => [cid, (set as Set<string>).size])
                  );
                }
              }
            } catch (popErr) {
              console.warn('Unexpected error computing community popularity:', popErr);
            }

            // Fetch all images for community characters
            const communityCharactersWithImages = await Promise.all(
              (filteredCommunityCharacters || []).map(async (char) => {
                let allImages: string[] = [];
                try {
                  const { data: images } = await supabase
                    .from('community_character_images')
                    .select('image_url, image_order')
                    .eq('character_id', char.id)
                    .order('image_order', { ascending: true });

                  if (images && images.length > 0) {
                    allImages = images.map(img => {
                      const imgUrl = img.image_url;
                      return normalizeImageUrl(imgUrl, BACKEND_URL) || '';
                    }).filter(url => url);
                  }
                } catch (err) {
                  console.warn(`Error fetching images for community character ${char.id}:`, err);
                }

                if (allImages.length === 0) {
                  if (char.image_url) {
                    const normalizedUrl = normalizeImageUrl(char.image_url, BACKEND_URL);
                    if (normalizedUrl) allImages = [normalizedUrl];
                  } else if (char.preview_image_url) {
                    const normalizedUrl = normalizeImageUrl(char.preview_image_url, BACKEND_URL);
                    if (normalizedUrl) allImages = [normalizedUrl];
                  }
                }

                return {
                  id: char.id,
                  name: char.name,
                  age: char.age || null,
                  location: char.location || null,
                  image_url: allImages[0] || null,
                  images: allImages,
                  tags: char.tags || [],
                  category: null, // Community characters don't have category yet
                  personality: char.personality || null,
                  featured: char.featured || false,
                  isCommunity: true,
                  uploaderUserId: char.uploader_user_id,
                  uploaderUsername: (Array.isArray(char.users) ? char.users[0] : char.users)?.username || 'Anonymous',
                  createdAt: char.approved_at || char.created_at || null,
                  popularity: popularityMap[char.id] || 0,
                };
              })
            );

            // Combine both types of characters
            const allCharacters = [...templateCharactersWithImages, ...communityCharactersWithImages];

            res.json({ characters: allCharacters });
  } catch (error) {
    console.error('Public characters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get featured characters for homepage
router.get('/characters/featured', async (req, res) => {
  try {
    const BACKEND_URL = process.env.BACKEND_URL || 
      (req.protocol + '://' + req.get('host')) || 
      `http://localhost:${process.env.PORT || 3001}`;

    // Get featured templates (only if featured column exists - migration must be run)
    // Try to fetch featured, but handle gracefully if column doesn't exist
    let featuredTemplates: any[] = [];
    let templatesError: any = null;
    
    try {
      const result = await supabase
        .from('character_templates')
        .select('id, name, age, location, image_url, preview_image_url, tags, category, personality')
        .eq('featured', true)
        .order('created_at', { ascending: false });
      
      if (result.error) {
        // If error is about column not existing, return empty array (migration not run)
        if (result.error.message?.includes('featured') || result.error.message?.includes('column')) {
          console.log('Featured column not found - migration may not be run yet');
          featuredTemplates = [];
        } else {
          templatesError = result.error;
        }
      } else {
        featuredTemplates = result.data || [];
      }
    } catch (err: any) {
      // Handle case where featured column doesn't exist
      if (err.message?.includes('featured') || err.message?.includes('column')) {
        console.log('Featured column not found - migration may not be run yet');
        featuredTemplates = [];
      } else {
        templatesError = err;
      }
    }

    if (templatesError) {
      console.error('Error fetching featured templates:', templatesError);
    }

    // Get featured community characters (only approved ones)
    // Try to fetch featured, but handle gracefully if column doesn't exist
    let featuredCommunity: any[] = [];
    let communityError: any = null;
    
    try {
      const result = await supabase
        .from('community_characters')
        .select('id, name, age, location, image_url, preview_image_url, tags, personality, uploader_user_id, users!community_characters_uploader_user_id_fkey(username)')
        .eq('featured', true)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      
      if (result.error) {
        // If error is about column not existing, return empty array (migration not run)
        if (result.error.message?.includes('featured') || result.error.message?.includes('column')) {
          console.log('Featured column not found - migration may not be run yet');
          featuredCommunity = [];
        } else {
          communityError = result.error;
        }
      } else {
        featuredCommunity = result.data || [];
      }
    } catch (err: any) {
      // Handle case where featured column doesn't exist
      if (err.message?.includes('featured') || err.message?.includes('column')) {
        console.log('Featured column not found - migration may not be run yet');
        featuredCommunity = [];
      } else {
        communityError = err;
      }
    }

    if (communityError) {
      console.error('Error fetching featured community characters:', communityError);
    }

    // Normalize image URLs and combine
    const templateCharacters = (featuredTemplates || []).map(char => ({
      ...char,
      previewImage: normalizeImageUrl(char.preview_image_url || char.image_url, BACKEND_URL),
      images: [normalizeImageUrl(char.image_url, BACKEND_URL)].filter(Boolean) as string[],
      isCommunity: false,
    }));

    const communityCharacters = (featuredCommunity || []).map(char => ({
      ...char,
      previewImage: normalizeImageUrl(char.preview_image_url || char.image_url, BACKEND_URL),
      images: [normalizeImageUrl(char.image_url, BACKEND_URL)].filter(Boolean) as string[],
      isCommunity: true,
      uploaderUsername: (char.users as any)?.username || null,
    }));

    const allFeatured = [...templateCharacters, ...communityCharacters];

    res.json({ characters: allFeatured });
  } catch (error) {
    console.error('Featured characters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get character details with all images
router.get('/characters/:characterId', async (req, res) => {
  try {
    // Use BACKEND_URL if set, otherwise construct from request or use Railway URL
    const BACKEND_URL = process.env.BACKEND_URL || 
      (req.protocol + '://' + req.get('host')) || 
      `http://localhost:${process.env.PORT || 3001}`;
    const { characterId } = req.params;

    // Try to get character template first
    let { data: character, error: charError } = await supabase
      .from('character_templates')
      .select('id, name, age, location, personality, system_prompt, preview_image_url, tags, image_url')
      .eq('id', characterId)
      .maybeSingle();

    let isCommunity = false;
    let allImages: string[] = [];

    if (charError || !character) {
      // Try community characters
      const { data: communityChar, error: communityError } = await supabase
        .from('community_characters')
        .select('id, name, age, location, personality, preview_image_url, tags, image_url, status, uploader_user_id, users!community_characters_uploader_user_id_fkey(username, profile_picture_url)')
        .eq('id', characterId)
        .eq('status', 'approved') // Only return approved community characters
        .maybeSingle();

      if (communityError || !communityChar) {
        return res.status(404).json({ error: 'Character not found' });
      }

      character = { ...communityChar, system_prompt: null } as any;
      isCommunity = true;
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Get all images for this character
    if (isCommunity) {
      const { data: images } = await supabase
        .from('community_character_images')
        .select('id, image_url, image_order')
        .eq('character_id', characterId)
        .order('image_order', { ascending: true });

      allImages = images && images.length > 0 
        ? images.map(img => normalizeImageUrl(img.image_url, BACKEND_URL) || '').filter(url => url)
        : character.image_url 
          ? [normalizeImageUrl(character.image_url, BACKEND_URL) || ''].filter(url => url)
          : character.preview_image_url 
            ? [normalizeImageUrl(character.preview_image_url, BACKEND_URL) || ''].filter(url => url)
            : [];
    } else {
      const { data: images } = await supabase
        .from('character_images')
        .select('id, image_url, image_order')
        .eq('character_type', 'template')
        .eq('character_id', characterId)
        .order('image_order', { ascending: true });

      allImages = images && images.length > 0 
        ? images.map(img => normalizeImageUrl(img.image_url, BACKEND_URL) || '').filter(url => url)
        : character.image_url 
          ? [normalizeImageUrl(character.image_url, BACKEND_URL) || ''].filter(url => url)
          : character.preview_image_url 
            ? [normalizeImageUrl(character.preview_image_url, BACKEND_URL) || ''].filter(url => url)
            : [];
    }

    res.json({
      character: {
        id: character.id,
        name: character.name,
        age: character.age || null,
        location: character.location || null,
        personality: character.personality,
        system_prompt: isCommunity ? null : (character as any).system_prompt || null,
        tags: character.tags || [],
        images: allImages,
        previewImage: character.preview_image_url || character.image_url || allImages[0] || null,
        isCommunity,
        uploaderUserId: isCommunity ? (character as any).uploader_user_id || null : null,
        uploaderUsername: isCommunity ? ((Array.isArray((character as any).users) ? (character as any).users[0] : (character as any).users)?.username || null) : null,
        uploaderProfilePicture: isCommunity ? ((Array.isArray((character as any).users) ? (character as any).users[0] : (character as any).users)?.profile_picture_url || null) : null,
      }
    });
  } catch (error) {
    console.error('Get character details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users by username
router.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    
    if (!search || typeof search !== 'string' || search.trim().length === 0) {
      return res.json({ users: [] });
    }

    const searchTerm = search.trim().toLowerCase();

    // Search users by username (case-insensitive)
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, profile_picture_url, bio, privacy_settings')
      .ilike('username', `%${searchTerm}%`)
      .not('username', 'is', null)
      .limit(20)
      .order('username', { ascending: true });

    if (error) {
      console.error('Error searching users:', error);
      return res.status(500).json({ error: 'Failed to search users' });
    }

    // Filter out users with private profiles (if needed)
    // For now, we'll return all users found - privacy can be checked on profile page
    const publicUsers = (users || []).map((user: any) => ({
      id: user.id,
      username: user.username,
      profilePictureUrl: user.profile_picture_url,
      bio: user.bio,
    }));

    res.json({ users: publicUsers });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get approved community characters uploaded by a specific user (for profile gallery)
router.get('/users/:username/characters', async (req, res) => {
  try {
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const { username } = req.params;

    // Get user by username
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get approved community characters uploaded by this user
    const { data: characters, error: charsError } = await supabase
      .from('community_characters')
      .select('id, name, age, location, personality, image_url, preview_image_url, tags, created_at')
      .eq('uploader_user_id', user.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (charsError) {
      console.error('Error fetching user characters:', charsError);
      return res.status(500).json({ error: 'Failed to fetch characters' });
    }

    // Fetch all images for each character
    const charactersWithImages = await Promise.all(
      (characters || []).map(async (char) => {
        let allImages: string[] = [];
        try {
          const { data: images } = await supabase
            .from('community_character_images')
            .select('image_url, image_order')
            .eq('character_id', char.id)
            .order('image_order', { ascending: true });

          if (images && images.length > 0) {
            allImages = images.map(img => {
              const imgUrl = img.image_url;
              return imgUrl && imgUrl.startsWith('/') ? `${BACKEND_URL}${imgUrl}` : imgUrl;
            });
          }
        } catch (err) {
          console.warn(`Error fetching images for character ${char.id}:`, err);
        }

        if (allImages.length === 0 && char.image_url) {
          const imgUrl = char.image_url;
          allImages = [imgUrl && imgUrl.startsWith('/') ? `${BACKEND_URL}${imgUrl}` : imgUrl];
        }

        return {
          id: char.id,
          name: char.name,
          age: char.age || null,
          location: char.location || null,
          personality: char.personality,
          imageUrl: allImages[0] || null,
          images: allImages,
          tags: char.tags || [],
          createdAt: char.created_at,
        };
      })
    );

    res.json({ characters: charactersWithImages });
  } catch (error) {
    console.error('Get user characters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
