/**
 * Client-side bot identity generation (shared with test screens).
 * Mirrors server logic for consistent, varied bot profiles.
 */

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotProfile {
  name: string;
  elo: number;
  accuracy: number;
  kurtosisProfile: number;
}

// Distribution parameters (must match server config)
const BOT_PROFILES = {
  easy:   { eloMean: 750,  eloStd: 50,  accMean: 0.45, accStd: 0.08, kurtDfRange: [5, 30] as const },
  medium: { eloMean: 1000, eloStd: 75,  accMean: 0.62, accStd: 0.07, kurtDfRange: [4, 25] as const },
  hard:   { eloMean: 1250, eloStd: 100, accMean: 0.78, accStd: 0.06, kurtDfRange: [3, 20] as const },
} as const;

// Game-specific param ranges for test screens (delay, interval, etc.)
export const BOT_GAME_PARAMS: Record<BotDifficulty, {
  raceDelayMin: number;
  raceDelayMax: number;
  asteroidShootInterval: number;
  memoryFlipDelay: number;
  memoryChance: number;
  wagerStyle: 'conservative' | 'balanced' | 'aggressive';
}> = {
  easy:   { raceDelayMin: 4000, raceDelayMax: 8000, asteroidShootInterval: 3500, memoryFlipDelay: 4000, memoryChance: 0.2, wagerStyle: 'conservative' },
  medium: { raceDelayMin: 2000, raceDelayMax: 5000, asteroidShootInterval: 2200, memoryFlipDelay: 2500, memoryChance: 0.55, wagerStyle: 'balanced' },
  hard:   { raceDelayMin: 1000, raceDelayMax: 3000, asteroidShootInterval: 1200, memoryFlipDelay: 1500, memoryChance: 0.85, wagerStyle: 'aggressive' },
};

const FAKE_USERNAMES = [
  'skyracer22', 'luna_learns', 'marco_esp', 'wordsmith_k', 'lingo_ninja',
  'polyglot_pete', 'spanish_dream', 'vocab_vault', 'fluent_fox', 'word_wizard',
  'lingua_luna', 'espanol_ace', 'translate_king', 'phrase_hunter', 'syntax_sage',
  'babel_buddy', 'conjugator99', 'verb_vibes', 'lexicon_leo', 'dialect_dave',
  'grammar_guard', 'speak_easy_7', 'tongue_twister', 'bilingual_ben', 'lingo_lord',
  'word_weaver', 'phrase_finder', 'vocab_voyager', 'espanol_echo', 'fluent_fly',
  'translate_tiger', 'lingua_lane', 'polyglot_paul', 'spanish_spark', 'word_whiz',
  'babel_bear', 'conjugator_carl', 'verb_victor', 'lexicon_lily', 'dialect_dan',
  'grammar_grace', 'speak_sam', 'tongue_tina', 'bilingual_bob', 'lingo_lisa',
  'word_wendy', 'phrase_phil', 'vocab_vera', 'espanol_emma', 'fluent_frank',
  'translate_tom', 'lingua_lucas', 'polyglot_priya', 'spanish_sara', 'word_will',
  'babel_ben', 'conjugator_chris', 'verb_vanessa', 'lexicon_luke', 'dialect_diana',
  'grammar_george', 'speak_sophie', 'tongue_tim', 'bilingual_beatriz', 'lingo_leo',
  'word_wanda', 'phrase_fiona', 'vocab_vincent', 'espanol_elena', 'fluent_felix',
  'translate_theo', 'lingua_lucia', 'polyglot_pablo', 'spanish_sergio', 'word_wesley',
  'babel_bruno', 'conjugator_carmen', 'verb_valeria', 'lexicon_lorenzo', 'dialect_diego',
  'grammar_gabriela', 'speak_santiago', 'tongue_teresa', 'bilingual_bruno', 'lingo_lucia',
  'word_wilson', 'phrase_patricia', 'vocab_ricardo', 'espanol_rosa', 'fluent_fernando',
  'translate_tatiana', 'lingua_manuel', 'polyglot_marta', 'spanish_sebastian', 'word_winston',
];

function sampleStandardNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  if (u1 <= 0) return 0;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleNormal(mean: number, std: number, min: number, max: number): number {
  const z = sampleStandardNormal();
  const x = mean + std * z;
  return Math.max(min, Math.min(max, x));
}

function sampleT(df: number): number {
  if (df >= 30) return sampleStandardNormal();
  const z = sampleStandardNormal();
  let chi2 = 0;
  const n = Math.floor(df);
  for (let i = 0; i < n; i++) {
    chi2 += sampleStandardNormal() ** 2;
  }
  if (df > n) {
    chi2 += (sampleStandardNormal() ** 2) * (df - n);
  }
  if (chi2 <= 0) return z;
  return z / Math.sqrt(chi2 / df);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateBotProfile(difficulty: BotDifficulty): BotProfile {
  const profile = BOT_PROFILES[difficulty];
  const [kurtMin, kurtMax] = profile.kurtDfRange;
  const kurtosisProfile = randomInt(kurtMin, kurtMax);

  const elo = Math.round(sampleNormal(profile.eloMean, profile.eloStd, 100, 2000));
  const accuracy = sampleNormal(profile.accMean, profile.accStd, 0.1, 0.95);
  const name = pickRandom(FAKE_USERNAMES);

  return { name, elo, accuracy, kurtosisProfile };
}

export function sampleBotCorrect(accuracy: number, kurtosisProfile: number): boolean {
  const noise = sampleT(kurtosisProfile);
  const noiseScale = 0.15;
  const effective = accuracy + noiseScale * noise;
  return Math.random() < Math.max(0.05, Math.min(0.98, effective));
}
