import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../lib/stores/authStore';
import { GAME_INFO, GameType } from '../../lib/types';
import { colors, radii, type, card } from '../../lib/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48 - 12) / 2;

const GAME_ACCENTS: Record<GameType, string> = {
  asteroid: colors.blue.light,
  race: colors.success,
  match: '#C084FC', // soft purple — stands out in the metallic palette
  wager: colors.warning,
};

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const gameTypes: GameType[] = ['race', 'asteroid', 'match', 'wager'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
          <Text style={type.hero}>
            Language Games
          </Text>
          <Text style={{ ...type.body, marginTop: 4 }}>
            {isAuthenticated
              ? `Welcome back, ${user?.username || 'player'}.`
              : 'Learn a language competitively.'}
          </Text>
        </View>

        {/* Quick Play Banner */}
        <TouchableOpacity
          onPress={() => router.push('/games/lobby?mode=quick')}
          activeOpacity={0.8}
          style={{ marginHorizontal: 20, marginBottom: 28 }}
        >
          <View
            style={{
              ...card,
              backgroundColor: colors.blue.dark,
              borderColor: colors.blue.bright + '25',
              padding: 24,
            }}
          >
            <Text style={type.label}>
              Jump In
            </Text>
            <Text style={{ ...type.title, marginTop: 8 }}>
              Quick Play
            </Text>
            <Text style={{ ...type.body, color: colors.blue.pale, marginTop: 6 }}>
              Random game mode, find an opponent instantly.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Game Modes */}
        <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
          <Text style={type.title}>Game Modes</Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: 20,
            gap: 12,
          }}
        >
          {gameTypes.map((gt) => {
            const info = GAME_INFO[gt];
            const accent = GAME_ACCENTS[gt];

            return (
              <TouchableOpacity
                key={gt}
                onPress={() => router.push(`/games/lobby?game=${gt}`)}
                activeOpacity={0.8}
                style={{ width: CARD_WIDTH }}
              >
                <View
                  style={{
                    ...card,
                    padding: 20,
                    minHeight: 160,
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 32 }}>{info.icon}</Text>
                  <View>
                    <Text style={{ ...type.headline, marginTop: 12 }}>
                      {info.title}
                    </Text>
                    <Text style={{ ...type.footnote, marginTop: 4, lineHeight: 16 }}>
                      {info.description}
                    </Text>
                  </View>
                  {/* Subtle accent bar at bottom */}
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 16,
                      right: 16,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: accent + '40',
                    }}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Test Modes */}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <Text style={{ ...type.title, marginBottom: 6 }}>
            Developer
          </Text>
          <Text style={{ ...type.footnote, marginBottom: 14 }}>
            Test games vs bots. Tracks LLM, server & Supabase latency.
          </Text>

          {[
            { route: '/games/translation-race-test', icon: '⚡', title: 'Translation Race', desc: 'Type translations, server validate latency' },
            { route: '/games/asteroid-shooter-test', icon: '🚀', title: 'Asteroid Shooter', desc: 'Shoot asteroids, LLM pair+distractor gen' },
            { route: '/games/memory-match-test', icon: '🧠', title: 'Memory Match', desc: 'Turn-based vs bot, LLM pair gen timing' },
            { route: '/games/wager-test', icon: '🎲', title: 'Wager Mode', desc: 'Per-round LLM pair gen + validate timing' },
            { route: '/games/elo-matchmaking-test', icon: '📊', title: 'Elo Matchmaking', desc: 'Simulate Elo, K-factors, queue expansion, bot fallback' },
          ].map((item, idx) => (
            <TouchableOpacity
              key={item.route}
              onPress={() => router.push(item.route)}
              activeOpacity={0.8}
              style={{ marginBottom: idx < 4 ? 8 : 0 }}
            >
              <View
                style={{
                  ...card,
                  backgroundColor: colors.bg.tertiary,
                  borderColor: colors.warning + '30',
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 24 }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...type.headline, color: colors.warning, fontSize: 15 }}>
                    Test: {item.title}
                  </Text>
                  <Text style={{ ...type.footnote, marginTop: 1 }}>
                    {item.desc}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: colors.silver.mid }}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Study Sets */}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <Text style={{ ...type.title, marginBottom: 14 }}>
            Study Sets
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/pairs/editor')}
            activeOpacity={0.8}
          >
            <View
              style={{
                ...card,
                borderStyle: 'dashed',
                borderColor: colors.silver.dark,
                padding: 24,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 28, marginBottom: 8 }}>📝</Text>
              <Text style={{ ...type.headline, color: colors.blue.light }}>
                Create Custom Pairs
              </Text>
              <Text style={{ ...type.footnote, marginTop: 4, textAlign: 'center' }}>
                Build your own flashcard sets, like Quizlet.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
