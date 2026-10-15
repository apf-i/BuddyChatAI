export const CHARACTER_CATEGORIES = ['Friends', 'Mentors', 'Adventurers'] as const;

export type CharacterCategory = typeof CHARACTER_CATEGORIES[number];
