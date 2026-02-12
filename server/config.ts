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
export const ELO_K_FACTOR_NEW = 32;
export const ELO_K_FACTOR_ESTABLISHED = 16;
export const GAMES_UNTIL_ESTABLISHED = 30;
export const ELO_MATCH_RANGE = 200;

// ── Room codes ───────────────────────────────────────────────
export const ROOM_CODE_LENGTH = 6;
