import {
  View, Text, TouchableOpacity, Dimensions, Animated, PanResponder, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { colors, radii, type, card, button, buttonText } from '../../lib/theme';
import { SERVER_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { createTestLogger } from '../../lib/testLogger';
import { generateBotProfile, sampleBotCorrect, BOT_GAME_PARAMS, type BotDifficulty } from '../../lib/botIdentity';
import { useAuthStore } from '../../lib/stores/authStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHIP_SIZE = 48;
const ASTEROID_SIZE = 70;
const BULLET_SIZE = 8;
const BULLET_HEIGHT = BULLET_SIZE * 3;
const SPAWN_INTERVAL = 2500;
const TIME_LIMIT = 60;

// ── Hardcoded pairs with distractors ─────────────────────────
const TEST_PAIRS = [
  { source: 'Hello', target: 'Hola', distractors: ['Ola', 'Oye', 'Hala'] },
  { source: 'Cat', target: 'Gato', distractors: ['Pato', 'Rato', 'Gata'] },
  { source: 'Dog', target: 'Perro', distractors: ['Pero', 'Perra', 'Cerro'] },
  { source: 'Water', target: 'Agua', distractors: ['Aguja', 'Ayuda', 'Algo'] },
  { source: 'House', target: 'Casa', distractors: ['Cosa', 'Caso', 'Caza'] },
  { source: 'Book', target: 'Libro', distractors: ['Libre', 'Libra', 'Limbo'] },
  { source: 'Friend', target: 'Amigo', distractors: ['Abrigo', 'Antiguo', 'Amiga'] },
  { source: 'Food', target: 'Comida', distractors: ['Cometa', 'Camisa', 'Comedia'] },
  { source: 'Sun', target: 'Sol', distractors: ['Sal', 'Sur', 'Silla'] },
  { source: 'Moon', target: 'Luna', distractors: ['Lupa', 'Lana', 'Línea'] },
  { source: 'Red', target: 'Rojo', distractors: ['Ojo', 'Rujo', 'Rosa'] },
  { source: 'Green', target: 'Verde', distractors: ['Viene', 'Verbo', 'Vende'] },
];

// ── Types ────────────────────────────────────────────────────
interface Asteroid {
  id: number;
  x: number;
  y: Animated.Value;
  word: string;
  isCorrect: boolean;
  hit: boolean;
}

interface Bullet {
  id: number;
  x: number;
  y: Animated.Value;
  active: boolean;
}

interface GameStats {
  playerScore: number;
  botScore: number;
  playerShots: number;
  playerHits: number;
  playerCorrectHits: number;
  playerWrongHits: number;
  bestCombo: number;

  botAttempts: number;
  botCorrect: number;

  llmPairGenMs: number | null;
  llmPairGenSuccess: boolean;
  llmValidateCalls: number;
  llmAvgValidateMs: number;

  supabaseHealthMs: number | null;
  supabaseAuthMs: number | null;
  serverHealthMs: number | null;

  totalGameTimeMs: number;
  winner: 'player' | 'bot' | 'tie';
}

export default function AsteroidShooterTestScreen() {
  const router = useRouter();

  // ── Game state ───────────────────────────────────────────
  const [phase, setPhase] = useState<'setup' | 'countdown' | 'playing' | 'gameover'>('setup');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [pairs] = useState(TEST_PAIRS);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(TIME_LIMIT);
  const [shipX, setShipX] = useState(SCREEN_WIDTH / 2 - SHIP_SIZE / 2);
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [showHit, setShowHit] = useState<{ correct: boolean; word: string } | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [eloResult, setEloResult] = useState<{
    eloChange: number;
    newElo: number;
    playerElo: number;
    opponentElo: number;
    hypotheticalBotChange: number;
  } | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const fetchEloRatings = useAuthStore((s) => s.fetchEloRatings);

  // ── Stats refs ───────────────────────────────────────────
  const playerShots = useRef(0);
  const playerHits = useRef(0);
  const playerCorrectHits = useRef(0);
  const playerWrongHits = useRef(0);
  const botAttempts = useRef(0);
  const botCorrectCount = useRef(0);
  const llmPairGenMs = useRef<number | null>(null);
  const llmPairGenSuccess = useRef(false);
  const llmValidateLatencies = useRef<number[]>([]);
  const supabaseHealthMs = useRef<number | null>(null);
  const supabaseAuthMs = useRef<number | null>(null);
  const serverHealthMs = useRef<number | null>(null);
  const gameStartTime = useRef(0);

  // ── Game refs ────────────────────────────────────────────
  const asteroidIdRef = useRef(0);
  const bulletIdRef = useRef(0);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const gameAreaHeightRef = useRef(SCREEN_HEIGHT);
  const spawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loggerRef = useRef(createTestLogger('asteroid-shooter'));
  const botProfileRef = useRef<ReturnType<typeof generateBotProfile> | null>(null);
  const currentPair = pairs[currentPairIndex];
  const botProfile = botProfileRef.current;

  const log = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setStatusLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
    loggerRef.current.log(msg);
  }, []);

  // ── Pan responder ────────────────────────────────────────
  const shootRef = useRef<() => void>(() => {});
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const newX = Math.max(0, Math.min(SCREEN_WIDTH - SHIP_SIZE, gesture.moveX - SHIP_SIZE / 2));
        setShipX(newX);
      },
      onPanResponderRelease: () => {
        shootRef.current();
      },
    })
  ).current;

  // ── Connectivity checks ──────────────────────────────────
  const runConnectivityChecks = useCallback(async () => {
    log('Running connectivity checks...');

    // Server health
    try {
      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) });
      const ms = Math.round(performance.now() - t0);
      serverHealthMs.current = ms;
      log(`Server health: ${resp.ok ? 'OK' : 'FAIL'} (${ms}ms)`);
    } catch (e: any) {
      log(`Server health: UNREACHABLE - ${e.message}`);
    }

    // Supabase REST
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

    // Supabase auth
    try {
      const t0 = performance.now();
      const { data } = await supabase.auth.getSession();
      const ms = Math.round(performance.now() - t0);
      supabaseAuthMs.current = ms;
      log(`Supabase auth: ${data.session ? 'Authenticated' : 'No session'} (${ms}ms)`);
    } catch (e: any) {
      log(`Supabase auth: ERROR - ${e.message}`);
    }

    // LLM pair generation test (this is the big one!)
    log('Testing LLM pair generation with distractors...');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const t0 = performance.now();
      const resp = await fetch(`${SERVER_URL}/api/games/pairs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fromLang: 'en', toLang: 'es', count: 5, difficulty: 'medium', withDistractors: true }),
        signal: AbortSignal.timeout(30000),
      });
      const ms = Math.round(performance.now() - t0);
      llmPairGenMs.current = ms;
      const data = await resp.json();
      llmPairGenSuccess.current = !!(data.pairs && data.pairs.length > 0);
      log(`LLM pair gen (5 pairs+distractors): ${llmPairGenSuccess.current ? 'OK' : 'FAIL'} (${ms}ms)`);
    } catch (e: any) {
      llmPairGenMs.current = null;
      log(`LLM pair gen: FAILED - ${e.message}`);
    }
  }, [log]);

  // ── Start game ────────────────────────────────────────────
  const startGame = useCallback(async () => {
    await runConnectivityChecks();
    botProfileRef.current = generateBotProfile(botDifficulty);
    setPhase('countdown');
    log('Countdown started');
    setTimeout(() => {
      setPhase('playing');
      gameStartTime.current = performance.now();
      log('Game started!');
    }, 2000);
  }, [runConnectivityChecks, log, botDifficulty]);

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

  // ── Spawn asteroids ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    const spawnAsteroid = () => {
      const pair = pairs[currentPairIndex];
      if (!pair) return;
      const words = [pair.target, ...(pair.distractors || [])];
      const shuffled = words.sort(() => Math.random() - 0.5).slice(0, 3);

      shuffled.forEach((word, i) => {
        const id = asteroidIdRef.current++;
        const x = (SCREEN_WIDTH / (shuffled.length + 1)) * (i + 1) - ASTEROID_SIZE / 2 + (Math.random() - 0.5) * 40;
        const y = new Animated.Value(-ASTEROID_SIZE);

        const asteroid: Asteroid = {
          id,
          x: Math.max(0, Math.min(SCREEN_WIDTH - ASTEROID_SIZE, x)),
          y,
          word,
          isCorrect: word === pair.target,
          hit: false,
        };

        asteroidsRef.current = [...asteroidsRef.current, asteroid];
        setAsteroids(prev => [...prev, asteroid]);

        Animated.timing(y, {
          toValue: SCREEN_HEIGHT,
          duration: 5000 + Math.random() * 2000,
          useNativeDriver: false,
        }).start(() => {
          asteroidsRef.current = asteroidsRef.current.filter(a => a.id !== id);
          setAsteroids(prev => prev.filter(a => a.id !== id));
        });
      });
    };

    spawnAsteroid();
    spawnTimerRef.current = setInterval(spawnAsteroid, SPAWN_INTERVAL);
    return () => { if (spawnTimerRef.current) clearInterval(spawnTimerRef.current); };
  }, [phase, currentPairIndex]);

  // ── Bot logic ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const profile = botProfileRef.current;
    if (!profile) return;
    const shootInterval = BOT_GAME_PARAMS[botDifficulty].asteroidShootInterval;
    botTimerRef.current = setInterval(() => {
      const isCorrect = sampleBotCorrect(profile.accuracy, profile.kurtosisProfile);
      botAttempts.current++;
      if (isCorrect) {
        botCorrectCount.current++;
        setBotScore(prev => prev + 1);
        log(`Bot ✓ hit correct asteroid`);
      } else {
        log(`Bot ✗ missed`);
      }
    }, shootInterval);
    return () => { if (botTimerRef.current) clearInterval(botTimerRef.current); };
  }, [phase, botDifficulty, log]);

  // ── Collision detection ───────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    gameLoopRef.current = setInterval(() => {
      const activeBullets = bulletsRef.current.filter(b => b.active);
      const activeAsteroids = asteroidsRef.current.filter(a => !a.hit);

      for (const bullet of activeBullets) {
        const bulletY = (bullet.y as any)._value || 0;
        const bulletBottom = bulletY + BULLET_HEIGHT;
        for (const asteroid of activeAsteroids) {
          const asteroidY = (asteroid.y as any)._value || 0;
          if (
            bullet.x + BULLET_SIZE > asteroid.x &&
            bullet.x < asteroid.x + ASTEROID_SIZE &&
            bulletBottom > asteroidY &&
            bulletY < asteroidY + ASTEROID_SIZE
          ) {
            bullet.active = false;
            asteroid.hit = true;
            playerHits.current++;

            if (asteroid.isCorrect) {
              playerCorrectHits.current++;
              setPlayerScore(prev => prev + 1);
              setCombo(prev => {
                const next = prev + 1;
                setBestCombo(bc => Math.max(bc, next));
                return next;
              });
              setShowHit({ correct: true, word: asteroid.word });
              setCurrentPairIndex(prev => prev < pairs.length - 1 ? prev + 1 : prev);
              log(`Player ✓ hit "${asteroid.word}"`);
            } else {
              playerWrongHits.current++;
              setCombo(0);
              setShowHit({ correct: false, word: asteroid.word });
              log(`Player ✗ hit wrong "${asteroid.word}"`);
            }

            setTimeout(() => setShowHit(null), 600);
            asteroidsRef.current = asteroidsRef.current.filter(a => a.id !== asteroid.id);
            bulletsRef.current = bulletsRef.current.filter(b => b.id !== bullet.id);
            setAsteroids(prev => prev.filter(a => a.id !== asteroid.id));
            setBullets(prev => prev.filter(b => b.id !== bullet.id));
            break;
          }
        }
      }
    }, 50);

    return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [phase]);

  const shoot = useCallback(() => {
    if (phase !== 'playing') return;
    playerShots.current++;
    const id = bulletIdRef.current++;
    const h = gameAreaHeightRef.current;
    const shipTopY = h - 60 - SHIP_SIZE;
    const bulletStartY = shipTopY - BULLET_HEIGHT;
    const y = new Animated.Value(bulletStartY);
    const bullet: Bullet = { id, x: shipX + SHIP_SIZE / 2 - BULLET_SIZE / 2, y, active: true };
    bulletsRef.current = [...bulletsRef.current, bullet];
    setBullets(prev => [...prev, bullet]);

    Animated.timing(y, {
      toValue: -BULLET_SIZE,
      duration: 800,
      useNativeDriver: false,
    }).start(() => {
      bulletsRef.current = bulletsRef.current.filter(b => b.id !== id);
      setBullets(prev => prev.filter(b => b.id !== id));
    });
  }, [shipX, phase]);
  shootRef.current = shoot;

  // ── End game ──────────────────────────────────────────────
  const handleGameEnd = useCallback(() => {
    if (phase === 'gameover') return;
    setPhase('gameover');
    [spawnTimerRef, gameLoopRef, botTimerRef, timerRef].forEach(ref => {
      if (ref.current) clearInterval(ref.current as any);
    });

    const totalTime = Math.round(performance.now() - gameStartTime.current);
    const latencies = llmValidateLatencies.current;

    setTimeout(() => {
      setPlayerScore(ps => {
        setBotScore(bs => {
          const stats: GameStats = {
            playerScore: ps,
            botScore: bs,
            playerShots: playerShots.current,
            playerHits: playerHits.current,
            playerCorrectHits: playerCorrectHits.current,
            playerWrongHits: playerWrongHits.current,
            bestCombo,
            botAttempts: botAttempts.current,
            botCorrect: botCorrectCount.current,
            llmPairGenMs: llmPairGenMs.current,
            llmPairGenSuccess: llmPairGenSuccess.current,
            llmValidateCalls: latencies.length,
            llmAvgValidateMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
            supabaseHealthMs: supabaseHealthMs.current,
            supabaseAuthMs: supabaseAuthMs.current,
            serverHealthMs: serverHealthMs.current,
            totalGameTimeMs: totalTime,
            winner: ps > bs ? 'player' : bs > ps ? 'bot' : 'tie',
          };
          setGameStats(stats);

          const profile = botProfileRef.current;
          if (profile) {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.access_token) {
                fetch(`${SERVER_URL}/api/games/report-bot-test`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    gameType: 'asteroid',
                    botElo: profile.elo,
                    playerScore: ps,
                    botScore: bs,
                    durationMs: totalTime,
                  }),
                })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.eloChange !== undefined) {
                      setEloResult({
                        eloChange: data.eloChange,
                        newElo: data.newElo,
                        playerElo: data.playerElo,
                        opponentElo: data.opponentElo,
                        hypotheticalBotChange: data.hypotheticalBotChange ?? 0,
                      });
                      fetchEloRatings();
                    }
                  })
                  .catch(() => {});
              }
            });
          }

          loggerRef.current.endSession(stats).catch(() => {});
          return bs;
        });
        return ps;
      });
    }, 100);
    log('Game ended');
  }, [phase, bestCombo, log, fetchEloRatings]);

  useEffect(() => {
    return () => { loggerRef.current.endSession().catch(() => {}); };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      [spawnTimerRef, gameLoopRef, botTimerRef, timerRef].forEach(ref => {
        if (ref.current) clearInterval(ref.current as any);
      });
    };
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
          <Text style={{ ...type.body, marginTop: 4 }}>Asteroid Shooter vs Bot</Text>

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
              {'• LLM pair generation with distractors (timed)\n• Server /api/games/pairs latency\n• Supabase REST & auth latency\n• Shooting accuracy & combo tracking\n• Bot simulation'}
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
        <Text style={{ fontSize: 48 }}>🚀</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.silver.white, marginTop: 16 }}>Shoot the correct translation!</Text>
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
            {playerScore > botScore ? '🏆 You Win!' : botScore > playerScore ? '🤖 Bot Wins!' : '🤝 Tie!'}
          </Text>

          <View style={{ ...card, padding: 20, marginTop: 16, flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.success }}>{playerScore}</Text>
              <Text style={type.body}>You</Text>
              {eloResult && (
                <Text style={{ fontSize: 13, color: colors.silver.mid, marginTop: 4 }}>
                  ELO {eloResult.playerElo}
                  {eloResult.eloChange !== 0 && (
                    <Text style={{ color: eloResult.eloChange > 0 ? colors.success : colors.error, fontWeight: '600' }}>
                      {' '}({eloResult.eloChange > 0 ? '+' : ''}{eloResult.eloChange})
                    </Text>
                  )}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.silver.mid }}>vs</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.error }}>{botScore}</Text>
              <Text style={type.body}>{botProfile?.name ?? 'Bot'}</Text>
              {eloResult && (
                <Text style={{ fontSize: 13, color: colors.silver.mid, marginTop: 4 }}>
                  ELO {eloResult.opponentElo}
                  {eloResult.hypotheticalBotChange !== 0 && (
                    <Text style={{ color: eloResult.hypotheticalBotChange > 0 ? colors.success : colors.error, fontWeight: '600' }}>
                      {' '}({eloResult.hypotheticalBotChange > 0 ? '+' : ''}{eloResult.hypotheticalBotChange})
                    </Text>
                  )}
                </Text>
              )}
            </View>
          </View>

          {eloResult && (
            <View style={{ ...card, padding: 12, marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.blue.pale }}>vs Bot, 75% ELO</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.silver.white, marginTop: 4 }}>
                New rating: {eloResult.newElo}
              </Text>
            </View>
          )}

          {gameStats && (
            <>
              <Text style={{ ...type.label, marginTop: 24, marginBottom: 8 }}>Player Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Shots Fired" value={`${gameStats.playerShots}`} />
                <StatRow label="Hits" value={`${gameStats.playerHits}`} />
                <StatRow label="Correct Hits" value={`${gameStats.playerCorrectHits}`} color={colors.success} />
                <StatRow label="Wrong Hits" value={`${gameStats.playerWrongHits}`} color={colors.error} />
                <StatRow label="Shot Accuracy" value={gameStats.playerShots > 0 ? `${Math.round((gameStats.playerHits / gameStats.playerShots) * 100)}%` : 'N/A'} />
                <StatRow label="Best Combo" value={`${gameStats.bestCombo}x`} color={colors.warning} />
              </View>

              <Text style={{ ...type.label, marginTop: 20, marginBottom: 8 }}>LLM Performance</Text>
              <View style={{ ...card, padding: 16 }}>
                <StatRow label="Pair Gen (5 pairs+distract)" value={gameStats.llmPairGenMs !== null ? `${gameStats.llmPairGenMs}ms` : 'Failed'} color={gameStats.llmPairGenSuccess ? colors.success : colors.error} />
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
                <StatRow label="Total Game Time" value={`${(gameStats.totalGameTimeMs / 1000).toFixed(1)}s`} />
                <StatRow label="Bot Attempts" value={`${gameStats.botAttempts}`} />
                <StatRow label="Bot Correct" value={`${gameStats.botCorrect}`} />
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
                setCurrentPairIndex(0);
                setPlayerScore(0);
                setBotScore(0);
                setEloResult(null);
                setCombo(0);
                setBestCombo(0);
                setAsteroids([]);
                setBullets([]);
                setTimeRemaining(TIME_LIMIT);
                setGameStats(null);
                setStatusLog([]);
                asteroidsRef.current = [];
                bulletsRef.current = [];
                playerShots.current = 0;
                playerHits.current = 0;
                playerCorrectHits.current = 0;
                playerWrongHits.current = 0;
                botAttempts.current = 0;
                botCorrectCount.current = 0;
                asteroidIdRef.current = 0;
                bulletIdRef.current = 0;
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
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const isLow = timeRemaining <= 10;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }} {...panResponder.panHandlers}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.blue.dark, borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'center' }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.blue.pale }}>TEST MODE</Text>
        </View>

        {/* HUD */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{playerScore}</Text>
            <Text style={{ fontSize: 10, color: colors.silver.mid }}>You</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'], color: isLow ? colors.error : colors.silver.white }}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.error }}>{botScore}</Text>
            <Text style={{ fontSize: 10, color: colors.silver.mid }}>{botProfile?.name ?? 'Bot'}</Text>
          </View>
        </View>

        {/* Translate prompt */}
        <View style={{ alignItems: 'center', paddingVertical: 8, backgroundColor: colors.bg.secondary }}>
          <Text style={{ fontSize: 12, color: colors.silver.mid }}>TRANSLATE:</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.blue.pale }}>{currentPair?.source || '...'}</Text>
        </View>

        {showHit && (
          <View style={{ position: 'absolute', top: 140, left: 0, right: 0, alignItems: 'center', zIndex: 100 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: showHit.correct ? colors.success : colors.error }}>
              {showHit.correct ? '✓ Correct!' : '✗ Wrong!'}
            </Text>
          </View>
        )}

        {/* Combo */}
        {combo > 1 && (
          <View style={{ position: 'absolute', top: 170, right: 20, zIndex: 100 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.warning }}>{combo}x COMBO</Text>
          </View>
        )}

        {/* Game area */}
        <View
          style={{ flex: 1, position: 'relative' }}
          onLayout={(e) => {
            gameAreaHeightRef.current = e.nativeEvent.layout.height;
          }}
        >
          {asteroids.map(asteroid => (
            <Animated.View key={asteroid.id} style={{ position: 'absolute', left: asteroid.x, width: ASTEROID_SIZE, height: ASTEROID_SIZE, transform: [{ translateY: asteroid.y }], zIndex: 10 }}>
              <View style={{ width: '100%', height: '100%', borderRadius: ASTEROID_SIZE / 2, backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.blue.dark, justifyContent: 'center', alignItems: 'center', padding: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.silver.white, textAlign: 'center' }} numberOfLines={2}>{asteroid.word}</Text>
              </View>
            </Animated.View>
          ))}

          {bullets.map(bullet => (
            <Animated.View key={bullet.id} style={{ position: 'absolute', left: bullet.x, width: BULLET_SIZE, height: BULLET_HEIGHT, borderRadius: BULLET_SIZE / 2, backgroundColor: colors.blue.light, transform: [{ translateY: bullet.y }], zIndex: 5 }} />
          ))}

          <View style={{ position: 'absolute', bottom: 60, left: shipX, width: SHIP_SIZE, height: SHIP_SIZE, zIndex: 20 }}>
            <Text style={{ fontSize: 40, textAlign: 'center' }}>🚀</Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <Text style={{ fontSize: 11, color: colors.silver.mid }}>Drag to move • Tap to shoot</Text>
        </View>
      </SafeAreaView>
    </View>
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
