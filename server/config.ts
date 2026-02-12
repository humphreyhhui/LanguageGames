import { createClient } from '@supabase/supabase-js';

// Supabase
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wgdayvqaaufmwbafneek.supabase.co';
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZGF5dnFhYXVmbXdiYWZuZWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NzI1NjEsImV4cCI6MjA4NjQ0ODU2MX0.cQnf7TIybz7hgVEZvIDubSM02iEy7p_Njj4Hsbe0zuk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Ollama config
export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b';

// Elo config
export const DEFAULT_ELO = 1000;
export const ELO_K_FACTOR_NEW = 32;
export const ELO_K_FACTOR_ESTABLISHED = 16;
export const GAMES_UNTIL_ESTABLISHED = 30;
export const ELO_MATCH_RANGE = 200;

// Room codes
export const ROOM_CODE_LENGTH = 6;
