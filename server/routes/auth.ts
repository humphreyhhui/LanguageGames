import { Router } from 'express';
import { supabase } from '../config';
import { requireAuth, AuthenticatedRequest } from '../middleware/security';

export const authRoutes = Router();

// Verify token and get user profile — requires valid JWT
authRoutes.get('/me', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, native_language, learning_language, badge_frame, created_at')
    .eq('id', req.userId)
    .single();

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  res.json({ user: profile });
});
