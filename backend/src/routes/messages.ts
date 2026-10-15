import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { isBlocked } from './blocks';
import { emitNewMessage, emitNotification, emitMessageRead, isUserOnline } from '../services/socket';
import { sendNewMessageEmail } from '../services/email';

const router = express.Router();

// Rate limiting: max messages per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 10;
const userMessageCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userLimit = userMessageCounts.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    userMessageCounts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: MAX_MESSAGES_PER_WINDOW - 1 };
  }

  if (userLimit.count >= MAX_MESSAGES_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  userLimit.count++;
  return { allowed: true, remaining: MAX_MESSAGES_PER_WINDOW - userLimit.count };
}

// Helper function to get or create thread between two users
async function getOrCreateThread(userAId: string, userBId: string): Promise<string> {
  // Ensure consistent ordering (smaller ID first)
  const [userA, userB] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];

  // Check if thread exists
  const { data: existingThread, error: findError } = await supabase
    .from('dm_threads')
    .select('id')
    .eq('user_a_id', userA)
    .eq('user_b_id', userB)
    .maybeSingle();

  if (findError) {
    throw new Error('Failed to find thread');
  }

  if (existingThread) {
    return existingThread.id;
  }

  // Create new thread
  const { data: newThread, error: createError } = await supabase
    .from('dm_threads')
    .insert({
      user_a_id: userA,
      user_b_id: userB,
    })
    .select('id')
    .single();

  if (createError || !newThread) {
    throw new Error('Failed to create thread');
  }

  return newThread.id;
}

const sendMessageSchema = z.object({
  recipient_id: z.string().uuid('Invalid user ID'),
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
});

