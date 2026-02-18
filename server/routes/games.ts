import { Router } from 'express';
import { generatePairs, generatePairsWithDistractors, validateTranslation, generateCategoryWords } from '../services/ollama';
import {
  requireAuth,
  validateLanguage,
  validateDifficulty,
  validateCount,
  sanitizeText,
} from '../middleware/security';
import { llmLimiter } from '../rateLimit';

export const gamesRoutes = Router();

// All game routes require authentication
gamesRoutes.use(requireAuth as any);

// Generate translation pairs for a game
gamesRoutes.post('/pairs', llmLimiter, async (req, res) => {
  try {
    const fromLang = validateLanguage(req.body.fromLang);
    const toLang = validateLanguage(req.body.toLang);
    const count = validateCount(req.body.count, 1, 30);
    const difficulty = validateDifficulty(req.body.difficulty);
    const withDistractors = Boolean(req.body.withDistractors);

    if (!fromLang || !toLang) {
      return res.status(400).json({ error: 'Invalid language codes. Use ISO 639-1 codes (en, es, fr, etc.)' });
    }

    if (fromLang === toLang) {
      return res.status(400).json({ error: 'Source and target languages must be different' });
    }

    let pairs;
    if (withDistractors) {
      pairs = await generatePairsWithDistractors(fromLang, toLang, count, difficulty);
    } else {
      pairs = await generatePairs(fromLang, toLang, count, difficulty);
    }

    res.json({ pairs });
  } catch (error) {
    console.error('Failed to generate pairs:', error);
    res.status(500).json({ error: 'Failed to generate translation pairs' });
  }
});

// Validate a translation answer
gamesRoutes.post('/validate', llmLimiter, async (req, res) => {
  try {
    const source = sanitizeText(req.body.source, 500);
    const userAnswer = sanitizeText(req.body.userAnswer, 500);
    const correctAnswer = sanitizeText(req.body.correctAnswer, 500);
    const targetLang = validateLanguage(req.body.targetLang);

    if (!source || !userAnswer || !correctAnswer || !targetLang) {
      return res.status(400).json({ error: 'Missing or invalid required fields' });
    }

    const result = await validateTranslation(source, userAnswer, correctAnswer, targetLang);
    res.json(result);
  } catch (error) {
    console.error('Failed to validate:', error);
    res.status(500).json({ error: 'Failed to validate translation' });
  }
});

// Generate category words (for wager game)
gamesRoutes.post('/category-words', llmLimiter, async (req, res) => {
  try {
    const category = sanitizeText(req.body.category, 50);
    const toLang = validateLanguage(req.body.toLang);
    const count = validateCount(req.body.count, 1, 20);

    if (!category || !toLang) {
      return res.status(400).json({ error: 'Missing or invalid category or language' });
    }

    const words = await generateCategoryWords(category, toLang, count);
    res.json({ words });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate category words' });
  }
});
