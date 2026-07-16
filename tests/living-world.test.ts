import { describe, expect, it } from 'vitest';
import {
  advancedUpgradeAvailability,
  advancedUpgradeCost,
  buildingCapacity,
  buildingEffectMultiplier,
  buildingOperatorEfficiency,
  createBuilding,
  upgradeAvailability,
  upgradeDescription,
  upgradePreview
} from '../src/simulation/building';
import { launchExpedition, resolveExpeditionDecision, updateExpeditions } from '../src/simulation/expeditions';
import { updateLivingWorld, relationshipStage } from '../src/simulation/livingWorld';
import { advanceOfflineWorld } from '../src/simulation/offlineProgress';
import { tickWorld } from '../src/simulation/simulation';
import { contextualVocalization } from '../src/simulation/vocalization';
import { createInitialWorld, makeCreature } from '../src/simulation/worldState';
import { parseWorldState } from '../src/simulation/worldSchema';
import { relationshipTone, resolvePersonalRequest, resolveStoryChoice, updateColonyStories } from '../src/simulation/colonyStories';

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
    const quality = upgradePreview(building, 'quality'); const capacity = upgradePreview(building, 'capacity');
    expect(quality.outputAfter).toBeGreaterThan(capacity.outputAfter);
    expect(capacity.capacityAfter).toBeGreaterThan(quality.capacityAfter);
    building.level = 2; building.upgradeBranch = 'capacity';
    expect(buildingCapacity(building)).toBe(base + 2);
    expect(buildingEffectMultiplier(building)).toBeGreaterThan(1);
  });

  it('gates level-2 and ascendant construction behind understandable research', () => {
    const world = createInitialWorld(17); world.resources = { glow: 500, alloy: 500 };
    const building = createBuilding('nutrient-bed', 700, 500, 1);
    expect(upgradeAvailability(world.resources, world.livingWorld, building, 'quality').reason).toContain('research');
    world.livingWorld.research.exploration = 1;
    expect(upgradeAvailability(world.resources, world.livingWorld, building, 'quality').ok).toBe(true);
    building.level = 2; building.upgradeBranch = 'quality'; world.livingWorld.rareResources.wildSeed = 1;
    expect(advancedUpgradeAvailability(world.resources, world.livingWorld, building).reason).toContain('NATURE 2');
    world.livingWorld.research.nature = 2;
    expect(advancedUpgradeAvailability(world.resources, world.livingWorld, building).ok).toBe(true);
  });

  it('rewards trained matching facility operators', () => {
    const world = createInitialWorld(18); const building = createBuilding('clinic', 700, 500, 1); const creature = world.creatures[0];
    creature.skills.healing = 82; creature.assignedRole = 'healer';
    const matched = buildingOperatorEfficiency(creature, building);
    creature.assignedRole = 'builder';
    expect(matched).toBeGreaterThan(buildingOperatorEfficiency(creature, building));
  });

  it('rewards colonies that commit to a facility specialization path', () => {
    const world = createInitialWorld(21);
    world.buildings = (['nutrient-bed', 'wash-pool', 'resonance-garden'] as const).map((kind, index) => {
      const building = createBuilding(kind, 500 + index * 180, 500, index + 1);
      building.level = 2; building.upgradeBranch = 'quality'; return building;
    });
    updateLivingWorld(world, 1);
    const milestone = world.livingWorld.challenges.find((challenge) => challenge.id === 'specialized-habitat');
    expect(milestone?.complete).toBe(true);
    expect(world.livingWorld.journal.some((entry) => entry.id === 'challenge-specialized-habitat')).toBe(true);
  });

  it('supports safe named expeditions, return decisions, and rare rewards', () => {
    const world = createInitialWorld(23); world.livingWorld.unlockedRegions = ['lumen-field', 'whisper-grove']; world.resources = { glow: 200, alloy: 50 };
    world.creatures.push(makeCreature('c2', 540, 500));
    const result = launchExpedition(world, 'whisper-grove', ['c1', 'c2']);
    expect(result.ok).toBe(true); expect(world.creatures.every((creature) => creature.expeditionId === result.expeditionId)).toBe(true);
    world.time = world.livingWorld.expeditions[0].returnAt; updateExpeditions(world);
    expect(world.livingWorld.expeditions[0].status).toBe('decision'); expect(world.creatures.every((creature) => creature.alive && !creature.expeditionId)).toBe(true);
    expect(resolveExpeditionDecision(world, world.livingWorld.expeditions[0].id, 'preserve')).toBe(true);
    expect(world.livingWorld.rareResources.wildSeed).toBe(2);
  });

  it('adds a final rare-material facility evolution', () => {
    const building = createBuilding('nutrient-bed', 700, 500, 1); const base = buildingCapacity(building); building.level = 2; building.upgradeBranch = 'quality';
    expect(advancedUpgradeCost(building).wildSeed).toBe(1); building.level = 3;
    expect(buildingCapacity(building)).toBe(base + 2); expect(buildingEffectMultiplier(building)).toBeGreaterThan(1.5);
  });

  it('creates named personal requests with persistent choices', () => {
    const world = createInitialWorld(31); world.creatures.push(makeCreature('c2', 540, 500)); world.time = 240; world.livingWorld.day = 2;
    updateColonyStories(world, 1);
    const request = world.livingWorld.personalRequests[0];
    expect(request.title).toContain(world.creatures.find((creature) => creature.id === request.creatureId)?.name);
    const glow = world.resources.glow;
    expect(resolvePersonalRequest(world, request.id, 'help')).toBe(true);
    expect(world.resources.glow).toBe(glow - 8); expect(request.status).toBe('resolved');
  });

  it('turns needs and requests into actionable named alerts', () => {
    const world = createInitialWorld(34); world.creatures.push(makeCreature('c2', 540, 500)); world.time = 240;
    world.creatures[0].needs.hunger = 18;
    updateLivingWorld(world, 1);
    const hunger = world.livingWorld.alerts.find((alert) => alert.id === 'food-shortage');
    const request = world.livingWorld.alerts.find((alert) => alert.id.startsWith('personal-request:'));
    expect(hunger?.title).toContain(world.creatures[0].name); expect(hunger?.creatureId).toBe(world.creatures[0].id);
    expect(request?.actionLabel).toBe('OPEN SOCIAL');
  });

  it('resolves colony stories through two consequential stages', () => {
    const world = createInitialWorld(32); world.creatures.push(makeCreature('c2', 540, 500)); world.time = 480; world.livingWorld.day = 3;
    updateColonyStories(world, 1);
    const story = world.livingWorld.storyEvents[0];
    expect(resolveStoryChoice(world, story.id, 'gentle')).toBe(true); expect(story.stage).toBe(2); expect(story.status).toBe('decision');
    expect(resolveStoryChoice(world, story.id, 'bold')).toBe(true); expect(story.status).toBe('resolved');
    expect(world.events.some((event) => event.type === 'story_resolved')).toBe(true);
  });

  it('runs safe group activities and classifies family and Lifebonds', () => {
    const world = createInitialWorld(33); world.creatures.push(makeCreature('c2', 540, 500), makeCreature('c3', 580, 500)); world.time = 90;
    updateColonyStories(world, 1);
    expect(world.livingWorld.groupActivity?.creatureIds).toHaveLength(3);
    world.creatures[1].parentId = world.creatures[0].id;
    expect(relationshipTone(world, world.creatures[0], world.creatures[1])).toBe('FAMILY');
    world.creatures[1].parentId = undefined; world.creatures[0].bonds.c2 = 90; world.creatures[1].bonds.c1 = 90;
    expect(relationshipTone(world, world.creatures[0], world.creatures[1])).toBe('LIFEBOND');
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
    expect(migrated?.livingWorld.settings.textScale).toBeGreaterThanOrEqual(1.1);
    expect(migrated?.livingWorld.expeditions).toEqual([]);
    expect(migrated?.livingWorld.personalRequests).toEqual([]);
    expect(migrated?.livingWorld.storyEvents).toEqual([]);
    expect(migrated?.livingWorld.saveVersion).toBe(5);
    expect(migrated?.creatures[0].history.length).toBeGreaterThan(0);
    expect(migrated?.creatures[0].voiceStyle).toBeTruthy();
  });

  it('migrates legacy facilities into the material and maintenance economy', () => {
    const world = createInitialWorld(9); world.buildings.push(createBuilding('extractor', 700, 500, 1));
    const legacy = structuredClone(world) as unknown as { buildings: Array<Record<string, unknown>> };
    delete legacy.buildings[0].constructionWork; delete legacy.buildings[0].materialsRequired; delete legacy.buildings[0].materialsDelivered;
    delete legacy.buildings[0].maintenanceMode; delete legacy.buildings[0].maintenanceFunded;
    const migrated = parseWorldState(legacy);
    expect(migrated?.buildings[0].constructionWork).toBe(100);
    expect(migrated?.buildings[0].materialsRequired).toEqual({ glow: 0, alloy: 0 });
    expect(migrated?.buildings[0].maintenanceMode).toBe('auto');
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