// Send a direct message (B-009)
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const validated = sendMessageSchema.parse(req.body);
    const { recipient_id, content } = validated;

    // Prevent self-messaging
    if (userId === recipient_id) {
      return res.status(400).json({ error: 'Cannot send message to yourself' });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please wait before sending more messages.',
        retryAfter: Math.ceil((userMessageCounts.get(userId)!.resetAt - Date.now()) / 1000)
      });
    }

    // Verify recipient exists
    const { data: recipient, error: recipientError } = await supabase
      .from('users')
      .select('id, privacy_settings')
      .eq('id', recipient_id)
      .single();

    if (recipientError || !recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check if recipient allows DMs
    if (recipient.privacy_settings && recipient.privacy_settings.allow_dms === false) {
      return res.status(403).json({ error: 'This user does not allow direct messages' });
    }

    // Check if either user has blocked the other
    if (await isBlocked(userId, recipient_id)) {
      return res.status(403).json({ error: 'Cannot send message to this user' });
    }

    // Get or create thread
    let threadId: string;
    try {
      threadId = await getOrCreateThread(userId, recipient_id);
    } catch (error: any) {
      console.error('Error getting/creating thread:', error);
      return res.status(500).json({ error: 'Failed to create message thread' });
    }

    // Create message
    const { data: message, error: messageError } = await supabase
      .from('dm_messages')
      .insert({
        thread_id: threadId,
        sender_id: userId,
        content: content.trim(),
        status: 'sent',
      })
      .select('id, thread_id, sender_id, content, created_at, status')
      .single();

    if (messageError || !message) {
      console.error('Error creating message:', messageError);
      return res.status(500).json({ error: 'Failed to send message' });
    }

    // Update thread's last_message_at
    await supabase
      .from('dm_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);

    // Get sender info for the message
    const { data: sender } = await supabase
      .from('users')
      .select('id, username, profile_picture_url')
      .eq('id', userId)
      .single();

    const messageData = {
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      content: message.content,
      createdAt: message.created_at,
      status: message.status,
      readAt: null,
      sender: sender ? {
        id: sender.id,
        username: sender.username,
        profilePictureUrl: sender.profile_picture_url,
      } : null,
    };

    // Emit real-time message to thread participants
    emitNewMessage(threadId, messageData);

    // Send notification to recipient if they're not in the thread
    emitNotification(recipient_id, {
      type: 'new_message',
      threadId,
      senderId: userId,
      senderUsername: sender?.username || null,
      messageId: message.id,
      content: message.content,
    });

    // Send email notification to recipient
    const { data: recipientData } = await supabase
      .from('users')
      .select('email, privacy_settings')
      .eq('id', recipient_id)
      .single();

    // Only send email if user allows email notifications (default to true if not set)
    const allowEmailNotifications = recipientData?.privacy_settings?.email_notifications !== false;
    
    if (recipientData?.email && allowEmailNotifications && sender?.username) {
      const messagePreview = message.content.length > 100 
        ? message.content.substring(0, 100) + '...'
        : message.content;
      
      await sendNewMessageEmail(
        recipientData.email,
        sender.username,
        messagePreview
      );
    }

    res.status(201).json({
      message: messageData
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all threads for current user (B-009)
router.get('/threads', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get all threads where user is either user_a or user_b
    const { data: threads, error } = await supabase
      .from('dm_threads')
      .select('id, user_a_id, user_b_id, created_at, last_message_at')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error fetching threads:', error);
      return res.status(500).json({ error: 'Failed to fetch threads' });
    }

    // Get the other user's info and last message for each thread
    const threadsWithDetails = await Promise.all(
      (threads || []).map(async (thread) => {
        const otherUserId = thread.user_a_id === userId ? thread.user_b_id : thread.user_a_id;

        // Get other user's info
        const { data: otherUser } = await supabase
          .from('users')
          .select('id, username, profile_picture_url')
          .eq('id', otherUserId)
          .single();

        // Get last message
        const { data: lastMessage } = await supabase
          .from('dm_messages')
          .select('id, sender_id, content, created_at')
          .eq('thread_id', thread.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Count unread messages (messages not from current user, not read)
        const { count: unreadCount } = await supabase
          .from('dm_messages')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', thread.id)
          .eq('sender_id', otherUserId)
          .is('read_at', null);

        return {
          id: thread.id,
          otherUser: {
            id: otherUser?.id || otherUserId,
            username: otherUser?.username || null,
            profilePictureUrl: otherUser?.profile_picture_url || null,
          },
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            senderId: lastMessage.sender_id,
            content: lastMessage.content,
            createdAt: lastMessage.created_at,
          } : null,
          unreadCount: unreadCount || 0,
          createdAt: thread.created_at,
          lastMessageAt: thread.last_message_at,
        };
      })
    );

    res.json({ threads: threadsWithDetails });
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get total unread message count (B-009)
router.get('/unread-count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get all threads for this user
    const { data: threads } = await supabase
      .from('dm_threads')
      .select('id, user_a_id, user_b_id')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

    if (!threads || threads.length === 0) {
      return res.json({ unreadCount: 0 });
    }

    // Count all unread messages across all threads
    let totalUnread = 0;
    for (const thread of threads) {
      const otherUserId = thread.user_a_id === userId ? thread.user_b_id : thread.user_a_id;
      
      const { count } = await supabase
        .from('dm_messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', thread.id)
        .eq('sender_id', otherUserId)
        .is('read_at', null);
      
      totalUnread += count || 0;
    }

    res.json({ unreadCount: totalUnread });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get or create thread with a specific user (B-009)
router.post('/threads/with/:userId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { userId: otherUserId } = req.params;

    // Prevent self-thread
    if (userId === otherUserId) {
      return res.status(400).json({ error: 'Cannot create thread with yourself' });
    }

    // Verify other user exists and allows DMs
    const { data: otherUser, error: userError } = await supabase
      .from('users')
      .select('id, username, profile_picture_url, privacy_settings')
      .eq('id', otherUserId)
      .single();

    if (userError || !otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if recipient allows DMs
    if (otherUser.privacy_settings && otherUser.privacy_settings.allow_dms === false) {
      return res.status(403).json({ error: 'This user does not allow direct messages' });
    }

    // Check if either user has blocked the other
    if (await isBlocked(userId, otherUserId)) {
      return res.status(403).json({ error: 'Cannot create thread with this user' });
    }

    // Get or create thread
    let threadId: string;
    try {
      threadId = await getOrCreateThread(userId, otherUserId);
    } catch (error: any) {
      console.error('Error getting/creating thread:', error);
      return res.status(500).json({ error: 'Failed to create message thread' });
    }

    // Get thread details
    const { data: thread, error: threadError } = await supabase
      .from('dm_threads')
      .select('id, user_a_id, user_b_id, created_at, last_message_at')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return res.status(500).json({ error: 'Failed to fetch thread' });
    }

    res.json({
      thread: {
        id: thread.id,
        otherUser: {
          id: otherUser.id,
          username: otherUser.username,
          profilePictureUrl: otherUser.profile_picture_url,
        },
        createdAt: thread.created_at,
        lastMessageAt: thread.last_message_at,
      }
    });
  } catch (error) {
    console.error('Get or create thread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get thread info (B-009)
router.get('/threads/:threadId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;

    // Get thread
    const { data: thread, error: threadError } = await supabase
      .from('dm_threads')
      .select('id, user_a_id, user_b_id, created_at, last_message_at')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.user_a_id !== userId && thread.user_b_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get other user's info
    const otherUserId = thread.user_a_id === userId ? thread.user_b_id : thread.user_a_id;
    const { data: otherUser } = await supabase
      .from('users')
      .select('id, username, profile_picture_url')
      .eq('id', otherUserId)
      .single();

    res.json({
      thread: {
        id: thread.id,
        otherUser: {
          id: otherUser?.id || otherUserId,
          username: otherUser?.username || null,
          profilePictureUrl: otherUser?.profile_picture_url || null,
        },
        createdAt: thread.created_at,
        lastMessageAt: thread.last_message_at,
      }
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a specific thread (B-009)
router.get('/threads/:threadId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;

    // Verify user is part of this thread
    const { data: thread, error: threadError } = await supabase
      .from('dm_threads')
      .select('user_a_id, user_b_id')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.user_a_id !== userId && thread.user_b_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from('dm_messages')
      .select('id, sender_id, content, created_at, status, read_at')
      .eq('thread_id', threadId)
      .eq('status', 'sent') // Only get non-deleted messages
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    // Mark messages as read (only messages from the other user)
    const otherUserId = thread.user_a_id === userId ? thread.user_b_id : thread.user_a_id;
    const unreadMessageIds = (messages || [])
      .filter(msg => msg.sender_id === otherUserId && !msg.read_at)
      .map(msg => msg.id);

    if (unreadMessageIds.length > 0) {
      await supabase
        .from('dm_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadMessageIds);

      // Emit read receipts for each message
      unreadMessageIds.forEach(messageId => {
        emitMessageRead(threadId, messageId, userId);
      });
    }

    res.json({ messages: messages || [] });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a message (B-009)
router.delete('/messages/:messageId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;

    // Verify user is the sender
    const { data: message, error: messageError } = await supabase
      .from('dm_messages')
      .select('id, sender_id, thread_id')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.sender_id !== userId) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }

    // Soft delete (mark as deleted)
    const { error: deleteError } = await supabase
      .from('dm_messages')
      .update({ status: 'deleted' })
      .eq('id', messageId);

    if (deleteError) {
      console.error('Error deleting message:', deleteError);
      return res.status(500).json({ error: 'Failed to delete message' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user is online
router.get('/users/:userId/online', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const online = isUserOnline(userId);
    res.json({ userId, online });
  } catch (error) {
    console.error('Check online status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
