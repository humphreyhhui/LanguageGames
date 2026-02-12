import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config';

// ============================================
// Allowed values (whitelist-only approach)
// ============================================

const ALLOWED_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko',
  'zh', 'ar', 'hi', 'tr', 'pl', 'sv', 'da', 'no', 'fi', 'el',
  'he', 'th', 'vi', 'id', 'ms', 'ro', 'cs', 'hu', 'uk', 'bg',
]);

const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

const ALLOWED_GAME_TYPES = new Set(['asteroid', 'race', 'match', 'wager']);

// ============================================
// Text Sanitizer — strips anything dangerous
// ============================================

/**
 * Sanitize user-provided text:
 * - Trim whitespace
 * - Enforce max length
 * - Strip control characters (keep newlines/tabs for pair descriptions)
 * - Strip HTML/script tags
 * - Strip prompt injection patterns
 * - Strip null bytes
 */
export function sanitizeText(input: unknown, maxLength: number = 200): string {
  if (typeof input !== 'string') return '';

  let text = input
    .trim()
    .slice(0, maxLength)
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newline and tab
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip common prompt injection patterns
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, '[filtered]')
    .replace(/you\s+are\s+now\s+/gi, '[filtered]')
    .replace(/system\s*:\s*/gi, '[filtered]')
    .replace(/\bpretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/\bact\s+as\s+/gi, '[filtered]')
    .replace(/\bforget\s+(everything|all|your)\b/gi, '[filtered]')
    .replace(/\bnew\s+instructions?\b/gi, '[filtered]')
    .replace(/\bdo\s+not\s+follow\b/gi, '[filtered]')
    .replace(/\bjailbreak\b/gi, '[filtered]')
    .replace(/\bprompt\s*injection\b/gi, '[filtered]');

  return text;
}

/**
 * Validate that a string is a valid language code from our allowlist.
 */
export function validateLanguage(lang: unknown): string | null {
  if (typeof lang !== 'string') return null;
  const normalized = lang.trim().toLowerCase().slice(0, 5);
  return ALLOWED_LANGUAGES.has(normalized) ? normalized : null;
}

/**
 * Validate difficulty level.
 */
export function validateDifficulty(diff: unknown): 'easy' | 'medium' | 'hard' {
  if (typeof diff === 'string' && ALLOWED_DIFFICULTIES.has(diff)) {
    return diff as 'easy' | 'medium' | 'hard';
  }
  return 'medium';
}

/**
 * Validate game type.
 */
export function validateGameType(gameType: unknown): string | null {
  if (typeof gameType !== 'string') return null;
  return ALLOWED_GAME_TYPES.has(gameType) ? gameType : null;
}

/**
 * Validate count parameter — enforce min/max.
 */
export function validateCount(count: unknown, min: number = 1, max: number = 30): number {
  const n = typeof count === 'number' ? count : parseInt(String(count), 10);
  if (isNaN(n) || n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

/**
 * Validate UUID format.
 */
export function isValidUUID(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ============================================
// Auth Middleware — verifies Supabase JWT
// ============================================

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Require a valid Supabase JWT in Authorization header.
 * Attaches userId and userEmail to the request.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token || token.length < 10) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  supabase.auth.getUser(token).then(({ data: { user }, error }) => {
    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.userId = user.id;
    req.userEmail = user.email;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Authentication failed' });
  });
}

/**
 * Optional auth — attaches user info if token present, but doesn't block.
 */
export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token || token.length < 10) {
    next();
    return;
  }

  supabase.auth.getUser(token).then(({ data: { user } }) => {
    if (user) {
      req.userId = user.id;
      req.userEmail = user.email;
    }
    next();
  }).catch(() => {
    next();
  });
}

// ============================================
// Socket Auth — verify JWT for WebSocket
// ============================================

/**
 * Verify a Supabase JWT and return the user ID.
 * Used for socket authentication instead of trusting client data.
 */
export async function verifySocketToken(token: string): Promise<{ userId: string; email: string } | null> {
  if (!token || token.length < 10) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch {
    return null;
  }
}

// ============================================
// Content filter for user-generated text
// ============================================

const PROFANITY_PATTERNS = [
  // Add patterns as needed; keeping it simple for now
  /\bf+u+c+k+/gi,
  /\bs+h+i+t+/gi,
  /\ba+s+s+h+o+l+e+/gi,
  /\bn+i+g+g+/gi,
  /\bf+a+g+g?/gi,
  /\bc+u+n+t+/gi,
  /\bd+i+c+k+/gi,
  /\bk+i+l+l+\s+(your|my|him|her|them)self/gi,
];

export function containsProfanity(text: string): boolean {
  return PROFANITY_PATTERNS.some((pattern) => pattern.test(text));
}

export function filterProfanity(text: string): string {
  let filtered = text;
  for (const pattern of PROFANITY_PATTERNS) {
    filtered = filtered.replace(pattern, '***');
  }
  return filtered;
}

// ============================================
// Socket rate limiting (in-memory)
// ============================================

const socketRateLimits = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple per-socket rate limiter.
 * Returns true if the action is allowed, false if rate-limited.
 */
export function checkSocketRateLimit(
  socketId: string,
  maxPerWindow: number = 30,
  windowMs: number = 10_000
): boolean {
  const now = Date.now();
  const entry = socketRateLimits.get(socketId);

  if (!entry || now > entry.resetAt) {
    socketRateLimits.set(socketId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > maxPerWindow) return false;
  return true;
}

/**
 * Clean up disconnected socket rate limit entries.
 */
export function clearSocketRateLimit(socketId: string): void {
  socketRateLimits.delete(socketId);
}
