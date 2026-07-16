import { tickWorld } from './simulation';
import type { CreatureState, WorldState } from './worldState';

export interface OfflineSummary {
  elapsedSeconds: number;
  simulatedSeconds: number;
  births: number;
  glowDelta: number;
  alloyDelta: number;
  strongerBonds: number;
  protectedLuma: number;
  livingAtStart: number;
  livingAtEnd: number;
  importantEvents: string[];
  regionalGlow: number;
  regionalAlloy: number;
  activeOutposts: number;
}

const MAX_OFFLINE_SECONDS = 15 * 60;
const MIN_OFFLINE_SECONDS = 45;
const MAX_OFFLINE_BIRTHS = 3;

function closeBondCount(creatures: CreatureState[]) {
  const pairs = new Set<string>();
  creatures.forEach((creature) => Object.entries(creature.bonds).forEach(([partner, strength]) => {
    if (strength >= 20) pairs.add([creature.id, partner].sort().join(':'));
  }));
  return pairs.size;
}

export function advanceOfflineWorld(world: WorldState, elapsedSeconds: number): { state: WorldState; summary?: OfflineSummary } {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < MIN_OFFLINE_SECONDS) return { state: world };
  const before = structuredClone(world);
  const initialCount = before.creatures.length;
  const initialCloseBonds = closeBondCount(before.creatures);
  const initialRegionalGlow = before.livingWorld.supplyRoutes.reduce((sum, route) => sum + route.delivered.glow, 0);
  const initialRegionalAlloy = before.livingWorld.supplyRoutes.reduce((sum, route) => sum + route.delivered.alloy, 0);
  const configuredLimit = Math.max(0, Math.min(240, world.livingWorld?.settings.offlineLimitMinutes ?? 15)) * 60;
  if (configuredLimit === 0) return { state: world };
  const simulatedSeconds = Math.min(configuredLimit || MAX_OFFLINE_SECONDS, elapsedSeconds);
  let state = structuredClone(before);
  let remaining = simulatedSeconds;
  const protectedIds = new Set<string>();
  while (remaining > 0) {
    const step = Math.min(5, remaining);
    const previouslyAlive = new Set(state.creatures.filter((creature) => creature.alive).map((creature) => creature.id));
    state.creatures.forEach((creature) => {
      if (!creature.alive) return;
      if (creature.needs.health < 25) { creature.needs.health = 25; protectedIds.add(creature.id); }
      if (state.creatures.length >= initialCount + MAX_OFFLINE_BIRTHS) creature.reproduction = 0;
    });
    state = tickWorld(state, step);
    const revived = state.creatures.filter((creature) => previouslyAlive.has(creature.id) && !creature.alive);
    revived.forEach((creature) => {
      creature.alive = true; creature.deathAge = undefined; creature.task = 'wander'; creature.needs.health = 12;
      creature.navigationPath = []; creature.destinationBuildingId = undefined; creature.destinationCreatureId = undefined;
      protectedIds.add(creature.id);
    });
    if (revived.length) {
      const revivedIds = new Set(revived.map((creature) => creature.id));
      state.deaths = Math.max(0, state.deaths - revived.length);
      state.profile.empathy += revived.length;
      state.events = state.events.filter((event) => event.type !== 'creature_death' || !revivedIds.has(String(event.payload.id ?? '')));
    }
    if (state.creatures.length > initialCount + MAX_OFFLINE_BIRTHS) state.creatures.splice(initialCount + MAX_OFFLINE_BIRTHS);
    remaining -= step;
  }
  state.populationPeak = Math.max(state.populationPeak, state.creatures.filter((creature) => creature.alive).length);
  const summary: OfflineSummary = {
    elapsedSeconds,
    simulatedSeconds,
    births: Math.max(0, state.creatures.length - initialCount),
    glowDelta: state.resources.glow - before.resources.glow,
    alloyDelta: state.resources.alloy - before.resources.alloy,
    strongerBonds: Math.max(0, closeBondCount(state.creatures) - initialCloseBonds),
    protectedLuma: protectedIds.size,
    livingAtStart: before.creatures.filter((creature) => creature.alive).length,
    livingAtEnd: state.creatures.filter((creature) => creature.alive).length,
    importantEvents: state.livingWorld.journal.slice(before.livingWorld.journal.length).slice(-4).map((entry) => entry.title),
    regionalGlow: state.livingWorld.supplyRoutes.reduce((sum, route) => sum + route.delivered.glow, 0) - initialRegionalGlow,
    regionalAlloy: state.livingWorld.supplyRoutes.reduce((sum, route) => sum + route.delivered.alloy, 0) - initialRegionalAlloy,
    activeOutposts: state.livingWorld.outposts.filter((outpost) => outpost.staffIds.length > 0).length
  };
  return { state, summary };
}
