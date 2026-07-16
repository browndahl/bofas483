import type {
  BuildingKind,
  BuildingState,
  ConstructionKind,
  CreatureRole,
  CreatureState,
  LivingWorldState,
  ResearchBranch,
  Resources,
  SkillKey,
  UpgradeBranch,
  Vec2
} from './worldState';
import { skillEfficiency } from './colonyLife';
import { isHabitatObstacle } from './navigation';

export interface UpgradeDefinition {
  name: string;
  description: string;
  effect: string;
  cost: Resources;
  outputMultiplier: number;
  capacityBonus: number;
  pollutionMultiplier: number;
}

export interface BuildingDefinition {
  kind: BuildingKind;
  name: string;
  glyph: string;
  description: string;
  effect: string;
  cost: Resources;
  color: number;
  pollution: number;
  unlockPopulation: number;
  capacity: number;
  operatorSkill: SkillKey;
  operatorRole: CreatureRole;
  advancedResearch: ResearchBranch;
  upgrade: UpgradeDefinition;
  capacityUpgrade: UpgradeDefinition;
}

export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  'nutrient-bed': {
    kind: 'nutrient-bed', name: 'Dew Loom', glyph: '◒', description: 'Automatic nourishment for hungry Luma.',
    effect: 'Restores +16 nourishment/sec at 2 service stations.', cost: { glow: 25, alloy: 0 }, color: 0xf7bd62, pollution: 0, unlockPopulation: 1, capacity: 2,
    operatorSkill: 'foraging', operatorRole: 'forager', advancedResearch: 'nature',
    upgrade: { name: 'Verdant Loom', description: 'A denser living canopy cultivates richer dew.', effect: '+38% nourishment, richer food, and +1 station.', cost: { glow: 45, alloy: 12 }, outputMultiplier: 1.38, capacityBonus: 1, pollutionMultiplier: 1 },
    capacityUpgrade: { name: 'Dew Loom Commons', description: 'A broad harvesting rack feeds a crowded colony.', effect: '+2 service stations and +14% nourishment.', cost: { glow: 37, alloy: 14 }, outputMultiplier: 1.14, capacityBonus: 2, pollutionMultiplier: 1 }
  },
  'wash-pool': {
    kind: 'wash-pool', name: 'Mist Basin', glyph: '≋', description: 'Automatic cleansing for the colony.',
    effect: 'Restores +19 clarity/sec at 2 service stations.', cost: { glow: 20, alloy: 8 }, color: 0x65c7ff, pollution: 0, unlockPopulation: 2, capacity: 2,
    operatorSkill: 'caregiving', operatorRole: 'caretaker', advancedResearch: 'care',
    upgrade: { name: 'Rain Basin', description: 'Circulating rain filters cleanse more efficiently.', effect: '+40% clarity recovery and +1 station.', cost: { glow: 42, alloy: 18 }, outputMultiplier: 1.4, capacityBonus: 1, pollutionMultiplier: 1 },
    capacityUpgrade: { name: 'Mist Basin Commons', description: 'Extra channels keep long cleaning queues moving.', effect: '+2 service stations and +13% clarity recovery.', cost: { glow: 35, alloy: 21 }, outputMultiplier: 1.13, capacityBonus: 2, pollutionMultiplier: 1 }
  },
  'resonance-garden': {
    kind: 'resonance-garden', name: 'Chime Grove', glyph: '✣', description: 'A shared space for play and connection.',
    effect: 'Restores +14 resonance/sec at 3 service stations.', cost: { glow: 30, alloy: 8 }, color: 0xbf78ff, pollution: 0, unlockPopulation: 3, capacity: 3,
    operatorSkill: 'caregiving', operatorRole: 'caretaker', advancedResearch: 'society',
    upgrade: { name: 'Chorus Grove', description: 'Layered chimes amplify joy and social confidence.', effect: '+36% resonance, stronger social recovery, and +1 station.', cost: { glow: 54, alloy: 20 }, outputMultiplier: 1.36, capacityBonus: 1, pollutionMultiplier: 1 },
    capacityUpgrade: { name: 'Chime Grove Commons', description: 'A wider ring creates room for colony-wide play.', effect: '+2 service stations and +16% resonance.', cost: { glow: 45, alloy: 24 }, outputMultiplier: 1.16, capacityBonus: 2, pollutionMultiplier: 1 }
  },
  nest: {
    kind: 'nest', name: 'Warm Archive', glyph: '⌂', description: 'A safe place for rest and memory.',
    effect: 'Restores +20 charge/sec at 2 service stations.', cost: { glow: 25, alloy: 20 }, color: 0x7af6bd, pollution: 0, unlockPopulation: 4, capacity: 2,
    operatorSkill: 'caregiving', operatorRole: 'caretaker', advancedResearch: 'care',
    upgrade: { name: 'Dream Archive', description: 'Insulated memory chambers deepen rest and support growing families.', effect: '+38% charge, comfort, and a small birth-readiness bonus.', cost: { glow: 58, alloy: 28 }, outputMultiplier: 1.38, capacityBonus: 1, pollutionMultiplier: 1 },
    capacityUpgrade: { name: 'Warm Archive Commons', description: 'Additional chambers prevent exhausted Luma from waiting.', effect: '+2 service stations and +14% charge recovery.', cost: { glow: 48, alloy: 33 }, outputMultiplier: 1.14, capacityBonus: 2, pollutionMultiplier: 1 }
  },
  extractor: {
    kind: 'extractor', name: 'Deep Taker', glyph: '⟐', description: 'Produces resources quickly at a lasting cost.',
    effect: '2 workers create alloy and glow, but lose resonance.', cost: { glow: 35, alloy: 25 }, color: 0xff735f, pollution: 2.4, unlockPopulation: 5, capacity: 2,
    operatorSkill: 'building', operatorRole: 'builder', advancedResearch: 'technology',
    upgrade: { name: 'Sealed Taker', description: 'A closed conduit captures more while leaking less.', effect: '+32% output, +1 station, and 28% less pollution.', cost: { glow: 70, alloy: 52 }, outputMultiplier: 1.32, capacityBonus: 1, pollutionMultiplier: 0.72 },
    capacityUpgrade: { name: 'Deep Taker Array', description: 'Parallel conduits prioritize throughput over containment.', effect: '+2 worker stations and +18% output.', cost: { glow: 58, alloy: 61 }, outputMultiplier: 1.18, capacityBonus: 2, pollutionMultiplier: 1.08 }
  },
  clinic: {
    kind: 'clinic', name: 'Mending Prism', glyph: '✚', description: 'Treats illness and pollution exposure.',
    effect: 'Restores +8 integrity and removes exposure at 1 station.', cost: { glow: 65, alloy: 45 }, color: 0xff8fcf, pollution: 0.25, unlockPopulation: 7, capacity: 1,
    operatorSkill: 'healing', operatorRole: 'healer', advancedResearch: 'care',
    upgrade: { name: 'Renewal Prism', description: 'A stronger treatment field accelerates healing and disease prevention.', effect: '+42% healing, stronger exposure removal, and +1 station.', cost: { glow: 92, alloy: 68 }, outputMultiplier: 1.42, capacityBonus: 1, pollutionMultiplier: 0.75 },
    capacityUpgrade: { name: 'Mending Prism Ward', description: 'A second ward keeps outbreaks from creating long queues.', effect: '+2 treatment stations and +14% healing.', cost: { glow: 76, alloy: 79 }, outputMultiplier: 1.14, capacityBonus: 2, pollutionMultiplier: 1 }
  }
};

