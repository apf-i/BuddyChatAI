export const SAMPLE_CHARACTER_ID = '11111111-1111-4111-8111-111111111111';

const SAMPLE_CHARACTER = {
  id: SAMPLE_CHARACTER_ID,
  name: 'Alex',
  age: 24,
  location: 'San Francisco',
  personality:
    'Warm, curious, and quick with a joke. Alex likes games, study sessions, and hearing about your day.',
  system_prompt:
    'You are Alex, a friendly 24-year-old from San Francisco. You are upbeat, a good listener, and you enjoy gaming, study sessions, and lighthearted conversation. Keep replies short, natural, and in character.',
  tags: ['friendly', 'funny', 'gaming', 'study buddy'],
  category: 'Friends',
};

export function isSampleCharacter(id: string | null | undefined): boolean {
  return id === SAMPLE_CHARACTER_ID;
}

export function sampleImageUrl(): string {
  const configured = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const base =
    configured && !/localhost|127\.0\.0\.1/.test(configured)
      ? configured
      : 'https://buddychatai.vercel.app';
  return `${base}/sample-alex.jpg`;
}

export function samplePublicCharacter() {
  const image = sampleImageUrl();
  return {
    id: SAMPLE_CHARACTER.id,
    name: SAMPLE_CHARACTER.name,
    age: SAMPLE_CHARACTER.age,
    location: SAMPLE_CHARACTER.location,
    image_url: image,
    preview_image_url: image,
    images: [image],
    tags: SAMPLE_CHARACTER.tags,
    category: SAMPLE_CHARACTER.category,
    personality: SAMPLE_CHARACTER.personality,
    system_prompt: SAMPLE_CHARACTER.system_prompt,
    featured: true,
    isCommunity: false,
  };
}

export function sampleMatchesFilters(category: unknown, search: unknown): boolean {
  const sample = samplePublicCharacter();
  if (typeof category === 'string' && category && category !== 'all' && category !== sample.category) {
    return false;
  }
  if (typeof search === 'string' && search.trim()) {
    const query = search.trim().toLowerCase();
    const haystack = [sample.name, sample.location, sample.category, sample.personality, ...sample.tags]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}
