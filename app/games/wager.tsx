import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useGameStore } from '../../lib/stores/gameStore';
import { useAuthStore } from '../../lib/stores/authStore';
import { SERVER_URL, WAGER_ROUNDS } from '../../lib/constants';
import { colors, radii, type, card, button, buttonText, input } from '../../lib/theme';

type Phase = 'wager' | 'play' | 'result' | 'gameover';

interface RoundResult {
  round: number;
  wager: number;
  correct: number;
  hitWager: boolean;
  pointsEarned: number;
}

const CATEGORIES = [
  'Animals', 'Food & Drink', 'Colors', 'Body Parts', 'Clothing',
  'Family', 'Numbers', 'Weather', 'Professions', 'Emotions',
];

export default function WagerScreen() {
  const router = useRouter();
  const { pairs, playerScore, resetGame, endGame } = useGameStore();
  const user = useAuthStore((s) => s.user);

  const [phase, setPhase] = useState<Phase>('wager');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalScore, setTotalScore] = useState(0);
  const [wager, setWager] = useState(3);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [roundPairs, setRoundPairs] = useState(pairs.slice(0, 10));
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [correctThisRound, setCorrectThisRound] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnswer, setShowAnswer] = useState<{ correct: boolean; text: string } | null>(null);

  const wordsPerRound = 10;

  const handleStartRound = useCallback(async () => {
    setIsLoading(true);

    try {
      // Try to fetch category words from server
      const response = await fetch(`${SERVER_URL}/api/games/pairs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLang: user?.native_language || 'en',
          toLang: user?.learning_language || 'es',
          count: wordsPerRound,
          difficulty: currentRound <= 2 ? 'easy' : currentRound <= 4 ? 'medium' : 'hard',
        }),
      });

      const data = await response.json();
      if (data.pairs) {
        setRoundPairs(data.pairs);
      }
    } catch {
      // Use existing pairs as fallback
      const start = ((currentRound - 1) * wordsPerRound) % pairs.length;
      setRoundPairs(pairs.slice(start, start + wordsPerRound));
    }

    setIsLoading(false);
    setCurrentWordIndex(0);
    setCorrectThisRound(0);
    setPhase('play');
  }, [currentRound, pairs, user]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!userInput.trim()) return;

    const currentWord = roundPairs[currentWordIndex];
    if (!currentWord) return;

    const answer = userInput.trim();
    setUserInput('');

    // Validate
    let isCorrect = answer.toLowerCase() === currentWord.target.toLowerCase();

    if (!isCorrect) {
      try {
        const response = await fetch(`${SERVER_URL}/api/games/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: currentWord.source,
            userAnswer: answer,
            correctAnswer: currentWord.target,
            targetLang: user?.learning_language || 'es',
          }),
        });
        const result = await response.json();
        isCorrect = result.correct;
      } catch {
        // Offline: only exact match
      }
    }

    if (isCorrect) {
      setCorrectThisRound((prev) => prev + 1);
      setShowAnswer({ correct: true, text: 'Correct!' });
    } else {
      setShowAnswer({ correct: false, text: `Answer: ${currentWord.target}` });
    }

    // Move to next word or end round
    setTimeout(() => {
      setShowAnswer(null);

      if (currentWordIndex < roundPairs.length - 1) {
        setCurrentWordIndex((prev) => prev + 1);
      } else {
        // End of round
        finishRound(isCorrect ? correctThisRound + 1 : correctThisRound);
      }
    }, 1000);
  }, [userInput, roundPairs, currentWordIndex, correctThisRound]);

  const finishRound = (finalCorrect: number) => {
    const hitWager = finalCorrect >= wager;
    const pointsEarned = hitWager ? wager * 10 + (finalCorrect - wager) * 5 : -(wager * 5);

    const result: RoundResult = {
      round: currentRound,
      wager,
      correct: finalCorrect,
      hitWager,
      pointsEarned,
    };

    setRoundResults((prev) => [...prev, result]);
    setTotalScore((prev) => prev + pointsEarned);
    setPhase('result');
  };

  const handleNextRound = () => {
    if (currentRound >= WAGER_ROUNDS) {
      setPhase('gameover');
      endGame();
    } else {
      setCurrentRound((prev) => prev + 1);
      setWager(3);
      setPhase('wager');
    }
  };

  const handlePlayAgain = () => {
    resetGame();
    router.replace('/games/lobby?game=wager');
  };

  const handleGoHome = () => {
    resetGame();
    router.replace('/');
  };

  // ============================================
  // WAGER PHASE
  // ============================================
  if (phase === 'wager') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'center' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={{ fontSize: 28, color: colors.silver.white }}>←</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid }}>Round</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.silver.white }}>
                {currentRound}/{WAGER_ROUNDS}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid }}>Score</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: totalScore >= 0 ? colors.success : colors.error }}>
                {totalScore}
              </Text>
            </View>
          </View>

          {/* Wager Selection */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.silver.white, marginBottom: 8 }}>
              Place Your Wager
            </Text>
            <Text style={{ fontSize: 14, color: colors.silver.light, textAlign: 'center', marginBottom: 32 }}>
              How many out of {wordsPerRound} words can you translate correctly?
            </Text>

            {/* Wager selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 32 }}>
              <TouchableOpacity
                onPress={() => setWager((prev) => Math.max(1, prev - 1))}
                style={{
                  width: 48, height: 48, borderRadius: radii.xxl,
                  backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center',
                  borderWidth: 1, borderColor: colors.blue.dark,
                }}
              >
                <Text style={{ fontSize: 24, color: colors.silver.white }}>−</Text>
              </TouchableOpacity>

              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 64, fontWeight: '800', color: colors.warning }}>{wager}</Text>
                <Text style={{ fontSize: 12, color: colors.silver.mid }}>words</Text>
              </View>

              <TouchableOpacity
                onPress={() => setWager((prev) => Math.min(wordsPerRound, prev + 1))}
                style={{
                  width: 48, height: 48, borderRadius: radii.xxl,
                  backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center',
                  borderWidth: 1, borderColor: colors.blue.dark,
                }}
              >
                <Text style={{ fontSize: 24, color: colors.silver.white }}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Risk/Reward display */}
            <View style={{ flexDirection: 'row', gap: 24, marginBottom: 32 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: colors.silver.mid }}>If you hit</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.success }}>+{wager * 10}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: colors.silver.mid }}>If you miss</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.error }}>−{wager * 5}</Text>
              </View>
            </View>

            {/* Drinking game penalty note */}
            <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.08)', borderRadius: radii.md, padding: 16, marginBottom: 24, width: '100%', borderWidth: 1, borderColor: `${colors.warning}20` }}>
              <Text style={{ fontSize: 13, color: colors.warning, fontWeight: '600', marginBottom: 4 }}>
                🍻 Party Mode
              </Text>
              <Text style={{ fontSize: 12, color: colors.silver.light }}>
                Miss your wager? That's a penalty! (You decide what it is.)
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleStartRound}
              style={{
                ...button.primary,
                backgroundColor: colors.warning,
                borderRadius: radii.lg,
                paddingVertical: 16,
                paddingHorizontal: 48,
              }}
            >
              <Text style={{ ...buttonText.primary, color: colors.bg.primary }}>
                {isLoading ? 'Loading...' : 'Lock It In!'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // PLAY PHASE
  // ============================================
  if (phase === 'play') {
    const currentWord = roundPairs[currentWordIndex];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {/* Top bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>Correct</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{correctThisRound}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>Wager</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.warning }}>{wager}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.silver.mid }}>Remaining</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.silver.white }}>
                {roundPairs.length - currentWordIndex}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={{ height: 4, backgroundColor: colors.bg.secondary, borderRadius: 2, marginBottom: 24 }}>
            <View
              style={{
                height: '100%',
                width: `${((currentWordIndex + 1) / roundPairs.length) * 100}%`,
                backgroundColor: correctThisRound >= wager ? colors.success : colors.warning,
                borderRadius: 2,
              }}
            />
          </View>

          {/* Word to translate */}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <Text style={{ fontSize: 13, color: colors.silver.mid, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Translate
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.silver.white, textAlign: 'center' }}>
                {currentWord?.source || '...'}
              </Text>
            </View>

            {/* Feedback */}
            {showAnswer && (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: showAnswer.correct ? colors.success : colors.error }}>
                  {showAnswer.text}
                </Text>
              </View>
            )}

            {/* Input */}
            <TextInput
              value={userInput}
              onChangeText={setUserInput}
              onSubmitEditing={handleSubmitAnswer}
              placeholder="Type your translation..."
              placeholderTextColor={colors.silver.mid}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              autoFocus
              style={{
                ...input,
                borderRadius: radii.lg,
                paddingVertical: 18,
                paddingHorizontal: 20,
                fontSize: 18,
                textAlign: 'center',
              }}
            />

            <TouchableOpacity
              onPress={handleSubmitAnswer}
              disabled={!userInput.trim()}
              style={{
                ...(userInput.trim() ? { ...button.primary, backgroundColor: colors.warning } : button.secondary),
                borderRadius: radii.lg,
                paddingVertical: 16,
                alignItems: 'center',
                marginTop: 12,
              }}
            >
              <Text style={{ ...(userInput.trim() ? { ...buttonText.primary, color: colors.bg.primary } : buttonText.secondary) }}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // RESULT PHASE
  // ============================================
  if (phase === 'result') {
    const lastResult = roundResults[roundResults.length - 1];
    if (!lastResult) return null;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 64 }}>
          {lastResult.hitWager ? '🎉' : '😅'}
        </Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white, marginTop: 16 }}>
          {lastResult.hitWager ? 'Wager Hit!' : 'Wager Missed!'}
        </Text>

        <View style={{ ...card, padding: 24, marginTop: 24, width: '100%', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.silver.light }}>
            Got {lastResult.correct} out of {wordsPerRound} (wagered {lastResult.wager})
          </Text>
          <Text
            style={{
              fontSize: 40,
              fontWeight: '800',
              marginTop: 8,
              color: lastResult.pointsEarned >= 0 ? colors.success : colors.error,
            }}
          >
            {lastResult.pointsEarned >= 0 ? '+' : ''}{lastResult.pointsEarned}
          </Text>
          <Text style={{ fontSize: 14, color: colors.silver.mid, marginTop: 4 }}>points</Text>

          <View style={{ marginTop: 16, width: '100%', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 16 }}>
            <Text style={{ fontSize: 14, color: colors.silver.light, textAlign: 'center' }}>
              Total Score: <Text style={{ fontWeight: '700', color: totalScore >= 0 ? colors.success : colors.error }}>{totalScore}</Text>
            </Text>
          </View>
        </View>

        {!lastResult.hitWager && (
          <View style={{ backgroundColor: 'rgba(248, 113, 113, 0.08)', borderRadius: radii.md, padding: 16, marginTop: 16, width: '100%', borderWidth: 1, borderColor: `${colors.error}20` }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.error, textAlign: 'center' }}>
              🍻 Penalty Round! You know what to do...
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleNextRound}
          style={{
            ...button.primary,
            borderRadius: radii.lg,
            paddingVertical: 16,
            paddingHorizontal: 48,
            marginTop: 24,
          }}
        >
          <Text style={buttonText.primary}>
            {currentRound >= WAGER_ROUNDS ? 'See Final Results' : `Round ${currentRound + 1} →`}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ============================================
  // GAME OVER PHASE
  // ============================================
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ fontSize: 48, marginTop: 24 }}>
          {totalScore > 0 ? '🏆' : '💪'}
        </Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.silver.white, marginTop: 12 }}>
          Game Over!
        </Text>

        <View style={{ ...card, padding: 24, marginTop: 24, width: '100%', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.silver.light }}>Final Score</Text>
          <Text style={{ fontSize: 56, fontWeight: '800', color: totalScore >= 0 ? colors.success : colors.error }}>
            {totalScore}
          </Text>
        </View>

        {/* Round breakdown */}
        <View style={{ width: '100%', marginTop: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.silver.white, marginBottom: 12 }}>
            Round Breakdown
          </Text>
          {roundResults.map((r) => (
            <View
              key={r.round}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.divider,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.silver.light }}>Round {r.round}</Text>
              <Text style={{ fontSize: 14, color: colors.silver.white }}>
                {r.correct}/{wordsPerRound} (wagered {r.wager})
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: r.hitWager ? colors.success : colors.error }}>
                {r.hitWager ? '✓' : '✗'} {r.pointsEarned >= 0 ? '+' : ''}{r.pointsEarned}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
          <TouchableOpacity
            onPress={handlePlayAgain}
            style={{ flex: 1, ...button.primary, backgroundColor: colors.warning, borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ ...buttonText.primary, color: colors.bg.primary }}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGoHome}
            style={{ flex: 1, ...button.secondary, borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={buttonText.secondary}>Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
