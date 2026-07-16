import {
  BUILDINGS,
  buildingCapacity,
  buildingEffectMultiplier,
  buildingOperatorEfficiency,
  buildingPollution,
  buildingStation,
  maintenanceCost,
  materialDeliveryRatio,
  taskBuilding
} from './building';
import { advanceReproduction, chooseTask, decayNeeds, divideCreature } from './creature';
import { skillEfficiency, skillForTask, trainSkill } from './colonyLife';
import { addJournal, ensureBuildingLife, ensureCreatureHistory, ensureLivingWorld, remember, researchBonus, updateCreatureHistory, updateLivingWorld } from './livingWorld';
import { buildNavigationPath, findSocialMeeting, isNavigationBlocked } from './navigation';
import { setBond, socialCompatibility } from './personality';
import { resolveObjectiveProgress } from './progression';
import { SpatialGrid } from './spatialGrid';
import type { BuildingKind, BuildingState, CreatureState, TaskType, Vec2, WorldState } from './worldState';
import { appendWorldEvent } from './worldState';
import {
  canSpendReserve,
  creatureZone,
  ensureColonyManagement,
  managedTask,
  operatorPreferenceScore,
  priorityForTask
} from './colonyManagement';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;
const SOCIAL_TASKS = new Set<TaskType>(['socialize', 'comfort', 'argue']);
const MAX_SOCIAL_PURSUIT = 8;
const STUCK_REPATH_SECONDS = 2.2;

interface SocialPlan { partnerId: string; task: 'socialize' | 'comfort' | 'argue'; target: Vec2 }
interface ServiceAssignment { building: BuildingState; queueIndex: number; target: Vec2; serving: boolean }
const socialTask = (task: TaskType): SocialPlan['task'] => task === 'comfort' || task === 'argue' ? task : 'socialize';

function taskUrgency(world: WorldState, creature: CreatureState, task: TaskType) {
  const policyWeight = priorityForTask(world, task) * 34;
  if (task === 'heal') return 220 - creature.needs.health + policyWeight;
  if (task === 'eat') return 180 - creature.needs.hunger + policyWeight;
  if (task === 'bathe') return 150 - creature.needs.hygiene + policyWeight;
  if (task === 'sleep') return 140 - creature.needs.energy + policyWeight;
  if (task === 'play') return 120 - creature.needs.happiness + policyWeight;
  return 20 + creature.personality.diligence * 10 + policyWeight;
}

function openStation(building: BuildingState, queueIndex: number, buildings: BuildingState[]) {
  const requested = buildingStation(building, queueIndex);
  const dx = requested.x - building.x; const dy = requested.y - building.y;
  const candidates = [requested, { x: building.x - dy, y: building.y + dx }, { x: building.x + dy, y: building.y - dx }, { x: building.x - dx, y: building.y - dy }];
  return candidates.find((candidate) => !isNavigationBlocked(candidate, buildings, building.id)) ?? requested;
}

function buildServiceAssignments(world: WorldState, creatures: CreatureState[], tasks: Map<string, TaskType>, buildingsByKind: Map<BuildingKind, BuildingState[]>, buildings: BuildingState[]) {
  const assignments = new Map<string, ServiceAssignment>();
  const loads = new Map<string, number>();
  const waiting = creatures.filter((creature) => creature.alive && !creature.expeditionId && taskBuilding[tasks.get(creature.id) ?? 'wander'])
    .sort((a, b) => taskUrgency(world, b, tasks.get(b.id) ?? 'wander') - taskUrgency(world, a, tasks.get(a.id) ?? 'wander') || a.id.localeCompare(b.id));
  for (const creature of waiting) {
    const kind = taskBuilding[tasks.get(creature.id) ?? 'wander'];
    const candidates = kind ? buildingsByKind.get(kind) ?? [] : [];
    let chosen: BuildingState | undefined; let bestScore = Number.POSITIVE_INFINITY;
    for (const building of candidates) {
      const load = loads.get(building.id) ?? 0;
      const distance = Math.hypot(building.x - creature.x, building.y - creature.y);
      const queuePressure = load / buildingCapacity(building) * 230;
      const preferenceBonus = creature.preferences.favoriteBuilding === building.kind ? 42 : 0;
      const staffingBonus = world.livingWorld.management.policies.autoStaff ? operatorPreferenceScore(building, creature) : 0;
      const score = distance + queuePressure - preferenceBonus - staffingBonus;
      if (score < bestScore) { bestScore = score; chosen = building; }
    }
    if (!chosen) continue;
    const queueIndex = loads.get(chosen.id) ?? 0;
    loads.set(chosen.id, queueIndex + 1);
    assignments.set(creature.id, { building: chosen, queueIndex, target: openStation(chosen, queueIndex, buildings), serving: queueIndex < buildingCapacity(chosen) });
  }
  return assignments;
}

