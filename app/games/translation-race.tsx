import { View, Text, TextInput, TouchableOpacity, Animated, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../lib/stores/gameStore';
import { useAuthStore } from '../../lib/stores/authStore';
import Timer from '../../components/Timer';
import AdBanner from '../../components/AdBanner';
import { shouldShowAd } from '../../lib/adHelpers';
import { SERVER_URL, TRANSLATION_RACE_TIME_LIMIT } from '../../lib/constants';
import { getSocket } from '../../lib/socket';
import { colors, radii, type, card, button, buttonText, input } from '../../lib/theme';

interface AnswerResult { index: number; correct: boolean; feedback: string; userAnswer: string; }

export default function TranslationRaceScreen() {
  const router = useRouter();
  const { pairs, currentPairIndex, playerScore, opponentScore, isGameOver, roomId, currentMode, nextPair, submitAnswer, endGame, resetGame, opponent } = useGameStore();
  const user = useAuthStore((s) => s.user);

  const [userInput, setUserInput] = useState('');
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [adDismissed, setAdDismissed] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const currentPair = pairs[currentPairIndex];

  useEffect(() => {
    const timer = setTimeout(() => { setGameStarted(true); setIsTimerActive(true); inputRef.current?.focus(); }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (roomId && currentMode !== 'unranked') {
      const socket = getSocket();
      socket.on('scoreUpdate', (data: { player1Score: number; player2Score: number }) => {
        useGameStore.getState().updateOpponentScore(data.player2Score);
      });
      socket.on('gameResult', () => endGame());
      return () => { socket.off('scoreUpdate'); socket.off('gameResult'); };
    }
  }, [roomId, currentMode]);

  const handleSubmit = useCallback(async () => {
    if (!userInput.trim() || !currentPair || !gameStarted) return;
    const answer = userInput.trim();
    setUserInput('');

    try {
      const response = await fetch(`${SERVER_URL}/api/games/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: currentPair.source, userAnswer: answer, correctAnswer: currentPair.target, targetLang: user?.learning_language || 'es' }),
      });
      const result = await response.json();
      setResults((prev) => [...prev, { index: currentPairIndex, correct: result.correct, feedback: result.feedback, userAnswer: answer }]);
      if (result.correct) { submitAnswer(true); showCorrectFeedback(); } else { showIncorrectFeedback(result.feedback || `Correct: ${currentPair.target}`); }
      if (roomId) getSocket().emit('submitAnswer', { roomId, questionIndex: currentPairIndex, answer, source: currentPair.source, correctAnswer: currentPair.target, targetLang: user?.learning_language || 'es' });
    } catch {
      const isCorrect = answer.toLowerCase() === currentPair.target.toLowerCase();
      setResults((prev) => [...prev, { index: currentPairIndex, correct: isCorrect, feedback: isCorrect ? 'Correct!' : `Answer: ${currentPair.target}`, userAnswer: answer }]);
      if (isCorrect) { submitAnswer(true); showCorrectFeedback(); } else { showIncorrectFeedback(`Correct: ${currentPair.target}`); }
    }

    if (currentPairIndex < pairs.length - 1) {
      setTimeout(() => { nextPair(); setShowFeedback(false); inputRef.current?.focus(); }, 800);
    } else { handleGameEnd(); }
  }, [userInput, currentPair, currentPairIndex, gameStarted]);

  const showCorrectFeedback = () => {
    setLastFeedback({ correct: true, text: 'Correct!' }); setShowFeedback(true);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 400, delay: 300, useNativeDriver: true }),
    ]).start();
  };

  const showIncorrectFeedback = (text: string) => {
    setLastFeedback({ correct: false, text }); setShowFeedback(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleTimeUp = () => { setIsTimerActive(false); handleGameEnd(); };
  const handleGameEnd = () => { endGame(); Keyboard.dismiss(); if (roomId) getSocket().emit('endGame', { roomId }); };

  // Countdown
  if (!gameStarted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 48, fontWeight: '800', color: colors.silver.white }}>Get Ready!</Text>
        <Text style={{ ...type.body, marginTop: 12 }}>Translate as many as you can.</Text>
      </SafeAreaView>
    );
  }

  // Game Over
  if (isGameOver) {
    const correctCount = results.filter((r) => r.correct).length;
    const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
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
            gameType="race"
            onDismiss={() => setAdDismissed(true)}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 48 }}>{correctCount >= pairs.length * 0.8 ? '🏆' : correctCount >= pairs.length * 0.5 ? '⭐' : '💪'}</Text>
          <Text style={{ ...type.hero, marginTop: 12 }}>Game Over!</Text>

          <View style={{ ...card, padding: 24, marginTop: 24, width: '100%', alignItems: 'center' }}>
            <Text style={{ fontSize: 48, fontWeight: '800', color: colors.success }}>{playerScore}</Text>
            <Text style={type.body}>correct translations</Text>
            {opponent && (
              <View style={{ flexDirection: 'row', marginTop: 16 }}>
                <Text style={type.body}>vs {opponent.username}: </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.error }}>{opponentScore}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', marginTop: 20, gap: 28 }}>
              <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 20, fontWeight: '700', color: colors.silver.white }}>{results.length}</Text><Text style={type.footnote}>Attempted</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 20, fontWeight: '700', color: colors.warning }}>{accuracy}%</Text><Text style={type.footnote}>Accuracy</Text></View>
            </View>
          </View>

          <View style={{ width: '100%', marginTop: 16, maxHeight: 200 }}>
            {results.slice(0, 5).map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.divider }}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>{r.correct ? '✅' : '❌'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.silver.white }} numberOfLines={1}>{pairs[r.index]?.source}</Text>
                  <Text style={{ fontSize: 11, color: r.correct ? colors.success : colors.error }} numberOfLines={1}>{r.userAnswer}{!r.correct ? ` → ${pairs[r.index]?.target}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
            <TouchableOpacity onPress={() => { resetGame(); router.replace('/games/lobby?game=race'); }} style={{ flex: 1, ...button.primary }}><Text style={buttonText.primary}>Play Again</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { resetGame(); router.replace('/'); }} style={{ flex: 1, ...button.secondary }}><Text style={buttonText.secondary}>Home</Text></TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Active Game
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* HUD */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
          <View style={{ alignItems: 'center', minWidth: 60 }}><Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{playerScore}</Text><Text style={type.footnote}>You</Text></View>
          <Timer totalSeconds={TRANSLATION_RACE_TIME_LIMIT} onTimeUp={handleTimeUp} isActive={isTimerActive} />
          {opponent ? (
            <View style={{ alignItems: 'center', minWidth: 60 }}><Text style={{ fontSize: 24, fontWeight: '800', color: colors.error }}>{opponentScore}</Text><Text style={type.footnote}>{opponent.username}</Text></View>
          ) : (
            <View style={{ minWidth: 60, alignItems: 'center' }}><Text style={type.footnote}>{currentPairIndex + 1}/{pairs.length}</Text></View>
          )}
        </View>

        {/* Progress */}
        <View style={{ height: 2, backgroundColor: colors.bg.secondary, borderRadius: 1, marginBottom: 24 }}>
          <View style={{ height: '100%', width: `${((currentPairIndex + 1) / pairs.length) * 100}%`, backgroundColor: colors.blue.bright, borderRadius: 1 }} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <Text style={type.label}>Translate this</Text>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }], marginTop: 10 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.silver.white, textAlign: 'center', lineHeight: 36 }}>{currentPair?.source || '...'}</Text>
            </Animated.View>
          </View>

          {showFeedback && lastFeedback && (
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: lastFeedback.correct ? colors.success : colors.error }}>{lastFeedback.text}</Text>
            </View>
          )}

          <TextInput
            ref={inputRef} value={userInput} onChangeText={setUserInput} onSubmitEditing={handleSubmit}
            placeholder="Type your translation..." placeholderTextColor={colors.silver.dark}
            autoCapitalize="none" autoCorrect={false} returnKeyType="send"
            style={{ ...input, textAlign: 'center', fontSize: 18, borderWidth: 1.5, borderColor: colors.blue.dark }}
          />

          <TouchableOpacity onPress={handleSubmit} disabled={!userInput.trim()} style={{ ...button.primary, marginTop: 12, opacity: userInput.trim() ? 1 : 0.4 }}>
            <Text style={buttonText.primary}>Submit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setResults((prev) => [...prev, { index: currentPairIndex, correct: false, feedback: 'Skipped', userAnswer: '(skipped)' }]); currentPairIndex < pairs.length - 1 ? nextPair() : handleGameEnd(); }}
            style={{ alignItems: 'center', marginTop: 14 }}
          >
            <Text style={{ fontSize: 13, color: colors.silver.mid }}>Skip ›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
