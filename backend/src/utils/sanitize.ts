import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes HTML content to prevent XSS attacks
 * Removes dangerous tags and attributes while preserving safe formatting
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return sanitizeHtml(input, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'code', 'pre'
    ],
    allowedAttributes: {},
    allowedStyles: {},
    allowedClasses: {},
    // Remove all script tags and event handlers
    disallowedTagsMode: 'discard',
    allowedSchemes: [],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: [],
    allowProtocolRelative: false,
  });
}

/**
 * Sanitizes plain text (removes all HTML)
 */
export function sanitizePlainText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/**
 * Sanitizes user input for database storage
 * This is a more permissive sanitization that allows some HTML formatting
 */
export function sanitizeUserInput(input: string): string {
  return sanitizeInput(input);
}
