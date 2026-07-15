import { describe, expect, it } from 'vitest';
import { chooseTask, decayNeeds, reproductionReady } from '../src/simulation/creature';
import { findPath } from '../src/simulation/pathfinding';
import { spreadPollution, tickWorld } from '../src/simulation/simulation';
import { createBuilding, validateBuildingPlacement } from '../src/simulation/building';
import { buildNavigationPath } from '../src/simulation/navigation';
import { createCreaturePersonality, setBond } from '../src/simulation/personality';
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
  it('forms bonds during social time', () => {
    const world = createInitialWorld(1); const friend = makeCreature('c2', 540, 500);
    world.creatures[0].x = 500; world.creatures[0].y = 500; world.creatures[0].target = { x: 500, y: 500 };
    world.creatures.push(friend);
    world.creatures.forEach((creature) => { creature.age = 10; creature.socialCooldown = 0; creature.needs.happiness = 65; });
    const next = tickWorld(world, 0.2);
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
    }
    const migrated = parseWorldState(legacy);
    expect(migrated?.creatures[0].personality).toBeDefined();
    expect(migrated?.creatures[0].navigationPath).toEqual([]);
  });
  it('keeps relationship state bounded', () => {
    const creature = createInitialWorld(1).creatures[0];
    for (let index = 2; index <= 14; index++) setBond(creature, `c${index}`, index);
    expect(Object.keys(creature.bonds)).toHaveLength(8);
    expect(Math.min(...Object.values(creature.bonds))).toBe(7);
  });
});
