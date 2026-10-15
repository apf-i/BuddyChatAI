/**
 * Keyword mapping for user-friendly search
 * Maps common keywords to database values for age ranges and locations
 */

interface AgeRange {
  min: number;
  max: number;
}

interface SearchQuery {
  ageRange?: AgeRange;
  locationKeywords?: string[];
  countryCode?: string; // ISO 3166-1 alpha-2 country code for flag-based matching
  nameSearch?: string;
  originalQuery: string;
}

// Age keyword mapping
const ageKeywords: Record<string, AgeRange> = {
  "20's": { min: 20, max: 29 },
  "20s": { min: 20, max: 29 },
  "twenties": { min: 20, max: 29 },
  "twenty": { min: 20, max: 29 },
  "30's": { min: 30, max: 39 },
  "30s": { min: 30, max: 39 },
  "thirties": { min: 30, max: 39 },
  "thirty": { min: 30, max: 39 },
  "40's": { min: 40, max: 49 },
  "40s": { min: 40, max: 49 },
  "forties": { min: 40, max: 49 },
  "forty": { min: 40, max: 49 },
  "50's": { min: 50, max: 59 },
  "50s": { min: 50, max: 59 },
  "fifties": { min: 50, max: 59 },
  "fifty": { min: 50, max: 59 },
  "60's": { min: 60, max: 69 },
  "60s": { min: 60, max: 69 },
  "sixties": { min: 60, max: 69 },
  "sixty": { min: 60, max: 69 },
};

// Location keyword mapping
// US state codes are included so "America" matches locations like "New York, NY" or "Miami, FL"
const locationKeywords: Record<string, string[]> = {
  "america": [
    "united states", "usa", "us", "america", "american",
    // US State codes
    "ny", "ca", "tx", "fl", "il", "pa", "oh", "ga", "nc", "mi", "nj", "va", "wa", "az", "ma", "tn", "in", "mo", "md", "wi", "co", "mn", "sc", "al", "la", "ky", "or", "ok", "ct", "ut", "ia", "nv", "ar", "ms", "ks", "nm", "ne", "wv", "id", "hi", "nh", "me", "mt", "ri", "de", "sd", "nd", "ak", "dc", "vt", "wy",
    // Major US cities (common in location format "City, ST")
    "new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose", "austin", "jacksonville", "fort worth", "columbus", "charlotte", "san francisco", "indianapolis", "seattle", "denver", "washington", "boston", "el paso", "detroit", "nashville", "portland", "memphis", "oklahoma city", "las vegas", "louisville", "baltimore", "milwaukee", "albuquerque", "tucson", "fresno", "sacramento", "kansas city", "mesa", "atlanta", "omaha", "colorado springs", "raleigh", "virginia beach", "miami", "oakland", "minneapolis", "tulsa", "cleveland", "wichita", "arlington"
  ],
  "usa": [
    "united states", "usa", "us", "america", "american",
    "ny", "ca", "tx", "fl", "il", "pa", "oh", "ga", "nc", "mi", "nj", "va", "wa", "az", "ma", "tn", "in", "mo", "md", "wi", "co", "mn", "sc", "al", "la", "ky", "or", "ok", "ct", "ut", "ia", "nv", "ar", "ms", "ks", "nm", "ne", "wv", "id", "hi", "nh", "me", "mt", "ri", "de", "sd", "nd", "ak", "dc", "vt", "wy",
    "new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose", "austin", "jacksonville", "fort worth", "columbus", "charlotte", "san francisco", "indianapolis", "seattle", "denver", "washington", "boston", "el paso", "detroit", "nashville", "portland", "memphis", "oklahoma city", "las vegas", "louisville", "baltimore", "milwaukee", "albuquerque", "tucson", "fresno", "sacramento", "kansas city", "mesa", "atlanta", "omaha", "colorado springs", "raleigh", "virginia beach", "miami", "oakland", "minneapolis", "tulsa", "cleveland", "wichita", "arlington"
  ],
  "us": [
    "united states", "usa", "us", "america", "american",
    "ny", "ca", "tx", "fl", "il", "pa", "oh", "ga", "nc", "mi", "nj", "va", "wa", "az", "ma", "tn", "in", "mo", "md", "wi", "co", "mn", "sc", "al", "la", "ky", "or", "ok", "ct", "ut", "ia", "nv", "ar", "ms", "ks", "nm", "ne", "wv", "id", "hi", "nh", "me", "mt", "ri", "de", "sd", "nd", "ak", "dc", "vt", "wy",
    "new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose", "austin", "jacksonville", "fort worth", "columbus", "charlotte", "san francisco", "indianapolis", "seattle", "denver", "washington", "boston", "el paso", "detroit", "nashville", "portland", "memphis", "oklahoma city", "las vegas", "louisville", "baltimore", "milwaukee", "albuquerque", "tucson", "fresno", "sacramento", "kansas city", "mesa", "atlanta", "omaha", "colorado springs", "raleigh", "virginia beach", "miami", "oakland", "minneapolis", "tulsa", "cleveland", "wichita", "arlington"
  ],
  "united states": [
    "united states", "usa", "us", "america", "american",
    "ny", "ca", "tx", "fl", "il", "pa", "oh", "ga", "nc", "mi", "nj", "va", "wa", "az", "ma", "tn", "in", "mo", "md", "wi", "co", "mn", "sc", "al", "la", "ky", "or", "ok", "ct", "ut", "ia", "nv", "ar", "ms", "ks", "nm", "ne", "wv", "id", "hi", "nh", "me", "mt", "ri", "de", "sd", "nd", "ak", "dc", "vt", "wy",
    "new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose", "austin", "jacksonville", "fort worth", "columbus", "charlotte", "san francisco", "indianapolis", "seattle", "denver", "washington", "boston", "el paso", "detroit", "nashville", "portland", "memphis", "oklahoma city", "las vegas", "louisville", "baltimore", "milwaukee", "albuquerque", "tucson", "fresno", "sacramento", "kansas city", "mesa", "atlanta", "omaha", "colorado springs", "raleigh", "virginia beach", "miami", "oakland", "minneapolis", "tulsa", "cleveland", "wichita", "arlington"
  ],
  "uk": ["united kingdom", "uk", "england", "britain", "british"],
  "england": ["united kingdom", "uk", "england", "britain", "british"],
  "britain": ["united kingdom", "uk", "england", "britain", "british"],
  "canada": ["canada", "canadian"],
  "australia": ["australia", "australian"],
  "germany": ["germany", "german"],
  "france": ["france", "french"],
  "italy": ["italy", "italian"],
  "spain": ["spain", "spanish"],
  "japan": ["japan", "japanese"],
  "china": ["china", "chinese"],
  "korea": ["south korea", "korea", "korean"],
  "brazil": ["brazil", "brazilian"],
  "mexico": ["mexico", "mexican"],
  "india": ["india", "indian"],
  "poland": ["poland", "polish"],
  "russia": ["russia", "russian"],
  "netherlands": ["netherlands", "dutch"],
  "sweden": ["sweden", "swedish"],
  "norway": ["norway", "norwegian"],
  "denmark": ["denmark", "danish"],
  "finland": ["finland", "finnish"],
};

