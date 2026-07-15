import { BUILDINGS, canAfford, createBuilding } from '../simulation/building';
import type { BuildingKind, CreatureState, NeedKey, WorldState } from '../simulation/worldState';
import { createInitialWorld } from '../simulation/worldState';

type Listener = (state: WorldState) => void;

class GameStateStore {
  private state = createInitialWorld();
  private listeners = new Set<Listener>();
  private worker?: Worker;

  get() { return this.state; }
  subscribe(listener: Listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private emit() { this.listeners.forEach((listener) => listener(this.state)); }
  set(state: WorldState, send = true) { this.state = state; if (send) this.worker?.postMessage({ type: 'replace', state }); this.emit(); }
  start() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../simulation/simulationWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<{ type: string; state: WorldState }>) => {
      if (event.data.type === 'state') { this.state = event.data.state; this.emit(); }
    };
    this.worker.onerror = (event) => window.dispatchEvent(new CustomEvent('worker-error', { detail: event.message }));
    this.worker.postMessage({ type: 'start', state: this.state });
  }
  reset() { this.set(createInitialWorld()); }
  selectCreature(id: string): CreatureState | undefined { return this.state.creatures.find((c) => c.id === id); }
  care(id: string, need: Extract<NeedKey, 'hunger' | 'hygiene' | 'happiness'>) {
    const next = structuredClone(this.state);
    const creature = next.creatures.find((c) => c.id === id && c.alive);
    if (!creature || next.resources.glow < 2) return false;
    const amount = next.technologies.includes('gentle-hands') ? 34 : 24;
    creature.needs[need] = Math.min(100, creature.needs[need] + amount);
    if (need === 'hunger') creature.needs.energy = Math.min(100, creature.needs.energy + 5);
    next.resources.glow -= 2;
    next.profile.empathy += 0.15;
    next.events.push({ type: `manual_${need}`, at: next.time, payload: { creatureId: id } });
    this.set(next); return true;
  }
  place(kind: BuildingKind, x: number, y: number) {
    const next = structuredClone(this.state);
    if (!canAfford(next.resources, kind)) return false;
    const cost = BUILDINGS[kind].cost;
    next.resources.glow -= cost.glow; next.resources.alloy -= cost.alloy;
    next.buildings.push(createBuilding(kind, x, y, next.buildings.length + 1));
    next.profile.ambition += kind === 'extractor' ? 2 : 0.5;
    next.profile.sustainability += BUILDINGS[kind].pollution === 0 ? 0.5 : -1;
    next.events.push({ type: 'place_building', at: next.time, payload: { kind, x, y } });
    this.set(next); return true;
  }
  applyChoice(dialogueId: string, effects: Partial<Record<keyof WorldState['profile'], number>>, ending?: string) {
    const next = structuredClone(this.state);
    if (!next.dialogueHistory.includes(dialogueId)) next.dialogueHistory.push(dialogueId);
    Object.entries(effects).forEach(([key, value]) => { next.profile[key as keyof typeof next.profile] += value ?? 0; });
    next.events.push({ type: 'dialogue_choice', at: next.time, payload: { dialogueId, effects, ending } });
    if (ending) { next.endingId = ending; next.chapter = 5; }
    this.set(next);
  }
}

export const gameStore = new GameStateStore();
