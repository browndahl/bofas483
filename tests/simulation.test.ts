import { describe, expect, it } from 'vitest';
import { chooseTask, decayNeeds, reproductionReady } from '../src/simulation/creature';
import { findPath } from '../src/simulation/pathfinding';
import { spreadPollution, tickWorld } from '../src/simulation/simulation';
import { buildingCapacity, buildingEffectMultiplier, buildingPollution, createBuilding, validateBuildingPlacement } from '../src/simulation/building';
import { buildNavigationPath, isNavigationBlocked } from '../src/simulation/navigation';
import { createCreaturePersonality, setBond } from '../src/simulation/personality';
import { ROLE_SKILL, SKILL_KEYS, trainSkill } from '../src/simulation/colonyLife';
import { advanceOfflineWorld } from '../src/simulation/offlineProgress';
import { creatureMood, creatureVocalization } from '../src/simulation/vocalization';
import { appendWorldEvent, createInitialWorld, makeCreature, MAX_EVENT_HISTORY } from '../src/simulation/worldState';
import { parseWorldState } from '../src/simulation/worldSchema';

describe('creature simulation', () => {
  it('decays needs at their configured rates', () => {
    const creature = createInitialWorld(1).creatures[0]; const next = decayNeeds(creature, 10);
    expect(next.needs.hunger).toBeCloseTo(71.5); expect(next.needs.hygiene).toBeCloseTo(78.8); expect(next.age).toBe(10);
  });
  it('prioritizes health, hunger, hygiene, energy, then happiness', () => {
    const world = createInitialWorld(1); const creature = world.creatures[0]; const clinic = createBuilding('clinic', 0, 0, 1);
    creature.needs = { hunger: 1, hygiene: 1, happiness: 1, health: 20, energy: 1 }; expect(chooseTask(creature, [clinic])).toBe('heal');
    expect(chooseTask(creature, [])).toBe('eat'); creature.needs.hunger = 90; expect(chooseTask(creature, [])).toBe('bathe');
    creature.needs.hygiene = 90; expect(chooseTask(creature, [])).toBe('sleep'); creature.needs.energy = 90; expect(chooseTask(creature, [])).toBe('play');
  });
  it('requires strong needs and maturity for reproduction', () => {
    const creature = createInitialWorld(1).creatures[0]; creature.age = 30; creature.needs = { hunger: 90, hygiene: 90, happiness: 90, health: 90, energy: 90 };
    expect(reproductionReady(creature)).toBe(true); creature.needs.hunger = 50; expect(reproductionReady(creature)).toBe(false);
  });
  it('creates a child after sustained wellbeing', () => {
    const world = createInitialWorld(1); world.creatures[0].age = 30; world.creatures[0].reproduction = 99.9; world.creatures[0].needs = { hunger: 100, hygiene: 100, happiness: 100, health: 100, energy: 100 };
    const next = tickWorld(world, 0.2); expect(next.creatures).toHaveLength(2); expect(next.events.some((event) => event.type === 'division')).toBe(true);
  });
  it('awards objective resources exactly once', () => {
    const world = createInitialWorld(1);
    appendWorldEvent(world, { type: 'manual_hunger', at: 0, payload: { creatureId: 'c1' } });
    const completed = tickWorld(world, 0.2);
    expect(completed.completedObjectives).toEqual(['first-care']);
    expect(completed.resources.glow).toBeCloseTo(98);
    const next = tickWorld(completed, 0.2);
    expect(next.completedObjectives).toEqual(['first-care']);
    expect(next.resources.glow).toBeCloseTo(98);
    expect(next.events.filter((event) => event.type === 'objective_complete')).toHaveLength(1);
  });
  it('gives each Luma a stable bounded personality', () => {
    const first = createCreaturePersonality('c12', 2); const second = createCreaturePersonality('c12', 2);
    expect(first).toEqual(second);
    expect(Object.values(first).every((value) => value >= 0 && value <= 1)).toBe(true);
  });
  it('creates a persistent role, six skills, preferences, and an ambition', () => {
    const first = makeCreature('c12', 500, 500); const second = makeCreature('c12', 500, 500);
    expect(first.role).toBe(second.role);
    expect(Object.keys(first.skills)).toEqual(SKILL_KEYS);
    expect(first.preferences).toEqual(second.preferences);
    expect(first.ambition.description.length).toBeGreaterThan(5);
  });
  it('trains a role specialty faster than ordinary practice', () => {
    const creature = makeCreature('c3', 500, 500); const specialty = ROLE_SKILL[creature.role];
    const before = creature.skills[specialty]; trainSkill(creature, specialty, 10);
    expect(creature.skills[specialty] - before).toBeCloseTo(4.42);
  });
  it('uses original mood-based click vocabulary', () => {
    const creature = makeCreature('c4', 500, 500); creature.needs.hunger = 20;
    expect(creatureMood(creature)).toBe('hungry');
    expect(creatureVocalization(creature, 1).text.length).toBeGreaterThan(2);
  });
  it('forms bonds during social time', () => {
    const world = createInitialWorld(1); const friend = makeCreature('c2', 540, 500);
    world.creatures[0].x = 500; world.creatures[0].y = 500; world.creatures[0].target = { x: 500, y: 500 };
    world.creatures.push(friend);
    world.creatures.forEach((creature) => { creature.age = 10; creature.socialCooldown = 0; creature.needs.happiness = 65; });
    let next = world;
    for (let index = 0; index < 50 && !(next.creatures[0].bonds.c2 ?? next.creatures[1].bonds.c1); index++) next = tickWorld(next, 0.2);
    expect(next.creatures.some((creature) => creature.task === 'socialize')).toBe(true);
    expect(next.creatures[0].bonds.c2 ?? next.creatures[1].bonds.c1).toBeGreaterThan(0);
  });
  it('allows empathetic Luma to comfort distress', () => {
    const world = createInitialWorld(1); const distressed = makeCreature('c2', 540, 500);
    world.creatures[0].x = 500; world.creatures[0].y = 500; world.creatures[0].age = 10; world.creatures[0].socialCooldown = 0; world.creatures[0].personality.empathy = 1;
    distressed.needs.happiness = 20; world.creatures.push(distressed);
    const next = tickWorld(world, 0.2);
    expect(next.creatures[0].task).toBe('comfort');
  });
  it('lets urgent needs interrupt an existing social pursuit', () => {
    const world = createInitialWorld(1); const friend = makeCreature('c2', 560, 500); world.creatures.push(friend);
    world.creatures.forEach((creature, index) => {
      creature.age = 10; creature.socialCooldown = 0; creature.task = 'socialize';
      creature.destinationCreatureId = index === 0 ? 'c2' : 'c1'; creature.socialTarget = { x: 500 + index * 60, y: 500 };
    });
    world.creatures[0].needs.energy = 20;
    const next = tickWorld(world, 0.2);
    expect(next.creatures[0].task).toBe('sleep');
    expect(next.creatures[0].destinationCreatureId).toBeUndefined();
  });
  it('dissolves triangular pursuits into exclusive reciprocal pairs', () => {
    const world = createInitialWorld(1);
    world.creatures = [makeCreature('c1', 450, 500), makeCreature('c2', 520, 500), makeCreature('c3', 590, 500)];
    const loop = ['c2', 'c3', 'c1'];
    world.creatures.forEach((creature, index) => {
      creature.age = 10; creature.socialCooldown = 0; creature.needs.happiness = 65;
      creature.task = 'socialize'; creature.destinationCreatureId = loop[index];
    });
    const next = tickWorld(world, 0.2); const byId = new Map(next.creatures.map((creature) => [creature.id, creature]));
    const paired = next.creatures.filter((creature) => creature.destinationCreatureId);
    expect(paired).toHaveLength(2);
    expect(paired.every((creature) => byId.get(creature.destinationCreatureId!)?.destinationCreatureId === creature.id)).toBe(true);
  });
  it('abandons a social pursuit that exceeds its deadline', () => {
    const world = createInitialWorld(1); world.creatures.push(makeCreature('c2', 560, 500));
    world.creatures.forEach((creature, index) => {
      creature.age = 10; creature.socialCooldown = 0; creature.needs.happiness = 65; creature.task = 'socialize';
      creature.destinationCreatureId = index === 0 ? 'c2' : 'c1'; creature.socialTarget = { x: 500 + index * 60, y: 500 }; creature.socialPursuitTimer = 7.9;
    });
    const next = tickWorld(world, 0.2);
    expect(next.creatures.every((creature) => !creature.destinationCreatureId && creature.socialCooldown >= 8)).toBe(true);
    expect(next.events.some((event) => event.type === 'social_path_abandoned')).toBe(true);
  });
});

