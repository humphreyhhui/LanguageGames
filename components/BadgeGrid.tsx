import { View, Text } from 'react-native';
import { UserBadge } from '../lib/types';
import { colors, radii, type, card } from '../lib/theme';

interface BadgeGridProps {
  badges: UserBadge[];
}

const BADGE_ICONS: Record<string, string> = {
  elo_threshold: '🏆',
  games_played: '🎮',
  win_streak: '🔥',
};

export default function BadgeGrid({ badges }: BadgeGridProps) {
  if (badges.length === 0) {
    return (
      <View style={{ ...card, padding: 28, alignItems: 'center' }}>
        <Text style={{ fontSize: 32, marginBottom: 10 }}>🏅</Text>
        <Text style={{ ...type.body, textAlign: 'center' }}>
          No badges earned yet. Play games to earn your first badge!
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {badges.map((ub) => {
        const badge = ub.badge;
        if (!badge) return null;

        return (
          <View
            key={`${ub.user_id}-${ub.badge_id}`}
            style={{
              ...card,
              padding: 14,
              width: '48%' as any,
            }}
          >
            <Text style={{ fontSize: 26 }}>
              {BADGE_ICONS[badge.criteria_type] || '🏅'}
            </Text>
            <Text
              style={{ ...type.headline, fontSize: 13, marginTop: 8 }}
              numberOfLines={1}
            >
              {badge.name}
            </Text>
            <Text
              style={{ ...type.footnote, marginTop: 3 }}
              numberOfLines={2}
            >
              {badge.description}
            </Text>
            <Text style={{ fontSize: 10, color: colors.blue.light, marginTop: 6 }}>
              Earned {new Date(ub.earned_at).toLocaleDateString()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
