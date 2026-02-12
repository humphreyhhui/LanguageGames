import { create } from 'zustand';
import { supabase } from '../supabase';
import type { UserStats, UserBadge, GameType } from '../types';

interface StatsState {
  stats: UserStats[];
  badges: UserBadge[];
  isLoading: boolean;

  fetchStats: (userId: string) => Promise<void>;
  fetchBadges: (userId: string) => Promise<void>;
  getStatsByGame: (gameType: GameType) => UserStats | undefined;
}

export const useStatsStore = create<StatsState>((set, get) => ({
  stats: [],
  badges: [],
  isLoading: false,

  fetchStats: async (userId) => {
    set({ isLoading: true });
    const { data } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId);

    if (data) {
      set({ stats: data as UserStats[] });
    }
    set({ isLoading: false });
  },

  fetchBadges: async (userId) => {
    const { data } = await supabase
      .from('user_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', userId);

    if (data) {
      set({ badges: data as UserBadge[] });
    }
  },

  getStatsByGame: (gameType) => {
    return get().stats.find((s) => s.game_type === gameType);
  },
}));
