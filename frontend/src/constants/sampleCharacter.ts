export const SAMPLE_CHARACTER_ID = '11111111-1111-4111-8111-111111111111';

export function sampleGalleryCharacter() {
  return {
    id: SAMPLE_CHARACTER_ID,
    name: 'Alex',
    age: 24,
    location: 'San Francisco',
    previewImage: '/sample-alex.jpg',
    images: ['/sample-alex.jpg'],
    tags: ['friendly', 'funny', 'gaming', 'study buddy'],
    category: 'Friends',
    isUserCharacter: false,
    isCommunity: false,
    personality:
      'Warm, curious, and quick with a joke. Alex likes games, study sessions, and hearing about your day.',
    featured: true,
  };
}

export function sampleCharacterDetail() {
  const card = sampleGalleryCharacter();
  return {
    id: card.id,
    name: card.name,
    age: card.age,
    location: card.location,
    personality: card.personality,
    tags: card.tags,
    images: card.images,
    previewImage: card.previewImage,
    featured: true,
  };
}