/**
 * Parse search query and extract keywords
 */
export function parseSearchQuery(searchTerm: string): SearchQuery {
  const normalized = searchTerm.trim().toLowerCase();
  const result: SearchQuery = {
    originalQuery: searchTerm,
  };

  // Check for age keywords
  for (const [keyword, range] of Object.entries(ageKeywords)) {
    if (normalized.includes(keyword.toLowerCase())) {
      result.ageRange = range;
      break;
    }
  }

  // If no age keyword found, try parsing exact number
  if (!result.ageRange) {
    const ageMatch = parseInt(normalized);
    if (!isNaN(ageMatch) && ageMatch >= 18 && ageMatch <= 100) {
      result.ageRange = { min: ageMatch, max: ageMatch };
    }
  }

  // Check for location keywords - match whole words, not just substring
  const locationMatches: string[] = [];
  let countryCode: string | null = null;
  
  // First check for direct country keyword matches (for flag-based matching)
  const countryKeywordMap: Record<string, string> = {
    'america': 'US',
    'usa': 'US',
    'us': 'US',
    'united states': 'US',
    'uk': 'GB',
    'england': 'GB',
    'britain': 'GB',
    'united kingdom': 'GB',
    'canada': 'CA',
    'australia': 'AU',
    'germany': 'DE',
    'france': 'FR',
    'italy': 'IT',
    'spain': 'ES',
    'japan': 'JP',
    'china': 'CN',
    'korea': 'KR',
    'south korea': 'KR',
    'brazil': 'BR',
    'mexico': 'MX',
    'india': 'IN',
    'russia': 'RU',
    'poland': 'PL',
    'netherlands': 'NL',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'finland': 'FI',
  };
  
  // Check for country keywords (use word boundaries)
  for (const [keyword, code] of Object.entries(countryKeywordMap)) {
    const keywordRegex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i');
    if (keywordRegex.test(normalized)) {
      countryCode = code;
      break; // Take the first match
    }
  }
  
  // If we found a country code, set it (this will use flag-based matching)
  if (countryCode) {
    result.countryCode = countryCode;
  } else {
    // Fall back to location keyword matching for non-country searches
    for (const [keyword, locations] of Object.entries(locationKeywords)) {
      // Use word boundaries to match whole words only
      const keywordRegex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i');
      if (keywordRegex.test(normalized)) {
        locationMatches.push(...locations);
      }
    }

    if (locationMatches.length > 0) {
      result.locationKeywords = [...new Set(locationMatches)]; // Remove duplicates
    }
  }

  // Extract name search (remove matched keywords)
  let nameSearch = normalized;
  // Remove age keywords
  for (const keyword of Object.keys(ageKeywords)) {
    nameSearch = nameSearch.replace(new RegExp(keyword.toLowerCase(), 'gi'), '').trim();
  }
  // Remove location keywords
  for (const keyword of Object.keys(locationKeywords)) {
    nameSearch = nameSearch.replace(new RegExp(keyword.toLowerCase(), 'gi'), '').trim();
  }
  // Remove common words that might be leftover
  nameSearch = nameSearch.replace(/\b(in|from|at|the|a|an|of|is|are|and|or)\b/gi, '').trim();
  
  if (nameSearch && nameSearch.length > 0) {
    result.nameSearch = nameSearch;
  }

  return result;
}

