import { LRUCache } from 'lru-cache';
import { OLLAMA_URL, OLLAMA_MODEL } from '../config';

// ============================================
// Types
// ============================================

export interface TranslationPair {
  source: string;
  target: string;
  distractors?: string[];
}

type Difficulty = 'easy' | 'medium' | 'hard';

// ============================================
// LRU Cache (avoid regenerating identical pairs)
// ============================================

const pairCache = new LRUCache<string, TranslationPair[]>({
  max: 500,
  ttl: 1000 * 60 * 30, // 30 minutes
});

// ============================================
// Ollama API Helper
// ============================================

async function queryOllama(prompt: string): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { response?: string };
    let text = data.response || '';
    // Strip <think>...</think> blocks from models like qwen3 that include reasoning
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return text;
  } catch (error) {
    console.error('Ollama query failed:', error);
    throw error;
  }
}

// ============================================
// Parse JSON from LLM response (handles markdown fences)
// ============================================

function parseJsonFromResponse(text: string): any {
  // Try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1].trim());
  }

  // Try to find JSON array or object directly
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]);
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error('No valid JSON found in response');
}

// ============================================
// Generate Translation Pairs
// ============================================

export async function generatePairs(
  fromLang: string,
  toLang: string,
  count: number,
  difficulty: Difficulty
): Promise<TranslationPair[]> {
  const cacheKey = `${fromLang}-${toLang}-${count}-${difficulty}-${Date.now() % 10}`;

  const cached = pairCache.get(cacheKey);
  if (cached) return cached;

  const difficultyGuide: Record<Difficulty, string> = {
    easy: 'simple common words and very short phrases (1-3 words), like basic greetings, colors, numbers, common objects',
    medium: 'everyday sentences (4-8 words), like ordering food, asking directions, basic conversation',
    hard: 'complex sentences (8-15 words) with idioms, subjunctive mood, or nuanced vocabulary',
  };

  const prompt = `Generate exactly ${count} translation pairs from ${fromLang} to ${toLang}.
Difficulty: ${difficulty} - ${difficultyGuide[difficulty]}.

Return ONLY a JSON array with this exact format, no other text:
[
  {"source": "word or phrase in ${fromLang}", "target": "translation in ${toLang}"},
  ...
]

Make sure translations are accurate. Vary the topics. Return exactly ${count} items.`;

  try {
    const response = await queryOllama(prompt);
    const pairs = parseJsonFromResponse(response) as TranslationPair[];

    if (!Array.isArray(pairs) || pairs.length === 0) {
      throw new Error('Invalid pairs response');
    }

    // Validate structure
    const validPairs = pairs
      .filter((p) => p.source && p.target)
      .slice(0, count);

    pairCache.set(cacheKey, validPairs);
    return validPairs;
  } catch (error) {
    console.error('Failed to generate pairs, using fallback:', error);
    return getFallbackPairs(fromLang, toLang, count);
  }
}

// ============================================
// Generate Distractors (for Asteroid game)
// ============================================

export async function generateDistractors(
  targetWord: string,
  toLang: string,
  count: number = 3
): Promise<string[]> {
  const prompt = `Given the ${toLang} word/phrase "${targetWord}", generate ${count} plausible but INCORRECT translations that a language learner might confuse it with. These should be real ${toLang} words that are similar but have different meanings.

Return ONLY a JSON array of strings, no other text:
["wrong1", "wrong2", "wrong3"]`;

  try {
    const response = await queryOllama(prompt);
    const distractors = parseJsonFromResponse(response) as string[];
    return Array.isArray(distractors) ? distractors.slice(0, count) : [];
  } catch {
    return [];
  }
}

// ============================================
// Validate a Translation Answer
// ============================================

export async function validateTranslation(
  source: string,
  userAnswer: string,
  correctAnswer: string,
  targetLang: string
): Promise<{ correct: boolean; feedback: string }> {
  // Quick exact match (case-insensitive)
  if (userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()) {
    return { correct: true, feedback: 'Correct!' };
  }

  const prompt = `A language learner was asked to translate "${source}" into ${targetLang}.
The expected answer is: "${correctAnswer}"
The learner answered: "${userAnswer}"

Is the learner's answer an acceptable translation? Consider synonyms, minor spelling variations, and alternative valid translations.

Return ONLY a JSON object with this exact format:
{"correct": true/false, "feedback": "brief explanation"}`;

  try {
    const response = await queryOllama(prompt);
    const result = parseJsonFromResponse(response);
    return {
      correct: Boolean(result.correct),
      feedback: result.feedback || (result.correct ? 'Correct!' : 'Not quite.'),
    };
  } catch {
    // Fallback: simple string similarity
    const similarity = stringSimilarity(userAnswer.toLowerCase(), correctAnswer.toLowerCase());
    const correct = similarity > 0.8;
    return {
      correct,
      feedback: correct ? 'Close enough!' : `The correct answer is: ${correctAnswer}`,
    };
  }
}

