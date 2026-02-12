import { View, Text } from 'react-native';
import { GameType, GAME_INFO, getEloTier, ELO_TIERS } from '../lib/types';
import { colors, radii, type, card } from '../lib/theme';

interface EloDisplayProps {
  gameType: GameType;
  elo: number;
  peakElo: number;
}

export default function EloDisplay({ gameType, elo, peakElo }: EloDisplayProps) {
  const info = GAME_INFO[gameType];
  const tier = getEloTier(elo);
  const tierInfo = tier ? ELO_TIERS[tier] : null;

  return (
    <View
      style={{
        ...card,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 24, marginRight: 14 }}>{info.icon}</Text>

      <View style={{ flex: 1 }}>
        <Text style={type.headline}>{info.title}</Text>
        <Text style={{ ...type.footnote, marginTop: 2 }}>Peak: {peakElo}</Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: tierInfo?.color || colors.silver.white }}>
          {elo}
        </Text>
        {tierInfo && (
          <View
            style={{
              backgroundColor: tierInfo.color + '18',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radii.xs,
              marginTop: 3,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: tierInfo.color }}>
              {tierInfo.label}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
