import { TouchableOpacity, Text, Animated } from 'react-native';
import { useRef, useEffect } from 'react';
import { colors, radii } from '../lib/theme';

interface MatchCardProps {
  text: string;
  isFlipped: boolean;
  isMatched: boolean;
  onPress: () => void;
  index: number;
}

export default function MatchCard({ text, isFlipped, isMatched, onPress, index }: MatchCardProps) {
  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(flipAnim, {
      toValue: isFlipped || isMatched ? 1 : 0,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  }, [isFlipped, isMatched]);

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isFlipped || isMatched}
      activeOpacity={0.8}
      style={{ width: '23%', aspectRatio: 0.75, margin: '1%' }}
    >
      {/* Card Back */}
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
          transform: [{ rotateY: frontInterpolate }],
          borderWidth: 0.5,
          borderColor: colors.blue.dark,
        }}
      >
        <Text style={{ fontSize: 24 }}>❓</Text>
      </Animated.View>

      {/* Card Front */}
      <Animated.View
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backgroundColor: isMatched ? 'rgba(52, 211, 153, 0.12)' : colors.bg.secondary,
          borderRadius: radii.md,
          justifyContent: 'center',
          alignItems: 'center',
          backfaceVisibility: 'hidden',
          transform: [{ rotateY: backInterpolate }],
          borderWidth: 0.5,
          borderColor: isMatched ? colors.success : colors.blue.dark,
          padding: 4,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.silver.white,
            textAlign: 'center',
          }}
          numberOfLines={3}
        >
          {text}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
