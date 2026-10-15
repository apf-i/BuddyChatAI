// Database type definitions

export interface User {
  id: string;
  email: string;
  password_hash: string;
  token_balance: number;
  is_admin: boolean;
  username: string | null;
  profile_picture_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterTemplate {
  id: string;
  name: string;
  personality: string;
  system_prompt: string;
  image_url: string;
  preview_image_url: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCharacter {
  id: string;
  user_id: string;
  name: string;
  age: number;
  hair: string | null;
  style_outfit: string | null;
  personality: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  character_type: 'template' | 'user_character';
  character_id: string;
  memory_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface TokenUsage {
  id: string;
  user_id: string;
  session_id: string | null;
  tokens_used: number;
  created_at: string;
}
