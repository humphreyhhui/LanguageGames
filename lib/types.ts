// ============================================
// Database / Domain Types
// ============================================

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  native_language: string;
  learning_language: string;
  badge_frame: string | null;
  created_at: string;
}

export type GameType = 'asteroid' | 'race' | 'match' | 'wager';

export type GameMode = 'ranked' | 'unranked' | 'friend';

export interface EloRating {
  user_id: string;
  game_type: GameType;
  elo: number;
  peak_elo: number;
}

export interface GameSession {
  id: string;
  game_type: GameType;
  mode: GameMode;
  player1_id: string;
  player2_id: string | null;
  player1_score: number;
  player2_score: number;
  winner_id: string | null;
  duration_ms: number;
  pair_set_id: string | null;
  created_at: string;
}

export interface UserStats {
  user_id: string;
  game_type: GameType;
  games_played: number;
  wins: number;
  losses: number;
  avg_time_ms: number;
  best_score: number;
  current_streak: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  criteria_type: 'elo_threshold' | 'games_played' | 'win_streak';
  criteria_value: number;
  game_type: GameType | null;
}

export interface UserBadge {
  user_id: string;
  badge_id: string;
  earned_at: string;
  badge?: Badge;
}

export interface CustomPairSet {
  id: string;
  user_id: string;
  name: string;
  language_from: string;
  language_to: string;
  is_public: boolean;
  pairs: TranslationPair[];
  created_at: string;
}

export interface Friend {
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

// ============================================
// Game / LLM Types
// ============================================

export interface TranslationPair {
  source: string;
  target: string;
  distractors?: string[];
}

export type Difficulty = 'easy' | 'medium' | 'hard';

// ============================================
// Elo / Ranking Types
// ============================================

export type EloTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export const ELO_TIERS: Record<EloTier, { min: number; label: string; color: string }> = {
  bronze: { min: 1200, label: 'Bronze', color: '#CD7F32' },
  silver: { min: 1400, label: 'Silver', color: '#C0C0C0' },
  gold: { min: 1600, label: 'Gold', color: '#FFD700' },
  diamond: { min: 1800, label: 'Diamond', color: '#B9F2FF' },
};

export function getEloTier(elo: number): EloTier | null {
  if (elo >= 1800) return 'diamond';
  if (elo >= 1600) return 'gold';
  if (elo >= 1400) return 'silver';
  if (elo >= 1200) return 'bronze';
  return null;
}

// ============================================
// Socket Event Types
// ============================================

export interface SocketEvents {
  // Client -> Server
  joinQueue: { gameType: GameType; elo: number };
  joinRoom: { roomCode: string };
  createRoom: { gameType: GameType };
  submitAnswer: { roomId: string; answer: string; questionIndex: number };
  leaveGame: { roomId: string };

  // Server -> Client
  matchFound: { roomId: string; pairs: TranslationPair[]; opponent: { username: string; elo: number } };
  roomCreated: { roomCode: string };
  scoreUpdate: { player1Score: number; player2Score: number };
  gameResult: {
    winner: string | null;
    player1Score: number;
    player2Score: number;
    eloChange: number;
    newElo: number;
  };
  opponentJoined: { username: string; elo: number };
  error: { message: string };
}

// ============================================
// Navigation Types
// ============================================

export const GAME_INFO: Record<GameType, { title: string; description: string; icon: string }> = {
  asteroid: {
    title: 'Asteroid Shooter',
    description: 'Shoot the correct translation!',
    icon: '🚀',
  },
  race: {
    title: 'Translation Race',
    description: 'Translate as fast as you can!',
    icon: '⚡',
  },
  match: {
    title: 'Memory Match',
    description: 'Find the translation pairs!',
    icon: '🧠',
  },
  wager: {
    title: 'Wager Mode',
    description: 'Bet on your skills!',
    icon: '🎲',
  },
};

// ============================================
// Language Options
// ============================================

export const LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
};
