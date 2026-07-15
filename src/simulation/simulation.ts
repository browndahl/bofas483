import { BUILDINGS, taskBuilding } from './building';
import { advanceReproduction, chooseTask, decayNeeds, divideCreature } from './creature';
import { buildNavigationPath, findSocialMeeting, isNavigationBlocked } from './navigation';
import { setBond, socialCompatibility } from './personality';
import { resolveObjectiveProgress } from './progression';
import { SpatialGrid } from './spatialGrid';
import type { BuildingKind, BuildingState, CreatureState, TaskType, Vec2, WorldState } from './worldState';
import { appendWorldEvent } from './worldState';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;
const SOCIAL_TASKS = new Set<TaskType>(['socialize', 'comfort']);
const MAX_SOCIAL_PURSUIT = 8;
const STUCK_REPATH_SECONDS = 2.2;

interface SocialPlan { partnerId: string; task: 'socialize' | 'comfort'; target: Vec2 }

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

function clearSocialState(creature: CreatureState, cooldown = 0) {
  creature.destinationCreatureId = undefined;
  creature.socialTarget = undefined;
  creature.socialTimer = 0;
  creature.socialPursuitTimer = 0;
  creature.socialCooldown = Math.max(creature.socialCooldown, cooldown);
  creature.navigationPath = [];
  creature.navigationTarget = undefined;
}

function canSocialize(creature: CreatureState, buildings: BuildingState[], allowComfortRecipient = false): boolean {
  if (!creature.alive || creature.age < 5 || creature.socialCooldown > 0 || creature.socialPursuitTimer >= MAX_SOCIAL_PURSUIT) return false;
  const task = chooseTask(creature, buildings);
  return ['wander', 'work'].includes(task) || (allowComfortRecipient && task === 'play');
}

function canReceiveComfort(creature: CreatureState, buildings: BuildingState[]): boolean {
  if (!creature.alive) return false;
  return ['wander', 'work', 'play'].includes(chooseTask(creature, buildings));
}

function wantsCompany(creature: CreatureState, time: number): boolean {
  const serial = Number(creature.id.replace(/\D/g, '')) || 1;
  const socialPulse = ((Math.floor(time / 7) + serial * 3) % 20) / 20;
  return creature.needs.happiness < 66 || socialPulse < creature.personality.sociability * 0.22;
}

function comfortScore(actor: CreatureState, candidate: CreatureState): number {
  if (actor.personality.empathy <= 0.48 || actor.needs.health <= 58) return 0;
  const distress = Math.max(0, 48 - candidate.needs.happiness) + Math.max(0, 64 - candidate.needs.health) * 0.6;
  return distress * (0.65 + actor.personality.empathy * 0.7) + (actor.bonds[candidate.id] ?? 0) * 0.08;
}

