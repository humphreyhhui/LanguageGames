import { View, Text, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../lib/stores/gameStore';
import { useAuthStore } from '../../lib/stores/authStore';
import Timer from '../../components/Timer';
import AdBanner from '../../components/AdBanner';
import { shouldShowAd } from '../../lib/adHelpers';
import { getSocket } from '../../lib/socket';
import { colors, radii, type, card, button, buttonText } from '../../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLS = 4;
const CARD_GAP = 8;
const CARD_SIZE = (SCREEN_WIDTH - 40 - CARD_GAP * (GRID_COLS - 1)) / GRID_COLS;

interface Card {
  id: number;
  text: string;
  pairIndex: number;
  isSource: boolean;
  isFlipped: boolean;
  isMatched: boolean;
}

export default function MemoryMatchScreen() {
  const router = useRouter();
  const { pairs, playerScore, opponentScore, isGameOver, submitAnswer, endGame, resetGame, roomId, opponent } = useGameStore();
  const user = useAuthStore((s) => s.user);

  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [matches, setMatches] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [adDismissed, setAdDismissed] = useState(false);

  const flipAnims = useRef<Animated.Value[]>([]);

  // Initialize cards from pairs
  useEffect(() => {
    // Take first 8 pairs for 4x4 grid (16 cards)
    const gamePairs = pairs.slice(0, 8);
    const cardList: Card[] = [];

    gamePairs.forEach((pair, idx) => {
      cardList.push({
        id: idx * 2,
        text: pair.source,
        pairIndex: idx,
        isSource: true,
        isFlipped: false,
        isMatched: false,
      });
      cardList.push({
        id: idx * 2 + 1,
        text: pair.target,
        pairIndex: idx,
        isSource: false,
        isFlipped: false,
        isMatched: false,
      });
    });

    // Shuffle
    const shuffled = cardList.sort(() => Math.random() - 0.5);
    flipAnims.current = shuffled.map(() => new Animated.Value(0));
    setCards(shuffled);
  }, [pairs]);

  // Start game
  useEffect(() => {
    const timer = setTimeout(() => {
      setGameStarted(true);
      setIsTimerActive(true);
      setStartTime(Date.now());
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Track elapsed time
  useEffect(() => {
    if (!gameStarted || isGameOver) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, isGameOver, startTime]);

  const flipCard = useCallback((index: number) => {
    Animated.spring(flipAnims.current[index], {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  }, []);

  const unflipCard = useCallback((index: number) => {
    Animated.spring(flipAnims.current[index], {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  }, []);

  const handleCardPress = useCallback((cardIndex: number) => {
    if (isChecking || !gameStarted) return;

    const card = cards[cardIndex];
    if (card.isFlipped || card.isMatched) return;
    if (selectedCards.length >= 2) return;

    // Flip the card
    flipCard(cardIndex);
    const newCards = [...cards];
    newCards[cardIndex] = { ...card, isFlipped: true };
    setCards(newCards);

    const newSelected = [...selectedCards, cardIndex];
    setSelectedCards(newSelected);

    // Check for match when two cards are selected
    if (newSelected.length === 2) {
      setIsChecking(true);
      setAttempts((prev) => prev + 1);

      const card1 = newCards[newSelected[0]];
      const card2 = newCards[newSelected[1]];

      if (card1.pairIndex === card2.pairIndex && card1.isSource !== card2.isSource) {
        // Match found!
        setTimeout(() => {
          const matchedCards = [...newCards];
          matchedCards[newSelected[0]] = { ...card1, isMatched: true };
          matchedCards[newSelected[1]] = { ...card2, isMatched: true };
          setCards(matchedCards);
          setSelectedCards([]);
          setIsChecking(false);

          const newMatches = matches + 1;
          setMatches(newMatches);
          submitAnswer(true);

          // Check if all matched
          if (newMatches === Math.floor(cards.length / 2)) {
            setIsTimerActive(false);
            endGame();
          }
        }, 500);
      } else {
        // No match - flip back
        setTimeout(() => {
          unflipCard(newSelected[0]);
          unflipCard(newSelected[1]);

          const resetCards = [...newCards];
          resetCards[newSelected[0]] = { ...resetCards[newSelected[0]], isFlipped: false };
          resetCards[newSelected[1]] = { ...resetCards[newSelected[1]], isFlipped: false };
          setCards(resetCards);
          setSelectedCards([]);
          setIsChecking(false);
        }, 800);
      }
    }
  }, [cards, selectedCards, isChecking, gameStarted, matches]);

  const handlePlayAgain = () => {
    resetGame();
    router.replace('/games/lobby?game=match');
  };

  const handleGoHome = () => {
    resetGame();
    router.replace('/');
  };

  // Countdown
  if (!gameStarted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 48, fontWeight: '800', color: colors.silver.white }}>🧠</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.silver.white, marginTop: 16 }}>
          Find the matching pairs!
        </Text>
        <Text style={{ fontSize: 14, color: colors.silver.light, marginTop: 8 }}>
          Match each word with its translation
        </Text>
      </SafeAreaView>
    );
  }

  // Game Over
  if (isGameOver) {
    const accuracy = attempts > 0 ? Math.round((matches / attempts) * 100) : 0;
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
            gameType="match"
            onDismiss={() => setAdDismissed(true)}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>🧠</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white }}>All Matched!</Text>

        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radii.lg, padding: 24, marginTop: 24, width: '100%', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.silver.light }}>Completed in</Text>
          <Text style={{ fontSize: 48, fontWeight: '800', color: colors.success }}>{elapsed}s</Text>

          <View style={{ flexDirection: 'row', marginTop: 16, gap: 24 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.silver.white }}>{matches}</Text>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>Pairs</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.silver.white }}>{attempts}</Text>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>Attempts</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.warning }}>{accuracy}%</Text>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>Accuracy</Text>
            </View>
          </View>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* HUD */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{matches}</Text>
          <Text style={{ fontSize: 10, color: colors.silver.mid }}>Matched</Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white, fontVariant: ['tabular-nums'] }}>
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
          </Text>
          <Text style={{ fontSize: 10, color: colors.silver.mid }}>Time</Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.warning }}>{attempts}</Text>
          <Text style={{ fontSize: 10, color: colors.silver.mid }}>Attempts</Text>
        </View>
      </View>

      {/* Card Grid */}
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 20,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            width: GRID_COLS * (CARD_SIZE + CARD_GAP) - CARD_GAP,
            gap: CARD_GAP,
          }}
        >
          {cards.map((card, index) => {
            const frontRotate = flipAnims.current[index]?.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '180deg'],
            }) || '0deg';

            const backRotate = flipAnims.current[index]?.interpolate({
              inputRange: [0, 1],
              outputRange: ['180deg', '360deg'],
            }) || '180deg';

            return (
              <TouchableOpacity
                key={card.id}
                onPress={() => handleCardPress(index)}
                disabled={card.isFlipped || card.isMatched || isChecking}
                activeOpacity={0.8}
                style={{ width: CARD_SIZE, height: CARD_SIZE * 1.2 }}
              >
                {/* Card back (face down) */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backgroundColor: colors.bg.tertiary,
                    borderRadius: radii.md,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backfaceVisibility: 'hidden',
                    transform: [{ rotateY: frontRotate }],
                    borderWidth: 1,
                    borderColor: colors.blue.dark,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>❓</Text>
                </Animated.View>

                {/* Card front (face up) */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backgroundColor: card.isMatched ? 'rgba(52, 211, 153, 0.15)' : colors.bg.secondary,
                    borderRadius: radii.md,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backfaceVisibility: 'hidden',
                    transform: [{ rotateY: backRotate }],
                    borderWidth: 1,
                    borderColor: card.isMatched ? colors.success : colors.blue.dark,
                    padding: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: card.text.length > 10 ? 10 : 12,
                      fontWeight: '600',
                      color: colors.silver.white,
                      textAlign: 'center',
                    }}
                    numberOfLines={3}
                  >
                    {card.text}
                  </Text>
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      backgroundColor: card.isSource ? 'rgba(59, 130, 246, 0.2)' : 'rgba(248, 113, 113, 0.2)',
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: radii.xs,
                    }}
                  >
                    <Text style={{ fontSize: 8, color: card.isSource ? colors.blue.pale : colors.error }}>
                      {card.isSource ? 'EN' : 'Target'}
                    </Text>
                  </View>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Bottom hint */}
      <View style={{ alignItems: 'center', paddingBottom: 16 }}>
        <Text style={{ fontSize: 12, color: colors.silver.mid }}>
          Match each word with its translation
        </Text>
      </View>
    </SafeAreaView>
  );
}
