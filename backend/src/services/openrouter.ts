import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Model is configurable via OPENROUTER_MODEL so it can be swapped without code changes
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function sendToOpenRouter(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL
): Promise<{ content: string; tokensUsed: number }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  try {
    const response = await axios.post<OpenRouterResponse>(
      OPENROUTER_URL,
      {
        model,
        messages,
        temperature: 0.9, // Higher temperature for more creative/character-authentic responses
        max_tokens: 1500,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'BuddyChatAI',
        },
      }
    );

    const content = response.data.choices[0]?.message?.content || '';
    const tokensUsed = response.data.usage?.total_tokens || 0;

    return { content, tokensUsed };
  } catch (error: any) {
    console.error('OpenRouter API error:', error.response?.data || error.message);
    
    // Handle rate limit errors specifically
    if (error.response?.status === 429 || error.response?.data?.error?.code === 429) {
      const errorMessage = error.response?.data?.error?.message || 'Rate limit exceeded';
      throw new Error(`Rate limit exceeded: ${errorMessage}. Please try again in a few moments.`);
    }
    
    // Handle model not found errors (404)
    if (error.response?.status === 404 || error.response?.data?.error?.code === 404) {
      const errorMessage = error.response?.data?.error?.message || 'Model not found';
      throw new Error(`The AI model "${model}" is no longer available. Please update the OPENROUTER_MODEL environment variable or contact support. Error: ${errorMessage}`);
    }
    
    // Handle other API errors
    if (error.response?.data?.error?.message) {
      throw new Error(`AI service error: ${error.response.data.error.message}`);
    }
    
    throw new Error('Failed to get AI response. Please try again.');
  }
}
