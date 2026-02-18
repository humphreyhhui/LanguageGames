import type { EloRating, GameType } from '../types';

const GAME_TYPES: GameType[] = ['race', 'asteroid', 'match', 'wager'];

function pickLowestEloAmong(ratings: EloRating[], gameTypes: GameType[]): GameType | null {
  const byGame: Record<string, number> = {};
  for (const gt of gameTypes) {
    byGame[gt] = ratings.find((r) => r.game_type === gt)?.elo ?? 1000;
  }
  const lowest = Math.min(...Object.values(byGame));
  const found = gameTypes.find((gt) => byGame[gt] === lowest);
  return found ?? null;
}

export function pickQuickPlayGame(
  eloRatings: EloRating[],
  queueSizes?: Record<string, number>
): GameType {
  if (queueSizes) {
    const maxQueue = Math.max(...GAME_TYPES.map((gt) => queueSizes[gt] ?? 0));
    if (maxQueue > 0) {
      const candidates = GAME_TYPES.filter((gt) => (queueSizes[gt] ?? 0) === maxQueue);
      const picked = pickLowestEloAmong(eloRatings, candidates);
      if (picked) return picked;
    }
  }
  return pickLowestEloAmong(eloRatings, GAME_TYPES) ?? 'race';
}