export const taskBuilding: Partial<Record<string, BuildingKind>> = {
  eat: 'nutrient-bed', bathe: 'wash-pool', play: 'resonance-garden', sleep: 'nest', work: 'extractor', heal: 'clinic'
};

const RESEARCH_LABELS: Record<ResearchBranch, string> = {
  care: 'CARE', nature: 'NATURE', technology: 'TECHNOLOGY', society: 'SOCIETY', exploration: 'EXPLORATION'
};

export function canAfford(resources: Resources, kind: BuildingKind): boolean {
  const cost = BUILDINGS[kind].cost;
  return resources.glow >= cost.glow && resources.alloy >= cost.alloy;
}

export interface PlacementResult {
  ok: boolean;
  reason?: string;
  nearbyFacilities?: number;
  influenceSummary?: string;
}

export function buildingInfluenceSummary(buildings: BuildingState[], kind: BuildingKind, x: number, y: number) {
  const nearby = buildings.filter((building) => Math.hypot(building.x - x, building.y - y) <= 280).length;
  const label = kind === 'clinic' ? 'care coverage' : kind === 'resonance-garden' ? 'social reach' : kind === 'extractor' ? 'industrial reach' : 'path connections';
  return { nearby, label: `${nearby} nearby facilit${nearby === 1 ? 'y' : 'ies'} · ${label}` };
}

