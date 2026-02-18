import { create } from 'zustand';
import { supabase } from '../supabase';
import type { Profile, EloRating } from '../types';

interface AuthState {
  user: Profile | null;
  eloRatings: EloRating[];
  isLoading: boolean;
  isAuthenticated: boolean;

  signUp: (email: string, password: string, username: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  fetchEloRatings: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  eloRatings: [],
  isLoading: true,
  isAuthenticated: false,

  signUp: async (email, password, username) => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (authError) throw authError;

    if (authData.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        username,
        native_language: 'en',
        learning_language: 'es',
      });
      if (profileError) throw profileError;

      // Elo ratings are created by DB trigger (handle_new_profile) on profile insert
      await get().fetchProfile();
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await get().fetchProfile();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, eloRatings: [], isAuthenticated: false });
  },

  fetchProfile: async () => {
    set({ isLoading: true });
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        set({ user: profile as Profile, isAuthenticated: true });
        await get().fetchEloRatings();
      }
    }
    set({ isLoading: false });
  },

  fetchEloRatings: async () => {
    const user = get().user;
    if (!user) return;

    const { data } = await supabase
      .from('elo_ratings')
      .select('*')
      .eq('user_id', user.id);

    if (data) {
      set({ eloRatings: data as EloRating[] });
    }
  },

  updateProfile: async (updates) => {
    const user = get().user;
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) throw error;

    set({ user: { ...user, ...updates } });
  },
}));
