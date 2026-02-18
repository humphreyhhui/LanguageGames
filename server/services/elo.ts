import { supabase } from '../config';
import {
  DEFAULT_ELO,
  ELO_MIN_FLOOR,
  ELO_MIN_CHANGE,
  ELO_UPSET_THRESHOLD,
  ELO_UPSET_MULTIPLIER,
  ELO_SEED_CAP_MAX,
  ELO_SEED_COEFFICIENT,
  ELO_K_PROVISIONAL,
  ELO_K_DEVELOPING,
  ELO_K_ESTABLISHED,
  ELO_GAMES_PROVISIONAL,
  ELO_GAMES_ESTABLISHED,
} from '../config';

const GAME_TYPES = ['asteroid', 'race', 'match', 'wager'] as const;

// ============================================
// K-Factor (chess.com-inspired tiers)
// ============================================

export function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < ELO_GAMES_PROVISIONAL) return ELO_K_PROVISIONAL;
  if (gamesPlayed < ELO_GAMES_ESTABLISHED) return ELO_K_DEVELOPING;
  return ELO_K_ESTABLISHED;
}

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < ELO_GAMES_PROVISIONAL;
}

// ============================================
// Cross-Game Elo Seeding
// ============================================

export async function getSeededStartingElo(userId: string, gameType: string): Promise<number> {
  const { data: otherRatings } = await supabase
    .from('elo_ratings')
    .select('elo, games_played')
    .eq('user_id', userId)
    .neq('game_type', gameType);

  if (!otherRatings || otherRatings.length === 0) return DEFAULT_ELO;

  const established = otherRatings.filter((r) => (r.games_played ?? 0) >= ELO_GAMES_ESTABLISHED);
  const highestFromEstablished = established.length > 0
    ? Math.max(...established.map((r) => r.elo))
    : 0;

  if (highestFromEstablished <= DEFAULT_ELO) return DEFAULT_ELO;

  const seedElo = DEFAULT_ELO + (highestFromEstablished - DEFAULT_ELO) * ELO_SEED_COEFFICIENT;
  return Math.round(Math.min(ELO_SEED_CAP_MAX, Math.max(DEFAULT_ELO, seedElo)));
}

// ============================================
// Elo Calculation
// ============================================

export function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  result: 0 | 0.5 | 1,
  kFactor: number
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  let change = kFactor * (result - expected);

  const eloDiff = opponentElo - playerElo;
  if (result === 1 && eloDiff >= ELO_UPSET_THRESHOLD) {
    change *= ELO_UPSET_MULTIPLIER;
  } else if (result === 0 && eloDiff <= -ELO_UPSET_THRESHOLD) {
    change *= ELO_UPSET_MULTIPLIER;
  }

  const rounded = Math.round(change);
  const clampedChange = Math.max(ELO_MIN_CHANGE, Math.abs(rounded)) * (rounded >= 0 ? 1 : -1);
  const newElo = playerElo + clampedChange;
  return Math.max(ELO_MIN_FLOOR, newElo);
}

// ============================================
// Games played helper
// ============================================

async function getGamesPlayed(userId: string, gameType: string): Promise<number> {
  const { data: row } = await supabase
    .from('elo_ratings')
    .select('games_played')
    .eq('user_id', userId)
    .eq('game_type', gameType)
    .single();

  if (row?.games_played != null) return row.games_played;

  const { count } = await supabase
    .from('game_sessions')
    .select('*', { count: 'exact', head: true })
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .eq('game_type', gameType);

  return count ?? 0;
}

// ============================================
// Ensure Elo row exists (with seeding for new game types)
// ============================================

async function ensureEloRow(userId: string, gameType: string): Promise<{ elo: number; games_played: number; peak_elo: number } | null> {
  const { data: existing } = await supabase
    .from('elo_ratings')
    .select('elo, games_played, peak_elo')
    .eq('user_id', userId)
    .eq('game_type', gameType)
    .single();

  if (existing) return existing;

  const seededElo = await getSeededStartingElo(userId, gameType);
  await supabase.from('elo_ratings').insert({
    user_id: userId,
    game_type: gameType,
    elo: seededElo,
    peak_elo: seededElo,
    games_played: 0,
  });

  return { elo: seededElo, games_played: 0, peak_elo: seededElo };
}