export function validateBuildingPlacement(buildings: BuildingState[], x: number, y: number, kind: BuildingKind = 'nutrient-bed'): PlacementResult {
  const influence = buildingInfluenceSummary(buildings, kind, x, y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 60 || x > 1540 || y < 80 || y > 930) {
    return { ok: false, reason: 'Blocked: place it inside the habitat boundary', nearbyFacilities: influence.nearby, influenceSummary: influence.label };
  }
  if (isHabitatObstacle({ x, y }, 54)) return { ok: false, reason: 'Blocked by water or ancient stone', nearbyFacilities: influence.nearby, influenceSummary: influence.label };
  const overlap = buildings.find((building) => Math.hypot(building.x - x, building.y - y) < 112);
  if (overlap) {
    return { ok: false, reason: `Blocked by ${buildingDisplayName(overlap)} · needs 112m clearance`, nearbyFacilities: influence.nearby, influenceSummary: influence.label };
  }
  return { ok: true, reason: 'Clear ground', nearbyFacilities: influence.nearby, influenceSummary: influence.label };
}

export function createBuilding(kind: BuildingKind, x: number, y: number, index: number): BuildingState {
  return {
    id: `b${index}`, kind, x, y, level: 1, active: true, durability: 100,
    constructionProgress: 100, constructing: false, constructionWork: 100,
    materialsRequired: { glow: 0, alloy: 0 }, materialsDelivered: { glow: 0, alloy: 0 },
    influenceRadius: 130, maintenanceMode: 'auto', maintenanceFunded: false
  };
}

export function beginBuildingProject(building: BuildingState, kind: ConstructionKind, cost: Resources) {
  building.active = false;
  building.constructing = true;
  building.constructionKind = kind;
  building.constructionProgress = 0;
  building.constructionWork = 0;
  building.materialsRequired = { ...cost };
  building.materialsDelivered = { glow: 0, alloy: 0 };
  building.maintenanceFunded = false;
}

export function buildingDisplayName(building: BuildingState) {
  if (building.level >= 3) return `Ascendant ${BUILDINGS[building.kind].name}`;
  if (building.level < 2) return BUILDINGS[building.kind].name;
  return upgradeDescription(building, building.upgradeBranch ?? 'quality').name;
}

export function buildingCapacity(building: BuildingState) {
  const definition = BUILDINGS[building.kind];
  const branchBonus = building.level >= 2 ? upgradeDescription(building, building.upgradeBranch ?? 'quality').capacityBonus : 0;
  return definition.capacity + branchBonus + (building.level >= 3 ? 1 : 0);
}

export function buildingConditionMultiplier(building: BuildingState) {
  if (building.durability <= 0) return 0;
  if (building.durability < 30) return 0.7;
  if (building.durability < 60) return 0.88;
  return 1;
}

export function buildingEffectMultiplier(building: BuildingState) {
  const condition = buildingConditionMultiplier(building);
  if (building.level < 2) return condition;
  const branch = upgradeDescription(building, building.upgradeBranch ?? 'quality');
  return branch.outputMultiplier * (building.level >= 3 ? 1.22 : 1) * condition;
}

export function buildingPollution(building: BuildingState) {
  const definition = BUILDINGS[building.kind];
  const maintenanceLeak = building.durability < 35 ? 1.25 : 1;
  const branchMultiplier = building.level >= 2 ? upgradeDescription(building, building.upgradeBranch ?? 'quality').pollutionMultiplier : 1;
  const ascendant = building.level >= 3 && building.kind === 'extractor' ? 0.7 : 1;
  return definition.pollution * branchMultiplier * ascendant * maintenanceLeak;
}

