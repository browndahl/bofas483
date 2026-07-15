import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export const authService = {
  async currentUser(): Promise<User | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser(); return data.user;
  },
  async ensureGuest(): Promise<User | null> {
    if (!supabase) return null;
    const existing = await this.currentUser(); if (existing) return existing;
    const { data, error } = await supabase.auth.signInAnonymously(); if (error) throw error; return data.user;
  },
  async signUp(email: string, password: string, displayName: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    return supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  },
  async signIn(email: string, password: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    return supabase.auth.signInWithPassword({ email, password });
  },
  async signInGoogle() {
    if (!supabase) throw new Error('Cloud backend is not configured');
    return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  },
  async linkGuest(email: string, password: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    return supabase.auth.updateUser({ email, password });
  },
  async signOut() { return supabase?.auth.signOut(); }
};