function buildProjectAssignments(world: WorldState, creatures: CreatureState[], tasks: Map<string, TaskType>, buildings: BuildingState[]) {
  const assignments = new Map<string, ServiceAssignment>(); const loads = new Map<string, number>();
  const workers = creatures.filter((creature) => creature.alive && !creature.expeditionId && ['construct', 'maintain'].includes(tasks.get(creature.id) ?? ''))
    .sort((a, b) => {
      const aPriority = priorityForTask(world, tasks.get(a.id) ?? 'wander'); const bPriority = priorityForTask(world, tasks.get(b.id) ?? 'wander');
      return bPriority - aPriority || b.personality.diligence - a.personality.diligence;
    });
  for (const creature of workers) {
    const task = tasks.get(creature.id); const candidates = task === 'construct'
      ? buildings.filter((building) => building.constructing)
      : buildings.filter((building) => !building.constructing && building.maintenanceFunded && building.durability < 100);
    let chosen: BuildingState | undefined; let best = Number.POSITIVE_INFINITY;
    for (const building of candidates) {
      const load = loads.get(building.id) ?? 0; const score = Math.hypot(building.x - creature.x, building.y - creature.y) + load * 180;
      if (score < best) { best = score; chosen = building; }
    }
    if (!chosen) continue;
    const queueIndex = loads.get(chosen.id) ?? 0; loads.set(chosen.id, queueIndex + 1);
    assignments.set(creature.id, { building: chosen, queueIndex, target: openStation(chosen, queueIndex, buildings), serving: queueIndex < 2 });
  }
  return assignments;
}

