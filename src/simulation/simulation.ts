import { BUILDINGS, taskBuilding } from './building';
import { advanceReproduction, chooseTask, decayNeeds, divideCreature } from './creature';
import type { BuildingKind, BuildingState, CreatureState, WorldState } from './worldState';
import { appendWorldEvent } from './worldState';
import { resolveObjectiveProgress } from './progression';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;

function nearestBuilding(creature: CreatureState, buildings: BuildingState[]): BuildingState | undefined {
  let nearest: BuildingState | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const building of buildings) {
    const dx = building.x - creature.x; const dy = building.y - creature.y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) { nearest = building; nearestDistance = distance; }
  }
  return nearest;
}

export function spreadPollution(map: number[], width: number, height: number, sources: Array<{ x: number; y: number; amount: number }>, seconds: number): number[] {
  const next = map.slice();
  sources.forEach((source) => {
    const sx = Math.max(0, Math.min(width - 1, Math.floor(source.x / (WORLD_WIDTH / width))));
    const sy = Math.max(0, Math.min(height - 1, Math.floor(source.y / (WORLD_HEIGHT / height))));
    next[sy * width + sx] = Math.min(100, next[sy * width + sx] + source.amount * seconds);
  });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height)
      .map(([nx, ny]) => map[ny * width + nx]);
    const average = neighbors.reduce((sum, value) => sum + value, 0) / Math.max(1, neighbors.length);
    next[i] = Math.max(0, Math.min(100, next[i] + (average - map[i]) * 0.08 * seconds - 0.018 * seconds));
  }
  return next;
}

function pollutionAt(world: WorldState, x: number, y: number): number {
  const gx = Math.max(0, Math.min(world.pollutionWidth - 1, Math.floor(x / (WORLD_WIDTH / world.pollutionWidth))));
  const gy = Math.max(0, Math.min(world.pollutionHeight - 1, Math.floor(y / (WORLD_HEIGHT / world.pollutionHeight))));
  return world.pollution[gy * world.pollutionWidth + gx] ?? 0;
}

export function tickWorld(world: WorldState, seconds: number): WorldState {
  const next = structuredClone(world);
  next.time += seconds;
  const sources = next.buildings.map((b) => ({ x: b.x, y: b.y, amount: BUILDINGS[b.kind].pollution }));
  next.pollution = spreadPollution(next.pollution, next.pollutionWidth, next.pollutionHeight, sources, seconds);
  const buildingsByKind = new Map<BuildingKind, BuildingState[]>();
  next.buildings.forEach((building) => {
    if (!building.active) return;
    const group = buildingsByKind.get(building.kind) ?? [];
    group.push(building); buildingsByKind.set(building.kind, group);
  });
  const newborns: CreatureState[] = [];
  next.creatures = next.creatures.map((raw) => {
    if (!raw.alive) return raw;
    const creature = advanceReproduction(decayNeeds(raw, seconds, pollutionAt(next, raw.x, raw.y)), seconds);
    if (creature.needs.health <= 0) {
      creature.alive = false; creature.task = 'dead'; creature.deathAge = creature.age; next.deaths++;
      next.profile.empathy -= 1; appendWorldEvent(next, { type: 'creature_death', at: next.time, payload: { id: creature.id, exposure: creature.exposure } });
      return creature;
    }
    const task = chooseTask(creature, next.buildings);
    creature.task = task;
    const kind = taskBuilding[task];
    const building = kind ? nearestBuilding(creature, buildingsByKind.get(kind) ?? []) : undefined;
    if (building) { creature.target = { x: building.x, y: building.y + 38 }; creature.destinationBuildingId = building.id; }
    else if (Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) < 14) {
      const theta = ((next.seed + creature.age * 19 + Number(creature.id.slice(1)) * 41) % 628) / 100;
      creature.target = { x: Math.max(80, Math.min(1520, creature.x + Math.cos(theta) * 170)), y: Math.max(100, Math.min(900, creature.y + Math.sin(theta) * 130)) };
    }
    const distance = Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y);
    if (distance > 5) {
      const speed = (task === 'work' ? 52 : 38) * seconds;
      creature.x += (creature.target.x - creature.x) / distance * Math.min(distance, speed);
      creature.y += (creature.target.y - creature.y) / distance * Math.min(distance, speed);
    } else if (building) {
      if (task === 'eat') creature.needs.hunger = Math.min(100, creature.needs.hunger + 16 * seconds);
      if (task === 'bathe') creature.needs.hygiene = Math.min(100, creature.needs.hygiene + 19 * seconds);
      if (task === 'play') creature.needs.happiness = Math.min(100, creature.needs.happiness + 14 * seconds);
      if (task === 'sleep') creature.needs.energy = Math.min(100, creature.needs.energy + 20 * seconds);
      if (task === 'heal') { creature.needs.health = Math.min(100, creature.needs.health + 8 * seconds); creature.exposure = Math.max(0, creature.exposure - 5 * seconds); }
      if (task === 'work') { next.resources.alloy += 0.8 * seconds; next.resources.glow += 0.35 * seconds; creature.needs.happiness = Math.max(0, creature.needs.happiness - 0.9 * seconds); }
    }
    if (creature.reproduction >= 100 && next.creatures.length + newborns.length < 250) newborns.push(divideCreature(creature, next));
    return creature;
  });
  if (newborns.length) {
    next.creatures.push(...newborns);
    appendWorldEvent(next, { type: 'division', at: next.time, payload: { count: newborns.length } });
  }
  const living = next.creatures.filter((c) => c.alive).length;
  next.populationPeak = Math.max(next.populationPeak, living);
  next.chapter = living >= 14 || next.deaths >= 3 ? 4 : living >= 8 ? 3 : living >= 3 ? 2 : 1;
  return resolveObjectiveProgress(next);
}