function buildSocialPlans(creatures: CreatureState[], buildings: BuildingState[], time: number): Map<string, SocialPlan> {
  const plans = new Map<string, SocialPlan>();
  const byId = new Map(creatures.map((creature) => [creature.id, creature]));
  const reserved = new Set<string>();
  const eligible = creatures.filter((creature) => canSocialize(creature, buildings));
  const pair = (first: CreatureState, second: CreatureState, firstTask: 'socialize' | 'comfort', secondTask: 'socialize' | 'comfort' = 'socialize', firstTarget?: Vec2, secondTarget?: Vec2) => {
    const meeting = firstTarget && secondTarget ? { first: firstTarget, second: secondTarget } : findSocialMeeting(first, second, buildings);
    if (!meeting) return false;
    plans.set(first.id, { partnerId: second.id, task: firstTask, target: meeting.first });
    plans.set(second.id, { partnerId: first.id, task: secondTask, target: meeting.second });
    reserved.add(first.id); reserved.add(second.id);
    return true;
  };

  // Keep only reciprocal, valid pairings. This deliberately dissolves legacy three-way target loops.
  for (const first of eligible) {
    if (reserved.has(first.id) || !first.destinationCreatureId || !first.socialTarget || !SOCIAL_TASKS.has(first.task)) continue;
    const second = byId.get(first.destinationCreatureId);
    const comforting = first.task === 'comfort' || second?.task === 'comfort';
    if (!second || reserved.has(second.id) || second.destinationCreatureId !== first.id || !second.socialTarget || !canSocialize(second, buildings, comforting)) continue;
    if (Math.hypot(first.x - second.x, first.y - second.y) > 500) continue;
    if (isNavigationBlocked(first.socialTarget, buildings) || isNavigationBlocked(second.socialTarget, buildings)) continue;
    pair(first, second, first.task === 'comfort' ? 'comfort' : 'socialize', second.task === 'comfort' ? 'comfort' : 'socialize', first.socialTarget, second.socialTarget);
  }

  // Empathetic care gets first claim on an available partner.
  for (const actor of [...eligible].sort((a, b) => b.personality.empathy - a.personality.empathy)) {
    if (reserved.has(actor.id)) continue;
    let partner: CreatureState | undefined; let bestScore = 8;
    for (const candidate of creatures) {
      if (candidate.id === actor.id || reserved.has(candidate.id) || !canReceiveComfort(candidate, buildings)) continue;
      const distance = Math.hypot(candidate.x - actor.x, candidate.y - actor.y); if (distance > 320) continue;
      const score = comfortScore(actor, candidate) - distance / 900;
      if (score > bestScore) { bestScore = score; partner = candidate; }
    }
    if (partner) pair(actor, partner, 'comfort');
  }

  // Remaining Luma form exclusive pairs, preventing chains and triangular pursuit loops.
  for (const actor of eligible) {
    if (reserved.has(actor.id)) continue;
    let partner: CreatureState | undefined; let bestScore = -1;
    for (const candidate of eligible) {
      if (candidate.id === actor.id || reserved.has(candidate.id) || candidate.needs.health < 30 || candidate.needs.hunger < 25) continue;
      const distance = Math.hypot(candidate.x - actor.x, candidate.y - actor.y); if (distance > 320) continue;
      if (!wantsCompany(actor, time) && !wantsCompany(candidate, time)) continue;
      const score = socialCompatibility(actor, candidate) - distance / 1200;
      if (score > bestScore) { bestScore = score; partner = candidate; }
    }
    if (partner) pair(actor, partner, 'socialize');
  }
  return plans;
}

function updateNavigation(creature: CreatureState, buildings: BuildingState[]) {
  const targetChanged = !creature.navigationTarget || Math.hypot(creature.navigationTarget.x - creature.target.x, creature.navigationTarget.y - creature.target.y) > 34;
  if (targetChanged) {
    creature.navigationPath = buildNavigationPath(creature, creature.target, buildings, creature.destinationBuildingId);
    creature.navigationTarget = { ...creature.target };
  }
  while (creature.navigationPath.length && Math.hypot(creature.navigationPath[0].x - creature.x, creature.navigationPath[0].y - creature.y) < 10) creature.navigationPath.shift();
}

function moveCreature(creature: CreatureState, buildings: BuildingState[], nearby: CreatureState[], seconds: number): { moved: number; remaining: number } {
  updateNavigation(creature, buildings);
  const waypoint = creature.navigationPath[0] ?? creature.target;
  const distance = Math.hypot(waypoint.x - creature.x, waypoint.y - creature.y);
  if (distance <= 4) return { moved: 0, remaining: Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) };
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
  let moved = 0;
  if (!isNavigationBlocked(candidate, buildings, creature.destinationBuildingId)) {
    moved = Math.hypot(nextX - creature.x, nextY - creature.y);
    creature.x = nextX; creature.y = nextY;
  }
  else { creature.navigationPath = []; creature.navigationTarget = undefined; }
  return { moved, remaining: Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) };
}

