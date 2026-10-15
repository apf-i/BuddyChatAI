/**
 * Content moderation rules for BuddyChatAI.
 * Blocks prohibited / harmful content so the platform stays appropriate for all users.
 */

const FORBIDDEN_WORDS = [
  // Prohibited adult / explicit terms
  'nsfw', 'sex', 'sexual', 'sexy', 'nude', 'nudes', 'naked', 'porn', 'porno', 'pornography',
  'erotic', 'fetish', 'kinky', 'horny', 'orgasm', 'bdsm', 'onlyfans', 'hentai', 'xxx',
  // Harassment
  'kill yourself', 'kys',
  // Real people impersonation
  'real person', 'celebrity',
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word matching so innocent words like "Essex" or "skill" aren't flagged
const FORBIDDEN_WORD_PATTERNS = FORBIDDEN_WORDS.map(
  (word) => new RegExp(`\\b${escapeRegex(word)}\\b`, 'i')
);

/**
 * Check if text contains forbidden words
 */
export function containsForbiddenContent(text: string): boolean {
  return FORBIDDEN_WORD_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Validate character creation input
 */
export function validateCharacterInput(input: {
  name: string;
  age?: number;
  personality: string;
  hair?: string;
  style_outfit?: string;
}): { valid: boolean; error?: string } {
  if (input.age !== undefined && input.age < 18) {
    return { valid: false, error: 'Age must be 18 or older' };
  }

  const fullText = [
    input.name,
    input.personality,
    input.hair || '',
    input.style_outfit || '',
  ].join(' ');

  if (containsForbiddenContent(fullText)) {
    return {
      valid: false,
      error: 'Character description contains prohibited content. Please keep characters friendly and appropriate.',
    };
  }

  return { valid: true };
}

/**
 * Validate chat message for moderation
 */
export function validateChatMessage(message: string): { valid: boolean; error?: string } {
  if (containsForbiddenContent(message)) {
    return {
      valid: false,
      error: 'Message contains prohibited content. Please keep conversations appropriate.',
    };
  }

  return { valid: true };
}
