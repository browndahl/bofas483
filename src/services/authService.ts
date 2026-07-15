import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export const authService = {
  async currentUser(): Promise<User | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error?.name === 'AuthSessionMissingError') return null;
    if (error) throw error; return data.user;
  },
  async ensureGuest(): Promise<User | null> {
    if (!supabase) return null;
    const existing = await this.currentUser(); if (existing) return existing;
    const { data, error } = await supabase.auth.signInAnonymously(); if (error) throw error; return data.user;
  },
  async signUp(email: string, password: string, displayName: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) throw error; return data;
  },
  async signIn(email: string, password: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error; return data;
  },
  async signInGoogle() {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error; return data;
  },
  async linkGuest(email: string, password: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) throw error; return data;
  },
  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut(); if (error) throw error;
  }
};