// ============================================
// Update Elo after a game
// ============================================

export async function updateEloAfterGame(
  player1Id: string,
  player2Id: string,
  gameType: string,
  winnerId: string | null
): Promise<{ player1NewElo: number; player2NewElo: number; player1Change: number; player2Change: number }> {
  await Promise.all([
    ensureEloRow(player1Id, gameType),
    ensureEloRow(player2Id, gameType),
  ]);

  const { data: ratings } = await supabase
    .from('elo_ratings')
    .select('*')
    .in('user_id', [player1Id, player2Id])
    .eq('game_type', gameType);

  const p1Rating = ratings?.find((r: any) => r.user_id === player1Id);
  const p2Rating = ratings?.find((r: any) => r.user_id === player2Id);

  const p1Elo = p1Rating?.elo ?? DEFAULT_ELO;
  const p2Elo = p2Rating?.elo ?? DEFAULT_ELO;

  const p1Games = await getGamesPlayed(player1Id, gameType);
  const p2Games = await getGamesPlayed(player2Id, gameType);

  const p1K = getKFactor(p1Games);
  const p2K = getKFactor(p2Games);

  let p1Result: 0 | 0.5 | 1;
  let p2Result: 0 | 0.5 | 1;

  if (winnerId === null) {
    p1Result = 0.5;
    p2Result = 0.5;
  } else if (winnerId === player1Id) {
    p1Result = 1;
    p2Result = 0;
  } else {
    p1Result = 0;
    p2Result = 1;
  }

  const p1NewElo = calculateNewElo(p1Elo, p2Elo, p1Result, p1K);
  const p2NewElo = calculateNewElo(p2Elo, p1Elo, p2Result, p2K);

  const p1GamesAfter = p1Games + 1;
  const p2GamesAfter = p2Games + 1;

  await supabase
    .from('elo_ratings')
    .upsert({
      user_id: player1Id,
      game_type: gameType,
      elo: p1NewElo,
      peak_elo: Math.max(p1NewElo, p1Rating?.peak_elo ?? DEFAULT_ELO),
      games_played: p1GamesAfter,
    }, { onConflict: 'user_id,game_type' });

  await supabase
    .from('elo_ratings')
    .upsert({
      user_id: player2Id,
      game_type: gameType,
      elo: p2NewElo,
      peak_elo: Math.max(p2NewElo, p2Rating?.peak_elo ?? DEFAULT_ELO),
      games_played: p2GamesAfter,
    }, { onConflict: 'user_id,game_type' });

  await checkEloBasedBadges(player1Id, gameType, p1NewElo);
  await checkEloBasedBadges(player2Id, gameType, p2NewElo);

  return {
    player1NewElo: p1NewElo,
    player2NewElo: p2NewElo,
    player1Change: p1NewElo - p1Elo,
    player2Change: p2NewElo - p2Elo,
  };
}

// ============================================
// Badge Checks
// ============================================

async function checkEloBasedBadges(userId: string, gameType: string, newElo: number): Promise<void> {
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('criteria_type', 'elo_threshold')
    .lte('criteria_value', newElo);

  if (!badges) return;

  for (const badge of badges) {
    if (badge.game_type && badge.game_type !== gameType) continue;

    const { data: existing } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single();

    if (!existing) {
      await supabase.from('user_badges').insert({
        user_id: userId,
        badge_id: badge.id,
      });
    }
  }
}

export async function checkGameCountBadges(userId: string): Promise<void> {
  const { count } = await supabase
    .from('game_sessions')
    .select('*', { count: 'exact', head: true })
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

  const gamesPlayed = count ?? 0;

  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('criteria_type', 'games_played')
    .lte('criteria_value', gamesPlayed);

  if (!badges) return;

  for (const badge of badges) {
    const { data: existing } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single();

    if (!existing) {
      await supabase.from('user_badges').insert({
        user_id: userId,
        badge_id: badge.id,
      });
    }
  }
}

export async function checkStreakBadges(userId: string, currentStreak: number): Promise<void> {
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('criteria_type', 'win_streak')
    .lte('criteria_value', currentStreak);

  if (!badges) return;

  for (const badge of badges) {
    const { data: existing } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single();

    if (!existing) {
      await supabase.from('user_badges').insert({
        user_id: userId,
        badge_id: badge.id,
      });
    }
  }
}
