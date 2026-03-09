import type { TranslationPair } from '../../lib/types';
import { selectPairs, type LearningGoal, type Difficulty } from './wordBank';

// Re-export for consumers
export type { TranslationPair } from '../../lib/types';

// ============================================
// Generate Translation Pairs (delegates to word bank)
// ============================================

export async function generatePairs(
  fromLang: string,
  toLang: string,
  count: number,
  difficulty: Difficulty,
  learningGoal: LearningGoal = 'general'
): Promise<TranslationPair[]> {
  return Promise.resolve(selectPairs(fromLang, toLang, learningGoal, difficulty, count, false));
}

// ============================================
// Generate pairs with distractors (for Asteroid game)
// ============================================

export async function generatePairsWithDistractors(
  fromLang: string,
  toLang: string,
  count: number,
  difficulty: Difficulty,
  learningGoal: LearningGoal = 'general'
): Promise<TranslationPair[]> {
  const pairs = selectPairs(fromLang, toLang, learningGoal, difficulty, count, true);
  if (pairs.length < count) {
    const extra = selectPairs(fromLang, toLang, learningGoal, difficulty, count - pairs.length, false);
    return [...pairs, ...extra.map((p) => ({ ...p, distractors: p.distractors || [] }))];
  }
  return Promise.resolve(pairs);
}

// ============================================
// Generate category words (for Wager game)
// ============================================

export async function generateCategoryWords(
  category: string,
  toLang: string,
  count: number
): Promise<{ word: string; translation: string }[]> {
  const pairs = selectPairs('en', toLang, 'general', 'easy', count * 2, false);
  const filtered = pairs.filter((p) => p.source && p.target);
  return filtered.slice(0, count).map((p) => ({ word: p.source, translation: p.target }));
}

// ============================================
// Validate a Translation Answer (string similarity only)
// ============================================

export async function validateTranslation(
  source: string,
  userAnswer: string,
  correctAnswer: string,
  targetLang: string
): Promise<{ correct: boolean; feedback: string }> {
  if (userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()) {
    return { correct: true, feedback: 'Correct!' };
  }

  const similarity = stringSimilarity(userAnswer.toLowerCase(), correctAnswer.toLowerCase());
  const correct = similarity > 0.8;
  return {
    correct,
    feedback: correct ? 'Close enough!' : `The correct answer is: ${correctAnswer}`,
  };
}

// ============================================
// Simple string similarity (Levenshtein-based)
// ============================================

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;

  const costs = new Array<number>(shorter.length + 1);
  for (let i = 0; i <= shorter.length; i++) costs[i] = i;

  for (let i = 1; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 1; j <= shorter.length; j++) {
      const newValue =
        longer[i - 1] === shorter[j - 1]
          ? costs[j - 1]
          : Math.min(costs[j - 1], lastValue, costs[j]) + 1;
      costs[j - 1] = lastValue;
      lastValue = newValue;
    }
    costs[shorter.length] = lastValue;
  }

  return (longer.length - costs[shorter.length]) / longer.length;
}
