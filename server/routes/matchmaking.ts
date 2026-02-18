import { Router } from 'express';
import { getQueueEntries } from '../services/matchmaking';

export const matchmakingRoutes = Router();

const GAME_TYPES = ['race', 'asteroid', 'match', 'wager'] as const;

// Get queue sizes per game type — public, for Quick Play game selection
matchmakingRoutes.get('/queue-sizes', (_req, res) => {
  const sizes: Record<string, number> = {};
  for (const gt of GAME_TYPES) {
    sizes[gt] = getQueueEntries(gt).length;
  }
  res.json(sizes);
});
