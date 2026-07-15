import objectives from '../data/objectives.json';
import type { WorldState } from './worldState';
import { appendWorldEvent } from './worldState';

export interface ObjectiveDefinition {
  id: string;
  title: string;
  hint: string;
  reward: number;
  researchReward?: number;
  alloyReward?: number;
  reputationReward?: number;
  optional?: boolean;
}

export const OBJECTIVES = objectives as ObjectiveDefinition[];

function isObjectiveMet(id: string, world: WorldState, living: number): boolean {
  switch (id) {
    case 'first-care': return world.events.some((event) => event.type.startsWith('manual_'));
    case 'place-food': return world.buildings.some((building) => building.kind === 'nutrient-bed');
    case 'complete-food': return world.buildings.some((building) => building.kind === 'nutrient-bed' && building.active && !building.constructing);
    case 'first-division': return world.events.some((event) => event.type === 'division');
    case 'population-3': return living >= 3;
    case 'assign-role': return world.events.some((event) => event.type === 'role_assignment');
    case 'place-wash': return world.buildings.some((building) => building.kind === 'wash-pool');
    case 'first-research': return world.events.some((event) => event.type === 'research_unlock');
    case 'first-upgrade': return world.events.some((event) => event.type === 'upgrade_building');
    case 'complete-upgrade': return world.buildings.some((building) => building.level >= 2 && building.active && !building.constructing);
    case 'place-play': return world.buildings.some((building) => building.kind === 'resonance-garden');
    case 'population-6': return living >= 6;
    case 'colony-level-2': return world.livingWorld.level >= 2;
    case 'industry': return world.buildings.some((building) => building.kind === 'extractor');
    case 'first-death': return world.deaths > 0;
    case 'ending': return Boolean(world.endingId);
    default: return false;
  }
}

export function resolveObjectiveProgress(world: WorldState): WorldState {
  const living = world.creatures.filter((creature) => creature.alive).length;
  const complete = (objective: ObjectiveDefinition) => {
    world.completedObjectives.push(objective.id);
    world.resources.glow += objective.reward;
    world.resources.alloy += objective.alloyReward ?? 0;
    world.livingWorld.researchPoints += objective.researchReward ?? 0;
    world.livingWorld.reputation += objective.reputationReward ?? 0;
    appendWorldEvent(world, {
      type: 'objective_complete', at: world.time,
      payload: { id: objective.id, reward: objective.reward, alloyReward: objective.alloyReward ?? 0, researchReward: objective.researchReward ?? 0, reputationReward: objective.reputationReward ?? 0 }
    });
  };
  for (const objective of OBJECTIVES.filter((item) => !item.optional)) {
    if (world.completedObjectives.includes(objective.id)) continue;
    if (!isObjectiveMet(objective.id, world, living)) break;
    complete(objective);
  }
  OBJECTIVES.filter((item) => item.optional && !world.completedObjectives.includes(item.id) && isObjectiveMet(item.id, world, living)).forEach(complete);
  return world;
}
