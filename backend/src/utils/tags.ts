// Tag Library - Predefined tags for character categorization
// Categories: Personality, Interests, Style, Gender

export const TAG_CATEGORIES = {
  PERSONALITY: 'personality',
  INTERESTS: 'interests',
  STYLE: 'style',
  GENDER: 'gender',
} as const;

export const TAG_LIBRARY: Record<string, string[]> = {
  [TAG_CATEGORIES.PERSONALITY]: [
    'Friendly',
    'Funny',
    'Witty',
    'Sarcastic',
    'Kind',
    'Calm',
    'Energetic',
    'Shy',
    'Confident',
    'Playful',
    'Serious',
    'Wise',
    'Curious',
    'Optimistic',
    'Supportive',
    'Mysterious',
    'Adventurous',
    'Creative',
    'Patient',
    'Motivational',
  ],
  [TAG_CATEGORIES.INTERESTS]: [
    'Gaming',
    'Music',
    'Movies',
    'Anime',
    'Books',
    'Sports',
    'Fitness',
    'Cooking',
    'Travel',
    'Technology',
    'Coding',
    'Science',
    'History',
    'Art',
    'Photography',
    'Fashion',
    'Cars',
    'Nature',
    'Pets',
    'Space',
    'Philosophy',
    'Languages',
    'Study Buddy',
    'Career Advice',
    'Storytelling',
  ],
  [TAG_CATEGORIES.STYLE]: [
    'Casual',
    'Formal',
    'Sporty',
    'Goth',
    'Preppy',
    'Fantasy',
    'Sci-Fi',
    'Historical',
    'Superhero',
    'Cartoon',
    'Glasses',
    'Tattoos',
    'Long Hair',
    'Short Hair',
    'Curly Hair',
  ],
  [TAG_CATEGORIES.GENDER]: [
    'Female',
    'Male',
    'Non-binary',
  ],
};

// Get all tags flattened
export function getAllTags(): string[] {
  return Object.values(TAG_LIBRARY).flat();
}

// Get tags by category
export function getTagsByCategory(category: string): string[] {
  return TAG_LIBRARY[category] || [];
}

// Search tags (case-insensitive)
export function searchTags(query: string): string[] {
  const allTags = getAllTags();
  const lowerQuery = query.toLowerCase();
  return allTags.filter(tag => tag.toLowerCase().includes(lowerQuery));
}

// Validate tags against library
export function validateTags(tags: string[]): { valid: boolean; invalidTags: string[] } {
  const allTags = getAllTags();
  const invalidTags = tags.filter(tag => !allTags.includes(tag));
  return {
    valid: invalidTags.length === 0,
    invalidTags,
  };
}
