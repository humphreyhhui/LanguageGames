import { Router } from 'express';
import { supabase } from '../config';
import {
  requireAuth,
  AuthenticatedRequest,
  sanitizeText,
  validateLanguage,
  isValidUUID,
  containsProfanity,
  filterProfanity,
} from '../middleware/security';

export const pairsRoutes = Router();

// Max pairs per set
const MAX_PAIRS_PER_SET = 200;
const MAX_PAIR_TEXT_LENGTH = 300;

/**
 * Sanitize and validate a pair set's content.
 */
function sanitizePairs(pairs: unknown): Array<{ source: string; target: string }> | null {
  if (!Array.isArray(pairs)) return null;

  const sanitized: Array<{ source: string; target: string }> = [];

  for (const pair of pairs.slice(0, MAX_PAIRS_PER_SET)) {
    if (!pair || typeof pair !== 'object') continue;

    const source = sanitizeText(pair.source, MAX_PAIR_TEXT_LENGTH);
    const target = sanitizeText(pair.target, MAX_PAIR_TEXT_LENGTH);

    if (!source || !target) continue;

    // Filter profanity from pair content
    sanitized.push({
      source: filterProfanity(source),
      target: filterProfanity(target),
    });
  }

  return sanitized;
}

// Get user's custom pair sets
pairsRoutes.get('/my-sets', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { data, error } = await supabase
    .from('custom_pair_sets')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch pair sets' });
  res.json({ pairSets: data });
});

// Get public pair sets
pairsRoutes.get('/public', async (_req, res) => {
  const { data, error } = await supabase
    .from('custom_pair_sets')
    .select('id, name, language_from, language_to, pairs, created_at, profiles(username)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: 'Failed to fetch public sets' });
  res.json({ pairSets: data });
});

// Create a custom pair set
pairsRoutes.post('/', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const name = sanitizeText(req.body.name, 100);
  const languageFrom = validateLanguage(req.body.languageFrom) || 'en';
  const languageTo = validateLanguage(req.body.languageTo) || 'es';
  const isPublic = Boolean(req.body.isPublic);
  const pairs = sanitizePairs(req.body.pairs);

  if (!name) {
    return res.status(400).json({ error: 'Set name is required (max 100 chars)' });
  }

  if (containsProfanity(name)) {
    return res.status(400).json({ error: 'Set name contains inappropriate language' });
  }

  if (!pairs || pairs.length === 0) {
    return res.status(400).json({ error: 'At least one translation pair is required' });
  }

  const { data, error } = await supabase
    .from('custom_pair_sets')
    .insert({
      user_id: req.userId,
      name,
      language_from: languageFrom,
      language_to: languageTo,
      is_public: isPublic,
      pairs,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create pair set' });
  res.json({ pairSet: data });
});

// Update a custom pair set
pairsRoutes.put('/:id', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'Invalid pair set ID' });
  }

  const updates: Record<string, unknown> = {};

  if (req.body.name !== undefined) {
    const name = sanitizeText(req.body.name, 100);
    if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
    if (containsProfanity(name)) return res.status(400).json({ error: 'Name contains inappropriate language' });
    updates.name = name;
  }

  if (req.body.pairs !== undefined) {
    const pairs = sanitizePairs(req.body.pairs);
    if (!pairs || pairs.length === 0) return res.status(400).json({ error: 'At least one pair required' });
    updates.pairs = pairs;
  }

  if (req.body.isPublic !== undefined) {
    updates.is_public = Boolean(req.body.isPublic);
  }

  const { data, error } = await supabase
    .from('custom_pair_sets')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.userId) // ownership check
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update pair set' });
  res.json({ pairSet: data });
});

// Delete a custom pair set
pairsRoutes.delete('/:id', requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'Invalid pair set ID' });
  }

  const { error } = await supabase
    .from('custom_pair_sets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId); // ownership check

  if (error) return res.status(500).json({ error: 'Failed to delete pair set' });
  res.json({ success: true });
});
