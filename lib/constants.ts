// Server URL - change this to your deployed server
export const SERVER_URL = __DEV__
  ? 'http://localhost:3001'
  : 'https://your-production-server.com';

// Supabase config
export const SUPABASE_URL = 'https://wgdayvqaaufmwbafneek.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZGF5dnFhYXVmbXdiYWZuZWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NzI1NjEsImV4cCI6MjA4NjQ0ODU2MX0.cQnf7TIybz7hgVEZvIDubSM02iEy7p_Njj4Hsbe0zuk';

// Game constants
export const DEFAULT_ELO = 1000;
export const ELO_K_PROVISIONAL = 40;
export const ELO_K_DEVELOPING = 32;
export const ELO_K_ESTABLISHED = 20;
export const ELO_GAMES_PROVISIONAL = 15;
export const ELO_GAMES_ESTABLISHED = 30;

// Matchmaking
export const MATCHMAKING_BOT_FALLBACK_MS = 60000;
export const MATCHMAKING_RANGE_SCHEDULE_MS = [0, 10000, 20000, 30000, 45000] as const;

// Game-specific
export const TRANSLATION_RACE_TIME_LIMIT = 90; // seconds
export const ASTEROID_GAME_DURATION = 60; // seconds
export const MEMORY_MATCH_GRID_SIZE = 4; // 4x4 grid
export const WAGER_ROUNDS = 5;

// Room codes
export const ROOM_CODE_LENGTH = 6;
