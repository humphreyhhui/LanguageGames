import { supabase } from '../config';
import {
  DEFAULT_ELO,
  ELO_K_FACTOR_NEW,
  ELO_K_FACTOR_ESTABLISHED,
  GAMES_UNTIL_ESTABLISHED,
} from '../config';

// ============================================
// Elo Calculation
// ============================================

export function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  result: 0 | 0.5 | 1, // loss, draw, win
  kFactor: number
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(playerElo + kFactor * (result - expected));
}

function getKFactor(gamesPlayed: number): number {
  return gamesPlayed < GAMES_UNTIL_ESTABLISHED
    ? ELO_K_FACTOR_NEW
    : ELO_K_FACTOR_ESTABLISHED;
}

// ============================================
// Update Elo after a game
// ============================================

export async function updateEloAfterGame(
  player1Id: string,
  player2Id: string,
  gameType: string,
  winnerId: string | null // null = draw
): Promise<{ player1NewElo: number; player2NewElo: number; player1Change: number; player2Change: number }> {
  // Fetch current elo ratings
  const { data: ratings } = await supabase
    .from('elo_ratings')
    .select('*')
    .in('user_id', [player1Id, player2Id])
    .eq('game_type', gameType);

  const p1Rating = ratings?.find((r) => r.user_id === player1Id);
  const p2Rating = ratings?.find((r) => r.user_id === player2Id);

  const p1Elo = p1Rating?.elo ?? DEFAULT_ELO;
  const p2Elo = p2Rating?.elo ?? DEFAULT_ELO;

  // Get games played for K-factor
  const { count: p1Games } = await supabase
    .from('game_sessions')
    .select('*', { count: 'exact', head: true })
    .or(`player1_id.eq.${player1Id},player2_id.eq.${player1Id}`)
    .eq('game_type', gameType);

  const { count: p2Games } = await supabase
    .from('game_sessions')
    .select('*', { count: 'exact', head: true })
    .or(`player1_id.eq.${player2Id},player2_id.eq.${player2Id}`)
    .eq('game_type', gameType);

  const p1K = getKFactor(p1Games ?? 0);
  const p2K = getKFactor(p2Games ?? 0);

  // Determine results
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

  // Update database
  await supabase
    .from('elo_ratings')
    .upsert({
      user_id: player1Id,
      game_type: gameType,
      elo: p1NewElo,
      peak_elo: Math.max(p1NewElo, p1Rating?.peak_elo ?? DEFAULT_ELO),
    }, { onConflict: 'user_id,game_type' });

  await supabase
    .from('elo_ratings')
    .upsert({
      user_id: player2Id,
      game_type: gameType,
      elo: p2NewElo,
      peak_elo: Math.max(p2NewElo, p2Rating?.peak_elo ?? DEFAULT_ELO),
    }, { onConflict: 'user_id,game_type' });

  // Check for badge eligibility
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
  // Get all elo_threshold badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('criteria_type', 'elo_threshold')
    .lte('criteria_value', newElo);

  if (!badges) return;

  for (const badge of badges) {
    // Check if badge is game-specific and matches
    if (badge.game_type && badge.game_type !== gameType) continue;

    // Check if user already has badge
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
  // Get total games played
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
