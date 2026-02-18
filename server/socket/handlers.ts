import { Server, Socket } from 'socket.io';
import {
  joinQueue,
  leaveQueue,
  createRoom,
  joinRoom,
  getRoom,
  startGame,
  endGame,
  deleteRoom,
  removePlayerFromRooms,
  startMatchmakingLoop,
  getBotConfig,
} from '../services/matchmaking';
import { generatePairs, generatePairsWithDistractors, validateTranslation } from '../services/ollama';
import { saveGameSession } from '../services/gameSession';
import {
  verifySocketToken,
  sanitizeText,
  validateGameType,
  checkSocketRateLimit,
  clearSocketRateLimit,
} from '../middleware/security';
import { supabase } from '../config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  elo?: Record<string, number>;
  isAuthenticated?: boolean;
}

/**
 * Fetch the user's actual Elo ratings from the database.
 * Never trust client-supplied Elo.
 */
async function fetchUserElo(userId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('elo_ratings')
    .select('game_type, elo')
    .eq('user_id', userId);

  const eloMap: Record<string, number> = {};
  if (data) {
    for (const row of data) {
      eloMap[row.game_type] = row.elo;
    }
  }
  return eloMap;
}

/**
 * Fetch the user's username from the database.
 */
async function fetchUsername(userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();

  return data?.username || 'Unknown';
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    console.log(`Client connected: ${socket.id}`);

    // ============================================
    // Authentication — verify JWT server-side
    // ============================================

    socket.on('authenticate', async (data: { token: string }) => {
      if (!data.token || typeof data.token !== 'string') {
        return socket.emit('error', { message: 'Token required' });
      }

      const verified = await verifySocketToken(data.token);
      if (!verified) {
        return socket.emit('error', { message: 'Invalid or expired token' });
      }

      // Fetch real data from DB — never trust the client
      const [elo, username] = await Promise.all([
        fetchUserElo(verified.userId),
        fetchUsername(verified.userId),
      ]);

      socket.userId = verified.userId;
      socket.username = username;
      socket.elo = elo;
      socket.isAuthenticated = true;

      socket.emit('authenticated', { success: true, username });
    });

    /**
     * Guard: ensure socket is authenticated before any game action.
     */
    function requireSocketAuth(): boolean {
      if (!socket.isAuthenticated || !socket.userId || !socket.username) {
        socket.emit('error', { message: 'Not authenticated. Send authenticate event first.' });
        return false;
      }
      return true;
    }

    /**
     * Guard: check rate limit for this socket.
     */
    function checkRate(maxPerWindow: number = 30): boolean {
      if (!checkSocketRateLimit(socket.id, maxPerWindow)) {
        socket.emit('error', { message: 'Too many actions. Slow down.' });
        return false;
      }
      return true;
    }

    // ============================================
    // Matchmaking Queue (Ranked)
    // ============================================

    socket.on('joinQueue', async (data: { gameType: string }) => {
      if (!requireSocketAuth() || !checkRate(5)) return;

      const gameType = validateGameType(data.gameType);
      if (!gameType) {
        return socket.emit('error', { message: 'Invalid game type' });
      }

      const elo = socket.elo?.[gameType] ?? 1000;

      joinQueue({
        socketId: socket.id,
        userId: socket.userId!,
        username: socket.username!,
        elo,
        gameType,
        joinedAt: Date.now(),
      });

      socket.emit('queueJoined', { position: 1 });
    });

    socket.on('leaveQueue', () => {
      if (!requireSocketAuth()) return;
      leaveQueue(socket.id);
      socket.emit('queueLeft');
    });

    // ============================================
    // Friend Rooms
    // ============================================

    socket.on('createRoom', (data: { gameType: string }) => {
      if (!requireSocketAuth() || !checkRate(5)) return;

      const gameType = validateGameType(data.gameType);
      if (!gameType) {
        return socket.emit('error', { message: 'Invalid game type' });
      }

      const elo = socket.elo?.[gameType] ?? 1000;

      const room = createRoom(gameType, {
        socketId: socket.id,
        userId: socket.userId!,
        username: socket.username!,
        elo,
      }, 'friend');

      socket.join(room.roomId);
      socket.emit('roomCreated', { roomId: room.roomId, roomCode: room.roomCode });
    });

    socket.on('joinRoom', async (data: { roomCode: string }) => {
      if (!requireSocketAuth() || !checkRate(5)) return;

      // Sanitize room code: alphanumeric only, max 10 chars
      const roomCode = sanitizeText(data.roomCode, 10).replace(/[^a-zA-Z0-9]/g, '');
      if (!roomCode) {
        return socket.emit('error', { message: 'Invalid room code' });
      }

      const elo = socket.elo?.['race'] ?? 1000;

      const room = joinRoom(roomCode, {
        socketId: socket.id,
        userId: socket.userId!,
        username: socket.username!,
        elo,
      });

      if (!room) {
        return socket.emit('error', { message: 'Room not found or already full' });
      }

      socket.join(room.roomId);

      io.to(room.roomId).emit('playerJoined', {
        roomId: room.roomId,
        player2: { username: socket.username, elo },
      });

      try {
        const pairs = room.gameType === 'asteroid'
          ? await generatePairsWithDistractors('en', 'es', 15, 'medium')
          : await generatePairs('en', 'es', 15, 'medium');

        startGame(room.roomId, pairs);

        io.to(room.roomId).emit('gameStart', {
          roomId: room.roomId,
          pairs,
          gameType: room.gameType,
        });
      } catch (error) {
        console.error('Failed to start friend game:', error);
        io.to(room.roomId).emit('error', { message: 'Failed to start game' });
      }
    });

    // ============================================
    // In-Game Events
    // ============================================

    socket.on('submitAnswer', async (data: {
      roomId: string;
      questionIndex: number;
      answer: string;
    }) => {
      if (!requireSocketAuth() || !checkRate(60)) return;

      const room = getRoom(data.roomId);
      if (!room || !room.pairs) return;

      // Server looks up the correct answer — NOT the client
      const questionIndex = Math.floor(Number(data.questionIndex));
      if (questionIndex < 0 || questionIndex >= room.pairs.length) return;

      const pair = room.pairs[questionIndex];
      const userAnswer = sanitizeText(data.answer, 500);
      if (!userAnswer) return;

      // Validate the answer using the server's copy of the correct answer
      const validation = await validateTranslation(
        pair.source,
        userAnswer,
        pair.target,
        'es' // TODO: get from room config
      );

      // Update score server-side
      const currentPlayer = room.player1.userId === socket.userId ? room.player1 : room.player2;
      if (currentPlayer && validation.correct) {
        currentPlayer.score += 1;
      }

      socket.emit('answerResult', {
        questionIndex,
        correct: validation.correct,
        feedback: validation.feedback,
        newScore: currentPlayer?.score ?? 0,
      });

      io.to(data.roomId).emit('scoreUpdate', {
        player1Score: room.player1.score,
        player2Score: room.player2?.score ?? 0,
      });
    });

    // Score update for client-validated games (asteroid) — server caps increments
    socket.on('updateScore', (data: { roomId: string; score: number }) => {
      if (!requireSocketAuth() || !checkRate(60)) return;

      const room = getRoom(data.roomId);
      if (!room) return;

      const currentPlayer = room.player1.userId === socket.userId ? room.player1 : room.player2;
      if (!currentPlayer) return;

      // Only allow score to increase by 1 at a time (prevents jumps to 99999)
      const newScore = Math.floor(Number(data.score));
      if (isNaN(newScore) || newScore < 0) return;
      if (newScore > currentPlayer.score + 1) {
        // Suspicious: score jumped more than 1
        console.warn(`Suspicious score jump from ${currentPlayer.score} to ${newScore} by ${socket.userId}`);
        currentPlayer.score += 1; // only allow +1
      } else {
        currentPlayer.score = newScore;
      }

      io.to(data.roomId).emit('scoreUpdate', {
        player1Score: room.player1.score,
        player2Score: room.player2?.score ?? 0,
      });
    });

    // ============================================
    // Game End
    // ============================================

    socket.on('endGame', async (data: { roomId: string }) => {
      if (!requireSocketAuth() || !checkRate(5)) return;

      const room = getRoom(data.roomId);
      if (!room || !room.player2) return;

      // Only players in the room can end the game
      if (room.player1.userId !== socket.userId && room.player2.userId !== socket.userId) {
        return socket.emit('error', { message: 'You are not in this game' });
      }

      const endedRoom = endGame(data.roomId);
      if (!endedRoom || !endedRoom.player2) return;

      const p2 = endedRoom.player2;

      const durationMs = endedRoom.startedAt
        ? Date.now() - endedRoom.startedAt
        : 0;

      try {
        const isBotMatch = endedRoom.mode === 'bot_fallback' || p2.userId.startsWith('bot_');
        const result = await saveGameSession({
          gameType: endedRoom.gameType,
          mode: endedRoom.mode,
          player1Id: endedRoom.player1.userId,
          player2Id: isBotMatch ? null : p2.userId,
          player1Score: endedRoom.player1.score,
          player2Score: p2.score,
          durationMs,
        });

        const winnerId =
          endedRoom.player1.score > p2.score
            ? endedRoom.player1.userId
            : p2.score > endedRoom.player1.score
              ? p2.userId
              : null;

        const p1Socket = io.sockets.sockets.get(endedRoom.player1.socketId);
        p1Socket?.emit('gameResult', {
          winner: winnerId,
          player1Score: endedRoom.player1.score,
          player2Score: p2.score,
          eloChange: result.eloResult?.player1Change ?? 0,
          newElo: result.eloResult?.player1NewElo ?? endedRoom.player1.elo,
        });

        const p2Socket = io.sockets.sockets.get(p2.socketId);
        p2Socket?.emit('gameResult', {
          winner: winnerId,
          player1Score: endedRoom.player1.score,
          player2Score: p2.score,
          eloChange: result.eloResult?.player2Change ?? 0,
          newElo: result.eloResult?.player2NewElo ?? p2.elo,
        });
      } catch (error) {
        console.error('Failed to save game session:', error);
      }

      setTimeout(() => deleteRoom(data.roomId), 60000);
    });

    // ============================================
    // Disconnect
    // ============================================

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      leaveQueue(socket.id);
      clearSocketRateLimit(socket.id);

      const affectedRooms = removePlayerFromRooms(socket.id);
      for (const roomId of affectedRooms) {
        io.to(roomId).emit('opponentDisconnected', { roomId });
      }
    });
  });

  const onHumanMatch = async (
    room: { roomId: string; gameType: string },
    player1: { socketId: string; userId: string; username: string; elo: number },
    player2: { socketId: string; userId: string; username: string; elo: number },
    gameType: string
  ) => {
    try {
      const pairs =
        gameType === 'asteroid'
          ? await generatePairsWithDistractors('en', 'es', 15, 'medium')
          : await generatePairs('en', 'es', 15, 'medium');

      startGame(room.roomId, pairs);

      const s1 = io.sockets.sockets.get(player1.socketId);
      const s2 = io.sockets.sockets.get(player2.socketId);
      s1?.join(room.roomId);
      s2?.join(room.roomId);

      io.to(room.roomId).emit('matchFound', {
        roomId: room.roomId,
        pairs,
        gameType,
      });

      s1?.emit('opponentInfo', { username: player2.username, elo: player2.elo });
      s2?.emit('opponentInfo', { username: player1.username, elo: player1.elo });
    } catch (error) {
      console.error('Failed to start matched game:', error);
      const s1 = io.sockets.sockets.get(player1.socketId);
      const s2 = io.sockets.sockets.get(player2.socketId);
      s1?.emit('error', { message: 'Failed to generate game content' });
      s2?.emit('error', { message: 'Failed to generate game content' });
    }
  };

  const onBotMatch = async (
    room: { roomId: string; gameType: string },
    entry: { socketId: string; userId: string; username: string; elo: number },
    gameType: string
  ) => {
    try {
      const pairs =
        gameType === 'asteroid'
          ? await generatePairsWithDistractors('en', 'es', 15, 'medium')
          : await generatePairs('en', 'es', 15, 'medium');

      startGame(room.roomId, pairs);

      const socket = io.sockets.sockets.get(entry.socketId);
      socket?.join(room.roomId);

      const botConfig = getBotConfig(entry.elo);
      socket?.emit('botMatch', {
        roomId: room.roomId,
        pairs,
        gameType,
        botConfig,
      });
      socket?.emit('opponentInfo', { username: botConfig.name, elo: entry.elo });
    } catch (error) {
      console.error('Failed to start bot game:', error);
      const socket = io.sockets.sockets.get(entry.socketId);
      socket?.emit('error', { message: 'Failed to generate game content' });
    }
  };

  startMatchmakingLoop(io, onHumanMatch, onBotMatch);
}
