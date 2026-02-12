import { create } from 'zustand';
import type { TranslationPair, GameType, GameMode } from '../types';

interface GameState {
  // Current game state
  currentGameType: GameType | null;
  currentMode: GameMode | null;
  roomId: string | null;
  roomCode: string | null;

  // Game data
  pairs: TranslationPair[];
  currentPairIndex: number;
  playerScore: number;
  opponentScore: number;
  timeRemaining: number;
  isGameActive: boolean;
  isGameOver: boolean;

  // Opponent info
  opponent: { username: string; elo: number } | null;

  // Actions
  setGameType: (gameType: GameType) => void;
  setGameMode: (mode: GameMode) => void;
  startGame: (pairs: TranslationPair[], roomId: string) => void;
  submitAnswer: (correct: boolean) => void;
  updateOpponentScore: (score: number) => void;
  setTimeRemaining: (time: number) => void;
  nextPair: () => void;
  endGame: () => void;
  resetGame: () => void;
  setOpponent: (opponent: { username: string; elo: number }) => void;
  setRoomCode: (code: string) => void;
  setPairs: (pairs: TranslationPair[]) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  currentGameType: null,
  currentMode: null,
  roomId: null,
  roomCode: null,
  pairs: [],
  currentPairIndex: 0,
  playerScore: 0,
  opponentScore: 0,
  timeRemaining: 0,
  isGameActive: false,
  isGameOver: false,
  opponent: null,

  setGameType: (gameType) => set({ currentGameType: gameType }),
  setGameMode: (mode) => set({ currentMode: mode }),

  startGame: (pairs, roomId) =>
    set({
      pairs,
      roomId,
      currentPairIndex: 0,
      playerScore: 0,
      opponentScore: 0,
      isGameActive: true,
      isGameOver: false,
    }),

  submitAnswer: (correct) => {
    if (correct) {
      set((state) => ({ playerScore: state.playerScore + 1 }));
    }
  },

  updateOpponentScore: (score) => set({ opponentScore: score }),
  setTimeRemaining: (time) => set({ timeRemaining: time }),

  nextPair: () =>
    set((state) => ({
      currentPairIndex: Math.min(state.currentPairIndex + 1, state.pairs.length - 1),
    })),

  endGame: () => set({ isGameActive: false, isGameOver: true }),

  resetGame: () =>
    set({
      currentGameType: null,
      currentMode: null,
      roomId: null,
      roomCode: null,
      pairs: [],
      currentPairIndex: 0,
      playerScore: 0,
      opponentScore: 0,
      timeRemaining: 0,
      isGameActive: false,
      isGameOver: false,
      opponent: null,
    }),

  setOpponent: (opponent) => set({ opponent }),
  setRoomCode: (code) => set({ roomCode: code }),
  setPairs: (pairs) => set({ pairs }),
}));
