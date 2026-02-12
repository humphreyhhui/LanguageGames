import { Router } from 'express';
import { generatePairs, generatePairsWithDistractors, validateTranslation, generateCategoryWords } from '../services/ollama';

export const gamesRoutes = Router();

// Generate translation pairs for a game
gamesRoutes.post('/pairs', async (req, res) => {
  try {
    const { fromLang, toLang, count, difficulty, withDistractors } = req.body;

    if (!fromLang || !toLang || !count) {
      return res.status(400).json({ error: 'Missing required fields: fromLang, toLang, count' });
    }

    let pairs;
    if (withDistractors) {
      pairs = await generatePairsWithDistractors(
        fromLang,
        toLang,
        count || 10,
        difficulty || 'medium'
      );
    } else {
      pairs = await generatePairs(
        fromLang,
        toLang,
        count || 10,
        difficulty || 'medium'
      );
    }

    res.json({ pairs });
  } catch (error) {
    console.error('Failed to generate pairs:', error);
    res.status(500).json({ error: 'Failed to generate translation pairs' });
  }
});

// Validate a translation answer
gamesRoutes.post('/validate', async (req, res) => {
  try {
    const { source, userAnswer, correctAnswer, targetLang } = req.body;

    if (!source || !userAnswer || !correctAnswer || !targetLang) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await validateTranslation(source, userAnswer, correctAnswer, targetLang);
    res.json(result);
  } catch (error) {
    console.error('Failed to validate:', error);
    res.status(500).json({ error: 'Failed to validate translation' });
  }
});

// Generate category words (for wager game)
gamesRoutes.post('/category-words', async (req, res) => {
  try {
    const { category, toLang, count } = req.body;
    const words = await generateCategoryWords(category, toLang, count || 10);
    res.json({ words });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate category words' });
  }
});