function trainAndCelebrate(world: WorldState, creature: CreatureState, task: TaskType, seconds: number, multiplier = 1) {
  const skill = skillForTask(task); if (!skill) return;
  const previous = creature.ambition.progress;
  trainSkill(creature, skill, seconds, multiplier);
  if (previous < creature.ambition.target && creature.ambition.progress >= creature.ambition.target) {
    appendWorldEvent(world, { type: 'ambition_complete', at: world.time, payload: { creatureId: creature.id, ambition: creature.ambition.description } });
  }
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
  if (!creature.alive || creature.expeditionId || creature.age < 5 || creature.socialCooldown > 0 || creature.socialPursuitTimer >= MAX_SOCIAL_PURSUIT) return false;
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

function buildSocialPlans(world: WorldState): Map<string, SocialPlan> {
  const { creatures, buildings, time } = world;
  const plans = new Map<string, SocialPlan>();
  const byId = new Map(creatures.map((creature) => [creature.id, creature]));
  const reserved = new Set<string>();
  const eligible = creatures.filter((creature) => canSocialize(creature, buildings));
  const pair = (first: CreatureState, second: CreatureState, firstTask: 'socialize' | 'comfort' | 'argue', secondTask: 'socialize' | 'comfort' | 'argue' = 'socialize', firstTarget?: Vec2, secondTarget?: Vec2) => {
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
    pair(first, second, socialTask(first.task), socialTask(second.task), first.socialTarget, second.socialTarget);
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
      const compatibility = socialCompatibility(actor, candidate);
      if (compatibility < 0.24 && (Math.floor(time / 13) + Number(actor.id.replace(/\D/g, ''))) % 9 === 0) { partner = candidate; bestScore = 2; break; }
      const score = compatibility - distance / 1200;
      if (score > bestScore) { bestScore = score; partner = candidate; }
    }
    if (partner) {
      const key = [actor.id, partner.id].sort().join(':');
      const latestRelationshipEvent = [...world.events].reverse().find((event) => ['relationship_conflict', 'relationship_reconciled'].includes(event.type) && event.payload.pair === key);
      const readyToReconcile = latestRelationshipEvent?.type === 'relationship_conflict' && time - latestRelationshipEvent.at > 30
        && actor.personality.empathy + partner.personality.empathy > 0.9;
      const conflict = socialCompatibility(actor, partner) < 0.24 && !readyToReconcile;
      pair(actor, partner, conflict ? 'argue' : 'socialize', conflict ? 'argue' : 'socialize');
    }
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
    const arguing = actor.task === 'argue' || partner.task === 'argue';
    const previousBond = Math.max(actor.bonds[partner.id] ?? 0, partner.bonds[actor.id] ?? 0);
    const bondGain = seconds * (comforting ? 2.5 : arguing ? -1.15 : 1.7) * (0.75 + (actor.personality.sociability + partner.personality.sociability) * 0.25) * researchBonus(world, 'society');
    const nextBond = Math.max(0, Math.min(100, previousBond + bondGain));
    setBond(actor, partner.id, nextBond); setBond(partner, actor.id, nextBond);
    if (arguing) {
      actor.needs.happiness = Math.max(0, actor.needs.happiness - seconds * 1.6); partner.needs.happiness = Math.max(0, partner.needs.happiness - seconds * 1.6);
      actor.stress = Math.min(100, actor.stress + seconds * 1.2); partner.stress = Math.min(100, partner.stress + seconds * 1.2);
      const existing = [...world.events].reverse().find((event) => event.type === 'relationship_conflict' && event.payload.pair === pairKey && world.time - event.at < 45);
      if (!existing) {
        const event = { type: 'relationship_conflict', at: world.time, payload: { a: actor.id, b: partner.id, pair: pairKey } };
        appendWorldEvent(world, event); remember(actor, event, `Argued with ${partner.name} and felt misunderstood.`, -1); remember(partner, event, `Argued with ${actor.name} and felt misunderstood.`, -1);
        actor.currentConcern = `Upset after arguing with ${partner.name}`; partner.currentConcern = `Upset after arguing with ${actor.name}`;
        addJournal(world, { category: 'relationship', title: `${actor.name} and ${partner.name} clash`, detail: 'Their incompatible needs became an argument. Time, empathy, or a colony story can help them reconcile.' });
      }
    } else if (comforting) {
      const recipient = actor.task === 'comfort' ? partner : actor;
      recipient.needs.happiness = Math.min(100, recipient.needs.happiness + seconds * (3.8 + Math.max(actor.personality.empathy, partner.personality.empathy) * 2.2));
      actor.needs.happiness = Math.min(100, actor.needs.happiness + seconds * 1.2);
    } else {
      const restoration = seconds * (2.4 + (actor.personality.sociability + partner.personality.sociability) * 1.2);
      actor.needs.happiness = Math.min(100, actor.needs.happiness + restoration);
      partner.needs.happiness = Math.min(100, partner.needs.happiness + restoration);
      const conflict = [...world.events].reverse().find((event) => event.type === 'relationship_conflict' && event.payload.pair === pairKey);
      const reconciled = [...world.events].reverse().find((event) => event.type === 'relationship_reconciled' && event.payload.pair === pairKey);
      if (conflict && (!reconciled || reconciled.at < conflict.at) && world.time - conflict.at > 30) {
        const event = { type: 'relationship_reconciled', at: world.time, payload: { a: actor.id, b: partner.id, pair: pairKey } };
        appendWorldEvent(world, event); remember(actor, event, `${partner.name} returned to talk after their argument.`, 1); remember(partner, event, `${actor.name} returned to talk after their argument.`, 1);
        addJournal(world, { category: 'relationship', title: `${actor.name} and ${partner.name} reconcile`, detail: 'They returned to the same path, listened, and rebuilt part of their bond.' });
      }
    }
    trainAndCelebrate(world, actor, actor.task, seconds, 1.2);
    trainAndCelebrate(world, partner, partner.task, seconds, 1.2);
    if (!arguing && Math.abs(actor.age - partner.age) > 25) {
      const mentor = actor.age > partner.age ? actor : partner; const student = mentor === actor ? partner : actor;
      const skill = Object.entries(mentor.skills).sort((a, b) => b[1] - a[1])[0][0] as keyof typeof mentor.skills;
      if (mentor.skills[skill] > student.skills[skill] + 12) { student.skills[skill] = Math.min(100, student.skills[skill] + seconds * 0.22); student.mentorId = mentor.id; }
    }
    const crossed = [20, 50, 80].find((threshold) => previousBond < threshold && nextBond >= threshold);
    if (crossed) {
      const event = { type: 'social_bond', at: world.time, payload: { a: actor.id, b: partner.id, strength: crossed, kind: comforting ? 'comfort' : 'friendship' } };
      appendWorldEvent(world, event); remember(actor, event, `${partner.name} became an important companion.`, 1); remember(partner, event, `${actor.name} became an important companion.`, 1);
      addJournal(world, { category: 'relationship', title: `${actor.name} and ${partner.name} grow closer`, detail: `Their bond reached ${crossed}%.` });
    }
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
  ensureLivingWorld(next); ensureColonyManagement(next); next.creatures.forEach(ensureCreatureHistory); next.buildings.forEach(ensureBuildingLife);
  next.time += seconds;
  const natureProtection = researchBonus(next, 'nature');
  const sources = next.buildings.filter((building) => building.active && !building.constructing)
    .map((building) => ({ x: building.x, y: building.y, amount: buildingPollution(building) / natureProtection }));
  next.pollution = spreadPollution(next.pollution, next.pollutionWidth, next.pollutionHeight, sources, seconds);
  const buildingsByKind = new Map<BuildingKind, BuildingState[]>();
  next.buildings.forEach((building) => {
    if (building.active && !building.constructing) {
      building.durability = Math.max(0, building.durability - seconds * (building.kind === 'extractor' ? 0.009 : 0.0035));
      if (building.durability <= 0) building.active = false;
    }
    const management = next.livingWorld.management;
    const autoRepairThreshold = Math.max(management.autoFundRepairsBelow, building.maintenanceMode === 'auto' ? 55 : 0);
    if (!building.constructing && building.maintenanceMode === 'auto' && building.durability < autoRepairThreshold && !building.maintenanceFunded) {
      const cost = maintenanceCost(building);
      if (next.resources.glow >= cost.glow && next.resources.alloy >= cost.alloy && canSpendReserve(next, cost)) {
        next.resources.glow -= cost.glow; next.resources.alloy -= cost.alloy; building.maintenanceFunded = true;
        appendWorldEvent(next, { type: 'maintenance_funded', at: next.time, payload: { buildingId: building.id, automatic: true, glow: cost.glow, alloy: cost.alloy } });
      }
    }
    if (!building.active) return;
    const group = buildingsByKind.get(building.kind) ?? [];
    group.push(building); buildingsByKind.set(building.kind, group);
  });
  next.creatures = next.creatures.map((raw) => {
    if (!raw.alive || raw.expeditionId) return raw;
    const creature = advanceReproduction(decayNeeds(raw, seconds, pollutionAt(next, raw.x, raw.y)), seconds);
    updateCreatureHistory(creature, seconds);
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

  const socialPlans = buildSocialPlans(next);
  const groupActivity = next.livingWorld.groupActivity;
  const groupMembers = new Set(groupActivity?.creatureIds ?? []);
  const taskReasons = new Map<string, string>();
  const taskPlans = new Map(next.creatures.filter((creature) => creature.alive && !creature.expeditionId).map((creature) => {
    const urgent = Math.min(creature.needs.health, creature.needs.hunger, creature.needs.hygiene, creature.needs.energy) < 34;
    if (groupMembers.has(creature.id) && !urgent) { taskReasons.set(creature.id, 'Colony-wide group activity'); return [creature.id, 'celebrate'] as const; }
    if (socialPlans.has(creature.id)) { taskReasons.set(creature.id, 'Relationship need and available companion'); return [creature.id, socialPlans.get(creature.id)!.task] as const; }
    const decision = managedTask(next, creature, chooseTask(creature, next.buildings)); taskReasons.set(creature.id, decision.reason);
    return [creature.id, decision.task] as const;
  }));
  const serviceAssignments = buildServiceAssignments(next, next.creatures, taskPlans, buildingsByKind, next.buildings);
  buildProjectAssignments(next, next.creatures, taskPlans, next.buildings).forEach((assignment, id) => serviceAssignments.set(id, assignment));
  const socialGrid = new SpatialGrid<CreatureState>(128); socialGrid.rebuild(next.creatures.filter((creature) => creature.alive && !creature.expeditionId));
  const newborns: CreatureState[] = [];
  next.creatures = next.creatures.map((creature) => {
    if (!creature.alive || creature.expeditionId) return creature;
    const socialPlan = socialPlans.get(creature.id);
    const task = taskPlans.get(creature.id) ?? chooseTask(creature, next.buildings);
    creature.task = task;
    creature.lastTaskReason = taskReasons.get(creature.id) ?? 'Responding to current colony conditions';
    creature.shiftWork = ['work', 'construct', 'maintain'].includes(task) ? creature.shiftWork + seconds : Math.max(0, creature.shiftWork - seconds * 0.5);
    const service = serviceAssignments.get(creature.id);
    const building = service?.building;
    creature.queueIndex = service?.queueIndex ?? 0;
    creature.isBeingServed = service?.serving ?? false;

    if (socialPlan) {
      creature.destinationBuildingId = undefined;
      creature.destinationCreatureId = socialPlan.partnerId;
      creature.socialCooldown = 0;
      creature.socialTarget = { ...socialPlan.target };
      creature.target = { ...socialPlan.target };
    } else if (service) {
      if (creature.destinationCreatureId || SOCIAL_TASKS.has(creature.task) || creature.socialTarget) clearSocialState(creature);
      creature.destinationBuildingId = service.building.id; creature.destinationCreatureId = undefined;
      creature.target = { ...service.target };
    } else if (task === 'celebrate' && groupActivity) {
      if (creature.destinationCreatureId || creature.socialTarget) clearSocialState(creature);
      const index = groupActivity.creatureIds.indexOf(creature.id);
      const angle = Math.PI * 2 * index / Math.max(1, groupActivity.creatureIds.length);
      creature.destinationBuildingId = undefined; creature.destinationCreatureId = undefined;
      creature.target = { x: groupActivity.center.x + Math.cos(angle) * 68, y: groupActivity.center.y + Math.sin(angle) * 44 };
    } else {
      if (creature.destinationCreatureId || SOCIAL_TASKS.has(creature.task) || creature.socialTarget) clearSocialState(creature);
      creature.destinationBuildingId = undefined; creature.destinationCreatureId = undefined;
      if (Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) < 14 || creature.navigationPath.length === 0) {
        const serial = Number(creature.id.replace(/\D/g, '')) || 1;
        const theta = ((next.seed + creature.age * 19 + serial * 41) % 628) / 100;
        const zone = creatureZone(next, creature); const radius = zone ? zone.radius * (0.35 + creature.personality.curiosity * 0.5) : 120 + creature.personality.curiosity * 105;
        const origin = zone ?? creature;
        creature.target = { x: Math.max(80, Math.min(1520, origin.x + Math.cos(theta) * radius)), y: Math.max(100, Math.min(900, origin.y + Math.sin(theta) * radius * 0.76)) };
        creature.navigationPath = []; creature.navigationTarget = undefined;
      }
    }

    const movement = moveCreature(creature, next.buildings, socialGrid.nearby(creature.x, creature.y, 48), seconds);
    if (task === 'wander' && movement.moved > 0.35) trainAndCelebrate(next, creature, task, seconds, 0.45);
    if (movement.remaining > 14 && movement.moved < 0.35) creature.stuckTimer += seconds;
    else if (movement.moved >= 0.35 || movement.remaining <= 14) creature.stuckTimer = 0;
    if (socialPlan && creature.socialTimer <= 0) creature.socialPursuitTimer += seconds;
    if (creature.stuckTimer >= STUCK_REPATH_SECONDS) {
      creature.navigationPath = []; creature.navigationTarget = undefined; creature.stuckTimer = 0;
      next.livingWorld.telemetry.pathRecoveries++;
      if (socialPlan) creature.socialPursuitTimer += 2.5;
      else if (task === 'wander') creature.target = { x: creature.x, y: creature.y };
    }
    const destinationDistance = Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y);
    if (building && service?.serving && destinationDistance < 12) {
      const preference = creature.preferences.favoriteBuilding === building.kind ? 1.05 : 1;
      const operatorEfficiency = ['construct', 'maintain'].includes(task) ? 1 : buildingOperatorEfficiency(creature, building);
      const efficiency = buildingEffectMultiplier(building) * preference * operatorEfficiency;
      if (!['construct', 'maintain'].includes(task)) building.lastOperatorId = creature.id;
      const careBonus = researchBonus(next, 'care');
      if (task === 'eat') creature.needs.hunger = Math.min(100, creature.needs.hunger + 16 * efficiency * careBonus * seconds);
      if (task === 'bathe') creature.needs.hygiene = Math.min(100, creature.needs.hygiene + 19 * efficiency * careBonus * seconds);
      if (task === 'play') creature.needs.happiness = Math.min(100, creature.needs.happiness + 14 * efficiency * seconds);
      if (task === 'sleep') {
        creature.needs.energy = Math.min(100, creature.needs.energy + 20 * efficiency * seconds);
        if (building.level >= 2 && building.upgradeBranch === 'quality') {
          creature.needs.happiness = Math.min(100, creature.needs.happiness + 1.2 * seconds);
          creature.reproduction = Math.min(100, creature.reproduction + 0.08 * seconds);
        }
      }
      if (task === 'heal') { creature.needs.health = Math.min(100, creature.needs.health + 8 * efficiency * careBonus * seconds); creature.exposure = Math.max(0, creature.exposure - 5 * efficiency * careBonus * seconds); }
      if (task === 'work') { next.resources.alloy += 0.8 * efficiency * seconds; next.resources.glow += 0.35 * efficiency * seconds; creature.needs.happiness = Math.max(0, creature.needs.happiness - 0.9 * seconds); }
      if (task === 'construct') {
        const before = building.constructionProgress;
        const builderEfficiency = skillEfficiency(creature, 'building') * (creature.assignedRole === 'builder' ? 1.12 : 1) * researchBonus(next, 'technology');
        const workDelta = 5.4 * builderEfficiency * seconds;
        const deliveryDelta = 7.2 * builderEfficiency * seconds;
        building.constructionWork = Math.min(100, building.constructionWork + workDelta);
        const required = building.materialsRequired;
        building.materialsDelivered.glow = Math.min(required.glow, building.materialsDelivered.glow + required.glow * deliveryDelta / 100);
        building.materialsDelivered.alloy = Math.min(required.alloy, building.materialsDelivered.alloy + required.alloy * deliveryDelta / 100);
        building.constructionProgress = Math.min(building.constructionWork, materialDeliveryRatio(building) * 100);
        trainSkill(creature, 'building', seconds, 1.4);
        if (before < 100 && building.constructionProgress >= 100) {
          building.constructing = false; building.active = true; building.durability = 100; building.constructionKind = undefined;
          building.materialsDelivered = { ...building.materialsRequired };
          appendWorldEvent(next, { type: 'construction_complete', at: next.time, payload: { buildingId: building.id, kind: building.kind, level: building.level, branch: building.upgradeBranch } });
          addJournal(next, { category: 'milestone', title: `${BUILDINGS[building.kind].name} construction complete`, detail: `${creature.name} delivered the final materials and brought level ${building.level} online.` });
        }
      }
      if (task === 'maintain') {
        const before = building.durability;
        building.durability = Math.min(100, building.durability + 7 * skillEfficiency(creature, 'building') * seconds);
        building.active = true; trainSkill(creature, 'building', seconds, 1.15);
        if (before < 100 && building.durability >= 100) {
          building.maintenanceFunded = false;
          appendWorldEvent(next, { type: 'maintenance_complete', at: next.time, payload: { buildingId: building.id, creatureId: creature.id } });
          addJournal(next, { category: 'milestone', title: `${BUILDINGS[building.kind].name} restored`, detail: `${creature.name} completed a funded maintenance cycle.` });
        }
      }
      if (!['construct', 'maintain'].includes(task)) {
        const operatorSkill = BUILDINGS[building.kind].operatorSkill;
        if (operatorSkill !== skillForTask(task)) trainSkill(creature, operatorSkill, seconds, 0.45);
      }
      trainAndCelebrate(next, creature, task, seconds, building.level >= 2 ? 1.12 : 1);
    }
    if (creature.reproduction >= 100 && next.creatures.length + newborns.length < 250) newborns.push(divideCreature(creature, next));
    return creature;
  });
  resolveSocialArrivals(next, socialPlans);
  applySocialInteractions(next, seconds);
  if (newborns.length) {
    next.creatures.push(...newborns);
    appendWorldEvent(next, { type: 'division', at: next.time, payload: { count: newborns.length } });
    newborns.forEach((child) => addJournal(next, { category: 'birth', title: `${child.name} joins the chorus`, detail: `Generation ${child.generation}, child of ${next.creatures.find((creature) => creature.id === child.parentId)?.name ?? 'the habitat'}.` }));
  }
  const living = next.creatures.filter((creature) => creature.alive).length;
  next.populationPeak = Math.max(next.populationPeak, living);
  next.chapter = living >= 14 || next.deaths >= 3 ? 4 : living >= 8 ? 3 : living >= 3 ? 2 : 1;
  updateLivingWorld(next, seconds);
  return resolveObjectiveProgress(next);
}
