import { createCreaturePersonality, setBond } from './personality';

export type NeedKey = 'hunger' | 'hygiene' | 'happiness' | 'health' | 'energy';
export type TaskType = 'wander' | 'eat' | 'bathe' | 'play' | 'sleep' | 'work' | 'heal' | 'socialize' | 'comfort' | 'dead';
export type BuildingKind = 'nutrient-bed' | 'wash-pool' | 'resonance-garden' | 'nest' | 'extractor' | 'clinic';

export interface Vec2 { x: number; y: number }
export interface Needs { hunger: number; hygiene: number; happiness: number; health: number; energy: number }
export interface CreaturePersonality { sociability: number; curiosity: number; diligence: number; empathy: number; resilience: number }
export interface CreatureState {
  id: string;
  name: string;
  x: number;
  y: number;
  target: Vec2;
  destinationBuildingId?: string;
  destinationCreatureId?: string;
  navigationPath: Vec2[];
  navigationTarget?: Vec2;
  needs: Needs;
  task: TaskType;
  age: number;
  exposure: number;
  reproduction: number;
  alive: boolean;
  deathAge?: number;
  generation: number;
  hue: number;
  personality: CreaturePersonality;
  bonds: Record<string, number>;
  socialCooldown: number;
  socialTimer: number;
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

export const MAX_EVENT_HISTORY = 500;

export function appendWorldEvent(world: WorldState, event: GameEvent) {
  world.events.push(event);
  if (world.events.length > MAX_EVENT_HISTORY) world.events.splice(0, world.events.length - MAX_EVENT_HISTORY);
}

const names = ['Pip', 'Mote', 'Iri', 'Nim', 'Vela', 'Odo', 'Rua', 'Kip', 'Sola', 'Tem', 'Uma', 'Bram'];

export function makeCreature(id: string, x: number, y: number, generation = 0, parentPersonality?: CreaturePersonality): CreatureState {
  const serial = Number(id.replace(/\D/g, '')) || 1;
  const index = serial - 1;
  return {
    id,
    name: `${names[index % names.length]}-${serial.toString(16).toUpperCase().padStart(2, '0')}`,
    x,
    y,
    target: { x, y },
    navigationPath: [],
    needs: { hunger: 78, hygiene: 82, happiness: 74, health: 100, energy: 88 },
    task: 'wander',
    age: 0,
    exposure: 0,
    reproduction: 0,
    alive: true,
    generation,
    hue: 145 + (index * 23) % 70,
    personality: createCreaturePersonality(id, generation, parentPersonality),
    bonds: {},
    socialCooldown: 5 + index % 8,
    socialTimer: 0
  };
}

export function connectParentAndChild(parent: CreatureState, child: CreatureState) {
  setBond(parent, child.id, 36);
  setBond(child, parent.id, 36);
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
