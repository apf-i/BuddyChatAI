# Database Migrations

## Running Migrations

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `001_create_tables.sql`
4. Run the migration

## Migration Files

- `001_create_tables.sql` - Creates all initial tables (Users, CharacterTemplate, UserCharacter, ChatSession, ChatMessages, TokenUsage)

## Tables Created

1. **users** - User accounts with email, password hash, and token balance
2. **character_templates** - Public character templates created by admins
3. **user_characters** - Private characters created by users
4. **chat_sessions** - Chat sessions linking users to characters
5. **chat_messages** - Individual messages in chat sessions
6. **token_usage** - Log of token usage for tracking
