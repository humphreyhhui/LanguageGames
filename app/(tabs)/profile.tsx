import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../lib/stores/authStore';
import { useStatsStore } from '../../lib/stores/statsStore';
import { useEffect } from 'react';
import { GAME_INFO, GameType, LANGUAGES } from '../../lib/types';
import { colors, radii, type, card } from '../../lib/theme';
import EloDisplay from '../../components/EloDisplay';
import BadgeGrid from '../../components/BadgeGrid';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, eloRatings, isAuthenticated, isLoading } = useAuthStore();
  const { stats, badges, fetchStats, fetchBadges } = useStatsStore();

  useEffect(() => {
    if (user?.id) {
      fetchStats(user.id);
      fetchBadges(user.id);
    }
  }, [user?.id]);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.blue.bright} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.bg.secondary,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.glassBorder,
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 36 }}>👤</Text>
        </View>
        <Text style={{ ...type.title, textAlign: 'center' }}>
          Sign in to track your progress
        </Text>
        <Text style={{ ...type.body, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>
          Create an account to save your Elo, earn badges, and compete.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/auth/login')}
          style={{
            backgroundColor: colors.blue.bright,
            paddingHorizontal: 36,
            paddingVertical: 14,
            borderRadius: radii.md,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Sign In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const totalGames = stats.reduce((sum, s) => sum + s.games_played, 0);
  const totalWins = stats.reduce((sum, s) => sum + s.wins, 0);
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 24 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.bg.secondary,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: colors.blue.bright,
            }}
          >
            <Text style={{ fontSize: 36 }}>👤</Text>
          </View>

          <Text style={{ ...type.title, marginTop: 14 }}>
            {user.username}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={type.body}>
              {LANGUAGES[user.native_language] || user.native_language}
            </Text>
            <Text style={{ ...type.footnote, marginHorizontal: 8 }}>→</Text>
            <Text style={{ ...type.body, color: colors.blue.light, fontWeight: '600' }}>
              {LANGUAGES[user.learning_language] || user.learning_language}
            </Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View
          style={{
            ...card,
            flexDirection: 'row',
            marginHorizontal: 20,
            padding: 16,
            marginBottom: 28,
          }}
        >
          {[
            { value: totalGames, label: 'Games', color: colors.silver.white },
            { value: totalWins, label: 'Wins', color: colors.success },
            { value: `${winRate}%`, label: 'Win Rate', color: colors.warning },
          ].map((stat, i) => (
            <View key={stat.label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              {i > 0 && (
                <View style={{ width: 0.5, height: 28, backgroundColor: colors.divider, marginRight: 0 }} />
              )}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: stat.color }}>{stat.value}</Text>
                <Text style={type.footnote}>{stat.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Elo Ratings */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={{ ...type.title, marginBottom: 14 }}>Elo Ratings</Text>
          {eloRatings.map((rating) => (
            <EloDisplay
              key={rating.game_type}
              gameType={rating.game_type as GameType}
              elo={rating.elo}
              peakElo={rating.peak_elo}
            />
          ))}
          {eloRatings.length === 0 && (
            <Text style={type.body}>Play ranked games to earn Elo.</Text>
          )}
        </View>

        {/* Badges */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={{ ...type.title, marginBottom: 14 }}>Badges</Text>
          <BadgeGrid badges={badges} />
        </View>

        {/* Per-Game Stats */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ ...type.title, marginBottom: 14 }}>Game Stats</Text>
          {stats.map((stat) => {
            const info = GAME_INFO[stat.game_type as GameType];
            return (
              <View key={stat.game_type} style={{ ...card, padding: 16, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 20, marginRight: 10 }}>{info?.icon}</Text>
                  <Text style={type.headline}>{info?.title || stat.game_type}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {[
                    { label: 'Played', value: stat.games_played, color: colors.silver.white },
                    { label: 'W/L', value: `${stat.wins}/${stat.losses}`, color: colors.silver.white },
                    { label: 'Best', value: stat.best_score, color: colors.warning },
                    { label: 'Avg Time', value: `${(stat.avg_time_ms / 1000).toFixed(1)}s`, color: colors.silver.white },
                  ].map((item) => (
                    <View key={item.label}>
                      <Text style={type.footnote}>{item.label}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: item.color }}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          {stats.length === 0 && (
            <Text style={type.body}>Play games to see your stats here.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
