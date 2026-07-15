import { describe, expect, it } from 'vitest';
import { chooseTask, decayNeeds, reproductionReady } from '../src/simulation/creature';
import { findPath } from '../src/simulation/pathfinding';
import { spreadPollution, tickWorld } from '../src/simulation/simulation';
import { createBuilding } from '../src/simulation/building';
import { createInitialWorld } from '../src/simulation/worldState';

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
});
