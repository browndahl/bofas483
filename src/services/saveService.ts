import type { WorldState } from '../simulation/worldState';
import { authService } from './authService';
import { supabase } from './supabaseClient';
import { parseWorldState } from '../simulation/worldSchema';
import { advanceOfflineWorld, type OfflineSummary } from '../simulation/offlineProgress';

const LOCAL_KEY = 'bofas483.save.v1';
let pendingOfflineSummary: OfflineSummary | undefined;

export const saveService = {
  saveLocal(state: WorldState): boolean {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ savedAt: Date.now(), state })); return true; }
    catch { return false; }
  },
  loadLocal(): WorldState | null {
    try {
      const value = localStorage.getItem(LOCAL_KEY); if (!value) return null;
      const parsed = JSON.parse(value) as unknown;
      const candidate = parsed && typeof parsed === 'object' && 'state' in parsed ? (parsed as { state: unknown }).state : parsed;
      return parseWorldState(candidate);
    } catch { return null; }
  },
  loadLocalWithProgress(): WorldState | null {
    try {
      const value = localStorage.getItem(LOCAL_KEY); if (!value) return null;
      const parsed = JSON.parse(value) as unknown;
      const wrapped = parsed && typeof parsed === 'object' && 'state' in parsed ? parsed as { savedAt?: unknown; state: unknown } : { state: parsed };
      const state = parseWorldState(wrapped.state); if (!state) return null;
      const savedAt = typeof wrapped.savedAt === 'number' && Number.isFinite(wrapped.savedAt) ? wrapped.savedAt : Date.now();
      const advanced = advanceOfflineWorld(state, Math.max(0, (Date.now() - savedAt) / 1000));
      pendingOfflineSummary = advanced.summary;
      return advanced.state;
    } catch { return null; }
  },
  consumeOfflineSummary() {
    const summary = pendingOfflineSummary; pendingOfflineSummary = undefined; return summary;
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
    if (error) throw error; return parseWorldState(data?.world_state) ?? this.loadLocal();
  }
};
