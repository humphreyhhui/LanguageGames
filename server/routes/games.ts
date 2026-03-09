import { Router } from 'express';
import { generatePairs, generatePairsWithDistractors, validateTranslation, generateCategoryWords } from '../services/ollama';
import { saveBotTestGame } from '../services/gameSession';
import {
  requireAuth,
  validateLanguage,
  validateDifficulty,
  validateCount,
  validateGameType,
  sanitizeText,
} from '../middleware/security';
import type { AuthenticatedRequest } from '../middleware/security';
import { llmLimiter } from '../rateLimit';

export const gamesRoutes = Router();

// All game routes require authentication
gamesRoutes.use(requireAuth as any);

const VALID_LEARNING_GOALS = ['travel', 'work', 'school', 'culture', 'relationship', 'general'] as const;

// Generate translation pairs for a game
gamesRoutes.post('/pairs', llmLimiter, async (req, res) => {
  try {
    const fromLang = validateLanguage(req.body.fromLang);
    const toLang = validateLanguage(req.body.toLang);
    const count = validateCount(req.body.count, 1, 30);
    const difficulty = validateDifficulty(req.body.difficulty);
    const withDistractors = Boolean(req.body.withDistractors);
    const rawGoal = req.body.learningGoal;
    const learningGoal = VALID_LEARNING_GOALS.includes(rawGoal) ? rawGoal : 'general';

    if (!fromLang || !toLang) {
      return res.status(400).json({ error: 'Invalid language codes. Use ISO 639-1 codes (en, es, fr, etc.)' });
    }

    if (fromLang === toLang) {
      return res.status(400).json({ error: 'Source and target languages must be different' });
    }

    let pairs;
    if (withDistractors) {
      pairs = await generatePairsWithDistractors(fromLang, toLang, count, difficulty, learningGoal);
    } else {
      pairs = await generatePairs(fromLang, toLang, count, difficulty, learningGoal);
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

// Report bot test game (test mode: contributes to ELO at 75%)
gamesRoutes.post('/report-bot-test', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const gameType = validateGameType(req.body.gameType);
    if (!gameType) {
      return res.status(400).json({ error: 'Invalid game type' });
    }

    const botElo = typeof req.body.botElo === 'number' ? req.body.botElo : parseInt(String(req.body.botElo), 10);
    const playerScore = Math.floor(Number(req.body.playerScore)) || 0;
    const botScore = Math.floor(Number(req.body.botScore)) || 0;
    const durationMs = Math.floor(Number(req.body.durationMs)) || 0;

    if (isNaN(botElo) || botElo < 100 || botElo > 2000) {
      return res.status(400).json({ error: 'Invalid botElo (100-2000)' });
    }

    const result = await saveBotTestGame({
      playerId: userId,
      gameType,
      botElo,
      playerScore,
      botScore,
      durationMs,
    });

    res.json({
      eloChange: result.playerChange,
      newElo: result.playerNewElo,
      playerElo: result.playerElo,
      opponentElo: result.opponentElo,
      hypotheticalBotChange: result.hypotheticalBotChange,
      isBotMatch: true,
    });
  } catch (error) {
    console.error('Failed to report bot test:', error);
    res.status(500).json({ error: 'Failed to report game' });
  }
});
