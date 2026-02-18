import { View, Text, TextInput, TouchableOpacity, Animated, Keyboard, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { colors, radii, type, card, button, buttonText, input } from '../../lib/theme';
import { SERVER_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { createTestLogger } from '../../lib/testLogger';

// ── Hardcoded test pairs (no server dependency) ──────────────
const TEST_PAIRS = [
  { source: 'Hello', target: 'Hola' },
  { source: 'Goodbye', target: 'Adiós' },
  { source: 'Thank you', target: 'Gracias' },
  { source: 'Please', target: 'Por favor' },
  { source: 'Good morning', target: 'Buenos días' },
  { source: 'Good night', target: 'Buenas noches' },
  { source: 'Water', target: 'Agua' },
  { source: 'Food', target: 'Comida' },
  { source: 'House', target: 'Casa' },
  { source: 'Dog', target: 'Perro' },
  { source: 'Cat', target: 'Gato' },
  { source: 'Book', target: 'Libro' },
  { source: 'Friend', target: 'Amigo' },
  { source: 'Love', target: 'Amor' },
  { source: 'Time', target: 'Tiempo' },
];

// ── Bot configuration ────────────────────────────────────────
type BotDifficulty = 'easy' | 'medium' | 'hard';
const BOT_CONFIG: Record<BotDifficulty, { minDelay: number; maxDelay: number; accuracy: number; name: string }> = {
  easy:   { minDelay: 4000, maxDelay: 8000,  accuracy: 0.5, name: 'SlowBot' },
  medium: { minDelay: 2000, maxDelay: 5000,  accuracy: 0.75, name: 'MediumBot' },
  hard:   { minDelay: 1000, maxDelay: 3000,  accuracy: 0.9, name: 'SpeedBot' },
};

const TIME_LIMIT = 90;

// ── Types ────────────────────────────────────────────────────
interface AnswerResult {
  index: number;
  correct: boolean;
  feedback: string;
  userAnswer: string;
  responseTimeMs: number;
  validationMethod: 'server' | 'local';
  serverLatencyMs?: number;
}

interface BotAction {
  index: number;
  correct: boolean;
  timeMs: number;
}

interface GameStats {
  // Player stats
  playerCorrect: number;
  playerAttempted: number;
  playerAccuracy: number;
  playerAvgResponseMs: number;
  playerFastestMs: number;
  playerSlowestMs: number;

  // Bot stats
  botCorrect: number;
  botAttempted: number;
  botAccuracy: number;

  // Server/Supabase stats
  serverValidationCalls: number;
  serverSuccesses: number;
  serverFailures: number;
  serverAvgLatencyMs: number;
  serverMinLatencyMs: number;
  serverMaxLatencyMs: number;

  // Supabase stats
  supabaseHealthCheckMs: number | null;
  supabaseAuthCheckMs: number | null;

  // Game meta
  totalGameTimeMs: number;
  pairsCount: number;
  winner: 'player' | 'bot' | 'tie';
}

export default function TranslationRaceTestScreen() {
  const router = useRouter();

  // ── Game state ───────────────────────────────────────────
  const [phase, setPhase] = useState<'setup' | 'countdown' | 'playing' | 'gameover'>('setup');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [pairs] = useState(TEST_PAIRS);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(TIME_LIMIT);

  // ── Stats tracking ───────────────────────────────────────
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [botActions, setBotActions] = useState<BotAction[]>([]);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);

  // ── Latency tracking ─────────────────────────────────────
  const serverLatencies = useRef<number[]>([]);
  const questionStartTime = useRef<number>(0);
  const gameStartTime = useRef<number>(0);
  const supabaseHealthMs = useRef<number | null>(null);
  const supabaseAuthMs = useRef<number | null>(null);

  // ── UI state ─────────────────────────────────────────────
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  // ── Refs ──────────────────────────────────────────────────
  const inputRef = useRef<TextInput>(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botPairIndex = useRef(0);
  const loggerRef = useRef(createTestLogger('translation-race'));

  const currentPair = pairs[currentPairIndex];
  const botConfig = BOT_CONFIG[botDifficulty];

  const log = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setStatusLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
    loggerRef.current.log(msg);
  }, []);

  // ── Pre-game connectivity checks ─────────────────────────
  const runConnectivityChecks = useCallback(async () => {
    log('Running connectivity checks...');

    // Check server health
    try {
      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) });
      const latency = Math.round(performance.now() - t0);
      if (resp.ok) {
        log(`Server health: OK (${latency}ms)`);
      } else {
        log(`Server health: FAIL status=${resp.status} (${latency}ms)`);
      }
    } catch (e: any) {
      log(`Server health: UNREACHABLE - ${e.message}`);
    }

    // Check Supabase
    try {
      const t0 = performance.now();
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      const latency = Math.round(performance.now() - t0);
      supabaseHealthMs.current = latency;
      log(`Supabase REST: ${resp.ok ? 'OK' : 'FAIL'} (${latency}ms)`);
    } catch (e: any) {
      supabaseHealthMs.current = null;
      log(`Supabase REST: UNREACHABLE - ${e.message}`);
    }

    // Check Supabase auth
    try {
      const t0 = performance.now();
      const { data } = await supabase.auth.getSession();
      const latency = Math.round(performance.now() - t0);
      supabaseAuthMs.current = latency;
      log(`Supabase auth: ${data.session ? 'Authenticated' : 'No session'} (${latency}ms)`);
    } catch (e: any) {
      supabaseAuthMs.current = null;
      log(`Supabase auth: ERROR - ${e.message}`);
    }
  }, [log]);

  // ── Start game ────────────────────────────────────────────
  const startGame = useCallback(async () => {
    await runConnectivityChecks();
    setPhase('countdown');
    log('Countdown started');
    setTimeout(() => {
      setPhase('playing');
      gameStartTime.current = performance.now();
      questionStartTime.current = performance.now();
      log('Game started!');
      inputRef.current?.focus();
      scheduleBotAnswer(0);
    }, 2000);
  }, [runConnectivityChecks, log]);

  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'playing' && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleGameEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Bot logic ─────────────────────────────────────────────
  const scheduleBotAnswer = useCallback((pairIdx: number) => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    const delay = botConfig.minDelay + Math.random() * (botConfig.maxDelay - botConfig.minDelay);
    botTimerRef.current = setTimeout(() => {
      const isCorrect = Math.random() < botConfig.accuracy;
      if (isCorrect) {
        setBotScore(prev => prev + 1);
      }
      setBotActions(prev => [...prev, { index: pairIdx, correct: isCorrect, timeMs: Math.round(delay) }]);
      log(`Bot ${isCorrect ? '✓' : '✗'} pair #${pairIdx + 1} (${Math.round(delay)}ms)`);

      botPairIndex.current = pairIdx + 1;
      if (botPairIndex.current < pairs.length) {
        scheduleBotAnswer(botPairIndex.current);
      }
    }, delay);
  }, [botConfig, pairs.length, log]);

  // Cleanup bot timer
  useEffect(() => {
    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  }, []);

  // ── Server validation with latency tracking ───────────────
  const validateWithServer = useCallback(async (source: string, userAnswer: string, correctAnswer: string): Promise<{ correct: boolean; feedback: string; serverMs: number } | null> => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/api/games/validate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source, userAnswer, correctAnswer, targetLang: 'es' }),
        signal: AbortSignal.timeout(8000),
      });
      const serverMs = Math.round(performance.now() - t0);
      const data = await resp.json();
      serverLatencies.current.push(serverMs);
      log(`Server validate: ${data.correct ? '✓' : '✗'} (${serverMs}ms)`);
      return { correct: data.correct, feedback: data.feedback || '', serverMs };
    } catch (e: any) {
      log(`Server validate FAILED: ${e.message}`);
      return null;
    }
  }, [log]);

  // ── Local validation fallback ─────────────────────────────
  const validateLocally = (userAnswer: string, correctAnswer: string): boolean => {
    return userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
  };

  // ── Submit answer ─────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!userInput.trim() || !currentPair || phase !== 'playing') return;
    const answer = userInput.trim();
    const responseTime = Math.round(performance.now() - questionStartTime.current);
    setUserInput('');

    // Try server validation, fall back to local
    const serverResult = await validateWithServer(currentPair.source, answer, currentPair.target);
    let isCorrect: boolean;
    let feedback: string;
    let validationMethod: 'server' | 'local';
    let serverLatencyMs: number | undefined;

    if (serverResult) {
      isCorrect = serverResult.correct;
      feedback = serverResult.feedback;
      validationMethod = 'server';
      serverLatencyMs = serverResult.serverMs;
    } else {
      isCorrect = validateLocally(answer, currentPair.target);
      feedback = isCorrect ? 'Correct! (local)' : `Correct answer: ${currentPair.target}`;
      validationMethod = 'local';
    }

    const result: AnswerResult = {
      index: currentPairIndex,
      correct: isCorrect,
      feedback,
      userAnswer: answer,
      responseTimeMs: responseTime,
      validationMethod,
      serverLatencyMs,
    };
    setResults(prev => [...prev, result]);

    if (isCorrect) {
      setPlayerScore(prev => prev + 1);
      showCorrectFeedback();
    } else {
      showIncorrectFeedback(feedback);
    }

    log(`Player ${isCorrect ? '✓' : '✗'} "${answer}" (${responseTime}ms, ${validationMethod})`);

    if (currentPairIndex < pairs.length - 1) {
      setTimeout(() => {
        setCurrentPairIndex(prev => prev + 1);
        setShowFeedback(false);
        questionStartTime.current = performance.now();
        inputRef.current?.focus();
      }, 700);
    } else {
      handleGameEnd();
    }
  }, [userInput, currentPair, currentPairIndex, phase, validateWithServer, log]);

  // ── Skip ──────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    const responseTime = Math.round(performance.now() - questionStartTime.current);
    setResults(prev => [...prev, {
      index: currentPairIndex,
      correct: false,
      feedback: 'Skipped',
      userAnswer: '(skipped)',
      responseTimeMs: responseTime,
      validationMethod: 'local',
    }]);
    log(`Player skipped pair #${currentPairIndex + 1}`);

    if (currentPairIndex < pairs.length - 1) {
      setCurrentPairIndex(prev => prev + 1);
      questionStartTime.current = performance.now();
    } else {
      handleGameEnd();
    }
  }, [currentPairIndex, log]);

  // ── Feedback animations ───────────────────────────────────
  const showCorrectFeedback = () => {
    setLastFeedback({ correct: true, text: 'Correct!' });
    setShowFeedback(true);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 400, delay: 200, useNativeDriver: true }),
    ]).start();
  };

  const showIncorrectFeedback = (text: string) => {
    setLastFeedback({ correct: false, text });
    setShowFeedback(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // ── End game & compute stats ──────────────────────────────
  const handleGameEnd = useCallback(() => {
    if (phase === 'gameover') return;
    setPhase('gameover');
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    Keyboard.dismiss();

    const totalTime = Math.round(performance.now() - gameStartTime.current);

    // Compute stats from results available at the moment of game end
    // We use a timeout to let the last setState calls flush
    setTimeout(() => {
      setResults(currentResults => {
        setBotActions(currentBotActions => {
          const playerCorrect = currentResults.filter(r => r.correct).length;
          const playerAttempted = currentResults.length;
          const responseTimes = currentResults.map(r => r.responseTimeMs);
          const serverCalls = currentResults.filter(r => r.validationMethod === 'server');
          const latencies = serverLatencies.current;

          const finalBotScore = currentBotActions.filter(a => a.correct).length;

          const stats: GameStats = {
            playerCorrect,
            playerAttempted,
            playerAccuracy: playerAttempted > 0 ? Math.round((playerCorrect / playerAttempted) * 100) : 0,
            playerAvgResponseMs: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0,
            playerFastestMs: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
            playerSlowestMs: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,

            botCorrect: finalBotScore,
            botAttempted: currentBotActions.length,
            botAccuracy: currentBotActions.length > 0 ? Math.round((finalBotScore / currentBotActions.length) * 100) : 0,

            serverValidationCalls: serverCalls.length,
            serverSuccesses: serverCalls.length,
            serverFailures: playerAttempted - serverCalls.length,
            serverAvgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
            serverMinLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
            serverMaxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,

            supabaseHealthCheckMs: supabaseHealthMs.current,
            supabaseAuthCheckMs: supabaseAuthMs.current,

            totalGameTimeMs: totalTime,
            pairsCount: pairs.length,
            winner: playerCorrect > finalBotScore ? 'player' : finalBotScore > playerCorrect ? 'bot' : 'tie',
          };

          setGameStats(stats);
          loggerRef.current.endSession(stats).catch(() => {});
          return currentBotActions;
        });
        return currentResults;
      });
    }, 100);

    log('Game ended');
  }, [phase, pairs.length, log]);

  useEffect(() => {
    return () => { loggerRef.current.endSession().catch(() => {}); };
  }, []);

  // ── Render: Setup screen ──────────────────────────────────
  if (phase === 'setup') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
          </TouchableOpacity>

          <Text style={type.hero}>Test Mode</Text>
          <Text style={{ ...type.body, marginTop: 4 }}>Translation Race vs Bot</Text>

          {/* Bot Difficulty */}
          <Text style={{ ...type.label, marginTop: 28, marginBottom: 10 }}>Bot Difficulty</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['easy', 'medium', 'hard'] as BotDifficulty[]).map(diff => (
              <TouchableOpacity
                key={diff}
                onPress={() => setBotDifficulty(diff)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: radii.md,
                  backgroundColor: botDifficulty === diff ? colors.blue.bright : colors.bg.secondary,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: botDifficulty === diff ? colors.blue.bright : colors.glassBorder,
                }}
              >
                <Text style={{ fontSize: 18, marginBottom: 4 }}>
                  {diff === 'easy' ? '🐢' : diff === 'medium' ? '🤖' : '⚡'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.silver.white, textTransform: 'capitalize' }}>{diff}</Text>
                <Text style={{ fontSize: 10, color: colors.silver.mid, marginTop: 2 }}>
                  {BOT_CONFIG[diff].name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bot Info */}
          <View style={{ ...card, padding: 16, marginTop: 16 }}>
            <Text style={type.headline}>{botConfig.name}</Text>
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
              <View>
                <Text style={type.footnote}>Accuracy</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.warning }}>{Math.round(botConfig.accuracy * 100)}%</Text>
              </View>
              <View>
                <Text style={type.footnote}>Speed</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.blue.light }}>
                  {(botConfig.minDelay / 1000).toFixed(1)}-{(botConfig.maxDelay / 1000).toFixed(1)}s
                </Text>
              </View>
              <View>
                <Text style={type.footnote}>Pairs</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.silver.white }}>{pairs.length}</Text>
              </View>
              <View>
                <Text style={type.footnote}>Time</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.silver.white }}>{TIME_LIMIT}s</Text>
              </View>
            </View>
          </View>

          {/* Test Info */}
          <View style={{ ...card, padding: 16, marginTop: 12 }}>
            <Text style={{ ...type.caption, color: colors.blue.pale }}>What this tests</Text>
            <Text style={{ ...type.body, marginTop: 6, fontSize: 13, lineHeight: 20 }}>
              {'• Server /api/games/validate response time\n• Supabase REST API latency\n• Supabase auth session check\n• Per-question player response time\n• Bot simulation accuracy\n• Local fallback when server unavailable'}
            </Text>
          </View>

          <TouchableOpacity onPress={startGame} style={{ ...button.primary, marginTop: 24, backgroundColor: colors.success }}>
            <Text style={buttonText.primary}>Start Test Game</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Countdown ─────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.light, marginBottom: 8 }}>TEST MODE</Text>
        <Text style={{ fontSize: 48, fontWeight: '800', color: colors.silver.white }}>Get Ready!</Text>
        <Text style={{ ...type.body, marginTop: 12 }}>vs {botConfig.name} ({botDifficulty})</Text>
        <View style={{ marginTop: 24 }}>
          {statusLog.slice(0, 5).map((msg, i) => (
            <Text key={i} style={{ fontSize: 10, color: colors.silver.mid, fontFamily: 'Courier', marginTop: 2 }}>{msg}</Text>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Game Over with Stats ──────────────────────────
  if (phase === 'gameover') {
    const correctCount = results.filter(r => r.correct).length;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.light, textAlign: 'center' }}>TEST MODE RESULTS</Text>
          <Text style={{ ...type.hero, textAlign: 'center', marginTop: 4 }}>
            {correctCount > botScore ? '🏆 You Win!' : botScore > correctCount ? '🤖 Bot Wins!' : '🤝 Tie!'}
          </Text>

          {/* Score Comparison */}
          <View style={{ ...card, padding: 20, marginTop: 16, flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.success }}>{correctCount}</Text>
              <Text style={type.body}>You</Text>
            </View>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.silver.mid }}>vs</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.error }}>{botScore}</Text>
              <Text style={type.body}>{botConfig.name}</Text>
            </View>
          </View>

          {/* Player Stats */}
          {gameStats && (
            <>
              <Text style={{ ...type.label, marginTop: 24, marginBottom: 8 }}>Player Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Attempted" value={`${gameStats.playerAttempted} / ${gameStats.pairsCount}`} />
                <StatRow label="Accuracy" value={`${gameStats.playerAccuracy}%`} color={gameStats.playerAccuracy >= 70 ? colors.success : colors.warning} />
                <StatRow label="Avg Response" value={`${gameStats.playerAvgResponseMs}ms`} />
                <StatRow label="Fastest" value={`${gameStats.playerFastestMs}ms`} color={colors.success} />
                <StatRow label="Slowest" value={`${gameStats.playerSlowestMs}ms`} color={colors.error} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Bot Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Attempted" value={`${gameStats.botAttempted}`} />
                <StatRow label="Correct" value={`${gameStats.botCorrect}`} />
                <StatRow label="Accuracy" value={`${gameStats.botAccuracy}%`} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Server / API Stats</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Validation Calls" value={`${gameStats.serverValidationCalls}`} />
                <StatRow label="Local Fallbacks" value={`${gameStats.serverFailures}`} color={gameStats.serverFailures > 0 ? colors.warning : colors.success} />
                <StatRow label="Avg Server Latency" value={gameStats.serverAvgLatencyMs > 0 ? `${gameStats.serverAvgLatencyMs}ms` : 'N/A'} />
                <StatRow label="Min Server Latency" value={gameStats.serverMinLatencyMs > 0 ? `${gameStats.serverMinLatencyMs}ms` : 'N/A'} color={colors.success} />
                <StatRow label="Max Server Latency" value={gameStats.serverMaxLatencyMs > 0 ? `${gameStats.serverMaxLatencyMs}ms` : 'N/A'} color={colors.error} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Supabase Stats</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="REST Health Check" value={gameStats.supabaseHealthCheckMs !== null ? `${gameStats.supabaseHealthCheckMs}ms` : 'Failed'} color={gameStats.supabaseHealthCheckMs !== null ? colors.success : colors.error} />
                <StatRow label="Auth Session Check" value={gameStats.supabaseAuthCheckMs !== null ? `${gameStats.supabaseAuthCheckMs}ms` : 'Failed'} color={gameStats.supabaseAuthCheckMs !== null ? colors.success : colors.error} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Game Meta</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Total Game Time" value={`${(gameStats.totalGameTimeMs / 1000).toFixed(1)}s`} />
                <StatRow label="Winner" value={gameStats.winner === 'player' ? 'You' : gameStats.winner === 'bot' ? botConfig.name : 'Tie'} color={gameStats.winner === 'player' ? colors.success : gameStats.winner === 'bot' ? colors.error : colors.warning} />
              </View>
            </>
          )}

          {/* Per-Question Breakdown */}
          <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Question Breakdown</Text>
          <View style={{ ...card, padding: 12 }}>
            {results.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: i < results.length - 1 ? 0.5 : 0, borderBottomColor: colors.divider }}>
                <Text style={{ fontSize: 14, width: 22 }}>{r.correct ? '✅' : '❌'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.silver.white }} numberOfLines={1}>{pairs[r.index]?.source} → {r.userAnswer}</Text>
                  <Text style={{ fontSize: 10, color: colors.silver.mid }}>
                    {r.responseTimeMs}ms • {r.validationMethod}{r.serverLatencyMs ? ` (server: ${r.serverLatencyMs}ms)` : ''}
                  </Text>
                </View>
              </View>
            ))}
            {results.length === 0 && <Text style={{ ...type.caption, textAlign: 'center', paddingVertical: 8 }}>No answers submitted</Text>}
          </View>

          {/* Debug Log */}
          <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Event Log</Text>
          <View style={{ ...card, padding: 12, maxHeight: 200 }}>
            <ScrollView nestedScrollEnabled>
              {statusLog.map((msg, i) => (
                <Text key={i} style={{ fontSize: 9, color: colors.silver.mid, fontFamily: 'Courier', lineHeight: 14 }}>{msg}</Text>
              ))}
            </ScrollView>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 }}>
            <TouchableOpacity
              onPress={() => {
                setPhase('setup');
                setCurrentPairIndex(0);
                setPlayerScore(0);
                setBotScore(0);
                setResults([]);
                setBotActions([]);
                setGameStats(null);
                setTimeRemaining(TIME_LIMIT);
                setStatusLog([]);
                serverLatencies.current = [];
                botPairIndex.current = 0;
              }}
              style={{ flex: 1, ...button.primary }}
            >
              <Text style={buttonText.primary}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/')} style={{ flex: 1, ...button.secondary }}>
              <Text style={buttonText.secondary}>Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Active game ───────────────────────────────────
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const isLow = timeRemaining <= 10;
  const progress = timeRemaining / TIME_LIMIT;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Test Mode Banner */}
        <View style={{ backgroundColor: colors.blue.dark, borderRadius: radii.sm, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'center', marginTop: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.blue.pale }}>TEST MODE</Text>
        </View>

        {/* HUD */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
          <View style={{ alignItems: 'center', minWidth: 60 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{playerScore}</Text>
            <Text style={type.footnote}>You</Text>
          </View>

          {/* Timer */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'], color: isLow ? colors.error : colors.silver.white }}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </Text>
            <View style={{ width: 120, height: 3, backgroundColor: colors.bg.secondary, borderRadius: 1.5, marginTop: 6, overflow: 'hidden' }}>
              <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: isLow ? colors.error : colors.blue.bright, borderRadius: 1.5 }} />
            </View>
          </View>

          <View style={{ alignItems: 'center', minWidth: 60 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.error }}>{botScore}</Text>
            <Text style={type.footnote}>{botConfig.name}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={{ height: 2, backgroundColor: colors.bg.secondary, borderRadius: 1, marginBottom: 24 }}>
          <View style={{ height: '100%', width: `${((currentPairIndex + 1) / pairs.length) * 100}%`, backgroundColor: colors.blue.bright, borderRadius: 1 }} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <Text style={type.label}>Translate this</Text>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }], marginTop: 10 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.silver.white, textAlign: 'center', lineHeight: 36 }}>
                {currentPair?.source || '...'}
              </Text>
            </Animated.View>
          </View>

          {showFeedback && lastFeedback && (
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: lastFeedback.correct ? colors.success : colors.error }}>{lastFeedback.text}</Text>
            </View>
          )}

          <TextInput
            ref={inputRef}
            value={userInput}
            onChangeText={setUserInput}
            onSubmitEditing={handleSubmit}
            placeholder="Type your translation..."
            placeholderTextColor={colors.silver.dark}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            style={{ ...input, textAlign: 'center', fontSize: 18, borderWidth: 1.5, borderColor: colors.blue.dark }}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!userInput.trim()}
            style={{ ...button.primary, marginTop: 12, opacity: userInput.trim() ? 1 : 0.4 }}
          >
            <Text style={buttonText.primary}>Submit</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkip} style={{ alignItems: 'center', marginTop: 14 }}>
            <Text style={{ fontSize: 13, color: colors.silver.mid }}>Skip ›</Text>
          </TouchableOpacity>
        </View>

        {/* Mini log at bottom */}
        <View style={{ paddingBottom: 8 }}>
          {statusLog.slice(0, 2).map((msg, i) => (
            <Text key={i} style={{ fontSize: 9, color: colors.silver.dark, fontFamily: 'Courier' }}>{msg}</Text>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Stat row component ──────────────────────────────────────
function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ fontSize: 13, color: colors.silver.light }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: color || colors.silver.white, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
