import { BUILDINGS, taskBuilding } from './building';
import { advanceReproduction, chooseTask, decayNeeds, divideCreature } from './creature';
import { buildNavigationPath, isNavigationBlocked } from './navigation';
import { setBond, socialCompatibility } from './personality';
import { resolveObjectiveProgress } from './progression';
import { SpatialGrid } from './spatialGrid';
import type { BuildingKind, BuildingState, CreatureState, TaskType, WorldState } from './worldState';
import { appendWorldEvent } from './worldState';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;
const SOCIAL_TASKS = new Set<TaskType>(['socialize', 'comfort']);

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

function findSocialPartner(creature: CreatureState, grid: SpatialGrid<CreatureState>, time: number): { task: 'socialize' | 'comfort'; partner: CreatureState } | undefined {
  if (creature.socialCooldown > 0 || creature.age < 5) return undefined;
  const candidates = grid.nearby(creature.x, creature.y, 320).filter((candidate) => candidate.id !== creature.id && candidate.alive);
  if (!candidates.length) return undefined;

  if (creature.personality.empathy > 0.48 && creature.needs.health > 58) {
    let best: CreatureState | undefined; let bestScore = 0;
    for (const candidate of candidates) {
      const distress = Math.max(0, 48 - candidate.needs.happiness) + Math.max(0, 64 - candidate.needs.health) * 0.6;
      const score = distress * (0.65 + creature.personality.empathy * 0.7) + (creature.bonds[candidate.id] ?? 0) * 0.08;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    if (best && bestScore > 8) return { task: 'comfort', partner: best };
  }

  const serial = Number(creature.id.replace(/\D/g, '')) || 1;
  const socialPulse = ((Math.floor(time / 7) + serial * 3) % 20) / 20;
  const wantsCompany = creature.needs.happiness < 66 || socialPulse < creature.personality.sociability * 0.22;
  if (!wantsCompany) return undefined;
  let best: CreatureState | undefined; let bestScore = -1;
  for (const candidate of candidates) {
    if (candidate.needs.health < 30 || candidate.needs.hunger < 25) continue;
    const distance = Math.hypot(candidate.x - creature.x, candidate.y - creature.y);
    const score = socialCompatibility(creature, candidate) - distance / 1200;
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best ? { task: 'socialize', partner: best } : undefined;
}

function chooseAutonomousTask(creature: CreatureState, buildings: BuildingState[], grid: SpatialGrid<CreatureState>, time: number): { task: TaskType; partner?: CreatureState } {
  const existingPartner = creature.destinationCreatureId ? grid.nearby(creature.x, creature.y, 500).find((candidate) => candidate.id === creature.destinationCreatureId && candidate.alive) : undefined;
  if (existingPartner && SOCIAL_TASKS.has(creature.task) && creature.socialCooldown <= 0) return { task: creature.task, partner: existingPartner };

  const needTask = chooseTask(creature, buildings);
  if (!['wander', 'work'].includes(needTask)) return { task: needTask };
  const social = findSocialPartner(creature, grid, time);
  if (social) return social;
  return { task: needTask };
}

function updateNavigation(creature: CreatureState, buildings: BuildingState[]) {
  const targetChanged = !creature.navigationTarget || Math.hypot(creature.navigationTarget.x - creature.target.x, creature.navigationTarget.y - creature.target.y) > 34;
  const targetDistance = Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y);
  if (targetChanged || (!creature.navigationPath.length && targetDistance > 12)) {
    creature.navigationPath = buildNavigationPath(creature, creature.target, buildings, creature.destinationBuildingId);
    creature.navigationTarget = { ...creature.target };
  }
  while (creature.navigationPath.length && Math.hypot(creature.navigationPath[0].x - creature.x, creature.navigationPath[0].y - creature.y) < 10) creature.navigationPath.shift();
}

function moveCreature(creature: CreatureState, buildings: BuildingState[], nearby: CreatureState[], seconds: number) {
  updateNavigation(creature, buildings);
  const waypoint = creature.navigationPath[0] ?? creature.target;
  const distance = Math.hypot(waypoint.x - creature.x, waypoint.y - creature.y);
  if (distance <= 4) return;
  const taskSpeed = creature.task === 'work' ? 46 + creature.personality.diligence * 12 : SOCIAL_TASKS.has(creature.task) ? 42 + creature.personality.sociability * 8 : 35 + creature.personality.curiosity * 8;
  const movement = Math.min(distance, taskSpeed * seconds);
  let nextX = creature.x + (waypoint.x - creature.x) / distance * movement;
  let nextY = creature.y + (waypoint.y - creature.y) / distance * movement;

  let separateX = 0; let separateY = 0;
  for (const other of nearby) {
    if (other.id === creature.id || !other.alive) continue;
    const dx = creature.x - other.x; const dy = creature.y - other.y;
    const gap = Math.hypot(dx, dy);
    if (gap > 0 && gap < 34) { const force = (34 - gap) / 34; separateX += dx / gap * force; separateY += dy / gap * force; }
  }
  const separationLength = Math.hypot(separateX, separateY);
  if (separationLength > 0) {
    nextX += separateX / separationLength * Math.min(12 * seconds, 34 - Math.min(34, separationLength));
    nextY += separateY / separationLength * Math.min(12 * seconds, 34 - Math.min(34, separationLength));
  }
  const candidate = { x: nextX, y: nextY };
  if (!isNavigationBlocked(candidate, buildings, creature.destinationBuildingId)) { creature.x = nextX; creature.y = nextY; }
  else { creature.navigationPath = []; creature.navigationTarget = undefined; }
}

function applySocialInteractions(world: WorldState, seconds: number) {
  const byId = new Map(world.creatures.map((creature) => [creature.id, creature]));
  const processed = new Set<string>();
  for (const actor of world.creatures) {
    if (!actor.alive || !SOCIAL_TASKS.has(actor.task) || actor.socialTimer <= 0 || !actor.destinationCreatureId) continue;
    const partner = byId.get(actor.destinationCreatureId);
    if (!partner?.alive || Math.hypot(actor.x - partner.x, actor.y - partner.y) > 76) continue;
    const pairKey = [actor.id, partner.id].sort().join(':');
    if (processed.has(pairKey)) continue;
    processed.add(pairKey);
    const comforting = actor.task === 'comfort' || partner.task === 'comfort';
    const previousBond = Math.max(actor.bonds[partner.id] ?? 0, partner.bonds[actor.id] ?? 0);
    const bondGain = seconds * (comforting ? 2.5 : 1.7) * (0.75 + (actor.personality.sociability + partner.personality.sociability) * 0.25);
    const nextBond = Math.min(100, previousBond + bondGain);
    setBond(actor, partner.id, nextBond); setBond(partner, actor.id, nextBond);
    if (comforting) {
      const recipient = actor.task === 'comfort' ? partner : actor;
      recipient.needs.happiness = Math.min(100, recipient.needs.happiness + seconds * (3.8 + Math.max(actor.personality.empathy, partner.personality.empathy) * 2.2));
      actor.needs.happiness = Math.min(100, actor.needs.happiness + seconds * 1.2);
    } else {
      const restoration = seconds * (2.4 + (actor.personality.sociability + partner.personality.sociability) * 1.2);
      actor.needs.happiness = Math.min(100, actor.needs.happiness + restoration);
      partner.needs.happiness = Math.min(100, partner.needs.happiness + restoration);
    }
    const crossed = [20, 50, 80].find((threshold) => previousBond < threshold && nextBond >= threshold);
    if (crossed) appendWorldEvent(world, { type: 'social_bond', at: world.time, payload: { a: actor.id, b: partner.id, strength: crossed, kind: comforting ? 'comfort' : 'friendship' } });
  }
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
  const sources = next.buildings.map((building) => ({ x: building.x, y: building.y, amount: BUILDINGS[building.kind].pollution }));
  next.pollution = spreadPollution(next.pollution, next.pollutionWidth, next.pollutionHeight, sources, seconds);
  const buildingsByKind = new Map<BuildingKind, BuildingState[]>();
  next.buildings.forEach((building) => {
    if (!building.active) return;
    const group = buildingsByKind.get(building.kind) ?? [];
    group.push(building); buildingsByKind.set(building.kind, group);
  });
  const socialGrid = new SpatialGrid<CreatureState>(128); socialGrid.rebuild(next.creatures.filter((creature) => creature.alive));
  const newborns: CreatureState[] = [];
  next.creatures = next.creatures.map((raw) => {
    if (!raw.alive) return raw;
    const creature = advanceReproduction(decayNeeds(raw, seconds, pollutionAt(next, raw.x, raw.y)), seconds);
    creature.socialCooldown = Math.max(0, creature.socialCooldown - seconds);
    if (creature.socialTimer > 0) {
      creature.socialTimer = Math.max(0, creature.socialTimer - seconds);
      if (creature.socialTimer === 0) {
        creature.socialCooldown = 12 + (1 - creature.personality.sociability) * 16;
        creature.destinationCreatureId = undefined; creature.navigationPath = []; creature.navigationTarget = undefined;
      }
    }
    if (creature.needs.health <= 0) {
      creature.alive = false; creature.task = 'dead'; creature.deathAge = creature.age; next.deaths++;
      next.profile.empathy -= 1; appendWorldEvent(next, { type: 'creature_death', at: next.time, payload: { id: creature.id, exposure: creature.exposure } });
      return creature;
    }

    const decision = chooseAutonomousTask(creature, next.buildings, socialGrid, next.time);
    creature.task = decision.task;
    const kind = taskBuilding[decision.task];
    const building = kind ? nearestBuilding(creature, buildingsByKind.get(kind) ?? []) : undefined;
    if (building) {
      creature.destinationBuildingId = building.id; creature.destinationCreatureId = undefined;
      creature.target = { x: building.x, y: building.y + 38 };
    } else if (decision.partner) {
      const side = (Number(creature.id.replace(/\D/g, '')) || 1) % 2 ? -1 : 1;
      creature.destinationBuildingId = undefined; creature.destinationCreatureId = decision.partner.id;
      creature.target = { x: decision.partner.x + side * 42, y: decision.partner.y + 12 };
    } else {
      creature.destinationBuildingId = undefined; creature.destinationCreatureId = undefined;
      if (Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) < 14 || creature.navigationPath.length === 0) {
        const serial = Number(creature.id.replace(/\D/g, '')) || 1;
        const theta = ((next.seed + creature.age * 19 + serial * 41) % 628) / 100;
        const radius = 120 + creature.personality.curiosity * 105;
        creature.target = { x: Math.max(80, Math.min(1520, creature.x + Math.cos(theta) * radius)), y: Math.max(100, Math.min(900, creature.y + Math.sin(theta) * radius * 0.76)) };
        creature.navigationPath = []; creature.navigationTarget = undefined;
      }
    }

    moveCreature(creature, next.buildings, socialGrid.nearby(creature.x, creature.y, 48), seconds);
    const destinationDistance = Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y);
    if (building && destinationDistance < 10) {
      if (decision.task === 'eat') creature.needs.hunger = Math.min(100, creature.needs.hunger + 16 * seconds);
      if (decision.task === 'bathe') creature.needs.hygiene = Math.min(100, creature.needs.hygiene + 19 * seconds);
      if (decision.task === 'play') creature.needs.happiness = Math.min(100, creature.needs.happiness + 14 * seconds);
      if (decision.task === 'sleep') creature.needs.energy = Math.min(100, creature.needs.energy + 20 * seconds);
      if (decision.task === 'heal') { creature.needs.health = Math.min(100, creature.needs.health + 8 * seconds); creature.exposure = Math.max(0, creature.exposure - 5 * seconds); }
      if (decision.task === 'work') { next.resources.alloy += 0.8 * seconds; next.resources.glow += 0.35 * seconds; creature.needs.happiness = Math.max(0, creature.needs.happiness - 0.9 * seconds); }
    }
    if (decision.partner && Math.hypot(decision.partner.x - creature.x, decision.partner.y - creature.y) < 76 && creature.socialTimer <= 0) creature.socialTimer = 4 + creature.personality.sociability * 3;
    if (creature.reproduction >= 100 && next.creatures.length + newborns.length < 250) newborns.push(divideCreature(creature, next));
    return creature;
  });
  applySocialInteractions(next, seconds);
  if (newborns.length) {
    next.creatures.push(...newborns);
    appendWorldEvent(next, { type: 'division', at: next.time, payload: { count: newborns.length } });
  }
  const living = next.creatures.filter((creature) => creature.alive).length;
  next.populationPeak = Math.max(next.populationPeak, living);
  next.chapter = living >= 14 || next.deaths >= 3 ? 4 : living >= 8 ? 3 : living >= 3 ? 2 : 1;
  return resolveObjectiveProgress(next);
}
