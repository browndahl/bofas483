import { addJournal } from './livingWorld';
import type { CreatureState, WorldState } from './worldState';
import { appendWorldEvent, makeCreature } from './worldState';

export interface ColonyRecoveryResult {
  state: WorldState;
  creatureId: string;
}

function prepareRecoveredCreature(creature: CreatureState, world: WorldState) {
  creature.alive = true;
  creature.deathAge = undefined;
  creature.task = 'wander';
  creature.x = 800;
  creature.y = 520;
  creature.target = { x: 800, y: 520 };
  creature.navigationPath = [];
  creature.navigationTarget = undefined;
  creature.destinationBuildingId = undefined;
  creature.destinationCreatureId = undefined;
  creature.socialTarget = undefined;
  creature.socialTimer = 0;
  creature.socialPursuitTimer = 0;
  creature.stuckTimer = 0;
  creature.queueIndex = 0;
  creature.isBeingServed = false;
  creature.reproduction = 0;
  creature.exposure = Math.min(creature.exposure, 10);
  creature.stress = Math.min(creature.stress, 18);
  creature.needs = { hunger: 82, hygiene: 78, happiness: 80, health: 85, energy: 82 };
  creature.currentConcern = 'Listening to the recovery signal';
  creature.history.push({ at: world.time, title: 'Answered the recovery signal', detail: 'The colony preserved its history, facilities, and hard-won knowledge.' });
  creature.memories.push({ id: `recovery-${Math.floor(world.time)}`, at: world.time, text: 'Returned when the habitat called.', valence: 1 });
}

export function recoverSilentColony(world: WorldState): ColonyRecoveryResult | null {
  if (world.creatures.some((creature) => creature.alive)) return null;
  const state = structuredClone(world);
  const creature = [...state.creatures]
    .sort((a, b) => (b.deathAge ?? -1) - (a.deathAge ?? -1))[0]
    ?? makeCreature('c1', 800, 520);
  if (!state.creatures.includes(creature)) state.creatures.push(creature);
  prepareRecoveredCreature(creature, state);
  state.resources.glow = Math.max(55, state.resources.glow);
  state.resources.alloy = Math.max(20, state.resources.alloy);
  state.profile.empathy += 2;
  state.profile.sustainability += 1;
  state.livingWorld.settings.paused = false;
  appendWorldEvent(state, { type: 'colony_recovered', at: state.time, payload: { creatureId: creature.id } });
  addJournal(state, {
    id: `recovery-${Math.floor(state.time)}`,
    category: 'milestone',
    title: `${creature.name} answers the recovery signal`,
    detail: 'One Luma returned with emergency stores. Buildings, research, relationships, and colony history were preserved.',
    at: state.time
  });
  return { state, creatureId: creature.id };
}
