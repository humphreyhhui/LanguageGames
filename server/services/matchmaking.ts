import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import {
  ROOM_CODE_LENGTH,
  MATCHMAKING_TICK_MS,
  MATCHMAKING_BOT_FALLBACK_MS,
  MATCHMAKING_QUEUE_STATUS_INTERVAL_MS,
  MATCHMAKING_RANGE_SCHEDULE,
  BOT_ELO_EASY,
  BOT_ELO_MEDIUM,
  BOT_ACCURACY_EASY,
  BOT_ACCURACY_MEDIUM,
  BOT_ACCURACY_HARD,
} from '../config';

// ============================================
// Types
// ============================================

export interface QueueEntry {
  socketId: string;
  userId: string;
  username: string;
  elo: number;
  gameType: string;
  joinedAt: number;
  botFallbackMs?: number;
}

export interface GameRoom {
  roomId: string;
  roomCode: string;
  gameType: string;
  player1: { socketId: string; userId: string; username: string; elo: number; score: number };
  player2: { socketId: string; userId: string; username: string; elo: number; score: number } | null;
  pairs: any[];
  isActive: boolean;
  startedAt: number | null;
  mode: 'ranked' | 'unranked' | 'friend' | 'bot_fallback';
}

export interface BotConfig {
  accuracy: number;
  name: string;
}

// ============================================
// State
// ============================================

const matchmakingQueue: Map<string, QueueEntry[]> = new Map();
const activeRooms: Map<string, GameRoom> = new Map();
const roomCodeMap: Map<string, string> = new Map();
let ioInstance: Server | null = null;
let tickIntervalId: ReturnType<typeof setInterval> | null = null;
let statusIntervalId: ReturnType<typeof setInterval> | null = null;

// ============================================
// Range expansion
// ============================================

function getEloRangeForWaitTime(waitMs: number): number {
  for (let i = MATCHMAKING_RANGE_SCHEDULE.length - 1; i >= 0; i--) {
    if (waitMs >= MATCHMAKING_RANGE_SCHEDULE[i].afterMs) {
      return MATCHMAKING_RANGE_SCHEDULE[i].range;
    }
  }
  return MATCHMAKING_RANGE_SCHEDULE[0].range;
}

export function getBotConfig(playerElo: number): BotConfig {
  if (playerElo < BOT_ELO_EASY) {
    return { accuracy: BOT_ACCURACY_EASY, name: 'EasyBot' };
  }
  if (playerElo < BOT_ELO_MEDIUM) {
    return { accuracy: BOT_ACCURACY_MEDIUM, name: 'MediumBot' };
  }
  return { accuracy: BOT_ACCURACY_HARD, name: 'HardBot' };
}

// ============================================
// Room Code Generation
// ============================================

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (roomCodeMap.has(code)) return generateRoomCode();
  return code;
}

// ============================================
// Queue Management
// ============================================

export function joinQueue(entry: QueueEntry): void {
  const queue = matchmakingQueue.get(entry.gameType) || [];
  if (queue.some((q) => q.socketId === entry.socketId || q.userId === entry.userId)) return;
  queue.push(entry);
  matchmakingQueue.set(entry.gameType, queue);
}

export function leaveQueue(socketId: string): void {
  for (const [gameType, queue] of matchmakingQueue.entries()) {
    const filtered = queue.filter((q) => q.socketId !== socketId);
    matchmakingQueue.set(gameType, filtered);
  }
}

export function getQueueEntries(gameType: string): QueueEntry[] {
  return matchmakingQueue.get(gameType) || [];
}

// ============================================
// Matchmaking Tick Loop
// ============================================

type OnHumanMatch = (
  room: GameRoom,
  player1: QueueEntry,
  player2: QueueEntry,
  gameType: string
) => Promise<void>;
type OnBotMatch = (room: GameRoom, entry: QueueEntry, gameType: string) => Promise<void>;

let onHumanMatchCb: OnHumanMatch | null = null;
let onBotMatchCb: OnBotMatch | null = null;

function runMatchmakingTick(): void {
  for (const [gameType, queue] of matchmakingQueue.entries()) {
    if (queue.length === 0) continue;

    const now = Date.now();

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      const waitMs = now - entry.joinedAt;
      const fallbackMs = entry.botFallbackMs ?? MATCHMAKING_BOT_FALLBACK_MS;

      if (waitMs >= fallbackMs) {
        queue.splice(i, 1);
        matchmakingQueue.set(gameType, queue);
        i--;
        const room = createBotRoom(gameType, entry);
        if (onBotMatchCb) {
          onBotMatchCb(room, entry, gameType).catch((err) =>
            console.error('onBotMatch failed:', err)
          );
        }
        continue;
      }

      const range = getEloRangeForWaitTime(waitMs);
      const opponentIdx = queue.findIndex(
        (q, j) =>
          j !== i &&
          q.userId !== entry.userId &&
          (range === Infinity || Math.abs(q.elo - entry.elo) <= range)
      );

      if (opponentIdx !== -1) {
        const opponent = queue.splice(opponentIdx, 1)[0];
        if (opponentIdx < i) i--;
        const entryIdx = queue.findIndex((q) => q.socketId === entry.socketId);
        if (entryIdx !== -1) queue.splice(entryIdx, 1);
        matchmakingQueue.set(gameType, queue);

        const room = createRankedRoom(gameType, opponent, entry);
        if (onHumanMatchCb) {
          onHumanMatchCb(room, opponent, entry, gameType).catch((err) =>
            console.error('onHumanMatch failed:', err)
          );
        }
        return;
      }
    }
  }
}

