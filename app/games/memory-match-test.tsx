import { View, Text, TouchableOpacity, Dimensions, Animated, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { colors, radii, type, card, button, buttonText } from '../../lib/theme';
import { SERVER_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { createTestLogger } from '../../lib/testLogger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLS = 4;
const CARD_GAP = 8;
const CARD_SIZE = (SCREEN_WIDTH - 40 - CARD_GAP * (GRID_COLS - 1)) / GRID_COLS;

// ── Hardcoded pairs ──────────────────────────────────────────
const TEST_PAIRS = [
  { source: 'Hello', target: 'Hola' },
  { source: 'Dog', target: 'Perro' },
  { source: 'Cat', target: 'Gato' },
  { source: 'House', target: 'Casa' },
  { source: 'Water', target: 'Agua' },
  { source: 'Book', target: 'Libro' },
  { source: 'Sun', target: 'Sol' },
  { source: 'Moon', target: 'Luna' },
];

// ── Bot config ───────────────────────────────────────────────
type BotDifficulty = 'easy' | 'medium' | 'hard';
const BOT_CONFIG: Record<BotDifficulty, { memoryChance: number; flipDelay: number; name: string }> = {
  easy:   { memoryChance: 0.2, flipDelay: 4000, name: 'ForgetBot' },
  medium: { memoryChance: 0.55, flipDelay: 2500, name: 'MemBot' },
  hard:   { memoryChance: 0.85, flipDelay: 1500, name: 'RecallBot' },
};

// ── Types ────────────────────────────────────────────────────
interface Card {
  id: number;
  text: string;
  pairIndex: number;
  isSource: boolean;
  isFlipped: boolean;
  isMatched: boolean;
}

interface GameStats {
  playerMatches: number;
  playerAttempts: number;
  playerAccuracy: number;
  playerAvgFlipTimeMs: number;

  botMatches: number;
  botAttempts: number;
  botAccuracy: number;

  llmPairGenMs: number | null;
  llmPairGenSuccess: boolean;

  supabaseHealthMs: number | null;
  supabaseAuthMs: number | null;
  serverHealthMs: number | null;

  totalGameTimeMs: number;
  winner: 'player' | 'bot' | 'tie';
}

export default function MemoryMatchTestScreen() {
  const router = useRouter();

  // ── Game state ───────────────────────────────────────────
  const [phase, setPhase] = useState<'setup' | 'countdown' | 'playing' | 'gameover'>('setup');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [playerMatches, setPlayerMatches] = useState(0);
  const [playerAttempts, setPlayerAttempts] = useState(0);
  const [botMatches, setBotMatches] = useState(0);
  const [botAttempts, setBotAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  // ── Stats refs ───────────────────────────────────────────
  const flipTimes = useRef<number[]>([]);
  const flipStartTime = useRef(0);
  const gameStartTime = useRef(0);
  const llmPairGenMs = useRef<number | null>(null);
  const llmPairGenSuccess = useRef(false);
  const supabaseHealthMs = useRef<number | null>(null);
  const supabaseAuthMs = useRef<number | null>(null);
  const serverHealthMs = useRef<number | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipAnims = useRef<Animated.Value[]>([]);
  const loggerRef = useRef(createTestLogger('memory-match'));
  const botConfig = BOT_CONFIG[botDifficulty];

  const log = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setStatusLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
    loggerRef.current.log(msg);
  }, []);

  // ── Initialize cards ──────────────────────────────────────
  const initCards = useCallback(() => {
    const cardList: Card[] = [];
    TEST_PAIRS.forEach((pair, idx) => {
      cardList.push({ id: idx * 2, text: pair.source, pairIndex: idx, isSource: true, isFlipped: false, isMatched: false });
      cardList.push({ id: idx * 2 + 1, text: pair.target, pairIndex: idx, isSource: false, isFlipped: false, isMatched: false });
    });
    const shuffled = cardList.sort(() => Math.random() - 0.5);
    flipAnims.current = shuffled.map(() => new Animated.Value(0));
    setCards(shuffled);
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

    // LLM pair generation test
    log('Testing LLM pair generation (8 pairs for memory)...');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/api/games/pairs`, {
        method: 'POST', headers,
        body: JSON.stringify({ fromLang: 'en', toLang: 'es', count: 8, difficulty: 'medium' }),
        signal: AbortSignal.timeout(30000),
      });
      const ms = Math.round(performance.now() - t0);
      llmPairGenMs.current = ms;
      const data = await resp.json();
      llmPairGenSuccess.current = !!(data.pairs && data.pairs.length > 0);
      log(`LLM pair gen (8 pairs): ${llmPairGenSuccess.current ? 'OK' : 'FAIL'} (${ms}ms)`);
    } catch (e: any) {
      llmPairGenMs.current = null;
      log(`LLM pair gen: FAILED - ${e.message}`);
    }
  }, [log]);

  // ── Start game ────────────────────────────────────────────
  const startGame = useCallback(async () => {
    initCards();
    await runConnectivityChecks();
    setPhase('countdown');
    log('Countdown started');
    setTimeout(() => {
      setPhase('playing');
      gameStartTime.current = performance.now();
      flipStartTime.current = performance.now();
      log('Game started! Your turn.');
    }, 2000);
  }, [initCards, runConnectivityChecks, log]);

  // ── Elapsed timer ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((performance.now() - gameStartTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Card flip helpers ─────────────────────────────────────
  const flipCard = useCallback((index: number) => {
    Animated.spring(flipAnims.current[index], { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start();
  }, []);

  const unflipCard = useCallback((index: number) => {
    Animated.spring(flipAnims.current[index], { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
  }, []);

  // ── Check if game is over ────────────────────────────────
  const checkGameOver = useCallback((currentCards: Card[], pMatches: number, bMatches: number) => {
    const totalPairs = TEST_PAIRS.length;
    if (pMatches + bMatches >= totalPairs) {
      setPhase('gameover');
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      const totalTime = Math.round(performance.now() - gameStartTime.current);
      const ft = flipTimes.current;

      const stats: GameStats = {
        playerMatches: pMatches,
        playerAttempts,
        playerAccuracy: playerAttempts > 0 ? Math.round((pMatches / playerAttempts) * 100) : 0,
        playerAvgFlipTimeMs: ft.length > 0 ? Math.round(ft.reduce((a, b) => a + b, 0) / ft.length) : 0,
        botMatches: bMatches,
        botAttempts,
        botAccuracy: botAttempts > 0 ? Math.round((bMatches / botAttempts) * 100) : 0,
        llmPairGenMs: llmPairGenMs.current,
        llmPairGenSuccess: llmPairGenSuccess.current,
        supabaseHealthMs: supabaseHealthMs.current,
        supabaseAuthMs: supabaseAuthMs.current,
        serverHealthMs: serverHealthMs.current,
        totalGameTimeMs: totalTime,
        winner: pMatches > bMatches ? 'player' : bMatches > pMatches ? 'bot' : 'tie',
      };
      setGameStats(stats);
      loggerRef.current.endSession(stats).catch(() => {});
      log('Game over!');
    }
  }, [playerAttempts, botAttempts, log]);

  useEffect(() => {
    return () => { loggerRef.current.endSession().catch(() => {}); };
  }, []);

  // ── Player card press ─────────────────────────────────────
  const handleCardPress = useCallback((cardIndex: number) => {
    if (isChecking || phase !== 'playing' || !isPlayerTurn) return;
    const c = cards[cardIndex];
    if (c.isFlipped || c.isMatched) return;
    if (selectedCards.length >= 2) return;

    const flipTime = Math.round(performance.now() - flipStartTime.current);
    flipTimes.current.push(flipTime);

    flipCard(cardIndex);
    const newCards = [...cards];
    newCards[cardIndex] = { ...c, isFlipped: true };
    setCards(newCards);

    const newSelected = [...selectedCards, cardIndex];
    setSelectedCards(newSelected);

    if (newSelected.length === 2) {
      setIsChecking(true);
      setPlayerAttempts(prev => prev + 1);
      const card1 = newCards[newSelected[0]];
      const card2 = newCards[newSelected[1]];

      if (card1.pairIndex === card2.pairIndex && card1.isSource !== card2.isSource) {
        setTimeout(() => {
          const matched = [...newCards];
          matched[newSelected[0]] = { ...card1, isMatched: true };
          matched[newSelected[1]] = { ...card2, isMatched: true };
          setCards(matched);
          setSelectedCards([]);
          setIsChecking(false);
          setPlayerMatches(prev => {
            const next = prev + 1;
            log(`Player matched "${card1.text}" ↔ "${card2.text}"`);
            flipStartTime.current = performance.now();
            checkGameOver(matched, next, botMatches);
            return next;
          });
        }, 500);
      } else {
        log(`Player no match: "${card1.text}" / "${card2.text}"`);
        setTimeout(() => {
          unflipCard(newSelected[0]);
          unflipCard(newSelected[1]);
          const reset = [...newCards];
          reset[newSelected[0]] = { ...reset[newSelected[0]], isFlipped: false };
          reset[newSelected[1]] = { ...reset[newSelected[1]], isFlipped: false };
          setCards(reset);
          setSelectedCards([]);
          setIsChecking(false);
          setIsPlayerTurn(false);
          flipStartTime.current = performance.now();
        }, 800);
      }
    } else {
      flipStartTime.current = performance.now();
    }
  }, [cards, selectedCards, isChecking, phase, isPlayerTurn, botMatches, flipCard, unflipCard, checkGameOver, log]);

  // ── Bot turn ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || isPlayerTurn || isChecking) return;

    botTimerRef.current = setTimeout(() => {
      const unmatched = cards.map((c, i) => ({ ...c, idx: i })).filter(c => !c.isMatched && !c.isFlipped);
      if (unmatched.length < 2) {
        setIsPlayerTurn(true);
        return;
      }

      setBotAttempts(prev => prev + 1);
      const knowsMatch = Math.random() < botConfig.memoryChance;

      if (knowsMatch) {
        const pairGroups: Record<number, number[]> = {};
        unmatched.forEach(c => {
          if (!pairGroups[c.pairIndex]) pairGroups[c.pairIndex] = [];
          pairGroups[c.pairIndex].push(c.idx);
        });
        const completePairs = Object.values(pairGroups).filter(g => g.length === 2);

        if (completePairs.length > 0) {
          const [idx1, idx2] = completePairs[Math.floor(Math.random() * completePairs.length)];
          flipCard(idx1);
          flipCard(idx2);
          const newCards = [...cards];
          newCards[idx1] = { ...newCards[idx1], isFlipped: true };
          newCards[idx2] = { ...newCards[idx2], isFlipped: true };

          setTimeout(() => {
            const matched = [...newCards];
            matched[idx1] = { ...matched[idx1], isMatched: true };
            matched[idx2] = { ...matched[idx2], isMatched: true };
            setCards(matched);
            setBotMatches(prev => {
              const next = prev + 1;
              log(`Bot matched "${matched[idx1].text}" ↔ "${matched[idx2].text}"`);
              checkGameOver(matched, playerMatches, next);
              return next;
            });
            setIsPlayerTurn(true);
            flipStartTime.current = performance.now();
          }, 700);
          setCards(newCards);
          return;
        }
      }

      // Bot picks two random cards (no match)
      const shuffled = unmatched.sort(() => Math.random() - 0.5);
      const pick1 = shuffled[0].idx;
      const pick2 = shuffled[1].idx;
      flipCard(pick1);
      flipCard(pick2);
      const newCards = [...cards];
      newCards[pick1] = { ...newCards[pick1], isFlipped: true };
      newCards[pick2] = { ...newCards[pick2], isFlipped: true };
      setCards(newCards);

      const c1 = newCards[pick1];
      const c2 = newCards[pick2];

      if (c1.pairIndex === c2.pairIndex && c1.isSource !== c2.isSource) {
        setTimeout(() => {
          const matched = [...newCards];
          matched[pick1] = { ...matched[pick1], isMatched: true };
          matched[pick2] = { ...matched[pick2], isMatched: true };
          setCards(matched);
          setBotMatches(prev => {
            const next = prev + 1;
            log(`Bot lucky match "${c1.text}" ↔ "${c2.text}"`);
            checkGameOver(matched, playerMatches, next);
            return next;
          });
          setIsPlayerTurn(true);
          flipStartTime.current = performance.now();
        }, 700);
      } else {
        log(`Bot no match: "${c1.text}" / "${c2.text}"`);
        setTimeout(() => {
          unflipCard(pick1);
          unflipCard(pick2);
          const reset = [...newCards];
          reset[pick1] = { ...reset[pick1], isFlipped: false };
          reset[pick2] = { ...reset[pick2], isFlipped: false };
          setCards(reset);
          setIsPlayerTurn(true);
          flipStartTime.current = performance.now();
        }, 1000);
      }
    }, botConfig.flipDelay);

    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  }, [phase, isPlayerTurn, isChecking, cards, botConfig, playerMatches]);

  // ── Setup ─────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
          </TouchableOpacity>

          <Text style={type.hero}>Test Mode</Text>
          <Text style={{ ...type.body, marginTop: 4 }}>Memory Match vs Bot</Text>

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
              {'• LLM pair generation (8 pairs, timed)\n• Turn-based bot with configurable memory\n• Card flip response time tracking\n• Supabase REST & auth latency\n• Match accuracy comparison'}
            </Text>
          </View>

          <TouchableOpacity onPress={startGame} style={{ ...button.primary, marginTop: 24, backgroundColor: colors.success }}>
            <Text style={buttonText.primary}>Start Test Game</Text>
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
        <Text style={{ fontSize: 48 }}>🧠</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.silver.white, marginTop: 16 }}>Find the pairs!</Text>
        <Text style={{ ...type.body, marginTop: 8 }}>vs {botConfig.name} — taking turns</Text>
        <View style={{ marginTop: 24 }}>
          {statusLog.slice(0, 6).map((msg, i) => (
            <Text key={i} style={{ fontSize: 10, color: colors.silver.mid, fontFamily: 'Courier', marginTop: 2 }}>{msg}</Text>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ── Game Over ─────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.light, textAlign: 'center' }}>TEST MODE RESULTS</Text>
          <Text style={{ ...type.hero, textAlign: 'center', marginTop: 4 }}>
            {playerMatches > botMatches ? '🏆 You Win!' : botMatches > playerMatches ? '🤖 Bot Wins!' : '🤝 Tie!'}
          </Text>

          <View style={{ ...card, padding: 20, marginTop: 16, flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.success }}>{playerMatches}</Text>
              <Text style={type.body}>You</Text>
            </View>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.silver.mid }}>vs</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.error }}>{botMatches}</Text>
              <Text style={type.body}>{botConfig.name}</Text>
            </View>
          </View>

          {gameStats && (
            <>
              <Text style={{ ...type.label, marginTop: 24, marginBottom: 8 }}>Player Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Matches" value={`${gameStats.playerMatches} / ${TEST_PAIRS.length}`} />
                <StatRow label="Attempts" value={`${gameStats.playerAttempts}`} />
                <StatRow label="Accuracy" value={`${gameStats.playerAccuracy}%`} color={gameStats.playerAccuracy >= 50 ? colors.success : colors.warning} />
                <StatRow label="Avg Flip Time" value={`${gameStats.playerAvgFlipTimeMs}ms`} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Bot Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Matches" value={`${gameStats.botMatches}`} />
                <StatRow label="Attempts" value={`${gameStats.botAttempts}`} />
                <StatRow label="Accuracy" value={`${gameStats.botAccuracy}%`} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>LLM Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Pair Gen (8 pairs)" value={gameStats.llmPairGenMs !== null ? `${gameStats.llmPairGenMs}ms` : 'Failed'} color={gameStats.llmPairGenSuccess ? colors.success : colors.error} />
                <StatRow label="Pair Gen Success" value={gameStats.llmPairGenSuccess ? 'Yes' : 'No'} color={gameStats.llmPairGenSuccess ? colors.success : colors.error} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Server / Supabase</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Server Health" value={gameStats.serverHealthMs !== null ? `${gameStats.serverHealthMs}ms` : 'Failed'} color={gameStats.serverHealthMs !== null ? colors.success : colors.error} />
                <StatRow label="Supabase REST" value={gameStats.supabaseHealthMs !== null ? `${gameStats.supabaseHealthMs}ms` : 'Failed'} color={gameStats.supabaseHealthMs !== null ? colors.success : colors.error} />
                <StatRow label="Supabase Auth" value={gameStats.supabaseAuthMs !== null ? `${gameStats.supabaseAuthMs}ms` : 'Failed'} color={gameStats.supabaseAuthMs !== null ? colors.success : colors.error} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>Game Meta</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Total Time" value={`${(gameStats.totalGameTimeMs / 1000).toFixed(1)}s`} />
                <StatRow label="Completed In" value={`${elapsed}s`} />
              </View>
            </>
          )}

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
                setCards([]);
                setSelectedCards([]);
                setPlayerMatches(0);
                setPlayerAttempts(0);
                setBotMatches(0);
                setBotAttempts(0);
                setElapsed(0);
                setIsPlayerTurn(true);
                setIsChecking(false);
                setGameStats(null);
                setStatusLog([]);
                flipTimes.current = [];
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

  // ── Active game ───────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ backgroundColor: colors.blue.dark, borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'center', marginTop: 4 }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.blue.pale }}>TEST MODE</Text>
      </View>

      {/* HUD */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{playerMatches}</Text>
          <Text style={{ fontSize: 10, color: colors.silver.mid }}>You</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white, fontVariant: ['tabular-nums'] }}>
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
          </Text>
          <Text style={{ fontSize: 10, color: isPlayerTurn ? colors.success : colors.error }}>
            {isPlayerTurn ? 'Your Turn' : `${botConfig.name}'s Turn`}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.error }}>{botMatches}</Text>
          <Text style={{ fontSize: 10, color: colors.silver.mid }}>{botConfig.name}</Text>
        </View>
      </View>

      {/* Card Grid */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, opacity: isPlayerTurn ? 1 : 0.6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: GRID_COLS * (CARD_SIZE + CARD_GAP) - CARD_GAP, gap: CARD_GAP }}>
          {cards.map((c, index) => {
            const frontRotate = flipAnims.current[index]?.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) || '0deg';
            const backRotate = flipAnims.current[index]?.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) || '180deg';

            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => handleCardPress(index)}
                disabled={c.isFlipped || c.isMatched || isChecking || !isPlayerTurn}
                activeOpacity={0.8}
                style={{ width: CARD_SIZE, height: CARD_SIZE * 1.2 }}
              >
                <Animated.View style={{
                  position: 'absolute', width: '100%', height: '100%', backgroundColor: colors.bg.tertiary, borderRadius: radii.md,
                  justifyContent: 'center', alignItems: 'center', backfaceVisibility: 'hidden',
                  transform: [{ rotateY: frontRotate }], borderWidth: 1, borderColor: colors.blue.dark,
                }}>
                  <Text style={{ fontSize: 24 }}>❓</Text>
                </Animated.View>

                <Animated.View style={{
                  position: 'absolute', width: '100%', height: '100%',
                  backgroundColor: c.isMatched ? 'rgba(52, 211, 153, 0.15)' : colors.bg.secondary,
                  borderRadius: radii.md, justifyContent: 'center', alignItems: 'center', backfaceVisibility: 'hidden',
                  transform: [{ rotateY: backRotate }], borderWidth: 1,
                  borderColor: c.isMatched ? colors.success : colors.blue.dark, padding: 4,
                }}>
                  <Text style={{ fontSize: c.text.length > 10 ? 10 : 12, fontWeight: '600', color: colors.silver.white, textAlign: 'center' }} numberOfLines={3}>{c.text}</Text>
                  <View style={{ position: 'absolute', bottom: 4, backgroundColor: c.isSource ? 'rgba(59, 130, 246, 0.2)' : 'rgba(248, 113, 113, 0.2)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.xs }}>
                    <Text style={{ fontSize: 8, color: c.isSource ? colors.blue.pale : colors.error }}>{c.isSource ? 'EN' : 'ES'}</Text>
                  </View>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ paddingBottom: 8 }}>
        {statusLog.slice(0, 2).map((msg, i) => (
          <Text key={i} style={{ fontSize: 9, color: colors.silver.dark, fontFamily: 'Courier', textAlign: 'center' }}>{msg}</Text>
        ))}
      </View>
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
