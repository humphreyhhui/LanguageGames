import { Router } from 'express';
import { supabase } from '../config';
import {
  requireAuth,
  optionalAuth,
  isValidUUID,
  validateGameType,
  AuthenticatedRequest,
} from '../middleware/security';

export const statsRoutes = Router();

// Get user stats — require auth, users can only view their own full stats
statsRoutes.get('/:userId', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.params.userId;

  if (!isValidUUID(userId)) {
    return res.status(400).json({ error: 'Invalid user ID format' });
  }

  // Users can only view their own detailed stats
  if (userId !== req.userId) {
    return res.status(403).json({ error: 'You can only view your own stats' });
  }

  const { data: stats, error: statsError } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId);

  if (statsError) return res.status(500).json({ error: 'Failed to fetch stats' });

  const { data: elo, error: eloError } = await supabase
    .from('elo_ratings')
    .select('*')
    .eq('user_id', userId);

  if (eloError) return res.status(500).json({ error: 'Failed to fetch elo' });

  const { data: badges } = await supabase
    .from('user_badges')
    .select('*, badge:badges(*)')
    .eq('user_id', userId);

  res.json({ stats, elo, badges });
});

// Get leaderboard for a game type — public but limited data
statsRoutes.get('/leaderboard/:gameType', async (req, res) => {
  const gameType = validateGameType(req.params.gameType);

  if (!gameType) {
    return res.status(400).json({ error: 'Invalid game type' });
  }

  const { data, error } = await supabase
    .from('elo_ratings')
    .select('elo, game_type, profiles(username)')
    .eq('game_type', gameType)
    .order('elo', { ascending: false })
    .limit(50); // Reduced from 100

  if (error) return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  res.json({ leaderboard: data });
});

// Get recent game history — auth required, own history only
statsRoutes.get('/:userId/history', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.params.userId;

  if (!isValidUUID(userId)) {
    return res.status(400).json({ error: 'Invalid user ID format' });
  }

  // Users can only view their own history
  if (userId !== req.userId) {
    return res.status(403).json({ error: 'You can only view your own game history' });
  }

  const { data, error } = await supabase
    .from('game_sessions')
    .select('id, game_type, mode, player1_score, player2_score, winner_id, duration_ms, created_at')
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: 'Failed to fetch history' });
  res.json({ history: data });
});
