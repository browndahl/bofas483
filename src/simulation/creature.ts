import type { BuildingState, CreatureState, NeedKey, TaskType, WorldState } from './worldState';
import { connectParentAndChild, makeCreature } from './worldState';

export const NEED_DECAY: Record<NeedKey, number> = {
  hunger: 0.65,
  hygiene: 0.32,
  happiness: 0.28,
  health: 0,
  energy: 0.38
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function decayNeeds(creature: CreatureState, seconds: number, pollution = 0): CreatureState {
  if (!creature.alive) return creature;
  const needs = { ...creature.needs };
  (Object.keys(NEED_DECAY) as NeedKey[]).forEach((key) => {
    const personalityFactor = key === 'happiness' ? 1.12 - creature.personality.resilience * 0.24 : 1;
    needs[key] = clamp(needs[key] - NEED_DECAY[key] * personalityFactor * seconds);
  });
  const distress = [needs.hunger, needs.hygiene, needs.happiness, needs.energy].filter((n) => n < 15).length;
  const resilience = 1.08 - creature.personality.resilience * 0.2;
  needs.health = clamp(needs.health - distress * 0.75 * resilience * seconds - Math.max(0, pollution - 38) * 0.015 * resilience * seconds);
  return { ...creature, needs, exposure: clamp(creature.exposure + pollution * 0.008 * seconds), age: creature.age + seconds };
}

export function chooseTask(creature: CreatureState, buildings: BuildingState[]): TaskType {
  if (!creature.alive) return 'dead';
  if (creature.needs.health < 48 && buildings.some((b) => b.kind === 'clinic' && b.active)) return 'heal';
  if (creature.needs.hunger < 45) return 'eat';
  if (creature.needs.hygiene < 38) return 'bathe';
  if (creature.needs.energy < 30) return 'sleep';
  if (creature.needs.happiness < 42) return 'play';
  if (buildings.some((building) => building.constructing || building.constructionProgress < 100) && creature.needs.energy > 45 && creature.needs.hunger > 52) return 'construct';
  if (buildings.some((building) => building.durability < 45) && creature.personality.diligence > 0.48 && creature.needs.energy > 40) return 'maintain';
  if (buildings.some((b) => b.kind === 'extractor' && b.active)) return 'work';
  return 'wander';
}

export function reproductionReady(creature: CreatureState): boolean {
  const n = creature.needs;
  return creature.alive && creature.age > 22 && n.hunger > 72 && n.hygiene > 65 && n.happiness > 72 && n.health > 80 && n.energy > 55;
}

export function advanceReproduction(creature: CreatureState, seconds: number): CreatureState {
  const reproduction = reproductionReady(creature)
    ? clamp(creature.reproduction + seconds * 2.4)
    : Math.max(0, creature.reproduction - seconds * 0.35);
  return { ...creature, reproduction };
}

export function divideCreature(parent: CreatureState, world: WorldState): CreatureState {
  const id = `c${world.creatures.length + 1}`;
  parent.reproduction = 0;
  parent.needs.energy = Math.max(30, parent.needs.energy - 30);
  parent.needs.hunger = Math.max(35, parent.needs.hunger - 22);
  const child = makeCreature(id, parent.x + 26, parent.y + 10, parent.generation + 1, parent.personality);
  child.parentId = parent.id; child.mentorId = parent.id; parent.childrenIds.push(child.id);
  if (parent.traits.length && (world.creatures.length + parent.generation) % 3 === 0) child.traits.push(parent.traits[world.creatures.length % parent.traits.length]);
  child.history.push({ at: world.time, title: 'Born in the habitat', detail: `${parent.name} is recorded as parent and first mentor.` });
  parent.history.push({ at: world.time, title: 'Welcomed a child', detail: `${child.name} joined the family line.` });
  connectParentAndChild(parent, child);
  return child;
}
