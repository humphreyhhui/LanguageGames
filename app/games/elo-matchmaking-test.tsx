import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useCallback, useEffect } from 'react';
import { colors, radii, type, card, button, buttonText } from '../../lib/theme';
import { createTestLogger } from '../../lib/testLogger';

// ── Elo constants (mirror server/config.ts) ────────────────────
const DEFAULT_ELO = 1000;
const ELO_MIN_FLOOR = 100;
const ELO_MIN_CHANGE = 1;
const ELO_UPSET_THRESHOLD = 200;
const ELO_UPSET_MULTIPLIER = 1.2;
const ELO_K_PROVISIONAL = 40;
const ELO_K_DEVELOPING = 32;
const ELO_K_ESTABLISHED = 20;
const ELO_GAMES_PROVISIONAL = 15;
const ELO_GAMES_ESTABLISHED = 30;
const ELO_SEED_COEFFICIENT = 0.4;
const ELO_SEED_CAP_MAX = 1400;

// Matchmaking range schedule (ms -> range)
const RANGE_SCHEDULE = [
  { afterMs: 0, range: 100 },
  { afterMs: 10000, range: 200 },
  { afterMs: 20000, range: 350 },
  { afterMs: 30000, range: 500 },
  { afterMs: 45000, range: Infinity },
];
const BOT_FALLBACK_MS = 60000;

// ── Elo simulation logic ──────────────────────────────────────
function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < ELO_GAMES_PROVISIONAL) return ELO_K_PROVISIONAL;
  if (gamesPlayed < ELO_GAMES_ESTABLISHED) return ELO_K_DEVELOPING;
  return ELO_K_ESTABLISHED;
}

function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  result: 0 | 0.5 | 1,
  kFactor: number
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  let change = kFactor * (result - expected);

  const eloDiff = opponentElo - playerElo;
  if (result === 1 && eloDiff >= ELO_UPSET_THRESHOLD) {
    change *= ELO_UPSET_MULTIPLIER;
  } else if (result === 0 && eloDiff <= -ELO_UPSET_THRESHOLD) {
    change *= ELO_UPSET_MULTIPLIER;
  }

  const rounded = Math.round(change);
  const clampedChange =
    Math.max(ELO_MIN_CHANGE, Math.abs(rounded)) * (rounded >= 0 ? 1 : -1);
  return Math.max(ELO_MIN_FLOOR, playerElo + clampedChange);
}

function getSeededElo(otherElos: number[]): number {
  const established = otherElos.filter((e) => e >= DEFAULT_ELO);
  const highest = established.length > 0 ? Math.max(...established) : 0;
  if (highest <= DEFAULT_ELO) return DEFAULT_ELO;
  const seed =
    DEFAULT_ELO + (highest - DEFAULT_ELO) * ELO_SEED_COEFFICIENT;
  return Math.round(
    Math.min(ELO_SEED_CAP_MAX, Math.max(DEFAULT_ELO, seed))
  );
}

function getRangeForWait(waitMs: number): number {
  for (let i = RANGE_SCHEDULE.length - 1; i >= 0; i--) {
    if (waitMs >= RANGE_SCHEDULE[i].afterMs)
      return RANGE_SCHEDULE[i].range;
  }
  return RANGE_SCHEDULE[0].range;
}

// ── Dummy user type ───────────────────────────────────────────
interface DummyUser {
  id: string;
  name: string;
  eloByGame: Record<string, number>;
  gamesByGame: Record<string, number>;
}

function createDummyUsers(count: number): DummyUser[] {
  const users: DummyUser[] = [];
  for (let i = 1; i <= count; i++) {
    const baseElo = 800 + Math.floor(Math.random() * 800);
    const gamesPlayed = Math.floor(Math.random() * 50);
    users.push({
      id: `user_${i}`,
      name: `TestUser_${String(i).padStart(2, '0')}`,
      eloByGame: { race: baseElo },
      gamesByGame: { race: gamesPlayed },
    });
  }
  return users;
}

