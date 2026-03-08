import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../lib/stores/gameStore';
import { useAuthStore } from '../../lib/stores/authStore';
import Timer from '../../components/Timer';
import AdBanner from '../../components/AdBanner';
import { shouldShowAd } from '../../lib/adHelpers';
import { ASTEROID_GAME_DURATION } from '../../lib/constants';
import { getSocket } from '../../lib/socket';
import { TranslationPair } from '../../lib/types';
import { colors, radii, type, card, button, buttonText } from '../../lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHIP_SIZE = 48;
const ASTEROID_SIZE = 70;
const BULLET_SIZE = 8;
const BULLET_HEIGHT = BULLET_SIZE * 3;
const SPAWN_INTERVAL = 2500;

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

export default function AsteroidShooterScreen() {
  const router = useRouter();
  const { pairs, playerScore, isGameOver, submitAnswer, endGame, resetGame, opponent, opponentScore, roomId, gameResult, setGameResult } = useGameStore();
  const user = useAuthStore((s) => s.user);
  const fetchEloRatings = useAuthStore((s) => s.fetchEloRatings);

  const [shipX, setShipX] = useState(SCREEN_WIDTH / 2 - SHIP_SIZE / 2);
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [combo, setCombo] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [showHit, setShowHit] = useState<{ correct: boolean; word: string } | null>(null);
  const [adDismissed, setAdDismissed] = useState(false);

  const asteroidIdRef = useRef(0);
  const bulletIdRef = useRef(0);
  const spawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const gameAreaHeightRef = useRef(SCREEN_HEIGHT);

  const currentPair = pairs[currentPairIndex];

  // Pan responder for ship movement
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

  // Start game after countdown
  useEffect(() => {
    const timer = setTimeout(() => {
      setGameStarted(true);
      setIsTimerActive(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Listen for gameResult when in a room (matchmade or bot)
  useEffect(() => {
    if (roomId) {
      const socket = getSocket();
      socket.on('gameResult', (data: { eloChange: number; newElo: number; playerElo: number; opponentElo: number; isBotMatch?: boolean }) => {
        setGameResult({ eloChange: data.eloChange, newElo: data.newElo, playerElo: data.playerElo, opponentElo: data.opponentElo, isBotMatch: data.isBotMatch });
        endGame();
        if (data.eloChange !== 0) fetchEloRatings();
      });
      return () => socket.off('gameResult');
    }
  }, [roomId]);

  // Spawn asteroids
  useEffect(() => {
    if (!gameStarted || isGameOver) return;

    const spawnAsteroid = () => {
      if (!currentPair) return;

      const words = [currentPair.target, ...(currentPair.distractors || [])];
      if (words.length < 2) {
        // Add the source as a distractor if we don't have enough
        words.push(currentPair.source);
      }

      // Shuffle and pick which positions to show
      const shuffled = words.sort(() => Math.random() - 0.5).slice(0, Math.min(3, words.length));

      shuffled.forEach((word, i) => {
        const id = asteroidIdRef.current++;
        const x = (SCREEN_WIDTH / (shuffled.length + 1)) * (i + 1) - ASTEROID_SIZE / 2 + (Math.random() - 0.5) * 40;
        const y = new Animated.Value(-ASTEROID_SIZE);

        const asteroid: Asteroid = {
          id,
          x: Math.max(0, Math.min(SCREEN_WIDTH - ASTEROID_SIZE, x)),
          y,
          word,
          isCorrect: word === currentPair.target,
          hit: false,
        };

        asteroidsRef.current = [...asteroidsRef.current, asteroid];
        setAsteroids((prev) => [...prev, asteroid]);

        // Animate falling (useNativeDriver: false so _value syncs for collision detection)
        Animated.timing(y, {
          toValue: SCREEN_HEIGHT,
          duration: 5000 + Math.random() * 2000,
          useNativeDriver: false,
        }).start(() => {
          // Remove asteroid when off screen
          asteroidsRef.current = asteroidsRef.current.filter((a) => a.id !== id);
          setAsteroids((prev) => prev.filter((a) => a.id !== id));
        });
      });
    };

    spawnAsteroid(); // Spawn immediately
    spawnTimerRef.current = setInterval(spawnAsteroid, SPAWN_INTERVAL);

    return () => {
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
    };
  }, [gameStarted, isGameOver, currentPairIndex]);

  // Collision detection loop
  useEffect(() => {
    if (!gameStarted || isGameOver) return;

    gameLoopRef.current = setInterval(() => {
      const activeBullets = bulletsRef.current.filter((b) => b.active);
      const activeAsteroids = asteroidsRef.current.filter((a) => !a.hit);

      for (const bullet of activeBullets) {
        const bulletY = (bullet.y as any)._value || 0;

        for (const asteroid of activeAsteroids) {
          const asteroidY = (asteroid.y as any)._value || 0;

          // AABB collision (bullet has height BULLET_HEIGHT)
          const bulletBottom = bulletY + BULLET_HEIGHT;
          if (
            bullet.x + BULLET_SIZE > asteroid.x &&
            bullet.x < asteroid.x + ASTEROID_SIZE &&
            bulletBottom > asteroidY &&
            bulletY < asteroidY + ASTEROID_SIZE
          ) {
            // Hit!
            bullet.active = false;
            asteroid.hit = true;

            if (asteroid.isCorrect) {
              submitAnswer(true);
              setCombo((prev) => prev + 1);
              setShowHit({ correct: true, word: asteroid.word });
              // Move to next pair
              setCurrentPairIndex((prev) =>
                prev < pairs.length - 1 ? prev + 1 : prev
              );
            } else {
              setCombo(0);
              setShowHit({ correct: false, word: asteroid.word });
            }

            // Clear hit indicator after delay
            setTimeout(() => setShowHit(null), 600);

            // Update states
            asteroidsRef.current = asteroidsRef.current.filter((a) => a.id !== asteroid.id);
            bulletsRef.current = bulletsRef.current.filter((b) => b.id !== bullet.id);
            setAsteroids((prev) => prev.filter((a) => a.id !== asteroid.id));
            setBullets((prev) => prev.filter((b) => b.id !== bullet.id));
            break;
          }
        }
      }
    }, 50);

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [gameStarted, isGameOver]);

  const shoot = useCallback(() => {
    const id = bulletIdRef.current++;
    const h = gameAreaHeightRef.current;
    const shipTopY = h - 60 - SHIP_SIZE;
    const bulletStartY = shipTopY - BULLET_HEIGHT;
    const y = new Animated.Value(bulletStartY);

    const bullet: Bullet = {
      id,
      x: shipX + SHIP_SIZE / 2 - BULLET_SIZE / 2,
      y,
      active: true,
    };

    bulletsRef.current = [...bulletsRef.current, bullet];
    setBullets((prev) => [...prev, bullet]);

    Animated.timing(y, {
      toValue: -BULLET_SIZE,
      duration: 800,
      useNativeDriver: false,
    }).start(() => {
      bulletsRef.current = bulletsRef.current.filter((b) => b.id !== id);
      setBullets((prev) => prev.filter((b) => b.id !== id));
    });
  }, [shipX]);
  shootRef.current = shoot;

  const handleTimeUp = () => {
    setIsTimerActive(false);
    if (roomId) getSocket().emit('endGame', { roomId });
    endGame();
    if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
  };

  const handlePlayAgain = () => {
    resetGame();
    router.replace('/games/lobby?game=asteroid');
  };

  const handleGoHome = () => {
    resetGame();
    router.replace('/');
  };

  // Countdown
  if (!gameStarted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 48, fontWeight: '800', color: colors.silver.white }}>🚀</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.silver.white, marginTop: 16 }}>
          Shoot the correct translation!
        </Text>
        <Text style={{ fontSize: 14, color: colors.silver.light, marginTop: 8 }}>
          Drag to move, release to shoot
        </Text>
      </SafeAreaView>
    );
  }

  // Game Over
  if (isGameOver) {
    const accuracy = pairs.length > 0 ? Math.round((playerScore / pairs.length) * 100) : 0;
    const showAd = !adDismissed && user?.id && shouldShowAd({
      hasOpponent: !!opponent,
      playerScore,
      opponentScore,
      accuracy,
    });

    if (showAd) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <AdBanner
            userId={user!.id}
            gameType="asteroid"
            onDismiss={() => setAdDismissed(true)}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>🚀</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white }}>Mission Complete!</Text>

        <View style={[card, { padding: 24, marginTop: 24, width: '100%', alignItems: 'center' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 36, fontWeight: '800', color: colors.success }}>{playerScore}</Text>
              <Text style={type.footnote}>You</Text>
              {(gameResult || opponent) && (
                <Text style={{ fontSize: 14, color: colors.silver.mid, marginTop: 4 }}>
                  ELO {gameResult?.newElo ?? gameResult?.playerElo ?? '—'}
                  {gameResult && gameResult.eloChange !== 0 && (
                    <Text style={{ color: gameResult.eloChange > 0 ? colors.success : colors.error, fontWeight: '600' }}>
                      {' '}({gameResult.eloChange > 0 ? '+' : ''}{gameResult.eloChange})
                    </Text>
                  )}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 20, color: colors.silver.dark }}>vs</Text>
            <View style={{ alignItems: 'center' }}>
              {opponent ? (
                <>
                  <Text style={{ fontSize: 36, fontWeight: '800', color: colors.error }}>{opponentScore}</Text>
                  <Text style={type.footnote}>{opponent.username}</Text>
                  {(gameResult || opponent) && (
                    <Text style={{ fontSize: 14, color: colors.silver.mid, marginTop: 4 }}>
                      ELO {gameResult?.opponentElo ?? opponent.elo}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 36, fontWeight: '800', color: colors.error }}>—</Text>
                  <Text style={type.footnote}>Solo</Text>
                </>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 14, color: colors.silver.light, marginTop: 12 }}>asteroids destroyed</Text>
          {gameResult?.isBotMatch && (
            <Text style={{ fontSize: 11, color: colors.silver.mid, marginTop: 8 }}>vs Bot, 75% ELO</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
          <TouchableOpacity onPress={handlePlayAgain} style={[button.primary, { flex: 1 }]}>
            <Text style={buttonText.primary}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGoHome} style={[button.secondary, { flex: 1 }]}>
            <Text style={buttonText.secondary}>Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Active Game
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      {...panResponder.panHandlers}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* HUD */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{playerScore}</Text>
            <Text style={{ fontSize: 10, color: colors.silver.mid }}>Score</Text>
          </View>

          <Timer
            totalSeconds={ASTEROID_GAME_DURATION}
            onTimeUp={handleTimeUp}
            isActive={isTimerActive}
          />

          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: combo > 2 ? colors.warning : colors.silver.white }}>
              {combo > 0 ? `${combo}x` : '-'}
            </Text>
            <Text style={{ fontSize: 10, color: colors.silver.mid }}>Combo</Text>
          </View>
        </View>

        {/* Current word to translate */}
        <View style={{ alignItems: 'center', paddingVertical: 8, backgroundColor: colors.bg.secondary }}>
          <Text style={{ fontSize: 12, color: colors.silver.mid }}>TRANSLATE:</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.blue.pale }}>
            {currentPair?.source || '...'}
          </Text>
        </View>

        {/* Hit feedback */}
        {showHit && (
          <View style={{ position: 'absolute', top: 140, left: 0, right: 0, alignItems: 'center', zIndex: 100 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: showHit.correct ? colors.success : colors.error,
              }}
            >
              {showHit.correct ? '✓ Correct!' : '✗ Wrong!'}
            </Text>
          </View>
        )}

        {/* Game area */}
        <View
          style={{ flex: 1, position: 'relative' }}
          onLayout={(e) => {
            gameAreaHeightRef.current = e.nativeEvent.layout.height;
          }}
        >
          {/* Asteroids */}
          {asteroids.map((asteroid) => (
            <Animated.View
              key={asteroid.id}
              style={{
                position: 'absolute',
                left: asteroid.x,
                width: ASTEROID_SIZE,
                height: ASTEROID_SIZE,
                transform: [{ translateY: asteroid.y }],
                zIndex: 10,
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: ASTEROID_SIZE / 2,
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 2,
                  borderColor: colors.blue.dark,
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 4,
                }}
              >
                <Text
                  style={{ fontSize: 11, fontWeight: '700', color: colors.silver.white, textAlign: 'center' }}
                  numberOfLines={2}
                >
                  {asteroid.word}
                </Text>
              </View>
            </Animated.View>
          ))}

          {/* Bullets */}
          {bullets.map((bullet) => (
            <Animated.View
              key={bullet.id}
              style={{
                position: 'absolute',
                left: bullet.x,
                width: BULLET_SIZE,
                height: BULLET_HEIGHT,
                borderRadius: BULLET_SIZE / 2,
                backgroundColor: colors.blue.light,
                transform: [{ translateY: bullet.y }],
                zIndex: 5,
                shadowColor: colors.blue.light,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 4,
              }}
            />
          ))}

          {/* Spaceship */}
          <View
            style={{
              position: 'absolute',
              bottom: 60,
              left: shipX,
              width: SHIP_SIZE,
              height: SHIP_SIZE,
              zIndex: 20,
            }}
          >
            <Text style={{ fontSize: 40, textAlign: 'center' }}>🚀</Text>
          </View>
        </View>

        {/* Tap to shoot hint */}
        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <Text style={{ fontSize: 11, color: colors.silver.mid }}>Drag to move • Tap to shoot</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
