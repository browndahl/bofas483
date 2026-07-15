import objectives from '../data/objectives.json';
import type { WorldState } from './worldState';
import { appendWorldEvent } from './worldState';

interface ObjectiveDefinition { id: string; reward: number }

function isObjectiveMet(id: string, world: WorldState, living: number): boolean {
  switch (id) {
    case 'first-care': return world.events.some((event) => event.type.startsWith('manual_'));
    case 'first-division': return world.events.some((event) => event.type === 'division');
    case 'place-food': return world.buildings.some((building) => building.kind === 'nutrient-bed');
    case 'population-3': return living >= 3;
    case 'place-wash': return world.buildings.some((building) => building.kind === 'wash-pool');
    case 'place-play': return world.buildings.some((building) => building.kind === 'resonance-garden');
    case 'population-6': return living >= 6;
    case 'industry': return world.buildings.some((building) => building.kind === 'extractor');
    case 'first-death': return world.deaths > 0;
    case 'ending': return Boolean(world.endingId);
    default: return false;
  }
}

export function resolveObjectiveProgress(world: WorldState): WorldState {
  const living = world.creatures.filter((creature) => creature.alive).length;
  for (const objective of objectives as ObjectiveDefinition[]) {
    if (world.completedObjectives.includes(objective.id)) continue;
    if (!isObjectiveMet(objective.id, world, living)) break;
    world.completedObjectives.push(objective.id);
    world.resources.glow += objective.reward;
    appendWorldEvent(world, { type: 'objective_complete', at: world.time, payload: { id: objective.id, reward: objective.reward } });
  }
  return world;
}
