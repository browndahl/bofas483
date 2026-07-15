import type { WorldState } from '../simulation/worldState';
import { authService } from './authService';
import { supabase } from './supabaseClient';

const LOCAL_KEY = 'bofas483.save.v1';

export const saveService = {
  saveLocal(state: WorldState) { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); },
  loadLocal(): WorldState | null {
    try { const value = localStorage.getItem(LOCAL_KEY); return value ? JSON.parse(value) as WorldState : null; } catch { return null; }
  },
  async saveCloud(state: WorldState, slot = 1) {
    if (!supabase) { this.saveLocal(state); return { local: true }; }
    await authService.ensureGuest();
    const proxy = import.meta.env.VITE_API_PROXY_URL as string | undefined;
    if (proxy) {
      const session = await supabase.auth.getSession();
      const response = await fetch(`${proxy.replace(/\/$/, '')}/save-game`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string }, body: JSON.stringify({ slot, state, events: state.events.slice(-250) }) });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      const data = await response.json(); this.saveLocal(state); return data;
    }
    const { data, error } = await supabase.functions.invoke('save-game', { body: { slot, state, events: state.events.slice(-250) } });
    if (error) throw error; this.saveLocal(state); return data;
  },
  async loadCloud(slot = 1): Promise<WorldState | null> {
    if (!supabase) return this.loadLocal();
    const user = await authService.currentUser(); if (!user) return this.loadLocal();
    const { data, error } = await supabase.from('save_games').select('world_state').eq('user_id', user.id).eq('slot', slot).maybeSingle();
    if (error) throw error; return (data?.world_state as WorldState | undefined) ?? this.loadLocal();
  }
};