function resolveSocialArrivals(world: WorldState, plans: Map<string, SocialPlan>) {
  const byId = new Map(world.creatures.map((creature) => [creature.id, creature]));
  const processed = new Set<string>();
  for (const [creatureId, plan] of plans) {
    const pairKey = [creatureId, plan.partnerId].sort().join(':'); if (processed.has(pairKey)) continue;
    processed.add(pairKey);
    const first = byId.get(creatureId); const second = byId.get(plan.partnerId); const reciprocal = plans.get(plan.partnerId);
    if (!first?.alive || !second?.alive || reciprocal?.partnerId !== first.id) continue;
    if (first.socialPursuitTimer >= MAX_SOCIAL_PURSUIT || second.socialPursuitTimer >= MAX_SOCIAL_PURSUIT) {
      clearSocialState(first, 8); clearSocialState(second, 8);
      first.task = chooseTask(first, world.buildings); second.task = chooseTask(second, world.buildings);
      appendWorldEvent(world, { type: 'social_path_abandoned', at: world.time, payload: { a: first.id, b: second.id } });
      continue;
    }
    const firstArrived = first.socialTarget && Math.hypot(first.x - first.socialTarget.x, first.y - first.socialTarget.y) < 16;
    const secondArrived = second.socialTarget && Math.hypot(second.x - second.socialTarget.x, second.y - second.socialTarget.y) < 16;
    if (firstArrived && secondArrived && Math.hypot(first.x - second.x, first.y - second.y) <= 78 && first.socialTimer <= 0 && second.socialTimer <= 0) {
      const duration = 4.5 + (first.personality.sociability + second.personality.sociability) * 1.25;
      first.socialTimer = duration; second.socialTimer = duration;
      first.socialPursuitTimer = 0; second.socialPursuitTimer = 0;
      first.stuckTimer = 0; second.stuckTimer = 0;
    }
  }
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
  next.creatures = next.creatures.map((raw) => {
    if (!raw.alive) return raw;
    const creature = advanceReproduction(decayNeeds(raw, seconds, pollutionAt(next, raw.x, raw.y)), seconds);
    creature.socialCooldown = Math.max(0, creature.socialCooldown - seconds);
    if (creature.socialTimer > 0) {
      creature.socialTimer = Math.max(0, creature.socialTimer - seconds);
      if (creature.socialTimer === 0) {
        clearSocialState(creature, 12 + (1 - creature.personality.sociability) * 16);
      }
    }
    if (creature.needs.health <= 0) {
      creature.alive = false; creature.task = 'dead'; creature.deathAge = creature.age; next.deaths++;
      next.profile.empathy -= 1; appendWorldEvent(next, { type: 'creature_death', at: next.time, payload: { id: creature.id, exposure: creature.exposure } });
      return creature;
    }
    return creature;
  });

  const socialPlans = buildSocialPlans(next.creatures, next.buildings, next.time);
  const socialGrid = new SpatialGrid<CreatureState>(128); socialGrid.rebuild(next.creatures.filter((creature) => creature.alive));
  const newborns: CreatureState[] = [];
  next.creatures = next.creatures.map((creature) => {
    if (!creature.alive) return creature;
    const socialPlan = socialPlans.get(creature.id);
    const task = socialPlan?.task ?? chooseTask(creature, next.buildings);
    creature.task = task;
    const kind = taskBuilding[task];
    const building = kind ? nearestBuilding(creature, buildingsByKind.get(kind) ?? []) : undefined;

    if (socialPlan) {
      creature.destinationBuildingId = undefined;
      creature.destinationCreatureId = socialPlan.partnerId;
      creature.socialCooldown = 0;
      creature.socialTarget = { ...socialPlan.target };
      creature.target = { ...socialPlan.target };
    } else if (building) {
      if (creature.destinationCreatureId || SOCIAL_TASKS.has(creature.task) || creature.socialTarget) clearSocialState(creature);
      creature.destinationBuildingId = building.id; creature.destinationCreatureId = undefined;
      creature.target = { x: building.x, y: building.y + 38 };
    } else {
      if (creature.destinationCreatureId || SOCIAL_TASKS.has(creature.task) || creature.socialTarget) clearSocialState(creature);
      creature.destinationBuildingId = undefined; creature.destinationCreatureId = undefined;
      if (Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) < 14 || creature.navigationPath.length === 0) {
        const serial = Number(creature.id.replace(/\D/g, '')) || 1;
        const theta = ((next.seed + creature.age * 19 + serial * 41) % 628) / 100;
        const radius = 120 + creature.personality.curiosity * 105;
        creature.target = { x: Math.max(80, Math.min(1520, creature.x + Math.cos(theta) * radius)), y: Math.max(100, Math.min(900, creature.y + Math.sin(theta) * radius * 0.76)) };
        creature.navigationPath = []; creature.navigationTarget = undefined;
      }
    }

    const movement = moveCreature(creature, next.buildings, socialGrid.nearby(creature.x, creature.y, 48), seconds);
    if (movement.remaining > 14 && movement.moved < 0.35) creature.stuckTimer += seconds;
    else if (movement.moved >= 0.35 || movement.remaining <= 14) creature.stuckTimer = 0;
    if (socialPlan && creature.socialTimer <= 0) creature.socialPursuitTimer += seconds;
    if (creature.stuckTimer >= STUCK_REPATH_SECONDS) {
      creature.navigationPath = []; creature.navigationTarget = undefined; creature.stuckTimer = 0;
      if (socialPlan) creature.socialPursuitTimer += 2.5;
      else if (task === 'wander') creature.target = { x: creature.x, y: creature.y };
    }
    const destinationDistance = Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y);
    if (building && destinationDistance < 10) {
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
  resolveSocialArrivals(next, socialPlans);
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
