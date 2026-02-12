import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useRef } from 'react';
import { useGameStore } from '../../lib/stores/gameStore';
import { useAuthStore } from '../../lib/stores/authStore';
import { GAME_INFO, GameType } from '../../lib/types';
import { getSocket, connectAndAuthenticate } from '../../lib/socket';
import { supabase } from '../../lib/supabase';
import { SERVER_URL } from '../../lib/constants';
import { colors, radii, type, card, button, buttonText, input } from '../../lib/theme';

export default function LobbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ game?: string; mode?: string }>();
  const { user } = useAuthStore();
  const gameStore = useGameStore();

  const [selectedGame, setSelectedGame] = useState<GameType>((params.game as GameType) || 'race');
  const [roomCode, setRoomCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const isConnecting = useRef(false);

  const gameTypes: GameType[] = ['race', 'asteroid', 'match', 'wager'];

  const navigateToGame = (gameType: string) => {
    const routes: Record<string, string> = {
      asteroid: '/games/asteroid-shooter',
      race: '/games/translation-race',
      match: '/games/memory-match',
      wager: '/games/wager',
    };
    router.push(routes[gameType] || '/games/translation-race');
  };

  /**
   * Get an authenticated socket connection.
   * Uses JWT — server verifies identity, never trusts client data.
   */
  const getAuthenticatedSocket = async () => {
    if (isConnecting.current) return getSocket();
    isConnecting.current = true;
    try {
      const socket = getSocket();
      if (socket.connected && (socket as any).isAuthenticated) return socket;
      const s = await connectAndAuthenticate();
      (s as any).isAuthenticated = true;
      return s;
    } catch (error: any) {
      Alert.alert('Connection Error', error.message || 'Failed to connect to server.');
      throw error;
    } finally {
      isConnecting.current = false;
    }
  };

  /**
   * Get auth header for REST API calls.
   */
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  };

  const handlePractice = async () => {
    gameStore.setGameType(selectedGame);
    gameStore.setGameMode('unranked');
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${SERVER_URL}/api/games/pairs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fromLang: user?.native_language || 'en',
          toLang: user?.learning_language || 'es',
          count: selectedGame === 'match' ? 8 : 15,
          difficulty: 'medium',
          withDistractors: selectedGame === 'asteroid',
        }),
      });
      const data = await response.json();
      if (data.pairs) {
        gameStore.setPairs(data.pairs);
        navigateToGame(selectedGame);
      } else {
        Alert.alert('Error', data.error || 'Failed to generate pairs. Is the server running?');
      }
    } catch {
      Alert.alert('Connection Error', 'Could not connect to server.');
    }
  };

  const handleCreateRoom = async () => {
    if (!user) return Alert.alert('Sign In Required', 'Please sign in to play with friends.');
    try {
      const socket = await getAuthenticatedSocket();
      socket.emit('createRoom', { gameType: selectedGame });
      socket.once('roomCreated', (data: { roomId: string; roomCode: string }) => {
        gameStore.setGameType(selectedGame);
        gameStore.setGameMode('friend');
        gameStore.setRoomCode(data.roomCode);
        setIsCreatingRoom(true);
        socket.once('playerJoined', () => {
          socket.once('gameStart', (gameData: { roomId: string; pairs: any[]; gameType: string }) => {
            gameStore.startGame(gameData.pairs, gameData.roomId);
            setIsCreatingRoom(false);
            navigateToGame(gameData.gameType);
          });
        });
      });
    } catch {
      // Error already shown by getAuthenticatedSocket
    }
  };

  const handleJoinRoom = async () => {
    if (!user) return Alert.alert('Sign In Required', 'Please sign in to play with friends.');
    if (!roomCode.trim()) return Alert.alert('Enter Room Code', 'Please enter a room code.');
    try {
      const socket = await getAuthenticatedSocket();
      socket.emit('joinRoom', { roomCode: roomCode.trim().toUpperCase() });
      socket.once('gameStart', (gameData: { roomId: string; pairs: any[]; gameType: string }) => {
        gameStore.setGameType(gameData.gameType as GameType);
        gameStore.setGameMode('friend');
        gameStore.startGame(gameData.pairs, gameData.roomId);
        navigateToGame(gameData.gameType);
      });
      socket.once('error', (data: { message: string }) => Alert.alert('Error', data.message));
    } catch {
      // Error already shown
    }
  };

  const handleRanked = async () => {
    if (!user) return Alert.alert('Sign In Required', 'Please sign in for ranked play.');
    setIsSearching(true);
    try {
      const socket = await getAuthenticatedSocket();
      socket.emit('joinQueue', { gameType: selectedGame });
      socket.once('matchFound', (data: { roomId: string; pairs: any[]; gameType: string }) => {
        gameStore.setGameType(data.gameType as GameType);
        gameStore.setGameMode('ranked');
        gameStore.startGame(data.pairs, data.roomId);
        setIsSearching(false);
        navigateToGame(data.gameType);
      });
    } catch {
      setIsSearching(false);
    }
  };

  const info = GAME_INFO[selectedGame];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
          </TouchableOpacity>
          <Text style={type.title}>Game Lobby</Text>
        </View>

        {/* Game Selector Chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {gameTypes.map((gt) => (
            <TouchableOpacity
              key={gt}
              onPress={() => setSelectedGame(gt)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: radii.md,
                backgroundColor: selectedGame === gt ? colors.blue.bright : colors.bg.secondary,
                alignItems: 'center',
                borderWidth: 0.5,
                borderColor: selectedGame === gt ? colors.blue.bright : colors.glassBorder,
              }}
            >
              <Text style={{ fontSize: 18 }}>{GAME_INFO[gt].icon}</Text>
              <Text style={{ fontSize: 10, color: colors.silver.white, marginTop: 2, fontWeight: selectedGame === gt ? '700' : '400' }}>
                {GAME_INFO[gt].title.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected Game Info Card */}
        <View style={{ ...card, padding: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>{info.icon}</Text>
          <Text style={type.title}>{info.title}</Text>
          <Text style={{ ...type.body, marginTop: 4 }}>{info.description}</Text>
        </View>

        {/* Room Code Display */}
        {isCreatingRoom && gameStore.roomCode && (
          <View style={{ ...card, backgroundColor: colors.blue.dark, borderColor: colors.blue.bright + '30', padding: 24, marginBottom: 16, alignItems: 'center' }}>
            <Text style={{ ...type.caption, color: colors.blue.pale, marginBottom: 8 }}>Share this code with your friend:</Text>
            <Text style={{ fontSize: 36, fontWeight: '800', color: colors.silver.white, letterSpacing: 8 }}>{gameStore.roomCode}</Text>
            <ActivityIndicator color={colors.blue.light} style={{ marginTop: 14 }} />
            <Text style={{ ...type.footnote, marginTop: 8 }}>Waiting for opponent...</Text>
          </View>
        )}

        {/* Searching */}
        {isSearching && (
          <View style={{ ...card, backgroundColor: colors.blue.dark, borderColor: colors.blue.bright + '30', padding: 24, marginBottom: 16, alignItems: 'center' }}>
            <ActivityIndicator color={colors.blue.light} size="large" />
            <Text style={{ ...type.headline, marginTop: 14 }}>Finding opponent...</Text>
            <Text style={{ ...type.footnote, marginTop: 4 }}>Matching by Elo rating</Text>
            <TouchableOpacity onPress={() => { setIsSearching(false); getSocket().emit('leaveQueue'); }} style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 14, color: colors.error }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Play Options */}
        {!isCreatingRoom && !isSearching && (
          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={handlePractice} style={{ ...button.primary, backgroundColor: colors.success }}>
              <Text style={buttonText.primary}>Practice Solo</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>No opponent needed</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={handleCreateRoom} style={{ flex: 1, ...button.primary }}>
                <Text style={buttonText.primary}>Create Room</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Get a code</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                <TextInput
                  value={roomCode}
                  onChangeText={setRoomCode}
                  placeholder="CODE"
                  placeholderTextColor={colors.silver.mid}
                  autoCapitalize="characters"
                  maxLength={6}
                  style={{ ...input, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: 3, paddingVertical: 10 }}
                />
                <TouchableOpacity
                  onPress={handleJoinRoom}
                  style={{ backgroundColor: colors.bg.tertiary, borderRadius: radii.sm, paddingVertical: 8, alignItems: 'center', marginTop: 6, borderWidth: 0.5, borderColor: colors.glassBorder }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.blue.light }}>Join</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={handleRanked} style={{ ...button.secondary, borderColor: colors.warning + '30' }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.warning }}>Ranked Match</Text>
              <Text style={{ fontSize: 12, color: colors.silver.mid, marginTop: 2 }}>Find opponent by Elo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
