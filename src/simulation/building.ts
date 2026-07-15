import type { BuildingKind, BuildingState, Resources, Vec2 } from './worldState';
import { isHabitatObstacle } from './navigation';

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
  upgrade: {
    name: string;
    description: string;
    effect: string;
    cost: Resources;
  };
}

export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  'nutrient-bed': { kind: 'nutrient-bed', name: 'Dew Loom', glyph: '◒', description: 'Automatic nourishment for hungry Luma.', effect: 'Restores +16 nourishment/sec at 2 service stations.', cost: { glow: 25, alloy: 0 }, color: 0xf7bd62, pollution: 0, unlockPopulation: 1, capacity: 2, upgrade: { name: 'Verdant Loom', description: 'A denser living canopy cultivates richer dew.', effect: '+35% nourishment and +1 service station.', cost: { glow: 45, alloy: 12 } } },
  'wash-pool': { kind: 'wash-pool', name: 'Mist Basin', glyph: '≋', description: 'Automatic cleansing for the colony.', effect: 'Restores +19 clarity/sec at 2 service stations.', cost: { glow: 20, alloy: 8 }, color: 0x65c7ff, pollution: 0, unlockPopulation: 2, capacity: 2, upgrade: { name: 'Rain Basin', description: 'Circulating rain filters cleanse more efficiently.', effect: '+35% clarity and +1 service station.', cost: { glow: 42, alloy: 18 } } },
  'resonance-garden': { kind: 'resonance-garden', name: 'Chime Grove', glyph: '✣', description: 'A shared space for play and connection.', effect: 'Restores +14 resonance/sec at 3 service stations.', cost: { glow: 30, alloy: 8 }, color: 0xbf78ff, pollution: 0, unlockPopulation: 3, capacity: 3, upgrade: { name: 'Chorus Grove', description: 'Layered chimes amplify play and companionship.', effect: '+35% resonance and +1 service station.', cost: { glow: 54, alloy: 20 } } },
  nest: { kind: 'nest', name: 'Warm Archive', glyph: '⌂', description: 'A safe place for rest and memory.', effect: 'Restores +20 charge/sec at 2 service stations.', cost: { glow: 25, alloy: 20 }, color: 0x7af6bd, pollution: 0, unlockPopulation: 4, capacity: 2, upgrade: { name: 'Dream Archive', description: 'Insulated memory chambers deepen every rest cycle.', effect: '+35% charge and +1 service station.', cost: { glow: 58, alloy: 28 } } },
  extractor: { kind: 'extractor', name: 'Deep Taker', glyph: '⟐', description: 'Produces resources quickly at a lasting cost.', effect: '2 workers create alloy and glow, but lose resonance.', cost: { glow: 35, alloy: 25 }, color: 0xff735f, pollution: 2.4, unlockPopulation: 5, capacity: 2, upgrade: { name: 'Sealed Taker', description: 'A closed conduit captures more while leaking less.', effect: '+30% output, +1 station, and 25% less pollution.', cost: { glow: 70, alloy: 52 } } },
  clinic: { kind: 'clinic', name: 'Mending Prism', glyph: '✚', description: 'Treats illness and pollution exposure.', effect: 'Restores +8 integrity and removes exposure at 1 station.', cost: { glow: 65, alloy: 45 }, color: 0xff8fcf, pollution: 0.25, unlockPopulation: 7, capacity: 1, upgrade: { name: 'Renewal Prism', description: 'A second treatment beam accelerates recovery.', effect: '+35% healing and +1 service station.', cost: { glow: 92, alloy: 68 } } }
};

export const taskBuilding: Partial<Record<string, BuildingKind>> = {
  eat: 'nutrient-bed', bathe: 'wash-pool', play: 'resonance-garden', sleep: 'nest', work: 'extractor', heal: 'clinic'
};

export function canAfford(resources: Resources, kind: BuildingKind): boolean {
  const cost = BUILDINGS[kind].cost;
  return resources.glow >= cost.glow && resources.alloy >= cost.alloy;
}

export interface PlacementResult { ok: boolean; reason?: string }

export function validateBuildingPlacement(buildings: BuildingState[], x: number, y: number): PlacementResult {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 60 || x > 1540 || y < 80 || y > 930) {
    return { ok: false, reason: 'Place it inside the habitat boundary' };
  }
  if (isHabitatObstacle({ x, y }, 54)) return { ok: false, reason: 'Keep structures clear of water and ancient stone' };
  if (buildings.some((building) => Math.hypot(building.x - x, building.y - y) < 112)) {
    return { ok: false, reason: 'Leave more room between structures' };
  }
  return { ok: true };
}

export function createBuilding(kind: BuildingKind, x: number, y: number, index: number): BuildingState {
  return { id: `b${index}`, kind, x, y, level: 1, active: true, durability: 100, constructionProgress: 100, constructing: false, influenceRadius: 130 };
}

export function buildingDisplayName(building: BuildingState) {
  if (building.level < 2) return BUILDINGS[building.kind].name;
  return building.upgradeBranch === 'capacity' ? `${BUILDINGS[building.kind].name} Commons` : BUILDINGS[building.kind].upgrade.name;
}

export function buildingCapacity(building: BuildingState) {
  return BUILDINGS[building.kind].capacity + (building.level >= 2 ? building.upgradeBranch === 'capacity' ? 2 : 1 : 0);
}

export function buildingEffectMultiplier(building: BuildingState) {
  const condition = building.durability < 30 ? 0.72 : building.durability < 60 ? 0.9 : 1;
  if (building.level < 2) return condition;
  return (building.upgradeBranch === 'capacity' ? 1.14 : building.kind === 'extractor' ? 1.3 : 1.35) * condition;
}

export function buildingPollution(building: BuildingState) {
  const base = BUILDINGS[building.kind].pollution;
  const maintenanceLeak = building.durability < 35 ? 1.25 : 1;
  return (building.level >= 2 && building.kind === 'extractor' && building.upgradeBranch !== 'capacity' ? base * 0.75 : base) * maintenanceLeak;
}

export function upgradeCost(building: BuildingState, branch: 'quality' | 'capacity' = 'quality') {
  const cost = BUILDINGS[building.kind].upgrade.cost;
  return branch === 'capacity' ? { glow: Math.ceil(cost.glow * 0.82), alloy: Math.ceil(cost.alloy * 1.16) } : cost;
}

export function upgradeDescription(building: BuildingState, branch: 'quality' | 'capacity') {
  const def = BUILDINGS[building.kind];
  return branch === 'capacity'
    ? { name: `${def.name} Commons`, description: 'An expanded service wing keeps crowded colonies moving.', effect: '+2 service stations and +14% output.' }
    : def.upgrade;
}

export function canAffordUpgrade(resources: Resources, building: BuildingState, branch: 'quality' | 'capacity' = 'quality') {
  if (building.level >= 2) return false;
  const cost = upgradeCost(building, branch);
  return resources.glow >= cost.glow && resources.alloy >= cost.alloy;
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
