import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useGameStore } from '../../lib/stores/gameStore';
import { colors, radii, type, card, button, buttonText } from '../../lib/theme';

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    winner?: string; playerScore?: string; opponentScore?: string; eloChange?: string; newElo?: string;
  }>();
  const { resetGame, opponent, currentGameType } = useGameStore();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const eloChange = parseInt(params.eloChange || '0');
  const isWin = eloChange > 0;

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 40, friction: 5 }).start();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Text style={{ fontSize: 80 }}>{isWin ? '🏆' : eloChange === 0 ? '🤝' : '💪'}</Text>
      </Animated.View>
      <Text style={{ ...type.hero, marginTop: 16 }}>
        {isWin ? 'Victory!' : eloChange === 0 ? 'Draw!' : 'Defeat'}
      </Text>

      <View style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 28, padding: 24, width: '100%' }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.footnote}>You</Text>
          <Text style={{ fontSize: 36, fontWeight: '800', color: colors.success }}>{params.playerScore || '0'}</Text>
        </View>
        <Text style={{ fontSize: 20, color: colors.silver.dark }}>vs</Text>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={type.footnote}>{opponent?.username || 'Opponent'}</Text>
          <Text style={{ fontSize: 36, fontWeight: '800', color: colors.error }}>{params.opponentScore || '0'}</Text>
        </View>
      </View>

      {eloChange !== 0 && (
        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={type.footnote}>Elo Change</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: eloChange > 0 ? colors.success : colors.error }}>
            {eloChange > 0 ? '+' : ''}{eloChange}
          </Text>
          {params.newElo && <Text style={{ ...type.body, marginTop: 4 }}>New Rating: {params.newElo}</Text>}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 32, width: '100%' }}>
        <TouchableOpacity onPress={() => { resetGame(); router.replace(`/games/lobby?game=${currentGameType || 'race'}`); }} style={{ flex: 1, ...button.primary }}>
          <Text style={buttonText.primary}>Rematch</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { resetGame(); router.replace('/'); }} style={{ flex: 1, ...button.secondary }}>
          <Text style={buttonText.secondary}>Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
