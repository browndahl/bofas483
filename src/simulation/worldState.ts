export type NeedKey = 'hunger' | 'hygiene' | 'happiness' | 'health' | 'energy';
export type TaskType = 'wander' | 'eat' | 'bathe' | 'play' | 'sleep' | 'work' | 'heal' | 'dead';
export type BuildingKind = 'nutrient-bed' | 'wash-pool' | 'resonance-garden' | 'nest' | 'extractor' | 'clinic';

export interface Vec2 { x: number; y: number }
export interface Needs { hunger: number; hygiene: number; happiness: number; health: number; energy: number }
export interface CreatureState {
  id: string;
  name: string;
  x: number;
  y: number;
  target: Vec2;
  destinationBuildingId?: string;
  needs: Needs;
  task: TaskType;
  age: number;
  exposure: number;
  reproduction: number;
  alive: boolean;
  deathAge?: number;
  generation: number;
  hue: number;
}
export interface BuildingState {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  active: boolean;
}
export interface Resources { glow: number; alloy: number }
export interface Personality {
  empathy: number;
  exploitation: number;
  sustainability: number;
  curiosity: number;
  ambition: number;
  obedience: number;
  aggression: number;
  honesty: number;
}
export interface GameEvent { type: string; at: number; payload: Record<string, unknown> }
export interface WorldState {
  version: 1;
  seed: number;
  time: number;
  chapter: number;
  creatures: CreatureState[];
  buildings: BuildingState[];
  resources: Resources;
  pollution: number[];
  pollutionWidth: number;
  pollutionHeight: number;
  technologies: string[];
  completedObjectives: string[];
  dialogueHistory: string[];
  profile: Personality;
  events: GameEvent[];
  deaths: number;
  populationPeak: number;
  endingId?: string;
}

const names = ['Pip', 'Mote', 'Iri', 'Nim', 'Vela', 'Odo', 'Rua', 'Kip', 'Sola', 'Tem', 'Uma', 'Bram'];

export function makeCreature(id: string, x: number, y: number, generation = 0): CreatureState {
  const serial = Number(id.replace(/\D/g, '')) || 1;
  const index = serial - 1;
  return {
    id,
    name: `${names[index % names.length]}-${serial.toString(16).toUpperCase().padStart(2, '0')}`,
    x,
    y,
    target: { x, y },
    needs: { hunger: 78, hygiene: 82, happiness: 74, health: 100, energy: 88 },
    task: 'wander',
    age: 0,
    exposure: 0,
    reproduction: 0,
    alive: true,
    generation,
    hue: 145 + (index * 23) % 70
  };
}

export function createInitialWorld(seed = Date.now()): WorldState {
  return {
    version: 1,
    seed,
    time: 0,
    chapter: 1,
    creatures: [makeCreature('c1', 760, 520)],
    buildings: [],
    resources: { glow: 80, alloy: 35 },
    pollution: new Array(24 * 16).fill(0),
    pollutionWidth: 24,
    pollutionHeight: 16,
    technologies: [],
    completedObjectives: [],
    dialogueHistory: [],
    profile: { empathy: 0, exploitation: 0, sustainability: 0, curiosity: 0, ambition: 0, obedience: 0, aggression: 0, honesty: 0 },
    events: [],
    deaths: 0,
    populationPeak: 1
  };
}

export function livingCreatures(world: WorldState): CreatureState[] {
  return world.creatures.filter((creature) => creature.alive);
}