export function buildingOperatorEfficiency(creature: CreatureState, building: BuildingState) {
  const definition = BUILDINGS[building.kind];
  const roleBonus = creature.assignedRole === definition.operatorRole ? 1.08 : 1;
  return skillEfficiency(creature, definition.operatorSkill) * roleBonus;
}

export function buildingOperatorLabel(building: BuildingState) {
  const definition = BUILDINGS[building.kind];
  return `${definition.operatorRole.toUpperCase()} / ${definition.operatorSkill.toUpperCase()}`;
}

export function advancedUpgradeCost(building: BuildingState) {
  const base = upgradeDescription(building, building.upgradeBranch ?? 'quality').cost;
  const natural = ['nutrient-bed', 'wash-pool', 'resonance-garden', 'nest'].includes(building.kind);
  return { glow: Math.ceil(base.glow * 1.45), alloy: Math.ceil(base.alloy * 1.35), memoryCrystal: natural ? 0 : 1, wildSeed: natural ? 1 : 0 };
}

export function advancedUpgradeDescription(building: BuildingState) {
  const resource = advancedUpgradeCost(building).wildSeed ? 'WILD SEED' : 'MEMORY CRYSTAL';
  return `Ascendant ${building.upgradeBranch ?? 'quality'} form: +22% output, +1 station, and a visible ${resource.toLowerCase()} evolution.`;
}

export function totalResearch(livingWorld: LivingWorldState) {
  return Object.values(livingWorld.research).reduce((sum, level) => sum + level, 0);
}

export interface UpgradeAvailability {
  ok: boolean;
  reason?: string;
  researchLabel: string;
}

export function upgradeAvailability(resources: Resources, livingWorld: LivingWorldState, building: BuildingState, branch: UpgradeBranch): UpgradeAvailability {
  if (building.constructing) return { ok: false, reason: 'Finish the current construction first', researchLabel: 'ANY RESEARCH 1' };
  if (building.level >= 2) return { ok: false, reason: 'Choose Ascendant evolution for the next tier', researchLabel: 'ANY RESEARCH 1' };
  if (totalResearch(livingWorld) < 1) return { ok: false, reason: 'Unlock any research branch first', researchLabel: 'ANY RESEARCH 1' };
  const cost = upgradeCost(building, branch);
  if (resources.glow < cost.glow || resources.alloy < cost.alloy) return { ok: false, reason: `Needs ${cost.glow} GLOW and ${cost.alloy} ALLOY`, researchLabel: 'ANY RESEARCH 1' };
  return { ok: true, researchLabel: 'ANY RESEARCH 1' };
}

export function advancedUpgradeAvailability(resources: Resources, livingWorld: LivingWorldState, building: BuildingState): UpgradeAvailability {
  const research = BUILDINGS[building.kind].advancedResearch;
  const label = `${RESEARCH_LABELS[research]} 2`;
  if (building.constructing) return { ok: false, reason: 'Finish the current construction first', researchLabel: label };
  if (building.level !== 2) return { ok: false, reason: 'Install a level-2 specialization first', researchLabel: label };
  if (livingWorld.research[research] < 2) return { ok: false, reason: `Requires ${label}`, researchLabel: label };
  const cost = advancedUpgradeCost(building);
  if (resources.glow < cost.glow || resources.alloy < cost.alloy) return { ok: false, reason: `Needs ${cost.glow} GLOW and ${cost.alloy} ALLOY`, researchLabel: label };
  if (livingWorld.rareResources.memoryCrystal < cost.memoryCrystal || livingWorld.rareResources.wildSeed < cost.wildSeed) {
    return { ok: false, reason: cost.wildSeed ? 'Needs 1 WILD SEED' : 'Needs 1 MEMORY CRYSTAL', researchLabel: label };
  }
  return { ok: true, researchLabel: label };
}

export function canAffordAdvancedUpgrade(resources: Resources, livingWorld: LivingWorldState, building: BuildingState) {
  return advancedUpgradeAvailability(resources, livingWorld, building).ok;
}

