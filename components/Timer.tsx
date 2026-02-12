import { View, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { colors } from '../lib/theme';

interface TimerProps {
  totalSeconds: number;
  onTimeUp: () => void;
  isActive: boolean;
}

export default function Timer({ totalSeconds, onTimeUp, isActive }: TimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    if (isActive && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            onTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isLow = remaining <= 10;
  const progress = remaining / totalSeconds;

  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={{
          fontSize: 28,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
          color: isLow ? colors.error : colors.silver.white,
        }}
      >
        {minutes}:{seconds.toString().padStart(2, '0')}
      </Text>

      <View
        style={{
          width: 120,
          height: 3,
          backgroundColor: colors.bg.secondary,
          borderRadius: 1.5,
          marginTop: 6,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            backgroundColor: isLow ? colors.error : colors.blue.bright,
            borderRadius: 1.5,
          }}
        />
      </View>
    </View>
  );
}