// Win probability: higher Elo wins more often
function winProbability(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export default function EloMatchmakingTestScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<'menu' | 'matchSim' | 'queueSim' | 'seedSim'>('menu');
  const [users, setUsers] = useState<DummyUser[]>(() => createDummyUsers(20));
  const [matchLog, setMatchLog] = useState<string[]>([]);
  const [queueLog, setQueueLog] = useState<string[]>([]);
  const [seedLog, setSeedLog] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const loggerRef = useRef<ReturnType<typeof createTestLogger> | null>(null);

  const addMatchLog = useCallback((msg: string) => {
    setMatchLog((p) => [msg, ...p].slice(0, 100));
    loggerRef.current?.log(msg, { simType: 'match' });
  }, []);

  const addQueueLog = useCallback((msg: string) => {
    setQueueLog((p) => [msg, ...p].slice(0, 80));
    loggerRef.current?.log(msg, { simType: 'queue' });
  }, []);

  const addSeedLog = useCallback((msg: string) => {
    setSeedLog((p) => [msg, ...p].slice(0, 50));
    loggerRef.current?.log(msg, { simType: 'seed' });
  }, []);

  const runMatchSim = useCallback(async () => {
    setPhase('matchSim');
    setIsRunning(true);
    setMatchLog([]);
    loggerRef.current = createTestLogger('elo-matchmaking');

    let u = users.map((x) => ({ ...x, eloByGame: { ...x.eloByGame }, gamesByGame: { ...x.gamesByGame } }));

    for (let m = 0; m < 100; m++) {
      const idx1 = Math.floor(Math.random() * u.length);
      let idx2 = Math.floor(Math.random() * u.length);
      while (idx2 === idx1) idx2 = Math.floor(Math.random() * u.length);

      const p1 = u[idx1];
      const p2 = u[idx2];
      const elo1 = p1.eloByGame['race'] ?? DEFAULT_ELO;
      const elo2 = p2.eloByGame['race'] ?? DEFAULT_ELO;
      const g1 = p1.gamesByGame['race'] ?? 0;
      const g2 = p2.gamesByGame['race'] ?? 0;

      const prob = winProbability(elo1, elo2);
      const r = Math.random();
      let winner: 'p1' | 'p2' | null = null;
      if (r < prob) winner = 'p1';
      else if (r < prob + (1 - prob) * 0.5) winner = 'p2';
      else winner = null;

      const res1: 0 | 0.5 | 1 =
        winner === 'p1' ? 1 : winner === 'p2' ? 0 : 0.5;
      const res2: 0 | 0.5 | 1 =
        winner === 'p2' ? 1 : winner === 'p1' ? 0 : 0.5;

      const k1 = getKFactor(g1);
      const k2 = getKFactor(g2);
      const newE1 = calculateNewElo(elo1, elo2, res1, k1);
      const newE2 = calculateNewElo(elo2, elo1, res2, k2);

      p1.eloByGame['race'] = newE1;
      p2.eloByGame['race'] = newE2;
      p1.gamesByGame['race'] = g1 + 1;
      p2.gamesByGame['race'] = g2 + 1;

      const wstr = winner ? (winner === 'p1' ? p1.name : p2.name) : 'Draw';
      addMatchLog(
        `#${m + 1} ${p1.name}(${elo1} K=${k1}) vs ${p2.name}(${elo2} K=${k2}) -> ${wstr} | New: ${newE1}/${newE2}`
      );

      u = [...u];
    }

    setUsers(u);
    const bins = [0, 800, 1000, 1200, 1400, 1600, 2000];
    const histogram = bins.slice(0, -1).map((_, i) => ({
      label: `${bins[i]}-${bins[i + 1]}`,
      count: u.filter((x) => {
        const e = x.eloByGame['race'] ?? DEFAULT_ELO;
        return e >= bins[i] && e < bins[i + 1];
      }).length,
    }));
    loggerRef.current?.endSession({
      simType: 'match',
      matchCount: 100,
      histogram,
      topUsers: [...u].sort((a, b) => (b.eloByGame['race'] ?? 0) - (a.eloByGame['race'] ?? 0)).slice(0, 5).map((x) => ({ name: x.name, elo: x.eloByGame['race'] })),
    }).catch(() => {});
    setIsRunning(false);
  }, [users, addMatchLog]);

  const runQueueSim = useCallback(async () => {
    setPhase('queueSim');
    setIsRunning(true);
    setQueueLog([]);
    loggerRef.current = createTestLogger('elo-matchmaking');

    const queue: { user: DummyUser; joinedAt: number; gameType: string }[] = [];
    const simUsers = users.slice(0, 10).map((x) => ({
      ...x,
      eloByGame: { ...x.eloByGame },
      gamesByGame: { ...x.gamesByGame },
    }));

    for (let t = 0; t < 70; t++) {
      if (t < 10 && t % 2 === 0) {
        const u = simUsers[t / 2];
        queue.push({
          user: u,
          joinedAt: t * 1000,
          gameType: 'race',
        });
        addQueueLog(`[${t}s] ${u.name} joined (Elo ${u.eloByGame['race'] ?? DEFAULT_ELO})`);
      }

      const now = t * 1000;
      for (let i = 0; i < queue.length; i++) {
        const entry = queue[i];
        const waitMs = now - entry.joinedAt;
        const range = getRangeForWait(waitMs);
        const elo = entry.user.eloByGame['race'] ?? DEFAULT_ELO;

        if (waitMs >= BOT_FALLBACK_MS) {
          queue.splice(i, 1);
          i--;
          addQueueLog(
            `[${t}s] BOT FALLBACK: ${entry.user.name} matched vs bot after ${waitMs / 1000}s`
          );
          continue;
        }

        const opponentIdx = queue.findIndex(
          (q, j) =>
            j !== i &&
            q.user.id !== entry.user.id &&
            (range === Infinity || Math.abs((q.user.eloByGame['race'] ?? DEFAULT_ELO) - elo) <= range)
        );

        if (opponentIdx !== -1) {
          const opp = queue.splice(opponentIdx, 1)[0];
          if (opponentIdx < i) i--;
          const ei = queue.findIndex((q) => q.user.id === entry.user.id);
          if (ei !== -1) queue.splice(ei, 1);
          addQueueLog(
            `[${t}s] MATCH: ${entry.user.name} vs ${opp.user.name} (range=${range} wait=${(waitMs / 1000).toFixed(0)}s)`
          );
          break;
        }
      }
    }

    loggerRef.current?.endSession({ simType: 'queue' }).catch(() => {});
    setIsRunning(false);
  }, [users, addQueueLog]);

  const runSeedSim = useCallback(() => {
    setPhase('seedSim');
    setSeedLog([]);
    loggerRef.current = createTestLogger('elo-matchmaking');

    const gameTypes = ['race', 'asteroid', 'match', 'wager'];
    for (const u of users.slice(0, 5)) {
      const others: number[] = [];
      for (const gt of gameTypes) {
        const e = u.eloByGame[gt];
        if (e != null && (u.gamesByGame[gt] ?? 0) >= ELO_GAMES_ESTABLISHED)
          others.push(e);
      }
      const seeded = getSeededElo(others);
      const highest = others.length > 0 ? Math.max(...others) : 0;
      addSeedLog(
        `${u.name}: best established Elo=${highest || 'N/A'} -> seeded new game at ${seeded}`
      );
    }
    loggerRef.current?.endSession({ simType: 'seed' }).catch(() => {});
  }, [users, addSeedLog]);

  useEffect(() => {
    return () => { loggerRef.current?.endSession().catch(() => {}); };
  }, []);

  const eloHistogram = useCallback(() => {
    const elos = users.map((u) => u.eloByGame['race'] ?? DEFAULT_ELO);
    const bins = [0, 800, 1000, 1200, 1400, 1600, 2000];
    const counts = bins.slice(0, -1).map((_, i) => ({
      label: `${bins[i]}-${bins[i + 1]}`,
      count: elos.filter((e) => e >= bins[i] && e < bins[i + 1]).length,
    }));
    return counts;
  }, [users]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
        </TouchableOpacity>

        <Text style={type.hero}>Elo Matchmaking Test</Text>
        <Text style={{ ...type.body, marginTop: 4 }}>
          Simulate Elo, K-factors, queue expansion, bot fallback
        </Text>

        {phase === 'menu' && (
          <View style={{ marginTop: 24, gap: 12 }}>
            <TouchableOpacity
              onPress={runMatchSim}
              style={{ ...button.primary, backgroundColor: colors.success }}
            >
              <Text style={buttonText.primary}>Run 100 Matches</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                Pair 20 users randomly, update Elo with K-factors
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={runQueueSim}
              style={{ ...button.primary }}
            >
              <Text style={buttonText.primary}>Matchmaking Queue Sim</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                10 users join at 0,2,4...18s, show range expansion & bot fallback
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={runSeedSim}
              style={{ ...button.secondary }}
            >
              <Text style={buttonText.secondary}>Cross-Game Seeding</Text>
              <Text style={{ fontSize: 12, color: colors.silver.mid, marginTop: 4 }}>
                Show how one game&apos;s Elo seeds another
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setUsers(createDummyUsers(20))}
              style={{ ...button.ghost }}
            >
              <Text style={buttonText.ghost}>Reset Dummy Users</Text>
            </TouchableOpacity>
          </View>
        )}

        {(phase === 'matchSim' || phase === 'seedSim') && (
          <View style={{ ...card, padding: 16, marginTop: 20 }}>
            <Text style={type.label}>Elo Distribution</Text>
            {eloHistogram().map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Text style={{ ...type.footnote, width: 70 }}>{b.label}</Text>
                <View
                  style={{
                    flex: 1,
                    height: 18,
                    backgroundColor: colors.bg.tertiary,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Math.min(100, (b.count / users.length) * 100 * 3)}%`,
                      height: '100%',
                      backgroundColor: colors.blue.bright,
                      borderRadius: 4,
                    }}
                  />
                </View>
                <Text style={{ ...type.footnote, marginLeft: 8 }}>{b.count}</Text>
              </View>
            ))}
          </View>
        )}

        {phase === 'matchSim' && (
          <View style={{ ...card, padding: 16, marginTop: 16 }}>
            <Text style={type.label}>Top 5 Users by Elo</Text>
            {[...users]
              .sort((a, b) => (b.eloByGame['race'] ?? 0) - (a.eloByGame['race'] ?? 0))
              .slice(0, 5)
              .map((u, i) => (
                <View key={u.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={type.body}>{u.name}</Text>
                  <Text style={{ ...type.body, fontWeight: '700', color: colors.success }}>
                    {(u.eloByGame['race'] ?? DEFAULT_ELO).toString()}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {phase === 'matchSim' && (
          <View style={{ marginTop: 16 }}>
            <Text style={type.label}>Match Log</Text>
            <View style={{ ...card, padding: 12, maxHeight: 300 }}>
              <ScrollView nestedScrollEnabled>
                {matchLog.map((msg, i) => (
                  <Text key={i} style={{ fontSize: 10, color: colors.silver.mid, fontFamily: 'Courier', lineHeight: 14 }}>
                    {msg}
                  </Text>
                ))}
                {isRunning && <Text style={{ color: colors.blue.light }}>Running...</Text>}
              </ScrollView>
            </View>
          </View>
        )}

        {phase === 'queueSim' && (
          <View style={{ marginTop: 16 }}>
            <Text style={type.label}>Queue Sim Log</Text>
            <View style={{ ...card, padding: 12, maxHeight: 400 }}>
              <ScrollView nestedScrollEnabled>
                {queueLog.map((msg, i) => (
                  <Text key={i} style={{ fontSize: 10, color: colors.silver.mid, fontFamily: 'Courier', lineHeight: 14 }}>
                    {msg}
                  </Text>
                ))}
                {isRunning && <Text style={{ color: colors.blue.light }}>Running...</Text>}
              </ScrollView>
            </View>
          </View>
        )}

        {phase === 'seedSim' && (
          <View style={{ marginTop: 16 }}>
            <Text style={type.label}>Cross-Game Seeding Log</Text>
            <View style={{ ...card, padding: 12 }}>
              {seedLog.map((msg, i) => (
                <Text key={i} style={{ fontSize: 12, color: colors.silver.light, marginTop: 4 }}>
                  {msg}
                </Text>
              ))}
            </View>
          </View>
        )}

        {phase !== 'menu' && (
          <TouchableOpacity
            onPress={() => setPhase('menu')}
            style={{ ...button.secondary, marginTop: 24 }}
          >
            <Text style={buttonText.secondary}>Back to Menu</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
