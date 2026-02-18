import { createClient } from '@supabase/supabase-js';

// ── Supabase ─────────────────────────────────────────────────
// In production, set these via environment variables.
// The service key should NEVER be the anon key — it must be the
// service_role key to bypass RLS for server operations.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wgdayvqaaufmwbafneek.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.warn(
    '⚠️  SUPABASE_SERVICE_KEY not set. Server-side DB operations that bypass RLS will fail.\n' +
    '   Set it via: SUPABASE_SERVICE_KEY=your_service_role_key npx ts-node index.ts'
  );
}

export { SUPABASE_URL, SUPABASE_SERVICE_KEY };

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || 'dummy-key-will-fail');

// ── Ollama ───────────────────────────────────────────────────
export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b';

// ── Elo ──────────────────────────────────────────────────────
export const DEFAULT_ELO = 1000;
export const ELO_MIN_FLOOR = 100;
export const ELO_MIN_CHANGE = 1;
export const ELO_UPSET_THRESHOLD = 200;
export const ELO_UPSET_MULTIPLIER = 1.2;
export const ELO_SEED_CAP_MAX = 1400;
export const ELO_SEED_COEFFICIENT = 0.4;

// K-factor tiers (chess.com-inspired)
export const ELO_K_PROVISIONAL = 40;   // first 15 games
export const ELO_K_DEVELOPING = 32;    // games 16–30
export const ELO_K_ESTABLISHED = 20;   // 30+ games
export const ELO_GAMES_PROVISIONAL = 15;
export const ELO_GAMES_ESTABLISHED = 30;

// Matchmaking ──────────────────────────────────────────────────
export const ELO_MATCH_RANGE_INITIAL = 100;
export const MATCHMAKING_TICK_MS = 3000;
export const MATCHMAKING_BOT_FALLBACK_MS = 60000;
export const MATCHMAKING_QUEUE_STATUS_INTERVAL_MS = 5000;

// Time (ms) -> max Elo range from player's rating
export const MATCHMAKING_RANGE_SCHEDULE: { afterMs: number; range: number }[] = [
  { afterMs: 0, range: 100 },
  { afterMs: 10000, range: 200 },
  { afterMs: 20000, range: 350 },
  { afterMs: 30000, range: 500 },
  { afterMs: 45000, range: Infinity },
];

// Bot difficulty by player Elo
export const BOT_ELO_EASY = 1200;   // < 1200 -> easy (50%)
export const BOT_ELO_MEDIUM = 1500; // 1200–1500 -> medium (65%); > 1500 -> hard (80%)
export const BOT_ACCURACY_EASY = 0.5;
export const BOT_ACCURACY_MEDIUM = 0.65;
export const BOT_ACCURACY_HARD = 0.8;

// ── Room codes ───────────────────────────────────────────────
export const ROOM_CODE_LENGTH = 6;
