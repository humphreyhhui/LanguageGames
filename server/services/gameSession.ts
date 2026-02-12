import { supabase } from '../config';
import { updateEloAfterGame, checkGameCountBadges, checkStreakBadges } from './elo';

// ============================================
// Save Game Session
// ============================================

export async function saveGameSession(params: {
  gameType: string;
  mode: string;
  player1Id: string;
  player2Id: string | null;
  player1Score: number;
  player2Score: number;
  durationMs: number;
  pairSetId?: string;
}): Promise<{
  sessionId: string;
  eloResult?: {
    player1NewElo: number;
    player2NewElo: number;
    player1Change: number;
    player2Change: number;
  };
}> {
  const winnerId =
    params.player1Score > params.player2Score
      ? params.player1Id
      : params.player2Score > params.player1Score
        ? params.player2Id
        : null;

  // Insert game session
  const { data: session, error } = await supabase
    .from('game_sessions')
    .insert({
      game_type: params.gameType,
      mode: params.mode,
      player1_id: params.player1Id,
      player2_id: params.player2Id,
      player1_score: params.player1Score,
      player2_score: params.player2Score,
      winner_id: winnerId,
      duration_ms: params.durationMs,
      pair_set_id: params.pairSetId || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Update user stats for both players
  await updateUserStats(params.player1Id, params.gameType, params.player1Score, winnerId === params.player1Id, params.durationMs);
  if (params.player2Id) {
    await updateUserStats(params.player2Id, params.gameType, params.player2Score, winnerId === params.player2Id, params.durationMs);
  }

  // Check game count badges
  await checkGameCountBadges(params.player1Id);
  if (params.player2Id) {
    await checkGameCountBadges(params.player2Id);
  }

  // Update Elo only for ranked games with two players
  let eloResult;
  if (params.mode === 'ranked' && params.player2Id) {
    eloResult = await updateEloAfterGame(
      params.player1Id,
      params.player2Id,
      params.gameType,
      winnerId
    );
  }

  return {
    sessionId: session.id,
    eloResult,
  };
}

// ============================================
// Update User Stats
// ============================================

async function updateUserStats(
  userId: string,
  gameType: string,
  score: number,
  won: boolean,
  durationMs: number
): Promise<void> {
  // Get current stats
  const { data: existing } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('game_type', gameType)
    .single();

  if (existing) {
    const newGamesPlayed = existing.games_played + 1;
    const newWins = existing.wins + (won ? 1 : 0);
    const newLosses = existing.losses + (won ? 0 : 1);
    const newAvgTime = Math.round(
      (existing.avg_time_ms * existing.games_played + durationMs) / newGamesPlayed
    );
    const newBestScore = Math.max(existing.best_score, score);
    const newStreak = won ? existing.current_streak + 1 : 0;

    await supabase
      .from('user_stats')
      .update({
        games_played: newGamesPlayed,
        wins: newWins,
        losses: newLosses,
        avg_time_ms: newAvgTime,
        best_score: newBestScore,
        current_streak: newStreak,
      })
      .eq('user_id', userId)
      .eq('game_type', gameType);

    // Check streak badges
    if (newStreak > 0) {
      await checkStreakBadges(userId, newStreak);
    }
  } else {
    await supabase.from('user_stats').insert({
      user_id: userId,
      game_type: gameType,
      games_played: 1,
      wins: won ? 1 : 0,
      losses: won ? 0 : 1,
      avg_time_ms: durationMs,
      best_score: score,
      current_streak: won ? 1 : 0,
    });
  }
}
