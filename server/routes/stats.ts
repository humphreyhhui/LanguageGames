import { Router } from 'express';
import { supabase } from '../config';

export const statsRoutes = Router();

// Get user stats
statsRoutes.get('/:userId', async (req, res) => {
  const { data: stats, error: statsError } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', req.params.userId);

  if (statsError) return res.status(500).json({ error: statsError.message });

  const { data: elo, error: eloError } = await supabase
    .from('elo_ratings')
    .select('*')
    .eq('user_id', req.params.userId);

  if (eloError) return res.status(500).json({ error: eloError.message });

  const { data: badges } = await supabase
    .from('user_badges')
    .select('*, badge:badges(*)')
    .eq('user_id', req.params.userId);

  res.json({ stats, elo, badges });
});

// Get leaderboard for a game type
statsRoutes.get('/leaderboard/:gameType', async (req, res) => {
  const { data, error } = await supabase
    .from('elo_ratings')
    .select('*, profiles(username, avatar_url)')
    .eq('game_type', req.params.gameType)
    .order('elo', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ leaderboard: data });
});

// Get recent game history for a user
statsRoutes.get('/:userId/history', async (req, res) => {
  const userId = req.params.userId;
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data });
});
