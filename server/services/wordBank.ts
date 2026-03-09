import * as fs from 'fs';
import * as path from 'path';
import type { TranslationPair } from '../../lib/types';

// ============================================
// Types
// ============================================

export type LearningGoal = 'travel' | 'work' | 'school' | 'culture' | 'relationship' | 'general';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Topic =
  | 'greetings'
  | 'food_drink'
  | 'travel_directions'
  | 'shopping_money'
  | 'business_work'
  | 'academics'
  | 'family_relationships'
  | 'emotions'
  | 'household'
  | 'nature_weather'
  | 'health_body'
  | 'hobbies_entertainment'
  | 'colors_numbers'
  | 'time_dates'
  | 'animals';

type WordBankStructure = Record<
  string,
  Record<Topic, Record<Difficulty, TranslationPair[]>>
>;

// ============================================
// Load word bank at startup
// ============================================

const wordBankPath = path.join(__dirname, '../data/word-bank.json');
let wordBank: WordBankStructure = {};

try {
  const raw = fs.readFileSync(wordBankPath, 'utf-8');
  wordBank = JSON.parse(raw) as WordBankStructure;
} catch (err) {
  console.error('Failed to load word-bank.json:', err);
}

// ============================================
// Goal -> Topic weights (from plan)
// ============================================

export const GOAL_TOPIC_WEIGHTS: Record<LearningGoal, Record<Topic, number>> = {
  travel: {
    greetings: 2,
    food_drink: 3,
    travel_directions: 3,
    shopping_money: 2,
    business_work: 0.5,
    academics: 0.5,
    family_relationships: 0.5,
    emotions: 0.5,
    household: 0.5,
    nature_weather: 0.5,
    health_body: 0.5,
    hobbies_entertainment: 0.5,
    colors_numbers: 0.5,
    time_dates: 1,
    animals: 0.5,
  },
  work: {
    greetings: 2,
    food_drink: 0.5,
    travel_directions: 0.5,
    shopping_money: 0.5,
    business_work: 3,
    academics: 1,
    family_relationships: 0.5,
    emotions: 0.5,
    household: 0.5,
    nature_weather: 0.5,
    health_body: 0.5,
    hobbies_entertainment: 0.5,
    colors_numbers: 0.5,
    time_dates: 2,
    animals: 0.5,
  },
  school: {
    greetings: 0.5,
    food_drink: 0.5,
    travel_directions: 0.5,
    shopping_money: 0.5,
    business_work: 0.5,
    academics: 3,
    family_relationships: 0.5,
    emotions: 0.5,
    household: 0.5,
    nature_weather: 1,
    health_body: 0.5,
    hobbies_entertainment: 0.5,
    colors_numbers: 2,
    time_dates: 0.5,
    animals: 1,
  },
  culture: {
    greetings: 1,
    food_drink: 2,
    travel_directions: 0.5,
    shopping_money: 0.5,
    business_work: 0.5,
    academics: 0.5,
    family_relationships: 0.5,
    emotions: 2,
    household: 0.5,
    nature_weather: 0.5,
    health_body: 0.5,
    hobbies_entertainment: 3,
    colors_numbers: 0.5,
    time_dates: 0.5,
    animals: 0.5,
  },
  relationship: {
    greetings: 1,
    food_drink: 1,
    travel_directions: 0.5,
    shopping_money: 0.5,
    business_work: 0.5,
    academics: 0.5,
    family_relationships: 3,
    emotions: 3,
    household: 2,
    nature_weather: 0.5,
    health_body: 0.5,
    hobbies_entertainment: 0.5,
    colors_numbers: 0.5,
    time_dates: 0.5,
    animals: 0.5,
  },
  general: {
    greetings: 1,
    food_drink: 1,
    travel_directions: 1,
    shopping_money: 1,
    business_work: 1,
    academics: 1,
    family_relationships: 1,
    emotions: 1,
    household: 1,
    nature_weather: 1,
    health_body: 1,
    hobbies_entertainment: 1,
    colors_numbers: 1,
    time_dates: 1,
    animals: 1,
  },
};