// ============================================
// Generate pairs with distractors (for Asteroid game)
// ============================================

export async function generatePairsWithDistractors(
  fromLang: string,
  toLang: string,
  count: number,
  difficulty: Difficulty
): Promise<TranslationPair[]> {
  const prompt = `Generate exactly ${count} translation pairs from ${fromLang} to ${toLang} for a game.
Difficulty: ${difficulty}.

For each pair, also provide 3 distractor words in ${toLang} that are plausible but WRONG translations.

Return ONLY a JSON array:
[
  {"source": "english word", "target": "correct translation", "distractors": ["wrong1", "wrong2", "wrong3"]},
  ...
]`;

  try {
    const response = await queryOllama(prompt);
    const pairs = parseJsonFromResponse(response) as TranslationPair[];

    if (!Array.isArray(pairs) || pairs.length === 0) {
      throw new Error('Invalid response');
    }

    return pairs.filter((p) => p.source && p.target).slice(0, count);
  } catch (error) {
    console.error('Failed to generate pairs with distractors:', error);
    const basePairs = await generatePairs(fromLang, toLang, count, difficulty);
    // Add empty distractors as fallback
    return basePairs.map((p) => ({ ...p, distractors: [] }));
  }
}

// ============================================
// Generate category words (for Wager game)
// ============================================

export async function generateCategoryWords(
  category: string,
  toLang: string,
  count: number
): Promise<{ word: string; translation: string }[]> {
  const prompt = `Generate ${count} words in the category "${category}" with their translations to ${toLang}.

Return ONLY a JSON array:
[{"word": "english word", "translation": "${toLang} translation"}, ...]`;

  try {
    const response = await queryOllama(prompt);
    return parseJsonFromResponse(response);
  } catch {
    return [];
  }
}

// ============================================
// Fallback Pairs (when LLM is unavailable)
// ============================================

function getFallbackPairs(fromLang: string, toLang: string, count: number): TranslationPair[] {
  const fallbackData: Record<string, TranslationPair[]> = {
    'en-es': [
      { source: 'hello', target: 'hola' },
      { source: 'goodbye', target: 'adiós' },
      { source: 'thank you', target: 'gracias' },
      { source: 'please', target: 'por favor' },
      { source: 'good morning', target: 'buenos días' },
      { source: 'cat', target: 'gato' },
      { source: 'dog', target: 'perro' },
      { source: 'house', target: 'casa' },
      { source: 'water', target: 'agua' },
      { source: 'food', target: 'comida' },
      { source: 'book', target: 'libro' },
      { source: 'friend', target: 'amigo' },
      { source: 'time', target: 'tiempo' },
      { source: 'day', target: 'día' },
      { source: 'night', target: 'noche' },
      { source: 'red', target: 'rojo' },
      { source: 'blue', target: 'azul' },
      { source: 'green', target: 'verde' },
      { source: 'big', target: 'grande' },
      { source: 'small', target: 'pequeño' },
    ],
    'en-fr': [
      { source: 'hello', target: 'bonjour' },
      { source: 'goodbye', target: 'au revoir' },
      { source: 'thank you', target: 'merci' },
      { source: 'please', target: 's\'il vous plaît' },
      { source: 'cat', target: 'chat' },
      { source: 'dog', target: 'chien' },
      { source: 'house', target: 'maison' },
      { source: 'water', target: 'eau' },
      { source: 'food', target: 'nourriture' },
      { source: 'book', target: 'livre' },
    ],
    'en-de': [
      { source: 'hello', target: 'hallo' },
      { source: 'goodbye', target: 'auf Wiedersehen' },
      { source: 'thank you', target: 'danke' },
      { source: 'please', target: 'bitte' },
      { source: 'cat', target: 'Katze' },
      { source: 'dog', target: 'Hund' },
      { source: 'house', target: 'Haus' },
      { source: 'water', target: 'Wasser' },
      { source: 'food', target: 'Essen' },
      { source: 'book', target: 'Buch' },
    ],
  };

  const key = `${fromLang}-${toLang}`;
  const pairs = fallbackData[key] || fallbackData['en-es'] || [];

  // Shuffle and return requested count
  const shuffled = [...pairs].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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
