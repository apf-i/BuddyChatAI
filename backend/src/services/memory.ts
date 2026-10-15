import { supabase } from '../db/supabase';
import { sendToOpenRouter } from './openrouter';

const MEMORY_SUMMARY_INTERVAL = 10; // Create summary every N messages

/**
 * T-015: Memory Summary Builder
 * Creates or updates a memory summary for a chat session
 */
export async function updateMemorySummary(sessionId: string): Promise<void> {
  try {
    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error('Session not found for memory summary:', sessionId);
      return;
    }

    // Get all messages for this session
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError || !messages || messages.length === 0) {
      console.error('No messages found for memory summary');
      return;
    }

    // Get character info for context
    let characterName = 'the character';
    if (session.character_type === 'template') {
      const { data: template } = await supabase
        .from('character_templates')
        .select('name')
        .eq('id', session.character_id)
        .single();
      characterName = template?.name || characterName;
    } else {
      const { data: userChar } = await supabase
        .from('user_characters')
        .select('name')
        .eq('id', session.character_id)
        .single();
      characterName = userChar?.name || characterName;
    }

    // Build summary prompt
    const existingSummary = session.memory_summary || '';
    const conversationText = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const summaryPrompt = `You are summarizing a conversation between a user and ${characterName}.

${existingSummary ? `Previous summary: ${existingSummary}\n\n` : ''}Recent conversation:
${conversationText}

Create a concise summary (2-3 sentences) of the key topics, interests, and relationship dynamics discussed. Focus on what's important for maintaining continuity in future conversations. If there's a previous summary, update it to include new information.`;

    // Generate summary using OpenRouter
    try {
      const result = await sendToOpenRouter([
        { role: 'system', content: 'You are a helpful assistant that creates concise conversation summaries.' },
        { role: 'user', content: summaryPrompt },
      ]);

      const newSummary = result.content.trim();

      // Update session with new summary
      await supabase
        .from('chat_sessions')
        .update({ memory_summary: newSummary })
        .eq('id', sessionId);

      console.log(`Memory summary updated for session ${sessionId}`);
    } catch (error) {
      console.error('Error generating memory summary:', error);
      // Don't throw - memory summary is not critical
    }
  } catch (error) {
    console.error('Error in updateMemorySummary:', error);
  }
}

/**
 * Check if a session needs a memory summary update
 */
export async function checkAndUpdateMemory(sessionId: string): Promise<void> {
  try {
    // Count messages
    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (error || !count) {
      return;
    }

    // Update summary every N messages
    if (count > 0 && count % MEMORY_SUMMARY_INTERVAL === 0) {
      await updateMemorySummary(sessionId);
    }
  } catch (error) {
    console.error('Error checking memory:', error);
  }
}