describe('environment and navigation', () => {
  it('spreads pollution into neighboring cells while preserving a stronger source', () => {
    const map = new Array(9).fill(0); map[4] = 80; const next = spreadPollution(map, 3, 3, [], 1);
    expect(next[4]).toBeLessThan(80); expect(next[1]).toBeGreaterThan(0); expect(next[0]).toBe(0);
  });
  it('finds a route around blocked cells', () => {
    const path = findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(['1,0']), 3, 3);
    expect(path[0]).toEqual({ x: 0, y: 0 }); expect(path.at(-1)).toEqual({ x: 2, y: 0 }); expect(path).not.toContainEqual({ x: 1, y: 0 });
  });
  it('rejects overlapping and out-of-bounds building sites', () => {
    const building = createBuilding('nutrient-bed', 500, 500, 1);
    expect(validateBuildingPlacement([building], 550, 530).ok).toBe(false);
    expect(validateBuildingPlacement([building], 20, 500).ok).toBe(false);
    expect(validateBuildingPlacement([building], 700, 650).ok).toBe(true);
  });
  it('routes around structures instead of crossing them', () => {
    const blocker = createBuilding('wash-pool', 500, 500, 1);
    const path = buildNavigationPath({ x: 300, y: 500 }, { x: 700, y: 500 }, [blocker]);
    expect(path.length).toBeGreaterThan(1);
    expect(path.some((point) => Math.abs(point.y - 500) > 40)).toBe(true);
    expect(path.slice(0, -1).every((point) => Math.hypot(point.x - blocker.x, point.y - blocker.y) >= 66)).toBe(true);
  });
  it('rejects construction on scenic water and stone', () => {
    expect(validateBuildingPlacement([], 170, 105).ok).toBe(false);
  });
  it('chooses open-ground social targets around structures', () => {
    const world = createInitialWorld(1); world.buildings.push(createBuilding('nest', 500, 500, 1));
    world.creatures = [makeCreature('c1', 390, 500), makeCreature('c2', 610, 500)];
    world.creatures.forEach((creature) => { creature.age = 10; creature.socialCooldown = 0; creature.needs.happiness = 65; });
    const next = tickWorld(world, 0.2); const targets = next.creatures.map((creature) => creature.socialTarget);
    expect(targets.every(Boolean)).toBe(true);
    expect(targets.every((target) => target && !isNavigationBlocked(target, next.buildings))).toBe(true);
  });
  it('reserves distinct service stations and queues overflow visitors', () => {
    const world = createInitialWorld(1); const loom = createBuilding('nutrient-bed', 700, 500, 1); world.buildings.push(loom);
    world.creatures = Array.from({ length: 5 }, (_, index) => makeCreature(`c${index + 1}`, 620 + index * 8, 650));
    world.creatures.forEach((creature) => { creature.needs.hunger = 10; });
    const next = tickWorld(world, 0.2); const visitors = next.creatures.filter((creature) => creature.destinationBuildingId === loom.id);
    expect(new Set(visitors.map((creature) => creature.queueIndex)).size).toBe(5);
    expect(visitors.filter((creature) => creature.isBeingServed)).toHaveLength(buildingCapacity(loom));
    expect(new Set(visitors.map((creature) => `${Math.round(creature.target.x)},${Math.round(creature.target.y)}`)).size).toBe(5);
  });
  it('upgrades every facility with more capacity and stronger or cleaner output', () => {
    (['nutrient-bed', 'wash-pool', 'resonance-garden', 'nest', 'extractor', 'clinic'] as const).forEach((kind) => {
      const building = createBuilding(kind, 500, 500, 1); const baseCapacity = buildingCapacity(building); const basePollution = buildingPollution(building);
      building.level = 2;
      expect(buildingCapacity(building)).toBe(baseCapacity + 1);
      expect(buildingEffectMultiplier(building)).toBeGreaterThan(1);
      expect(buildingPollution(building)).toBeLessThanOrEqual(basePollution);
    });
  });
});

