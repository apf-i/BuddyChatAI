// Map location strings to ISO 3166-1 alpha-2 country codes
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
  'melbourne': 'AU',
  'toronto': 'CA',
  'vancouver': 'CA',
  'berlin': 'DE',
  'madrid': 'ES',
  'rome': 'IT',
  'amsterdam': 'NL',
  'stockholm': 'SE',
  'oslo': 'NO',
  'copenhagen': 'DK',
  'dublin': 'IE',
  'zurich': 'CH',
  'vienna': 'AT',
  'brussels': 'BE',
  'prague': 'CZ',
  'budapest': 'HU',
  'warsaw': 'PL',
  'athens': 'GR',
  'istanbul': 'TR',
  'tel aviv': 'IL',
  'dubai': 'AE',
  'riyadh': 'SA',
  'cairo': 'EG',
  'casablanca': 'MA',
  'lagos': 'NG',
  'nairobi': 'KE',
  'johannesburg': 'ZA',
  'cape town': 'ZA',
  'buenos aires': 'AR',
  'santiago': 'CL',
  'bogota': 'CO',
  'sao paulo': 'BR',
  'rio de janeiro': 'BR',
  'mexico city': 'MX',
  'mumbai': 'IN',
  'delhi': 'IN',
  'bangalore': 'IN',
  'beijing': 'CN',
  'shanghai': 'CN',
  'hong kong': 'HK',
  'seoul': 'KR',
  'bangkok': 'TH',
  'ho chi minh city': 'VN',
  'jakarta': 'ID',
  'kuala lumpur': 'MY',
  'manila': 'PH',
  'auckland': 'NZ',
  'wellington': 'NZ',
  'moscow': 'RU',
  'saint petersburg': 'RU',
};

/**
 * Get country code (ISO 3166-1 alpha-2) for a location string
 * @param location - Location string (e.g., "New York, NY", "London, UK", "PL")
 * @returns 2-letter country code or empty string if not found
 */
export function getLocationCountryCode(location: string | null | undefined): string {
  if (!location) return '';
  
  const locationLower = location.toLowerCase().trim();
  
  // Try exact match first
  if (locationToCountryCode[locationLower]) {
    return locationToCountryCode[locationLower];
  }
  
  // Handle common 2-letter country codes (ISO 3166-1 alpha-2)
  // Check if the entire location is just a 2-letter code
  if (locationLower.length === 2) {
    // Common country codes - return uppercase if valid
    const validCountryCodes = ['us', 'uk', 'gb', 'ca', 'au', 'de', 'fr', 'it', 'es', 'jp', 'cn',
      'kr', 'br', 'mx', 'in', 'ru', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'gr', 'pt', 'ie', 'ch',
      'at', 'be', 'cz', 'hu', 'ro', 'tr', 'il', 'za', 'ar', 'cl', 'co', 'ph', 'th', 'vn', 'id',
      'my', 'sg', 'nz', 'eg', 'ma', 'ng', 'ke', 'ae', 'sa', 'hk'];
    if (validCountryCodes.includes(locationLower)) {
      return locationLower.toUpperCase();
    }
  }
  
  // Try matching city names (before comma)
  const cityMatch = locationLower.split(',')[0].trim();
  if (locationToCountryCode[cityMatch]) {
    return locationToCountryCode[cityMatch];
  }
  
  // Handle US state codes (common format: "City, ST")
  const usStateCodes = ['ny', 'ca', 'tx', 'fl', 'il', 'pa', 'oh', 'ga', 'nc', 'mi',
    'nj', 'va', 'wa', 'az', 'ma', 'tn', 'in', 'mo', 'md', 'wi', 'co', 'mn', 'sc', 'al', 'la',
    'ky', 'or', 'ok', 'ct', 'ut', 'ia', 'nv', 'ar', 'ms', 'ks', 'nm', 'ne', 'wv', 'id', 'hi',
    'nh', 'me', 'ri', 'mt', 'de', 'sd', 'nd', 'ak', 'dc', 'vt', 'wy'];
  
  // Try matching country/state codes (after comma) - handle "Warsaw, PL", "New York, NY", etc.
  const parts = locationLower.split(',');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim();
    
    // Try exact match for country/state code
    if (locationToCountryCode[lastPart]) {
      return locationToCountryCode[lastPart];
    }
    
    // Handle 2-letter country codes after comma (e.g., "Warsaw, PL")
    if (lastPart.length === 2) {
      const validCountryCodes = ['us', 'uk', 'gb', 'ca', 'au', 'de', 'fr', 'it', 'es', 'jp', 'cn',
        'kr', 'br', 'mx', 'in', 'ru', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'gr', 'pt', 'ie', 'ch',
        'at', 'be', 'cz', 'hu', 'ro', 'tr', 'il', 'za', 'ar', 'cl', 'co', 'ph', 'th', 'vn', 'id',
        'my', 'sg', 'nz', 'eg', 'ma', 'ng', 'ke', 'ae', 'sa', 'hk'];
      if (validCountryCodes.includes(lastPart)) {
        return lastPart.toUpperCase();
      }
    }
    
    // Handle US state codes (2-letter codes) - return US
    if (usStateCodes.includes(lastPart)) {
      return 'US';
    }
  }
  
  // If the entire location is just a US state code (e.g., "NY", "CA")
  if (usStateCodes.includes(locationLower)) {
    return 'US';
  }
  
  // Try partial matches for common patterns
  for (const [key, code] of Object.entries(locationToCountryCode)) {
    if (locationLower.includes(key) || key.includes(cityMatch)) {
      return code;
    }
  }
  
  // If location contains common US state codes, return US
  if (locationLower.match(/\b(ny|ca|tx|fl|il|pa|oh|ga|nc|mi|nj|va|wa|az|ma|tn|in|mo|md|wi|co|mn|sc|al|la|ky|or|ok|ct|ut|ia|nv|ar|ms|ks|nm|ne|wv|id|hi|nh|me|ri|mt|de|sd|nd|ak|dc|vt|wy)\b/)) {
    return 'US';
  }
  
  // Default: if it looks like a US location (has comma and 2-letter code), return US
  const locationParts = locationLower.split(',');
  if (locationParts.length > 1 && locationParts[locationParts.length - 1].trim().length === 2) {
    return 'US';
  }
  
  return ''; // No country code found
}
