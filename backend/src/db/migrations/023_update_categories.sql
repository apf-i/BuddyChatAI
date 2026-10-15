-- Migration 023: Normalize character categories to Friends/Mentors/Adventurers and drop unused age_confirmed
-- Safe to run on databases created before or after migration 005 was updated

ALTER TABLE character_templates DROP CONSTRAINT IF EXISTS character_templates_category_check;
ALTER TABLE user_characters DROP CONSTRAINT IF EXISTS user_characters_category_check;

-- Map any legacy category values to a new category based on the character's age
UPDATE character_templates
SET category = CASE
  WHEN age IS NULL OR age < 30 THEN 'Friends'
  WHEN age < 50 THEN 'Mentors'
  ELSE 'Adventurers'
END
WHERE category IS NOT NULL
  AND category NOT IN ('Friends', 'Mentors', 'Adventurers');

UPDATE user_characters
SET category = CASE
  WHEN age IS NULL OR age < 30 THEN 'Friends'
  WHEN age < 50 THEN 'Mentors'
  ELSE 'Adventurers'
END
WHERE category IS NOT NULL
  AND category NOT IN ('Friends', 'Mentors', 'Adventurers');

ALTER TABLE character_templates
ADD CONSTRAINT character_templates_category_check
CHECK (category IN ('Friends', 'Mentors', 'Adventurers') OR category IS NULL);

ALTER TABLE user_characters
ADD CONSTRAINT user_characters_category_check
CHECK (category IN ('Friends', 'Mentors', 'Adventurers') OR category IS NULL);

ALTER TABLE users DROP COLUMN IF EXISTS age_confirmed;
