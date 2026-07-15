import type { BuildingKind, BuildingState, Resources } from './worldState';

export interface BuildingDefinition {
  kind: BuildingKind;
  name: string;
  glyph: string;
  description: string;
  cost: Resources;
  color: number;
  pollution: number;
  unlockPopulation: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  'nutrient-bed': { kind: 'nutrient-bed', name: 'Dew Loom', glyph: '◒', description: 'Grows luminous nourishment.', cost: { glow: 25, alloy: 0 }, color: 0xf7bd62, pollution: 0, unlockPopulation: 1 },
  'wash-pool': { kind: 'wash-pool', name: 'Mist Basin', glyph: '≋', description: 'Automates cleansing.', cost: { glow: 20, alloy: 8 }, color: 0x65c7ff, pollution: 0, unlockPopulation: 2 },
  'resonance-garden': { kind: 'resonance-garden', name: 'Chime Grove', glyph: '✣', description: 'Restores communal joy.', cost: { glow: 30, alloy: 8 }, color: 0xbf78ff, pollution: 0, unlockPopulation: 3 },
  nest: { kind: 'nest', name: 'Warm Archive', glyph: '⌂', description: 'Shelter, sleep, memory.', cost: { glow: 25, alloy: 20 }, color: 0x7af6bd, pollution: 0, unlockPopulation: 4 },
  extractor: { kind: 'extractor', name: 'Deep Taker', glyph: '⟐', description: 'Fast alloy. Persistent harm.', cost: { glow: 35, alloy: 25 }, color: 0xff735f, pollution: 2.4, unlockPopulation: 5 },
  clinic: { kind: 'clinic', name: 'Mending Prism', glyph: '✚', description: 'Treats exposure and illness.', cost: { glow: 65, alloy: 45 }, color: 0xff8fcf, pollution: 0.25, unlockPopulation: 7 }
};

export const taskBuilding: Partial<Record<string, BuildingKind>> = {
  eat: 'nutrient-bed', bathe: 'wash-pool', play: 'resonance-garden', sleep: 'nest', work: 'extractor', heal: 'clinic'
};

export function canAfford(resources: Resources, kind: BuildingKind): boolean {
  const cost = BUILDINGS[kind].cost;
  return resources.glow >= cost.glow && resources.alloy >= cost.alloy;
}

export function createBuilding(kind: BuildingKind, x: number, y: number, index: number): BuildingState {
  return { id: `b${index}`, kind, x, y, level: 1, active: true };
}
