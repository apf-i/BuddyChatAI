export const CHARACTER_CATEGORIES = ['Friends', 'Mentors', 'Adventurers'] as const;

export type CharacterCategory = typeof CHARACTER_CATEGORIES[number];

export function isCharacterCategory(value: unknown): value is CharacterCategory {
  return typeof value === 'string' && (CHARACTER_CATEGORIES as readonly string[]).includes(value);
}
