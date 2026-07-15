import type { BuildingKind, BuildingState, Resources } from './worldState';

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
}

export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  'nutrient-bed': { kind: 'nutrient-bed', name: 'Dew Loom', glyph: '◒', description: 'Automatic nourishment for hungry Luma.', effect: 'Restores +16 nourishment per second while occupied.', cost: { glow: 25, alloy: 0 }, color: 0xf7bd62, pollution: 0, unlockPopulation: 1 },
  'wash-pool': { kind: 'wash-pool', name: 'Mist Basin', glyph: '≋', description: 'Automatic cleansing for the colony.', effect: 'Restores +19 clarity per second while occupied.', cost: { glow: 20, alloy: 8 }, color: 0x65c7ff, pollution: 0, unlockPopulation: 2 },
  'resonance-garden': { kind: 'resonance-garden', name: 'Chime Grove', glyph: '✣', description: 'A shared space for play and connection.', effect: 'Restores +14 resonance per second while occupied.', cost: { glow: 30, alloy: 8 }, color: 0xbf78ff, pollution: 0, unlockPopulation: 3 },
  nest: { kind: 'nest', name: 'Warm Archive', glyph: '⌂', description: 'A safe place for rest and memory.', effect: 'Restores +20 charge per second while occupied.', cost: { glow: 25, alloy: 20 }, color: 0x7af6bd, pollution: 0, unlockPopulation: 4 },
  extractor: { kind: 'extractor', name: 'Deep Taker', glyph: '⟐', description: 'Produces resources quickly at a lasting cost.', effect: 'Workers create +0.8 alloy and +0.35 glow/sec; lose resonance.', cost: { glow: 35, alloy: 25 }, color: 0xff735f, pollution: 2.4, unlockPopulation: 5 },
  clinic: { kind: 'clinic', name: 'Mending Prism', glyph: '✚', description: 'Treats illness and pollution exposure.', effect: 'Restores +8 integrity and removes 5 exposure per second.', cost: { glow: 65, alloy: 45 }, color: 0xff8fcf, pollution: 0.25, unlockPopulation: 7 }
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
  if (buildings.some((building) => Math.hypot(building.x - x, building.y - y) < 112)) {
    return { ok: false, reason: 'Leave more room between structures' };
  }
  return { ok: true };
}

export function createBuilding(kind: BuildingKind, x: number, y: number, index: number): BuildingState {
  return { id: `b${index}`, kind, x, y, level: 1, active: true };
}