const ALL_TOPICS: Topic[] = [
  'greetings',
  'food_drink',
  'travel_directions',
  'shopping_money',
  'business_work',
  'academics',
  'family_relationships',
  'emotions',
  'household',
  'nature_weather',
  'health_body',
  'hobbies_entertainment',
  'colors_numbers',
  'time_dates',
  'animals',
];

// ============================================
// Helpers
// ============================================

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getLangPairKey(fromLang: string, toLang: string): string {
  return `${fromLang}-${toLang}`;
}

function getPairsForLangPair(langPairKey: string): Record<Topic, Record<Difficulty, TranslationPair[]>> | null {
  const data = wordBank[langPairKey];
  if (!data) return null;
  return data as Record<Topic, Record<Difficulty, TranslationPair[]>>;
}

function buildWeightedPool(
  langPairKey: string,
  goal: LearningGoal,
  difficulty: Difficulty,
  withDistractors: boolean
): TranslationPair[] {
  const langData = getPairsForLangPair(langPairKey);
  if (!langData) return [];

  const weights = GOAL_TOPIC_WEIGHTS[goal];
  const pool: TranslationPair[] = [];

  for (const topic of ALL_TOPICS) {
    const weight = weights[topic] ?? 1;
    const topicData = langData[topic];
    if (!topicData) continue;

    const pairs = topicData[difficulty] || [];
    let usable = pairs;
    if (withDistractors) {
      usable = pairs.filter((p) => p.distractors && p.distractors.length >= 2);
    }

    const repeat = Math.max(1, Math.round(weight));
    for (let i = 0; i < repeat; i++) {
      pool.push(...usable);
    }
  }

  return pool;
}

// ============================================
// Main API
// ============================================

/**
 * Select pairs for a single player (solo practice or when only one goal applies).
 */
export function selectPairs(
  fromLang: string,
  toLang: string,
  goal: LearningGoal,
  difficulty: Difficulty,
  count: number,
  withDistractors: boolean = false
): TranslationPair[] {
  const langPairKey = getLangPairKey(fromLang, toLang);
  let pool = buildWeightedPool(langPairKey, goal, difficulty, withDistractors);

  if (pool.length === 0) {
    // Fallback to en-es if the requested pair is not in the bank
    const fallbackKey = langPairKey === 'en-es' ? null : 'en-es';
    if (fallbackKey) {
      pool = buildWeightedPool(fallbackKey, goal, difficulty, withDistractors);
    }
  }

  if (pool.length === 0) return [];

  const shuffled = shuffle(pool);
  return shuffled.slice(0, count);
}

/**
 * Select pairs for a matched game (2 players). Merges both players' goal weights.
 */
export function selectPairsForMatch(
  fromLang: string,
  toLang: string,
  goals: LearningGoal[],
  difficulty: Difficulty,
  count: number,
  withDistractors: boolean = false
): TranslationPair[] {
  const langPairKey = getLangPairKey(fromLang, toLang);
  const langData = getPairsForLangPair(langPairKey);
  if (!langData) {
    return selectPairs(fromLang, toLang, 'general', difficulty, count, withDistractors);
  }

  const mergedWeights: Record<Topic, number> = {} as Record<Topic, number>;
  for (const t of ALL_TOPICS) {
    mergedWeights[t] = 0;
  }
  for (const goal of goals) {
    const w = GOAL_TOPIC_WEIGHTS[goal];
    for (const t of ALL_TOPICS) {
      mergedWeights[t] += w[t] ?? 1;
    }
  }

  const pool: TranslationPair[] = [];
  for (const topic of ALL_TOPICS) {
    const weight = mergedWeights[topic];
    const topicData = langData[topic];
    if (!topicData) continue;

    let pairs = topicData[difficulty] || [];
    if (withDistractors) {
      pairs = pairs.filter((p) => p.distractors && p.distractors.length >= 2);
    }

    const repeat = Math.max(1, Math.round(weight));
    for (let i = 0; i < repeat; i++) {
      pool.push(...pairs);
    }
  }

  if (pool.length === 0) return [];

  const shuffled = shuffle(pool);
  return shuffled.slice(0, count);
}