export function upgradeCost(building: BuildingState, branch: UpgradeBranch = 'quality') {
  return upgradeDescription(building, branch).cost;
}

export function upgradeDescription(building: BuildingState, branch: UpgradeBranch) {
  return branch === 'capacity' ? BUILDINGS[building.kind].capacityUpgrade : BUILDINGS[building.kind].upgrade;
}

export function canAffordUpgrade(resources: Resources, building: BuildingState, branch: UpgradeBranch = 'quality', livingWorld?: LivingWorldState) {
  if (livingWorld) return upgradeAvailability(resources, livingWorld, building, branch).ok;
  if (building.level >= 2 || building.constructing) return false;
  const cost = upgradeCost(building, branch);
  return resources.glow >= cost.glow && resources.alloy >= cost.alloy;
}

export interface UpgradePreview {
  name: string;
  effect: string;
  cost: Resources;
  capacityBefore: number;
  capacityAfter: number;
  outputBefore: number;
  outputAfter: number;
  pollutionBefore: number;
  pollutionAfter: number;
  estimatedSeconds: number;
  research: string;
}

export function upgradePreview(building: BuildingState, branch: UpgradeBranch): UpgradePreview {
  const next = structuredClone(building);
  const description = upgradeDescription(building, branch);
  const cost = upgradeCost(building, branch);
  const capacityBefore = buildingCapacity(building);
  const outputBefore = buildingEffectMultiplier(building);
  const pollutionBefore = buildingPollution(building);
  next.level = 2; next.upgradeBranch = branch; next.durability = 100; next.constructing = false;
  return {
    name: description.name, effect: description.effect, cost, capacityBefore, capacityAfter: buildingCapacity(next),
    outputBefore, outputAfter: buildingEffectMultiplier(next), pollutionBefore, pollutionAfter: buildingPollution(next),
    estimatedSeconds: 18, research: 'ANY RESEARCH 1'
  };
}

export function advancedUpgradePreview(building: BuildingState): UpgradePreview {
  const next = structuredClone(building);
  const cost = advancedUpgradeCost(building);
  const capacityBefore = buildingCapacity(building);
  const outputBefore = buildingEffectMultiplier(building);
  const pollutionBefore = buildingPollution(building);
  next.level = 3; next.durability = 100; next.constructing = false;
  return {
    name: `Ascendant ${BUILDINGS[building.kind].name}`, effect: advancedUpgradeDescription(building),
    cost: { glow: cost.glow, alloy: cost.alloy }, capacityBefore, capacityAfter: buildingCapacity(next),
    outputBefore, outputAfter: buildingEffectMultiplier(next), pollutionBefore, pollutionAfter: buildingPollution(next),
    estimatedSeconds: 24, research: `${RESEARCH_LABELS[BUILDINGS[building.kind].advancedResearch]} 2`
  };
}

export function maintenanceCost(building: BuildingState): Resources {
  const missing = Math.max(0, 100 - building.durability);
  return { glow: Math.max(2, Math.ceil(missing / 18) + building.level), alloy: Math.max(1, Math.ceil(missing / 30) + Math.max(0, building.level - 1)) };
}

export function materialDeliveryRatio(building: BuildingState) {
  const required = building.materialsRequired;
  const glowRatio = required.glow > 0 ? building.materialsDelivered.glow / required.glow : 1;
  const alloyRatio = required.alloy > 0 ? building.materialsDelivered.alloy / required.alloy : 1;
  return Math.max(0, Math.min(1, glowRatio, alloyRatio));
}

export function buildingStation(building: BuildingState, queueIndex: number): Vec2 {
  const capacity = buildingCapacity(building);
  if (queueIndex < capacity) {
    const spacing = 42;
    return { x: building.x + (queueIndex - (capacity - 1) / 2) * spacing, y: building.y + 48 };
  }
  const waiting = queueIndex - capacity;
  const column = waiting % 4;
  const row = Math.floor(waiting / 4);
  return { x: building.x + (column - 1.5) * 42, y: building.y + 96 + row * 40 };
}