function emitQueueStatus(): void {
  const io = ioInstance;
  if (!io) return;

  const now = Date.now();
  for (const [, queue] of matchmakingQueue.entries()) {
    for (const entry of queue) {
      const waitMs = now - entry.joinedAt;
      const range = getEloRangeForWaitTime(waitMs);
      const socket = io.sockets.sockets.get(entry.socketId);
      if (socket) {
        socket.emit('queueStatus', {
          timeWaitedMs: waitMs,
          currentRange: range === Infinity ? 9999 : range,
          queueSize: queue.length,
          botFallbackInMs: Math.max(0, (entry.botFallbackMs ?? MATCHMAKING_BOT_FALLBACK_MS) - waitMs),
        });
      }
    }
  }
}

export function startMatchmakingLoop(
  io: Server,
  onHumanMatch: OnHumanMatch,
  onBotMatch: OnBotMatch
): void {
  if (tickIntervalId) clearInterval(tickIntervalId);
  if (statusIntervalId) clearInterval(statusIntervalId);

  ioInstance = io;
  onHumanMatchCb = onHumanMatch;
  onBotMatchCb = onBotMatch;
  tickIntervalId = setInterval(runMatchmakingTick, MATCHMAKING_TICK_MS);
  statusIntervalId = setInterval(emitQueueStatus, MATCHMAKING_QUEUE_STATUS_INTERVAL_MS);
}

export function stopMatchmakingLoop(): void {
  if (tickIntervalId) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
  if (statusIntervalId) {
    clearInterval(statusIntervalId);
    statusIntervalId = null;
  }
  ioInstance = null;
}

// ============================================
// Room Management
// ============================================

export function createRoom(
  gameType: string,
  player: { socketId: string; userId: string; username: string; elo: number },
  mode: 'ranked' | 'unranked' | 'friend' | 'bot_fallback' = 'friend'
): GameRoom {
  const roomId = uuidv4();
  const roomCode = generateRoomCode();

  const room: GameRoom = {
    roomId,
    roomCode,
    gameType,
    player1: { ...player, score: 0 },
    player2: null,
    pairs: [],
    isActive: false,
    startedAt: null,
    mode,
  };

  activeRooms.set(roomId, room);
  roomCodeMap.set(roomCode, roomId);
  return room;
}

export function createBotRoom(
  gameType: string,
  player: { socketId: string; userId: string; username: string; elo: number }
): GameRoom {
  const roomId = uuidv4();
  const roomCode = generateRoomCode();
  const botConfig = getBotConfig(player.elo);

  const room: GameRoom = {
    roomId,
    roomCode,
    gameType,
    player1: { ...player, score: 0 },
    player2: {
      socketId: `bot_${roomId}`,
      userId: `bot_${roomId}`,
      username: botConfig.name,
      elo: player.elo,
      score: 0,
    },
    pairs: [],
    isActive: false,
    startedAt: null,
    mode: 'bot_fallback',
  };

  activeRooms.set(roomId, room);
  roomCodeMap.set(roomCode, roomId);
  return room;
}

export function createRankedRoom(
  gameType: string,
  player1: { socketId: string; userId: string; username: string; elo: number },
  player2: { socketId: string; userId: string; username: string; elo: number }
): GameRoom {
  const roomId = uuidv4();
  const roomCode = generateRoomCode();

  const room: GameRoom = {
    roomId,
    roomCode,
    gameType,
    player1: { ...player1, score: 0 },
    player2: { ...player2, score: 0 },
    pairs: [],
    isActive: false,
    startedAt: null,
    mode: 'ranked',
  };

  activeRooms.set(roomId, room);
  roomCodeMap.set(roomCode, roomId);
  return room;
}

export function joinRoom(
  roomCode: string,
  player: { socketId: string; userId: string; username: string; elo: number }
): GameRoom | null {
  const roomId = roomCodeMap.get(roomCode.toUpperCase());
  if (!roomId) return null;

  const room = activeRooms.get(roomId);
  if (!room || room.player2 || room.isActive) return null;
  if (room.mode === 'bot_fallback') return null;

  room.player2 = { ...player, score: 0 };
  return room;
}

export function getRoom(roomId: string): GameRoom | null {
  return activeRooms.get(roomId) || null;
}

export function getRoomByCode(roomCode: string): GameRoom | null {
  const roomId = roomCodeMap.get(roomCode.toUpperCase());
  if (!roomId) return null;
  return activeRooms.get(roomId) || null;
}

export function updateScore(roomId: string, userId: string, score: number): GameRoom | null {
  const room = activeRooms.get(roomId);
  if (!room) return null;

  if (room.player1.userId === userId) {
    room.player1.score = score;
  } else if (room.player2?.userId === userId) {
    room.player2.score = score;
  }

  return room;
}

export function startGame(roomId: string, pairs: any[]): GameRoom | null {
  const room = activeRooms.get(roomId);
  if (!room) return null;

  room.pairs = pairs;
  room.isActive = true;
  room.startedAt = Date.now();
  return room;
}

export function endGame(roomId: string): GameRoom | null {
  const room = activeRooms.get(roomId);
  if (!room) return null;

  room.isActive = false;
  return room;
}

export function deleteRoom(roomId: string): void {
  const room = activeRooms.get(roomId);
  if (room) {
    roomCodeMap.delete(room.roomCode);
    activeRooms.delete(roomId);
  }
}

export function removePlayerFromRooms(socketId: string): string[] {
  const affectedRoomIds: string[] = [];
  for (const [roomId, room] of activeRooms.entries()) {
    if (room.player1.socketId === socketId || room.player2?.socketId === socketId) {
      affectedRoomIds.push(roomId);
      if (room.isActive) {
        room.isActive = false;
      }
    }
  }
  return affectedRoomIds;
}