describe('state integrity', () => {
  it('rejects malformed pollution grids', () => {
    const world = createInitialWorld(1); world.pollution.pop();
    expect(parseWorldState(world)).toBeNull();
  });
  it('caps event history at a bounded size', () => {
    const world = createInitialWorld(1);
    for (let index = 0; index < MAX_EVENT_HISTORY + 40; index++) appendWorldEvent(world, { type: 'test', at: index, payload: {} });
    expect(world.events).toHaveLength(MAX_EVENT_HISTORY);
    expect(world.events[0].at).toBe(40);
  });
  it('migrates legacy creatures without personality data', () => {
    const world = createInitialWorld(1);
    const legacy = structuredClone(world) as unknown as { creatures: Array<Record<string, unknown>> };
    for (const creature of legacy.creatures) {
      delete creature.personality; delete creature.bonds; delete creature.navigationPath; delete creature.socialCooldown; delete creature.socialTimer;
      delete creature.socialPursuitTimer; delete creature.socialTarget; delete creature.stuckTimer;
      delete creature.role; delete creature.skills; delete creature.preferences; delete creature.ambition; delete creature.queueIndex; delete creature.isBeingServed;
    }
    const migrated = parseWorldState(legacy);
    expect(migrated?.creatures[0].personality).toBeDefined();
    expect(migrated?.creatures[0].navigationPath).toEqual([]);
    expect(migrated?.creatures[0].socialPursuitTimer).toBe(0);
    expect(migrated?.creatures[0].stuckTimer).toBe(0);
    expect(migrated?.creatures[0].role).toBeDefined();
    expect(migrated?.creatures[0].skills).toBeDefined();
  });
  it('keeps relationship state bounded', () => {
    const creature = createInitialWorld(1).creatures[0];
    for (let index = 2; index <= 14; index++) setBond(creature, `c${index}`, index);
    expect(Object.keys(creature.bonds)).toHaveLength(8);
    expect(Math.min(...Object.values(creature.bonds))).toBe(7);
  });
  it('simulates a bounded, safe offline interval and returns a summary', () => {
    const world = createInitialWorld(1); world.buildings.push(createBuilding('nutrient-bed', 760, 560, 1)); world.creatures[0].needs = { hunger: 0, hygiene: 0, happiness: 0, health: 1, energy: 0 };
    const result = advanceOfflineWorld(world, 3600);
    expect(result.summary?.simulatedSeconds).toBe(900);
    expect(result.summary?.births).toBeLessThanOrEqual(3);
    expect(result.state.creatures[0].alive).toBe(true);
    expect(result.summary?.protectedLuma).toBe(1);
    expect(result.summary?.livingAtEnd).toBeGreaterThanOrEqual(1);
  });
});
