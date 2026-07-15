import { describe, expect, it } from 'vitest';
import { buildingCapacity, buildingEffectMultiplier, createBuilding, upgradeDescription } from '../src/simulation/building';
import { updateLivingWorld, relationshipStage } from '../src/simulation/livingWorld';
import { advanceOfflineWorld } from '../src/simulation/offlineProgress';
import { tickWorld } from '../src/simulation/simulation';
import { contextualVocalization } from '../src/simulation/vocalization';
import { createInitialWorld, makeCreature } from '../src/simulation/worldState';
import { parseWorldState } from '../src/simulation/worldSchema';

describe('living world progression', () => {
  it('advances day, season, reputation, research, and regional permits', () => {
    const world = createInitialWorld(11); world.time = 480; world.livingWorld.reputation = 95;
    updateLivingWorld(world, 1);
    expect(world.livingWorld.day).toBe(3);
    expect(world.livingWorld.level).toBe(3);
    expect(world.livingWorld.unlockedRegions).toHaveLength(3);
    expect(world.livingWorld.researchPoints).toBeGreaterThan(0);
  });

  it('uses five explicit relationship stages', () => {
    expect([0, 12, 35, 60, 85].map(relationshipStage)).toEqual(['STRANGER', 'FAMILIAR', 'FRIEND', 'CLOSE FRIEND', 'LIFEBOND']);
  });

  it('offers distinct quality and capacity facility paths', () => {
    const building = createBuilding('wash-pool', 700, 500, 1); const base = buildingCapacity(building);
    expect(upgradeDescription(building, 'quality').effect).not.toBe(upgradeDescription(building, 'capacity').effect);
    building.level = 2; building.upgradeBranch = 'capacity';
    expect(buildingCapacity(building)).toBe(base + 2);
    expect(buildingEffectMultiplier(building)).toBeGreaterThan(1);
  });

  it('disables offline simulation when the player selects a zero-minute limit', () => {
    const world = createInitialWorld(5); world.livingWorld.settings.offlineLimitMinutes = 0;
    const result = advanceOfflineWorld(world, 3600);
    expect(result.summary).toBeUndefined(); expect(result.state.time).toBe(0);
  });

  it('migrates saves from before living-world identity fields existed', () => {
    const legacy = createInitialWorld(7) as unknown as Record<string, unknown>;
    delete legacy.livingWorld;
    const creatures = legacy.creatures as Array<Record<string, unknown>>;
    delete creatures[0].traits; delete creatures[0].history; delete creatures[0].voiceStyle;
    const migrated = parseWorldState(legacy);
    expect(migrated?.livingWorld.settings.voiceVolume).toBeGreaterThan(0);
    expect(migrated?.creatures[0].history.length).toBeGreaterThan(0);
    expect(migrated?.creatures[0].voiceStyle).toBeTruthy();
  });

  it('provides contextual return, baby, social, and critical vocalizations', () => {
    const baby = makeCreature('c8', 500, 500, 1); baby.age = 2;
    const lines = (['return', 'birth', 'social', 'critical'] as const).map((context, index) => contextualVocalization(baby, index, context).text);
    expect(new Set(lines).size).toBe(4); expect(lines.every((line) => line.length > 2)).toBe(true);
  });
});

describe('large colony stability', () => {
  it('keeps a 250-Luma colony bounded through repeated worker ticks', () => {
    let world = createInitialWorld(19);
    world.creatures = Array.from({ length: 250 }, (_, index) => makeCreature(`c${index + 1}`, 100 + index % 25 * 55, 120 + Math.floor(index / 25) * 72));
    world.buildings = [
      createBuilding('nutrient-bed', 700, 420, 1), createBuilding('wash-pool', 920, 420, 2),
      createBuilding('resonance-garden', 700, 650, 3), createBuilding('nest', 920, 650, 4),
      createBuilding('clinic', 810, 540, 5)
    ];
    for (let index = 0; index < 8; index++) world = tickWorld(world, 0.2);
    expect(world.creatures).toHaveLength(250);
    expect(world.creatures.every((creature) => Number.isFinite(creature.x) && creature.navigationPath.length < 100)).toBe(true);
    expect(world.events.length).toBeLessThanOrEqual(500);
  });
});
