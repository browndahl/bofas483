import type { User } from '@supabase/supabase-js';
import { authRedirectUrl } from './authRedirect';
import { supabase } from './supabaseClient';

const redirectTo = () => authRedirectUrl(window.location.origin);

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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectTo() }
    });
    if (error) throw error;
    return { ...data, confirmationRequired: !data.session };
  },
  async signIn(email: string, password: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error; return data;
  },
  async signInGoogle() {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (error) throw error; return data;
  },
  async linkGuest(email: string, password: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.updateUser({ email, password }, { emailRedirectTo: redirectTo() });
    if (error) throw error;
    return { ...data, confirmationRequired: true };
  },
  async resendConfirmation(email: string) {
    if (!supabase) throw new Error('Cloud backend is not configured');
    const { data, error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } });
    if (error) throw error; return data;
  },
  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut(); if (error) throw error;
  }
};
