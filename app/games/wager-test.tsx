import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useCallback, useEffect } from 'react';
import { colors, radii, type, card, button, buttonText, input } from '../../lib/theme';
import { SERVER_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { createTestLogger } from '../../lib/testLogger';

const WAGER_ROUNDS = 5;
const WORDS_PER_ROUND = 10;

// ── Hardcoded pairs per round ────────────────────────────────
const ROUND_PAIRS = [
  // Round 1 - Easy (Animals)
  [
    { source: 'Dog', target: 'Perro' }, { source: 'Cat', target: 'Gato' },
    { source: 'Bird', target: 'Pájaro' }, { source: 'Fish', target: 'Pez' },
    { source: 'Horse', target: 'Caballo' }, { source: 'Cow', target: 'Vaca' },
    { source: 'Pig', target: 'Cerdo' }, { source: 'Chicken', target: 'Pollo' },
    { source: 'Duck', target: 'Pato' }, { source: 'Rabbit', target: 'Conejo' },
  ],
  // Round 2 - Easy (Food)
  [
    { source: 'Bread', target: 'Pan' }, { source: 'Milk', target: 'Leche' },
    { source: 'Cheese', target: 'Queso' }, { source: 'Rice', target: 'Arroz' },
    { source: 'Egg', target: 'Huevo' }, { source: 'Apple', target: 'Manzana' },
    { source: 'Water', target: 'Agua' }, { source: 'Meat', target: 'Carne' },
    { source: 'Salt', target: 'Sal' }, { source: 'Sugar', target: 'Azúcar' },
  ],
  // Round 3 - Medium (Body)
  [
    { source: 'Head', target: 'Cabeza' }, { source: 'Hand', target: 'Mano' },
    { source: 'Eye', target: 'Ojo' }, { source: 'Mouth', target: 'Boca' },
    { source: 'Heart', target: 'Corazón' }, { source: 'Foot', target: 'Pie' },
    { source: 'Arm', target: 'Brazo' }, { source: 'Leg', target: 'Pierna' },
    { source: 'Ear', target: 'Oreja' }, { source: 'Nose', target: 'Nariz' },
  ],
  // Round 4 - Medium (Nature)
  [
    { source: 'Sun', target: 'Sol' }, { source: 'Moon', target: 'Luna' },
    { source: 'Star', target: 'Estrella' }, { source: 'Rain', target: 'Lluvia' },
    { source: 'Wind', target: 'Viento' }, { source: 'Fire', target: 'Fuego' },
    { source: 'Earth', target: 'Tierra' }, { source: 'Mountain', target: 'Montaña' },
    { source: 'River', target: 'Río' }, { source: 'Tree', target: 'Árbol' },
  ],
  // Round 5 - Hard (Abstract)
  [
    { source: 'Love', target: 'Amor' }, { source: 'Time', target: 'Tiempo' },
    { source: 'Life', target: 'Vida' }, { source: 'Death', target: 'Muerte' },
    { source: 'Freedom', target: 'Libertad' }, { source: 'Truth', target: 'Verdad' },
    { source: 'Dream', target: 'Sueño' }, { source: 'Hope', target: 'Esperanza' },
    { source: 'Peace', target: 'Paz' }, { source: 'Strength', target: 'Fuerza' },
  ],
];

// ── Bot config ───────────────────────────────────────────────
type BotDifficulty = 'easy' | 'medium' | 'hard';
const BOT_CONFIG: Record<BotDifficulty, { accuracy: number; wagerStyle: 'conservative' | 'balanced' | 'aggressive'; name: string }> = {
  easy:   { accuracy: 0.4, wagerStyle: 'conservative', name: 'SafeBot' },
  medium: { accuracy: 0.65, wagerStyle: 'balanced', name: 'WagerBot' },
  hard:   { accuracy: 0.85, wagerStyle: 'aggressive', name: 'HighRoller' },
};

type Phase = 'setup' | 'countdown' | 'wager' | 'play' | 'roundResult' | 'gameover';

interface RoundResult {
  round: number;
  playerWager: number;
  playerCorrect: number;
  playerHitWager: boolean;
  playerPoints: number;
  botWager: number;
  botCorrect: number;
  botHitWager: boolean;
  botPoints: number;
  llmValidateMs: number[];
  llmPairGenMs: number | null;
}

interface GameStats {
  playerTotalScore: number;
  botTotalScore: number;
  playerTotalCorrect: number;
  botTotalCorrect: number;
  playerWagersHit: number;
  botWagersHit: number;

  llmTotalPairGenMs: number;
  llmAvgPairGenMs: number;
  llmPairGenCalls: number;
  llmPairGenSuccesses: number;
  llmTotalValidateMs: number;
  llmAvgValidateMs: number;
  llmValidateCalls: number;
  llmMinValidateMs: number;
  llmMaxValidateMs: number;

  supabaseHealthMs: number | null;
  supabaseAuthMs: number | null;
  serverHealthMs: number | null;
  totalGameTimeMs: number;
  winner: 'player' | 'bot' | 'tie';
}

export default function WagerTestScreen() {
  const router = useRouter();

  // ── Game state ───────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('setup');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [currentRound, setCurrentRound] = useState(1);
  const [wager, setWager] = useState(3);
  const [botWager, setBotWager] = useState(3);
  const [roundPairs, setRoundPairs] = useState(ROUND_PAIRS[0]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [correctThisRound, setCorrectThisRound] = useState(0);
  const [playerTotalScore, setPlayerTotalScore] = useState(0);
  const [botTotalScore, setBotTotalScore] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [showAnswer, setShowAnswer] = useState<{ correct: boolean; text: string } | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  // ── Stats refs ───────────────────────────────────────────
  const llmPairGenTimes = useRef<number[]>([]);
  const llmPairGenSuccesses = useRef(0);
  const llmValidateTimes = useRef<number[]>([]);
  const currentRoundValidateTimes = useRef<number[]>([]);
  const currentRoundPairGenMs = useRef<number | null>(null);
  const supabaseHealthMs = useRef<number | null>(null);
  const supabaseAuthMs = useRef<number | null>(null);
  const serverHealthMs = useRef<number | null>(null);
  const gameStartTime = useRef(0);
  const loggerRef = useRef(createTestLogger('wager'));
  const botConfig = BOT_CONFIG[botDifficulty];

  const log = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setStatusLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 80));
    loggerRef.current.log(msg);
  }, []);

  // ── Connectivity checks ──────────────────────────────────
  const runConnectivityChecks = useCallback(async () => {
    log('Running connectivity checks...');

    try {
      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) });
      const ms = Math.round(performance.now() - t0);
      serverHealthMs.current = ms;
      log(`Server health: ${resp.ok ? 'OK' : 'FAIL'} (${ms}ms)`);
    } catch (e: any) {
      log(`Server health: UNREACHABLE - ${e.message}`);
    }

    try {
      const t0 = performance.now();
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      const ms = Math.round(performance.now() - t0);
      supabaseHealthMs.current = ms;
      log(`Supabase REST: ${resp.ok ? 'OK' : 'FAIL'} (${ms}ms)`);
    } catch (e: any) {
      log(`Supabase REST: UNREACHABLE - ${e.message}`);
    }

    try {
      const t0 = performance.now();
      const { data } = await supabase.auth.getSession();
      const ms = Math.round(performance.now() - t0);
      supabaseAuthMs.current = ms;
      log(`Supabase auth: ${data.session ? 'Authenticated' : 'No session'} (${ms}ms)`);
    } catch (e: any) {
      log(`Supabase auth: ERROR - ${e.message}`);
    }
  }, [log]);

  // ── Start game ────────────────────────────────────────────
  const startGame = useCallback(async () => {
    await runConnectivityChecks();
    setPhase('countdown');
    log('Countdown started');
    setTimeout(() => {
      gameStartTime.current = performance.now();
      setPhase('wager');
      log('Round 1 - Place your wager!');
    }, 2000);
  }, [runConnectivityChecks, log]);

  // ── Generate bot wager ────────────────────────────────────
  const generateBotWager = useCallback(() => {
    const style = botConfig.wagerStyle;
    let w: number;
    if (style === 'conservative') {
      w = Math.floor(Math.random() * 3) + 1;
    } else if (style === 'balanced') {
      w = Math.floor(Math.random() * 5) + 3;
    } else {
      w = Math.floor(Math.random() * 4) + 7;
    }
    return Math.min(w, WORDS_PER_ROUND);
  }, [botConfig]);

  // ── Start round (try to fetch LLM pairs) ─────────────────
  const handleStartRound = useCallback(async () => {
    const bw = generateBotWager();
    setBotWager(bw);
    log(`You wagered ${wager}, ${botConfig.name} wagered ${bw}`);

    // Try LLM pair gen
    currentRoundValidateTimes.current = [];
    const difficulty = currentRound <= 2 ? 'easy' : currentRound <= 4 ? 'medium' : 'hard';
    log(`Fetching LLM pairs (${difficulty}, round ${currentRound})...`);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/api/games/pairs`, {
        method: 'POST', headers,
        body: JSON.stringify({ fromLang: 'en', toLang: 'es', count: WORDS_PER_ROUND, difficulty }),
        signal: AbortSignal.timeout(30000),
      });
      const ms = Math.round(performance.now() - t0);
      currentRoundPairGenMs.current = ms;
      llmPairGenTimes.current.push(ms);

      const data = await resp.json();
      if (data.pairs && data.pairs.length > 0) {
        setRoundPairs(data.pairs);
        llmPairGenSuccesses.current++;
        log(`LLM pair gen: OK (${ms}ms) - ${data.pairs.length} pairs`);
      } else {
        log(`LLM pair gen: empty response (${ms}ms), using fallback`);
        setRoundPairs(ROUND_PAIRS[(currentRound - 1) % ROUND_PAIRS.length]);
      }
    } catch (e: any) {
      currentRoundPairGenMs.current = null;
      log(`LLM pair gen: FAILED - ${e.message}, using fallback`);
      setRoundPairs(ROUND_PAIRS[(currentRound - 1) % ROUND_PAIRS.length]);
    }

    setCurrentWordIndex(0);
    setCorrectThisRound(0);
    setPhase('play');
  }, [currentRound, wager, botConfig, generateBotWager, log]);

  // ── Validate answer (with LLM timing) ────────────────────
  const validateWithServer = useCallback(async (source: string, userAnswer: string, correctAnswer: string): Promise<{ correct: boolean; feedback: string; ms: number } | null> => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/api/games/validate`, {
        method: 'POST', headers,
        body: JSON.stringify({ source, userAnswer, correctAnswer, targetLang: 'es' }),
        signal: AbortSignal.timeout(15000),
      });
      const ms = Math.round(performance.now() - t0);
      const data = await resp.json();
      llmValidateTimes.current.push(ms);
      currentRoundValidateTimes.current.push(ms);
      log(`LLM validate: ${data.correct ? '✓' : '✗'} (${ms}ms)`);
      return { correct: data.correct, feedback: data.feedback || '', ms };
    } catch (e: any) {
      log(`LLM validate: FAILED - ${e.message}`);
      return null;
    }
  }, [log]);

  // ── Submit answer ─────────────────────────────────────────
  const handleSubmitAnswer = useCallback(async () => {
    if (!userInput.trim()) return;
    const currentWord = roundPairs[currentWordIndex];
    if (!currentWord) return;

    const answer = userInput.trim();
    setUserInput('');

    let isCorrect = answer.toLowerCase() === currentWord.target.toLowerCase();

    if (!isCorrect) {
      const serverResult = await validateWithServer(currentWord.source, answer, currentWord.target);
      if (serverResult) {
        isCorrect = serverResult.correct;
      }
    } else {
      log(`Exact match for "${answer}" - skipped LLM`);
    }

    if (isCorrect) {
      setCorrectThisRound(prev => prev + 1);
      setShowAnswer({ correct: true, text: 'Correct!' });
      log(`Player ✓ "${answer}"`);
    } else {
      setShowAnswer({ correct: false, text: `Answer: ${currentWord.target}` });
      log(`Player ✗ "${answer}" (correct: ${currentWord.target})`);
    }

    setTimeout(() => {
      setShowAnswer(null);
      if (currentWordIndex < roundPairs.length - 1) {
        setCurrentWordIndex(prev => prev + 1);
      } else {
        finishRound(isCorrect ? correctThisRound + 1 : correctThisRound);
      }
    }, 800);
  }, [userInput, roundPairs, currentWordIndex, correctThisRound, validateWithServer, log]);

  // ── Finish round ──────────────────────────────────────────
  const finishRound = useCallback((finalCorrect: number) => {
    const playerHit = finalCorrect >= wager;
    const playerPts = playerHit ? wager * 10 + (finalCorrect - wager) * 5 : -(wager * 5);

    // Bot plays
    let botCorrectCount = 0;
    for (let i = 0; i < WORDS_PER_ROUND; i++) {
      if (Math.random() < botConfig.accuracy) botCorrectCount++;
    }
    const botHit = botCorrectCount >= botWager;
    const botPts = botHit ? botWager * 10 + (botCorrectCount - botWager) * 5 : -(botWager * 5);

    const result: RoundResult = {
      round: currentRound,
      playerWager: wager,
      playerCorrect: finalCorrect,
      playerHitWager: playerHit,
      playerPoints: playerPts,
      botWager,
      botCorrect: botCorrectCount,
      botHitWager: botHit,
      botPoints: botPts,
      llmValidateMs: [...currentRoundValidateTimes.current],
      llmPairGenMs: currentRoundPairGenMs.current,
    };

    setRoundResults(prev => [...prev, result]);
    setPlayerTotalScore(prev => prev + playerPts);
    setBotTotalScore(prev => prev + botPts);
    log(`Round ${currentRound}: You ${playerHit ? 'HIT' : 'MISSED'} (${finalCorrect}/${wager}) ${playerPts >= 0 ? '+' : ''}${playerPts}pts | ${botConfig.name} ${botHit ? 'HIT' : 'MISSED'} (${botCorrectCount}/${botWager}) ${botPts >= 0 ? '+' : ''}${botPts}pts`);
    setPhase('roundResult');
  }, [currentRound, wager, botWager, botConfig, log]);

  // ── Next round / end game ─────────────────────────────────
  const handleNextRound = useCallback(() => {
    if (currentRound >= WAGER_ROUNDS) {
      // Compute final stats
      const totalTime = Math.round(performance.now() - gameStartTime.current);
      const allValidate = llmValidateTimes.current;
      const allPairGen = llmPairGenTimes.current;

      setPlayerTotalScore(pts => {
        setBotTotalScore(bts => {
          const stats: GameStats = {
            playerTotalScore: pts,
            botTotalScore: bts,
            playerTotalCorrect: roundResults.reduce((s, r) => s + r.playerCorrect, 0) + (roundResults.length < WAGER_ROUNDS ? correctThisRound : 0),
            botTotalCorrect: roundResults.reduce((s, r) => s + r.botCorrect, 0),
            playerWagersHit: roundResults.filter(r => r.playerHitWager).length,
            botWagersHit: roundResults.filter(r => r.botHitWager).length,

            llmTotalPairGenMs: allPairGen.reduce((s, v) => s + v, 0),
            llmAvgPairGenMs: allPairGen.length > 0 ? Math.round(allPairGen.reduce((s, v) => s + v, 0) / allPairGen.length) : 0,
            llmPairGenCalls: allPairGen.length,
            llmPairGenSuccesses: llmPairGenSuccesses.current,
            llmTotalValidateMs: allValidate.reduce((s, v) => s + v, 0),
            llmAvgValidateMs: allValidate.length > 0 ? Math.round(allValidate.reduce((s, v) => s + v, 0) / allValidate.length) : 0,
            llmValidateCalls: allValidate.length,
            llmMinValidateMs: allValidate.length > 0 ? Math.min(...allValidate) : 0,
            llmMaxValidateMs: allValidate.length > 0 ? Math.max(...allValidate) : 0,

            supabaseHealthMs: supabaseHealthMs.current,
            supabaseAuthMs: supabaseAuthMs.current,
            serverHealthMs: serverHealthMs.current,
            totalGameTimeMs: totalTime,
            winner: pts > bts ? 'player' : bts > pts ? 'bot' : 'tie',
          };
          setGameStats(stats);
          loggerRef.current.endSession(stats).catch(() => {});
          return bts;
        });
        return pts;
      });
      setPhase('gameover');
      log('Game over!');
    } else {
      setCurrentRound(prev => prev + 1);
      setWager(3);
      setPhase('wager');
      log(`Round ${currentRound + 1} - Place your wager!`);
    }
  }, [currentRound, roundResults, correctThisRound, log]);

  useEffect(() => {
    return () => { loggerRef.current.endSession().catch(() => {}); };
  }, []);

  // ── Setup ─────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
          </TouchableOpacity>

          <Text style={type.hero}>Test Mode</Text>
          <Text style={{ ...type.body, marginTop: 4 }}>Wager Mode vs Bot</Text>

          <Text style={{ ...type.label, marginTop: 28, marginBottom: 10 }}>Bot Difficulty</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['easy', 'medium', 'hard'] as BotDifficulty[]).map(diff => (
              <TouchableOpacity
                key={diff}
                onPress={() => setBotDifficulty(diff)}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: radii.md,
                  backgroundColor: botDifficulty === diff ? colors.blue.bright : colors.bg.secondary,
                  alignItems: 'center', borderWidth: 1,
                  borderColor: botDifficulty === diff ? colors.blue.bright : colors.glassBorder,
                }}
              >
                <Text style={{ fontSize: 18, marginBottom: 4 }}>{diff === 'easy' ? '🐢' : diff === 'medium' ? '🤖' : '⚡'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.silver.white, textTransform: 'capitalize' }}>{diff}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ ...card, padding: 16, marginTop: 16 }}>
            <Text style={{ ...type.caption, color: colors.blue.pale }}>What this tests</Text>
            <Text style={{ ...type.body, marginTop: 6, fontSize: 13, lineHeight: 20 }}>
              {'• LLM pair generation per round (timed)\n• LLM answer validation per word (timed)\n• Avg/Min/Max LLM latency across all rounds\n• Supabase REST & auth latency\n• Wager risk/reward vs bot strategy'}
            </Text>
          </View>

          <View style={{ ...card, padding: 16, marginTop: 12 }}>
            <Text style={type.headline}>{botConfig.name}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <View><Text style={type.footnote}>Accuracy</Text><Text style={{ fontSize: 16, fontWeight: '700', color: colors.warning }}>{Math.round(botConfig.accuracy * 100)}%</Text></View>
              <View><Text style={type.footnote}>Style</Text><Text style={{ fontSize: 16, fontWeight: '700', color: colors.blue.light, textTransform: 'capitalize' }}>{botConfig.wagerStyle}</Text></View>
              <View><Text style={type.footnote}>Rounds</Text><Text style={{ fontSize: 16, fontWeight: '700', color: colors.silver.white }}>{WAGER_ROUNDS}</Text></View>
            </View>
          </View>

          <TouchableOpacity onPress={startGame} style={{ ...button.primary, marginTop: 24, backgroundColor: colors.warning }}>
            <Text style={{ ...buttonText.primary, color: colors.bg.primary }}>Start Test Game</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Countdown ─────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.light, marginBottom: 8 }}>TEST MODE</Text>
        <Text style={{ fontSize: 48 }}>🎲</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.silver.white, marginTop: 16 }}>Wager Mode!</Text>
        <Text style={{ ...type.body, marginTop: 8 }}>vs {botConfig.name}</Text>
        <View style={{ marginTop: 24 }}>
          {statusLog.slice(0, 5).map((msg, i) => (
            <Text key={i} style={{ fontSize: 10, color: colors.silver.mid, fontFamily: 'Courier', marginTop: 2 }}>{msg}</Text>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ── Wager phase ───────────────────────────────────────────
  if (phase === 'wager') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'center' }}>
          <View style={{ backgroundColor: colors.blue.dark, borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: colors.blue.pale }}>TEST MODE</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid }}>Round</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.silver.white }}>{currentRound}/{WAGER_ROUNDS}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid }}>You</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: playerTotalScore >= 0 ? colors.success : colors.error }}>{playerTotalScore}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid }}>{botConfig.name}</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: botTotalScore >= 0 ? colors.error : colors.success }}>{botTotalScore}</Text>
            </View>
          </View>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.silver.white, marginBottom: 8 }}>Place Your Wager</Text>
            <Text style={{ fontSize: 14, color: colors.silver.light, textAlign: 'center', marginBottom: 32 }}>
              How many out of {WORDS_PER_ROUND} words can you translate?
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 32 }}>
              <TouchableOpacity onPress={() => setWager(prev => Math.max(1, prev - 1))} style={{ width: 48, height: 48, borderRadius: radii.xxl, backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.blue.dark }}>
                <Text style={{ fontSize: 24, color: colors.silver.white }}>−</Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 64, fontWeight: '800', color: colors.warning }}>{wager}</Text>
              </View>
              <TouchableOpacity onPress={() => setWager(prev => Math.min(WORDS_PER_ROUND, prev + 1))} style={{ width: 48, height: 48, borderRadius: radii.xxl, backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.blue.dark }}>
                <Text style={{ fontSize: 24, color: colors.silver.white }}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 24, marginBottom: 32 }}>
              <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 12, color: colors.silver.mid }}>If hit</Text><Text style={{ fontSize: 20, fontWeight: '700', color: colors.success }}>+{wager * 10}</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 12, color: colors.silver.mid }}>If miss</Text><Text style={{ fontSize: 20, fontWeight: '700', color: colors.error }}>−{wager * 5}</Text></View>
            </View>

            <TouchableOpacity onPress={handleStartRound} style={{ ...button.primary, backgroundColor: colors.warning, paddingHorizontal: 48 }}>
              <Text style={{ ...buttonText.primary, color: colors.bg.primary }}>Lock It In!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Play phase ────────────────────────────────────────────
  if (phase === 'play') {
    const currentWord = roundPairs[currentWordIndex];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: colors.blue.dark, borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: colors.blue.pale }}>TEST MODE — ROUND {currentRound}</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 12, color: colors.silver.mid }}>Correct</Text><Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{correctThisRound}</Text></View>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 12, color: colors.silver.mid }}>Wager</Text><Text style={{ fontSize: 24, fontWeight: '800', color: colors.warning }}>{wager}</Text></View>
            <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 12, color: colors.silver.mid }}>Left</Text><Text style={{ fontSize: 24, fontWeight: '800', color: colors.silver.white }}>{roundPairs.length - currentWordIndex}</Text></View>
          </View>

          <View style={{ height: 4, backgroundColor: colors.bg.secondary, borderRadius: 2, marginBottom: 24 }}>
            <View style={{ height: '100%', width: `${((currentWordIndex + 1) / roundPairs.length) * 100}%`, backgroundColor: correctThisRound >= wager ? colors.success : colors.warning, borderRadius: 2 }} />
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Translate</Text>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.silver.white, textAlign: 'center' }}>{currentWord?.source || '...'}</Text>
            </View>

            {showAnswer && (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: showAnswer.correct ? colors.success : colors.error }}>{showAnswer.text}</Text>
              </View>
            )}

            <TextInput
              value={userInput} onChangeText={setUserInput} onSubmitEditing={handleSubmitAnswer}
              placeholder="Type your translation..." placeholderTextColor={colors.silver.mid}
              autoCapitalize="none" autoCorrect={false} returnKeyType="send" autoFocus
              style={{ ...input, borderRadius: radii.lg, paddingVertical: 18, fontSize: 18, textAlign: 'center' }}
            />

            <TouchableOpacity onPress={handleSubmitAnswer} disabled={!userInput.trim()} style={{ ...(userInput.trim() ? { ...button.primary, backgroundColor: colors.warning } : button.secondary), borderRadius: radii.lg, marginTop: 12 }}>
              <Text style={{ ...(userInput.trim() ? { ...buttonText.primary, color: colors.bg.primary } : buttonText.secondary) }}>Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingBottom: 8 }}>
            {statusLog.slice(0, 2).map((msg, i) => (
              <Text key={i} style={{ fontSize: 9, color: colors.silver.dark, fontFamily: 'Courier' }}>{msg}</Text>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Round result ──────────────────────────────────────────
  if (phase === 'roundResult') {
    const last = roundResults[roundResults.length - 1];
    if (!last) return null;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.light }}>TEST MODE — ROUND {last.round}</Text>
        <Text style={{ fontSize: 48, marginTop: 8 }}>{last.playerHitWager ? '🎉' : '😅'}</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white, marginTop: 12 }}>
          {last.playerHitWager ? 'Wager Hit!' : 'Wager Missed!'}
        </Text>

        <View style={{ ...card, padding: 20, marginTop: 20, width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>You</Text>
              <Text style={{ fontSize: 14, color: colors.silver.light }}>{last.playerCorrect}/{WORDS_PER_ROUND} (wager: {last.playerWager})</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: last.playerPoints >= 0 ? colors.success : colors.error }}>{last.playerPoints >= 0 ? '+' : ''}{last.playerPoints}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>{botConfig.name}</Text>
              <Text style={{ fontSize: 14, color: colors.silver.light }}>{last.botCorrect}/{WORDS_PER_ROUND} (wager: {last.botWager})</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: last.botPoints >= 0 ? colors.success : colors.error }}>{last.botPoints >= 0 ? '+' : ''}{last.botPoints}</Text>
            </View>
          </View>
          {last.llmPairGenMs !== null && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 12, paddingTop: 12 }}>
              <Text style={{ fontSize: 11, color: colors.silver.mid, textAlign: 'center' }}>
                LLM pair gen: {last.llmPairGenMs}ms | Validate calls: {last.llmValidateMs.length} (avg: {last.llmValidateMs.length > 0 ? Math.round(last.llmValidateMs.reduce((a, b) => a + b, 0) / last.llmValidateMs.length) : 0}ms)
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12 }}>
          <Text style={{ color: colors.silver.mid }}>Total: </Text>
          <Text style={{ fontWeight: '700', color: playerTotalScore >= 0 ? colors.success : colors.error }}>{playerTotalScore}</Text>
          <Text style={{ color: colors.silver.mid }}> vs </Text>
          <Text style={{ fontWeight: '700', color: botTotalScore >= 0 ? colors.error : colors.success }}>{botTotalScore}</Text>
        </View>

        <TouchableOpacity onPress={handleNextRound} style={{ ...button.primary, paddingHorizontal: 48, marginTop: 24 }}>
          <Text style={buttonText.primary}>{currentRound >= WAGER_ROUNDS ? 'See Final Results' : `Round ${currentRound + 1} →`}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Game Over ─────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.light, textAlign: 'center' }}>TEST MODE RESULTS</Text>
        <Text style={{ ...type.hero, textAlign: 'center', marginTop: 4 }}>
          {playerTotalScore > botTotalScore ? '🏆 You Win!' : botTotalScore > playerTotalScore ? '🤖 Bot Wins!' : '🤝 Tie!'}
        </Text>

        <View style={{ ...card, padding: 20, marginTop: 16, flexDirection: 'row', justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 36, fontWeight: '800', color: playerTotalScore >= 0 ? colors.success : colors.error }}>{playerTotalScore}</Text>
            <Text style={type.body}>You</Text>
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '600', color: colors.silver.mid }}>vs</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 36, fontWeight: '800', color: botTotalScore >= 0 ? colors.error : colors.success }}>{botTotalScore}</Text>
            <Text style={type.body}>{botConfig.name}</Text>
          </View>
        </View>

        {gameStats && (
          <>
            <Text style={{ ...type.label, marginTop: 24, marginBottom: 8 }}>LLM Performance (Key Metrics)</Text>
            <View style={{ ...card, padding: 16 }}>
              <StatRow label="Pair Gen Calls" value={`${gameStats.llmPairGenCalls}`} />
              <StatRow label="Pair Gen Successes" value={`${gameStats.llmPairGenSuccesses} / ${gameStats.llmPairGenCalls}`} color={gameStats.llmPairGenSuccesses === gameStats.llmPairGenCalls ? colors.success : colors.warning} />
              <StatRow label="Avg Pair Gen Time" value={gameStats.llmAvgPairGenMs > 0 ? `${gameStats.llmAvgPairGenMs}ms` : 'N/A'} color={colors.warning} />
              <StatRow label="Total Pair Gen Time" value={gameStats.llmTotalPairGenMs > 0 ? `${(gameStats.llmTotalPairGenMs / 1000).toFixed(1)}s` : 'N/A'} />
              <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 6 }} />
              <StatRow label="Validate Calls" value={`${gameStats.llmValidateCalls}`} />
              <StatRow label="Avg Validate Time" value={gameStats.llmAvgValidateMs > 0 ? `${gameStats.llmAvgValidateMs}ms` : 'N/A'} color={colors.warning} />
              <StatRow label="Min Validate Time" value={gameStats.llmMinValidateMs > 0 ? `${gameStats.llmMinValidateMs}ms` : 'N/A'} color={colors.success} />
              <StatRow label="Max Validate Time" value={gameStats.llmMaxValidateMs > 0 ? `${gameStats.llmMaxValidateMs}ms` : 'N/A'} color={colors.error} />
              <StatRow label="Total LLM Time" value={`${((gameStats.llmTotalPairGenMs + gameStats.llmTotalValidateMs) / 1000).toFixed(1)}s`} />
            </View>

            <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Player Stats</Text>
            <View style={{ ...card, padding: 16 }}>
              <StatRow label="Total Correct" value={`${gameStats.playerTotalCorrect} / ${WAGER_ROUNDS * WORDS_PER_ROUND}`} />
              <StatRow label="Wagers Hit" value={`${gameStats.playerWagersHit} / ${WAGER_ROUNDS}`} />
            </View>

            <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Server / Supabase</Text>
            <View style={{ ...card, padding: 16 }}>
              <StatRow label="Server Health" value={gameStats.serverHealthMs !== null ? `${gameStats.serverHealthMs}ms` : 'Failed'} color={gameStats.serverHealthMs !== null ? colors.success : colors.error} />
              <StatRow label="Supabase REST" value={gameStats.supabaseHealthMs !== null ? `${gameStats.supabaseHealthMs}ms` : 'Failed'} color={gameStats.supabaseHealthMs !== null ? colors.success : colors.error} />
              <StatRow label="Supabase Auth" value={gameStats.supabaseAuthMs !== null ? `${gameStats.supabaseAuthMs}ms` : 'Failed'} color={gameStats.supabaseAuthMs !== null ? colors.success : colors.error} />
              <StatRow label="Total Game Time" value={`${(gameStats.totalGameTimeMs / 1000).toFixed(1)}s`} />
            </View>
          </>
        )}

        {/* Round Breakdown */}
        <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Round Breakdown</Text>
        <View style={{ ...card, padding: 12 }}>
          {roundResults.map(r => (
            <View key={r.round} style={{ paddingVertical: 8, borderBottomWidth: r.round < roundResults.length ? 0.5 : 0, borderBottomColor: colors.divider }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: colors.silver.white }}>Round {r.round}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: r.playerPoints >= 0 ? colors.success : colors.error }}>{r.playerPoints >= 0 ? '+' : ''}{r.playerPoints}</Text>
              </View>
              <Text style={{ fontSize: 10, color: colors.silver.mid, marginTop: 2 }}>
                You: {r.playerCorrect}/{WORDS_PER_ROUND} (w:{r.playerWager}) {r.playerHitWager ? '✓' : '✗'} | Bot: {r.botCorrect}/{WORDS_PER_ROUND} (w:{r.botWager}) {r.botHitWager ? '✓' : '✗'}
              </Text>
              {r.llmPairGenMs !== null && (
                <Text style={{ fontSize: 9, color: colors.blue.pale, marginTop: 1, fontFamily: 'Courier' }}>
                  pairGen: {r.llmPairGenMs}ms | validates: {r.llmValidateMs.length} (avg: {r.llmValidateMs.length > 0 ? Math.round(r.llmValidateMs.reduce((a, b) => a + b, 0) / r.llmValidateMs.length) : 0}ms)
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Event log */}
        <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Event Log</Text>
        <View style={{ ...card, padding: 12, maxHeight: 180 }}>
          <ScrollView nestedScrollEnabled>
            {statusLog.map((msg, i) => (
              <Text key={i} style={{ fontSize: 9, color: colors.silver.mid, fontFamily: 'Courier', lineHeight: 14 }}>{msg}</Text>
            ))}
          </ScrollView>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 }}>
          <TouchableOpacity
            onPress={() => {
              setPhase('setup');
              setCurrentRound(1);
              setWager(3);
              setPlayerTotalScore(0);
              setBotTotalScore(0);
              setRoundResults([]);
              setGameStats(null);
              setStatusLog([]);
              llmPairGenTimes.current = [];
              llmPairGenSuccesses.current = 0;
              llmValidateTimes.current = [];
            }}
            style={{ flex: 1, ...button.primary, backgroundColor: colors.warning }}
          >
            <Text style={{ ...buttonText.primary, color: colors.bg.primary }}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/')} style={{ flex: 1, ...button.secondary }}>
            <Text style={buttonText.secondary}>Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ fontSize: 13, color: colors.silver.light }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: color || colors.silver.white, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
