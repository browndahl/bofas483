import type { WorldState } from '../simulation/worldState';
import { authService } from './authService';
import { supabase } from './supabaseClient';
import { parseWorldState } from '../simulation/worldSchema';
import { advanceOfflineWorld, type OfflineSummary } from '../simulation/offlineProgress';

const LOCAL_KEY = import.meta.env.DEV ? 'bofas483.save.dev.v2' : 'bofas483.save.v1';
const slotKey = (slot: number) => slot === 1 ? LOCAL_KEY : `${LOCAL_KEY}.slot.${slot}`;
let pendingOfflineSummary: OfflineSummary | undefined;
let lastSavedAt = 0;

export const saveService = {
  saveLocal(state: WorldState, slot = 1): boolean {
    try {
      const key = slotKey(slot); const previous = localStorage.getItem(key); if (previous) localStorage.setItem(`${key}.backup`, previous);
      lastSavedAt = Date.now(); localStorage.setItem(key, JSON.stringify({ savedAt: lastSavedAt, state })); return true;
    }
    catch { return false; }
  },
  loadLocal(slot = 1): WorldState | null {
    try {
      const value = localStorage.getItem(slotKey(slot)); if (!value) return null;
      const parsed = JSON.parse(value) as unknown;
      const candidate = parsed && typeof parsed === 'object' && 'state' in parsed ? (parsed as { state: unknown }).state : parsed;
      return parseWorldState(candidate);
    } catch { return null; }
  },
  loadLocalWithProgress(slot = 1): WorldState | null {
    try {
      const value = localStorage.getItem(slotKey(slot)); if (!value) return null;
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
  loadBackup(slot = 1) {
    try { const value = localStorage.getItem(`${slotKey(slot)}.backup`); if (!value) return null; const parsed = JSON.parse(value) as { state?: unknown }; return parseWorldState(parsed.state ?? parsed); }
    catch { return null; }
  },
  slotMetadata() {
    return [1, 2, 3].map((slot) => {
      try { const raw = localStorage.getItem(slotKey(slot)); if (!raw) return { slot, empty: true as const }; const parsed = JSON.parse(raw) as { savedAt?: number; state?: { creatures?: Array<{ alive?: boolean }>; livingWorld?: { title?: string } } }; return { slot, empty: false as const, savedAt: parsed.savedAt ?? 0, living: parsed.state?.creatures?.filter((creature) => creature.alive).length ?? 0, title: parsed.state?.livingWorld?.title ?? 'Habitat' }; }
      catch { return { slot, empty: true as const }; }
    });
  },
  exportState(state: WorldState) { return JSON.stringify({ product: 'bofas483', version: 2, exportedAt: Date.now(), state }, null, 2); },
  importState(value: string) { try { const parsed = JSON.parse(value) as { state?: unknown }; return parseWorldState(parsed.state ?? parsed); } catch { return null; } },
  lastSavedAt() { return lastSavedAt; },
  async saveCloud(state: WorldState, slot = 1) {
    if (!supabase) { this.saveLocal(state, slot); return { local: true }; }
    await authService.ensureGuest();
    const proxy = import.meta.env.VITE_API_PROXY_URL as string | undefined;
    if (proxy) {
      const session = await supabase.auth.getSession();
      const response = await fetch(`${proxy.replace(/\/$/, '')}/save-game`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string }, body: JSON.stringify({ slot, state, events: state.events.slice(-250) }) });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      const data = await response.json(); this.saveLocal(state, slot); return data;
    }
    const { data, error } = await supabase.functions.invoke('save-game', { body: { slot, state, events: state.events.slice(-250) } });
    if (error) throw error; this.saveLocal(state, slot); return data;
  },
  async loadCloud(slot = 1): Promise<WorldState | null> {
    if (!supabase) return this.loadLocal(slot);
    const user = await authService.currentUser(); if (!user) return this.loadLocal(slot);
    const { data, error } = await supabase.from('save_games').select('world_state').eq('user_id', user.id).eq('slot', slot).maybeSingle();
    if (error) throw error; return parseWorldState(data?.world_state) ?? this.loadLocal(slot);
  }
};
