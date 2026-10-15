import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendToOpenRouter } from '../services/openrouter';
import { checkAndUpdateMemory } from '../services/memory';
import { validateChatMessage } from '../services/moderation';

const router = express.Router();

// Validation schema
const sendMessageSchema = z.object({
  session_id: z.string().uuid(),
  user_message: z.string().min(1, 'Message cannot be empty'),
});

// Constants
const TOKENS_PER_MESSAGE = 100; // Cost per message in our token system (non-subscribers)
const TOKENS_PER_MESSAGE_SUBSCRIBER = 50; // Cost per message for subscribers
const MEMORY_SUMMARY_INTERVAL = 10; // Create summary every N messages

// T-013 & T-014: OpenRouter Chat Endpoint with Token Charging
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // SECURITY: Sanitize user message input
    const { sanitizeUserInput } = await import('../utils/sanitize');
    const sanitizedBody = {
      ...req.body,
      user_message: sanitizeUserInput(req.body.user_message),
    };
    
    const validated = sendMessageSchema.parse(sanitizedBody);
    const userId = req.userId!;
    const { session_id, user_message } = validated;

    // T-022: Basic Moderation Rules - validate chat message
    const moderationCheck = validateChatMessage(user_message);
    if (!moderationCheck.valid) {
      return res.status(400).json({ error: moderationCheck.error });
    }

    // Get session and verify ownership
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // T-014: Check token balance and subscription status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // Check for active subscription
    const { data: activeSubscription } = await supabase
      .from('subscriptions')
      .select('id, status, current_period_end')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    // Determine token cost based on subscription status
    const isSubscribed = activeSubscription && 
                         activeSubscription.current_period_end && 
                         new Date(activeSubscription.current_period_end) > new Date();
    const tokensPerMessage = isSubscribed ? TOKENS_PER_MESSAGE_SUBSCRIBER : TOKENS_PER_MESSAGE;

    if (user.token_balance < tokensPerMessage) {
      return res.status(403).json({ 
        error: 'Insufficient tokens',
        tokenBalance: user.token_balance,
        required: tokensPerMessage
      });
    }

    // Get character details
    let character: any = null;
    let systemPrompt = '';

    const safetyRules = `

CONVERSATION GUIDELINES:
- Stay in character and keep the conversation friendly, supportive, and engaging
- Keep all content safe for work and appropriate for a general audience
- Never produce sexual, graphic, hateful, or harassing content
- If the user steers toward inappropriate topics, politely redirect the conversation while staying in character`;

    if (session.character_type === 'template') {
      const { data } = await supabase
        .from('character_templates')
        .select('name, personality, system_prompt')
        .eq('id', session.character_id)
        .single();
      character = data;
      
      if (data?.system_prompt) {
        // If custom system_prompt exists, use it but ensure character name is included
        // Check if the name is already in the prompt
        if (data.system_prompt.includes(data.name || '')) {
          systemPrompt = `${data.system_prompt}${safetyRules}`;
        } else {
          systemPrompt = `You are ${data.name}, a fictional character. ${data.system_prompt}${safetyRules}`;
        }
      } else {
        systemPrompt = `You are ${data?.name}, a fictional character. ${data?.personality}

You should stay in character and respond as ${data?.name} would. This is a roleplay conversation where you portray this character. Be engaging, authentic to the character, and respond naturally as the character would.${safetyRules}`;
      }
    } else if (session.character_type === 'community') {
      const { data } = await supabase
        .from('community_characters')
        .select('name, personality, system_prompt')
        .eq('id', session.character_id)
        .single();
      character = data;
      
      if (data?.system_prompt) {
        // If custom system_prompt exists, use it but ensure character name is included
        // Check if the name is already in the prompt
        if (data.system_prompt.includes(data.name || '')) {
          systemPrompt = `${data.system_prompt}${safetyRules}`;
        } else {
          systemPrompt = `You are ${data.name}, a fictional character. ${data.system_prompt}${safetyRules}`;
        }
      } else {
        systemPrompt = `You are ${data?.name}, a fictional character. ${data?.personality}

You should stay in character and respond as ${data?.name} would. This is a roleplay conversation where you portray this character. Be engaging, authentic to the character, and respond naturally as the character would.${safetyRules}`;
      }
    } else {
      const { data } = await supabase
        .from('user_characters')
        .select('name, personality')
        .eq('id', session.character_id)
        .single();
      character = data;
      systemPrompt = `You are ${data?.name}, a fictional character. ${data?.personality}

You should stay in character and respond as ${data?.name} would. This is a roleplay conversation where you portray this character. Be engaging, authentic to the character, and respond naturally as the character would.${safetyRules}`;
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Get recent chat history (last 20 messages)
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Build messages array for OpenRouter
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add memory summary if available
    if (session.memory_summary) {
      messages.push({
        role: 'system',
        content: `Previous conversation summary: ${session.memory_summary}`,
      });
    }

    // Add recent messages (reversed to chronological order)
    if (recentMessages) {
      recentMessages.reverse().forEach((msg) => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: user_message });

    // Save user message first
    const { error: saveUserMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id,
        role: 'user',
        content: user_message,
      });

    if (saveUserMsgError) {
      console.error('Error saving user message:', saveUserMsgError);
    }

    // Send to OpenRouter
    let aiResponse: string;
    let tokensUsed: number;

    try {
      const result = await sendToOpenRouter(messages);
      aiResponse = result.content;
      tokensUsed = result.tokensUsed;
    } catch (error: any) {
      console.error('OpenRouter error:', error);
      // Pass through the error message from OpenRouter service
      const errorMessage = error.message || 'Message failed. Please try again.';
      const statusCode = errorMessage.includes('Rate limit') ? 429 : 500;
      return res.status(statusCode).json({ error: errorMessage });
    }

    // Save AI response
    const { error: saveAiMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id,
        role: 'assistant',
        content: aiResponse,
      });

    if (saveAiMsgError) {
      console.error('Error saving AI message:', saveAiMsgError);
    }

    // T-014: Deduct tokens (50 for subscribers, 100 for non-subscribers)
    const newBalance = user.token_balance - tokensPerMessage;
    await supabase
      .from('users')
      .update({ token_balance: newBalance })
      .eq('id', userId);

    // Log token usage
    await supabase
      .from('token_usage')
      .insert({
        user_id: userId,
        session_id,
        tokens_used: tokensPerMessage,
      });

    // T-015: Check if we need to create/update memory summary
    // Run asynchronously to not block response
    checkAndUpdateMemory(session_id).catch(err => {
      console.error('Error updating memory summary:', err);
    });

    // Update session timestamp
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', session_id);

    res.json({
      reply: aiResponse,
      tokenBalance: newBalance,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Chat send error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat history
router.get('/:sessionId/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId!;

    // Verify session ownership
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    res.json({ messages: messages || [] });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
