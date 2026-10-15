import express from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

const reportSchema = z.object({
  target_type: z.enum(['user', 'character', 'message']),
  target_id: z.string().uuid('Invalid target ID'),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long'),
  additional_details: z.string().max(1000, 'Additional details too long').optional(),
});

// Submit a report (F-007)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const validated = reportSchema.parse(req.body);
    const { target_type, target_id, reason, additional_details } = validated;

    // Verify target exists based on type
    let targetExists = false;
    if (target_type === 'user') {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('id', target_id)
        .maybeSingle();
      targetExists = !!data;
    } else if (target_type === 'character') {
      // Check both template and community characters
      const { data: template } = await supabase
        .from('character_templates')
        .select('id')
        .eq('id', target_id)
        .maybeSingle();
      
      const { data: community } = await supabase
        .from('community_characters')
        .select('id')
        .eq('id', target_id)
        .maybeSingle();
      
      targetExists = !!(template || community);
    } else if (target_type === 'message') {
      const { data } = await supabase
        .from('dm_messages')
        .select('id')
        .eq('id', target_id)
        .maybeSingle();
      targetExists = !!data;
    }

    if (!targetExists) {
      return res.status(404).json({ error: 'Target not found' });
    }

    // Prevent self-reporting
    if (target_type === 'user' && userId === target_id) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }

    // Check if user already reported this target (optional - you might want to allow multiple reports)
    // For now, we'll allow multiple reports but admins can see duplicates

    // Create report
    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        reporter_user_id: userId,
        target_type,
        target_id,
        reason: reason.trim(),
        additional_details: additional_details?.trim() || null,
        status: 'open',
      })
      .select('id, target_type, target_id, reason, status, created_at')
      .single();

    if (error) {
      console.error('Error creating report:', error);
      return res.status(500).json({ error: 'Failed to submit report' });
    }

    res.status(201).json({
      message: 'Report submitted successfully',
      report,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Submit report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all reports for moderation (admin only)
router.get('/moderation', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { status, target_type } = req.query;

    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    let query = supabase
      .from('reports')
      .select(`
        id,
        reporter_user_id,
        target_type,
        target_id,
        reason,
        additional_details,
        status,
        created_at,
        reviewed_at,
        reviewed_by,
        resolution_notes,
        users!reports_reporter_user_id_fkey(id, username, email)
      `);

    // Filter by status if provided
    if (status && typeof status === 'string') {
      if (status === 'active') {
        query = query.in('status', ['open', 'reviewing']);
      } else {
        query = query.eq('status', status);
      }
    }

    // Filter by target type if provided
    if (target_type && typeof target_type === 'string') {
      query = query.eq('target_type', target_type);
    }

    const { data: reports, error } = await query
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reports:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    // Get target details for each report
    const reportsWithDetails = await Promise.all(
      (reports || []).map(async (report: any) => {
        let targetDetails: any = null;

        try {
          if (report.target_type === 'user') {
            const { data } = await supabase
              .from('users')
              .select('id, username, email, profile_picture_url')
              .eq('id', report.target_id)
              .single();
            targetDetails = data;
          } else if (report.target_type === 'character') {
            // Try template first
            const { data: template } = await supabase
              .from('character_templates')
              .select('id, name, image_url')
              .eq('id', report.target_id)
              .maybeSingle();
            
            if (template) {
              targetDetails = template;
            } else {
              // Try community character
              const { data: community } = await supabase
                .from('community_characters')
                .select('id, name, image_url, status')
                .eq('id', report.target_id)
                .maybeSingle();
              targetDetails = community;
            }
          } else if (report.target_type === 'message') {
            const { data } = await supabase
              .from('dm_messages')
              .select('id, content, sender_id, created_at')
              .eq('id', report.target_id)
              .single();
            targetDetails = data;
          }
        } catch (err) {
          console.error('Error fetching target details:', err);
        }

        return {
          ...report,
          users: (report as any).reporter || (report as any).users || null,
          targetDetails,
        };
      })
    );

    res.json({ reports: reportsWithDetails });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get report statistics (admin only)
router.get('/moderation/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { count: openCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    const { count: reviewingCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'reviewing');

    const { count: resolvedCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');

    const { count: dismissedCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'dismissed');

    res.json({
      stats: {
        open: openCount || 0,
        reviewing: reviewingCount || 0,
        resolved: resolvedCount || 0,
        dismissed: dismissedCount || 0,
        total: (openCount || 0) + (reviewingCount || 0) + (resolvedCount || 0) + (dismissedCount || 0),
      }
    });
  } catch (error) {
    console.error('Get report stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update report status (admin only)
router.patch('/:reportId/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;
    const { status, resolution_notes } = req.body;

    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData: any = {
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    };

    if (resolution_notes) {
      updateData.resolution_notes = resolution_notes.trim();
    }

    const { data: report, error } = await supabase
      .from('reports')
      .update(updateData)
      .eq('id', reportId)
      .select()
      .single();

    if (error) {
      console.error('Error updating report:', error);
      return res.status(500).json({ error: 'Failed to update report' });
    }

    res.json({ report });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Take action on reported content (admin only)
router.post('/:reportId/action', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;
    const { action, notes } = req.body;

    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (userError || !user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get report details
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    let actionTaken = false;
    let actionMessage = '';

    // Perform action based on target type
    if (action === 'ban_user' && report.target_type === 'user') {
      // Ban the user (you might want to add a banned field to users table)
      // For now, we'll just mark the report as resolved
      actionTaken = true;
      actionMessage = 'User action taken';
    } else if (action === 'remove_character' && report.target_type === 'character') {
      // Remove/reject the character
      const { error: charError } = await supabase
        .from('community_characters')
        .update({ status: 'rejected', moderation_reason: notes || 'Removed due to report' })
        .eq('id', report.target_id);
      
      if (!charError) {
        actionTaken = true;
        actionMessage = 'Character removed';
      }
    } else if (action === 'delete_message' && report.target_type === 'message') {
      // Delete the message
      const { error: msgError } = await supabase
        .from('dm_messages')
        .update({ status: 'deleted' })
        .eq('id', report.target_id);
      
      if (!msgError) {
        actionTaken = true;
        actionMessage = 'Message deleted';
      }
    } else if (action === 'no_action') {
      actionTaken = true;
      actionMessage = 'No action needed';
    }

    if (actionTaken) {
      // Update report status
      await supabase
        .from('reports')
        .update({
          status: 'resolved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          resolution_notes: notes || actionMessage,
        })
        .eq('id', reportId);
    }

    res.json({
      success: actionTaken,
      message: actionTaken ? actionMessage : 'Action not applicable',
    });
  } catch (error) {
    console.error('Take action on report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
