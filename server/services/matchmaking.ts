import { v4 as uuidv4 } from 'uuid';
import { ELO_MATCH_RANGE, ROOM_CODE_LENGTH } from '../config';

// ============================================
// Types
// ============================================

interface QueueEntry {
  socketId: string;
  userId: string;
  username: string;
  elo: number;
  gameType: string;
  joinedAt: number;
}

interface GameRoom {
  roomId: string;
  roomCode: string;
  gameType: string;
  player1: { socketId: string; userId: string; username: string; elo: number; score: number };
  player2: { socketId: string; userId: string; username: string; elo: number; score: number } | null;
  pairs: any[];
  isActive: boolean;
  startedAt: number | null;
  mode: 'ranked' | 'unranked' | 'friend';
}

// ============================================
// State
// ============================================

const matchmakingQueue: Map<string, QueueEntry[]> = new Map(); // gameType -> entries
const activeRooms: Map<string, GameRoom> = new Map(); // roomId -> room
const roomCodeMap: Map<string, string> = new Map(); // roomCode -> roomId

// ============================================
// Room Code Generation
// ============================================

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure uniqueness
  if (roomCodeMap.has(code)) return generateRoomCode();
  return code;
}

// ============================================
// Queue Management
// ============================================

export function joinQueue(entry: QueueEntry): { matched: boolean; opponent?: QueueEntry } {
  const queue = matchmakingQueue.get(entry.gameType) || [];

  // Look for a match within Elo range
  const matchIndex = queue.findIndex(
    (q) =>
      q.userId !== entry.userId &&
      Math.abs(q.elo - entry.elo) <= ELO_MATCH_RANGE
  );

  if (matchIndex !== -1) {
    const opponent = queue.splice(matchIndex, 1)[0];
    matchmakingQueue.set(entry.gameType, queue);
    return { matched: true, opponent };
  }

  // No match, add to queue
  queue.push(entry);
  matchmakingQueue.set(entry.gameType, queue);
  return { matched: false };
}

export function leaveQueue(socketId: string): void {
  for (const [gameType, queue] of matchmakingQueue.entries()) {
    const filtered = queue.filter((q) => q.socketId !== socketId);
    matchmakingQueue.set(gameType, filtered);
  }
}

// ============================================
// Room Management
// ============================================

export function createRoom(
  gameType: string,
  player: { socketId: string; userId: string; username: string; elo: number },
  mode: 'ranked' | 'unranked' | 'friend' = 'friend'
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
