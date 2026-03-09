#!/usr/bin/env npx ts-node
/**
 * Optional script to expand the word bank using Ollama.
 * Run: npx ts-node server/scripts/generate-word-bank.ts
 *
 * Requires: OLLAMA_URL and OLLAMA_MODEL env vars (or defaults to localhost:11434, qwen3:4b)
 * Output: Merges generated pairs into server/data/word-bank.json
 */

import * as fs from 'fs';
import * as path from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:4b';

const TOPICS = [
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
] as const;

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

type Topic = (typeof TOPICS)[number];
type Difficulty = (typeof DIFFICULTIES)[number];

interface TranslationPair {
  source: string;
  target: string;
  distractors?: string[];
}

async function queryOllama(prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 1024 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as { response?: string };
  let text = data.response || '';
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return text;
}

function parseJsonFromResponse(text: string): any {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return JSON.parse(arrayMatch[0]);
  throw new Error('No valid JSON found in response');
}

async function generateTopicPairs(
  fromLang: string,
  toLang: string,
  topic: Topic,
  difficulty: Difficulty,
  count: number,
  withDistractors: boolean
): Promise<TranslationPair[]> {
  const topicLabels: Record<string, string> = {
    greetings: 'greetings and basic phrases',
    food_drink: 'food, drinks, and dining',
    travel_directions: 'travel, directions, and transportation',
    shopping_money: 'shopping, money, and prices',
    business_work: 'business and work',
    academics: 'school and academics',
    family_relationships: 'family and relationships',
    emotions: 'emotions and feelings',
    household: 'household items and rooms',
    nature_weather: 'nature and weather',
    health_body: 'health and body parts',
    hobbies_entertainment: 'hobbies and entertainment',
    colors_numbers: 'colors and numbers',
    time_dates: 'time and dates',
    animals: 'animals',
  };

  const diffGuide: Record<Difficulty, string> = {
    easy: 'simple common words and very short phrases (1-3 words)',
    medium: 'everyday phrases (4-8 words)',
    hard: 'complex sentences (8-15 words)',
  };

  const topicLabel = topicLabels[topic] || topic;
  const prompt = withDistractors
    ? `Generate exactly ${count} translation pairs from ${fromLang} to ${toLang} for the topic: ${topicLabel}.
Difficulty: ${difficulty} - ${diffGuide[difficulty]}.
For each pair, provide 3 distractor words in ${toLang} that are plausible but WRONG translations.
Return ONLY a JSON array: [{"source": "...", "target": "...", "distractors": ["a","b","c"]}, ...]`
    : `Generate exactly ${count} translation pairs from ${fromLang} to ${toLang} for the topic: ${topicLabel}.
Difficulty: ${difficulty} - ${diffGuide[difficulty]}.
Return ONLY a JSON array: [{"source": "...", "target": "..."}, ...]`;

  const response = await queryOllama(prompt);
  const pairs = parseJsonFromResponse(response) as TranslationPair[];
  return Array.isArray(pairs)
    ? pairs.filter((p) => p.source && p.target).slice(0, count)
    : [];
}

async function main() {
  const langPair = process.argv[2] || 'en-es';
  const [fromLang, toLang] = langPair.split('-');
  if (!fromLang || !toLang) {
    console.error('Usage: npx ts-node generate-word-bank.ts [lang-pair]');
    console.error('Example: npx ts-node generate-word-bank.ts en-es');
    process.exit(1);
  }

  const wordBankPath = path.join(__dirname, '../data/word-bank.json');
  let existing: Record<string, Record<string, Record<string, TranslationPair[]>>> = {};
  if (fs.existsSync(wordBankPath)) {
    existing = JSON.parse(fs.readFileSync(wordBankPath, 'utf-8'));
  }

  const key = `${fromLang}-${toLang}`;
  if (!existing[key]) existing[key] = {};

  const pairsPerTopic = 5;
  const withDistractors = true;

  console.log(`Generating pairs for ${key} (${pairsPerTopic} per topic/difficulty, with distractors)...`);

  for (const topic of TOPICS) {
    if (!existing[key][topic]) existing[key][topic] = { easy: [], medium: [], hard: [] };

    for (const difficulty of DIFFICULTIES) {
      try {
        const pairs = await generateTopicPairs(
          fromLang,
          toLang,
          topic,
          difficulty,
          pairsPerTopic,
          withDistractors
        );
        existing[key][topic][difficulty] = pairs;
        console.log(`  ${topic}/${difficulty}: ${pairs.length} pairs`);
      } catch (err) {
        console.error(`  ${topic}/${difficulty}: ${err}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  fs.writeFileSync(wordBankPath, JSON.stringify(existing, null, 2));

  console.log(`\nDone. Saved to ${wordBankPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
