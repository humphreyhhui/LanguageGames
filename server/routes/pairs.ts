import { Router } from 'express';
import { supabase } from '../config';

export const pairsRoutes = Router();

// Get user's custom pair sets
pairsRoutes.get('/my-sets', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { data, error } = await supabase
    .from('custom_pair_sets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ pairSets: data });
});

// Get public pair sets
pairsRoutes.get('/public', async (_req, res) => {
  const { data, error } = await supabase
    .from('custom_pair_sets')
    .select('*, profiles(username)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ pairSets: data });
});

// Create a custom pair set
pairsRoutes.post('/', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { name, languageFrom, languageTo, isPublic, pairs } = req.body;

  const { data, error } = await supabase
    .from('custom_pair_sets')
    .insert({
      user_id: user.id,
      name,
      language_from: languageFrom || 'en',
      language_to: languageTo || 'es',
      is_public: isPublic || false,
      pairs: pairs || [],
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ pairSet: data });
});

// Update a custom pair set
pairsRoutes.put('/:id', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { name, pairs, isPublic } = req.body;

  const { data, error } = await supabase
    .from('custom_pair_sets')
    .update({ name, pairs, is_public: isPublic })
    .eq('id', req.params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ pairSet: data });
});

// Delete a custom pair set
pairsRoutes.delete('/:id', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const { error } = await supabase
    .from('custom_pair_sets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});
