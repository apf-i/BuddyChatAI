/**
 * Flag-based location matching
 * Uses the same logic as the frontend flag utility to determine country codes
 * and match characters based on their flag instead of location text
 */

// Map location strings to ISO 3166-1 alpha-2 country codes
// This matches the logic in frontend/src/utils/flags.ts
const locationToCountryCode: Record<string, string> = {
  // Countries
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'america': 'US',
  'united kingdom': 'GB',
  'uk': 'GB',
  'england': 'GB',
  'canada': 'CA',
  'australia': 'AU',
  'germany': 'DE',
  'france': 'FR',
  'italy': 'IT',
  'spain': 'ES',
  'japan': 'JP',
  'china': 'CN',
  'south korea': 'KR',
  'korea': 'KR',
  'brazil': 'BR',
  'mexico': 'MX',
  'india': 'IN',
  'russia': 'RU',
  'netherlands': 'NL',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'poland': 'PL',
  'greece': 'GR',
  'portugal': 'PT',
  'ireland': 'IE',
  'switzerland': 'CH',
  'austria': 'AT',
  'belgium': 'BE',
  'czech republic': 'CZ',
  'hungary': 'HU',
  'romania': 'RO',
  'turkey': 'TR',
  'israel': 'IL',
  'south africa': 'ZA',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'philippines': 'PH',
  'thailand': 'TH',
  'vietnam': 'VN',
  'indonesia': 'ID',
  'malaysia': 'MY',
  'singapore': 'SG',
  'new zealand': 'NZ',
  'egypt': 'EG',
  'morocco': 'MA',
  'nigeria': 'NG',
  'kenya': 'KE',
  'uae': 'AE',
  'united arab emirates': 'AE',
  'saudi arabia': 'SA',
  
  // Major cities (using country codes)
  'new york': 'US',
  'los angeles': 'US',
  'chicago': 'US',
  'houston': 'US',
  'phoenix': 'US',
  'philadelphia': 'US',
  'san antonio': 'US',
  'san diego': 'US',
  'dallas': 'US',
  'san jose': 'US',
  'austin': 'US',
  'miami': 'US',
  'seattle': 'US',
  'boston': 'US',
  'london': 'GB',
  'paris': 'FR',
  'tokyo': 'JP',
  'sydney': 'AU',
  'warsaw': 'PL',
  // Add more cities as needed
};

// US state codes mapping to 'US'
const usStateCodes: Record<string, string> = {
  'ny': 'US', 'ca': 'US', 'tx': 'US', 'fl': 'US', 'il': 'US',
  'pa': 'US', 'oh': 'US', 'ga': 'US', 'nc': 'US', 'mi': 'US',
  'nj': 'US', 'va': 'US', 'wa': 'US', 'az': 'US', 'ma': 'US',
  'tn': 'US', 'in': 'US', 'mo': 'US', 'md': 'US', 'wi': 'US',
  'co': 'US', 'mn': 'US', 'sc': 'US', 'al': 'US', 'la': 'US',
  'ky': 'US', 'or': 'US', 'ok': 'US', 'ct': 'US', 'ut': 'US',
  'ia': 'US', 'nv': 'US', 'ar': 'US', 'ms': 'US', 'ks': 'US',
  'nm': 'US', 'ne': 'US', 'wv': 'US', 'id': 'US', 'hi': 'US',
  'nh': 'US', 'me': 'US', 'mt': 'US', 'ri': 'US', 'de': 'US',
  'sd': 'US', 'nd': 'US', 'ak': 'US', 'dc': 'US', 'vt': 'US',
  'wy': 'US',
};

/**
 * Get ISO 3166-1 alpha-2 country code for a location string
 * This matches the logic in frontend/src/utils/flags.ts
 */
export function getLocationCountryCode(location: string | null | undefined): string {
  if (!location) return '';

  const locationLower = location.toLowerCase().trim();

  // Try exact match first (e.g., "poland", "us", "pl")
  if (locationToCountryCode[locationLower]) {
    return locationToCountryCode[locationLower];
  }

  // Handle common 2-letter country codes (ISO 3166-1 alpha-2)
  if (locationLower.length === 2) {
    if (locationToCountryCode[locationLower]) {
      return locationToCountryCode[locationLower];
    }
  }

  // Try matching city names (before comma)
  const cityMatch = locationLower.split(',')[0].trim();
  if (locationToCountryCode[cityMatch]) {
    return locationToCountryCode[cityMatch];
  }

  // Try matching country/state codes (after comma) - handle "Warsaw, PL", "New York, NY", etc.
  const locationParts = locationLower.split(',');
  if (locationParts.length > 1) {
    const lastPart = locationParts[locationParts.length - 1].trim();

    // Try exact match for country code after comma
    if (locationToCountryCode[lastPart]) {
      return locationToCountryCode[lastPart];
    }

    // Handle US state codes (2-letter codes like "NY")
    if (usStateCodes[lastPart]) {
      return 'US';
    }
  }

  // If the entire location is just a US state code (e.g., "NY", "CA")
  if (usStateCodes[locationLower]) {
    return 'US';
  }

  // Try partial matches for common patterns
  for (const [key, code] of Object.entries(locationToCountryCode)) {
    if (locationLower.includes(key)) {
      return code;
    }
  }

  // Default: if it looks like a US location (has comma and 2-letter code), return US
  if (locationParts.length > 1 && locationParts[locationParts.length - 1].trim().length === 2) {
    return 'US';
  }

  return ''; // No country code found
}

/**
 * Map search keywords to country codes
 */
const searchKeywordToCountryCode: Record<string, string> = {
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
  // Add more as needed
};

/**
 * Get country code for a search keyword
 */
export function getCountryCodeForSearch(keyword: string): string | null {
  const normalized = keyword.toLowerCase().trim();
  return searchKeywordToCountryCode[normalized] || null;
}

/**
 * Check if a location matches a target country code
 */
export function locationMatchesCountryCode(location: string | null | undefined, targetCountryCode: string): boolean {
  if (!location || !targetCountryCode) return false;
  const locationCountryCode = getLocationCountryCode(location);
  return locationCountryCode === targetCountryCode;
}
