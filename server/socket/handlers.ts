import { Server, Socket } from 'socket.io';
import {
  joinQueue,
  leaveQueue,
  createRoom,
  createRankedRoom,
  joinRoom,
  getRoom,
  updateScore,
  startGame,
  endGame,
  deleteRoom,
  removePlayerFromRooms,
} from '../services/matchmaking';
import { generatePairs, generatePairsWithDistractors, validateTranslation } from '../services/ollama';
import { saveGameSession } from '../services/gameSession';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  elo?: Record<string, number>;
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    console.log(`Client connected: ${socket.id}`);

    // ============================================
    // Authentication
    // ============================================

    socket.on('authenticate', (data: { userId: string; username: string; elo: Record<string, number> }) => {
      socket.userId = data.userId;
      socket.username = data.username;
      socket.elo = data.elo;
      socket.emit('authenticated', { success: true });
    });

    // ============================================
    // Matchmaking Queue (Ranked)
    // ============================================

    socket.on('joinQueue', async (data: { gameType: string }) => {
      if (!socket.userId || !socket.username) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const elo = socket.elo?.[data.gameType] ?? 1000;

      const result = joinQueue({
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        elo,
        gameType: data.gameType,
        joinedAt: Date.now(),
      });

      if (result.matched && result.opponent) {
        // Create a ranked room
        const room = createRankedRoom(
          data.gameType,
          {
            socketId: result.opponent.socketId,
            userId: result.opponent.userId,
            username: result.opponent.username,
            elo: result.opponent.elo,
          },
          {
            socketId: socket.id,
            userId: socket.userId,
            username: socket.username,
            elo,
          }
        );

        // Generate pairs for the game
        try {
          const pairs = data.gameType === 'asteroid'
            ? await generatePairsWithDistractors('en', 'es', 15, 'medium')
            : await generatePairs('en', 'es', 15, 'medium');

          const startedRoom = startGame(room.roomId, pairs);

          // Join socket rooms
          socket.join(room.roomId);
          const opponentSocket = io.sockets.sockets.get(result.opponent.socketId);
          opponentSocket?.join(room.roomId);

          // Notify both players
          io.to(room.roomId).emit('matchFound', {
            roomId: room.roomId,
            pairs,
            gameType: data.gameType,
          });

          // Send opponent info to each player
          socket.emit('opponentInfo', {
            username: result.opponent.username,
            elo: result.opponent.elo,
          });
          opponentSocket?.emit('opponentInfo', {
            username: socket.username,
            elo,
          });

        } catch (error) {
          console.error('Failed to start matched game:', error);
          socket.emit('error', { message: 'Failed to generate game content' });
        }
      } else {
        socket.emit('queueJoined', { position: 1 });
      }
    });

    socket.on('leaveQueue', () => {
      leaveQueue(socket.id);
      socket.emit('queueLeft');
    });

    // ============================================
    // Friend Rooms
    // ============================================

    socket.on('createRoom', (data: { gameType: string }) => {
      if (!socket.userId || !socket.username) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const elo = socket.elo?.[data.gameType] ?? 1000;

      const room = createRoom(data.gameType, {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        elo,
      }, 'friend');

      socket.join(room.roomId);
      socket.emit('roomCreated', { roomId: room.roomId, roomCode: room.roomCode });
    });

    socket.on('joinRoom', async (data: { roomCode: string }) => {
      if (!socket.userId || !socket.username) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      const elo = socket.elo?.['race'] ?? 1000; // default

      const room = joinRoom(data.roomCode, {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        elo,
      });

      if (!room) {
        return socket.emit('error', { message: 'Room not found or already full' });
      }

      socket.join(room.roomId);

      // Notify room creator
      io.to(room.roomId).emit('playerJoined', {
        roomId: room.roomId,
        player2: { username: socket.username, elo },
      });

      // Generate pairs and start
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
      source: string;
      correctAnswer: string;
      targetLang: string;
    }) => {
      if (!socket.userId) return;

      // Validate the answer
      const validation = await validateTranslation(
        data.source,
        data.answer,
        data.correctAnswer,
        data.targetLang
      );

      const room = getRoom(data.roomId);
      if (!room) return;

      // Update score if correct
      const currentPlayer = room.player1.userId === socket.userId ? room.player1 : room.player2;
      if (currentPlayer && validation.correct) {
        currentPlayer.score += 1;
      }

      // Send result to the answering player
      socket.emit('answerResult', {
        questionIndex: data.questionIndex,
        correct: validation.correct,
        feedback: validation.feedback,
        newScore: currentPlayer?.score ?? 0,
      });

      // Send score update to the room
      io.to(data.roomId).emit('scoreUpdate', {
        player1Score: room.player1.score,
        player2Score: room.player2?.score ?? 0,
      });
    });

    // Simple score update (for games that validate client-side like asteroid)
    socket.on('updateScore', (data: { roomId: string; score: number }) => {
      if (!socket.userId) return;

      const room = updateScore(data.roomId, socket.userId, data.score);
      if (!room) return;

      io.to(data.roomId).emit('scoreUpdate', {
        player1Score: room.player1.score,
        player2Score: room.player2?.score ?? 0,
      });
    });

    // ============================================
    // Game End
    // ============================================

    socket.on('endGame', async (data: { roomId: string }) => {
      const room = getRoom(data.roomId);
      if (!room || !room.player2) return;

      const endedRoom = endGame(data.roomId);
      if (!endedRoom || !endedRoom.player2) return;

      const p2 = endedRoom.player2; // capture for TypeScript narrowing

      const durationMs = endedRoom.startedAt
        ? Date.now() - endedRoom.startedAt
        : 0;

      try {
        const result = await saveGameSession({
          gameType: endedRoom.gameType,
          mode: endedRoom.mode,
          player1Id: endedRoom.player1.userId,
          player2Id: p2.userId,
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

        // Notify player 1
        const p1Socket = io.sockets.sockets.get(endedRoom.player1.socketId);
        p1Socket?.emit('gameResult', {
          winner: winnerId,
          player1Score: endedRoom.player1.score,
          player2Score: p2.score,
          eloChange: result.eloResult?.player1Change ?? 0,
          newElo: result.eloResult?.player1NewElo ?? endedRoom.player1.elo,
        });

        // Notify player 2
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

      // Clean up room after a delay
      setTimeout(() => deleteRoom(data.roomId), 60000);
    });

    // ============================================
    // Disconnect
    // ============================================

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Remove from matchmaking queue
      leaveQueue(socket.id);

      // Handle rooms
      const affectedRooms = removePlayerFromRooms(socket.id);
      for (const roomId of affectedRooms) {
        io.to(roomId).emit('opponentDisconnected', { roomId });
      }
    });
  });
}
