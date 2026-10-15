-- Migration 005: Add category field to character_templates and user_characters
-- Categories: 'Friends', 'Mentors', 'Adventurers'

ALTER TABLE character_templates
ADD COLUMN IF NOT EXISTS category TEXT
CONSTRAINT character_templates_category_check
CHECK (category IN ('Friends', 'Mentors', 'Adventurers') OR category IS NULL);

ALTER TABLE user_characters
ADD COLUMN IF NOT EXISTS category TEXT
CONSTRAINT user_characters_category_check
CHECK (category IN ('Friends', 'Mentors', 'Adventurers') OR category IS NULL);
