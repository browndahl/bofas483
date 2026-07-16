import type { BuildingKind, CreatureState, GameSettings, TaskType, WeatherKind, WorldState } from '../simulation/worldState';

export type CreatureGesture = 'idle' | 'step' | 'nibble' | 'splash' | 'dance' | 'sleep' | 'work' | 'heal' | 'reach' | 'carry' | 'repair' | 'cheer' | 'argue';
export type SoundscapeMood = 'day' | 'night' | 'rain' | 'danger' | 'celebration';

export interface CreaturePose {
  cadence: number;
  bob: number;
  squash: number;
  lean: number;
  gesture: CreatureGesture;
  eyeScale: number;
  shadowPulse: number;
}

export interface PresentationBudget {
  animationStride: number;
  weatherParticles: number;
  activeMotes: number;
  footprintInterval: number;
  relationshipInterval: number;
  atmosphereInterval: number;
  buildingEffects: boolean;
}

const TASK_POSES: Record<TaskType, Omit<CreaturePose, 'eyeScale'>> = {
  wander: { cadence: 0.010, bob: 4.2, squash: 0.065, lean: 0.09, gesture: 'step', shadowPulse: 0.12 },
  eat: { cadence: 0.014, bob: 2.4, squash: 0.08, lean: 0.04, gesture: 'nibble', shadowPulse: 0.08 },
  bathe: { cadence: 0.009, bob: 3.5, squash: 0.055, lean: 0.03, gesture: 'splash', shadowPulse: 0.1 },
  play: { cadence: 0.013, bob: 7, squash: 0.095, lean: 0.11, gesture: 'dance', shadowPulse: 0.16 },
  sleep: { cadence: 0.0025, bob: 1.1, squash: 0.025, lean: 0.02, gesture: 'sleep', shadowPulse: 0.04 },
  work: { cadence: 0.011, bob: 3.6, squash: 0.06, lean: 0.1, gesture: 'work', shadowPulse: 0.1 },
  heal: { cadence: 0.006, bob: 2.1, squash: 0.035, lean: 0.03, gesture: 'heal', shadowPulse: 0.07 },
  socialize: { cadence: 0.007, bob: 4.6, squash: 0.055, lean: 0.08, gesture: 'reach', shadowPulse: 0.1 },
  comfort: { cadence: 0.005, bob: 2.7, squash: 0.04, lean: 0.07, gesture: 'reach', shadowPulse: 0.07 },
  construct: { cadence: 0.012, bob: 4, squash: 0.065, lean: 0.12, gesture: 'carry', shadowPulse: 0.12 },
  maintain: { cadence: 0.015, bob: 2.8, squash: 0.05, lean: 0.13, gesture: 'repair', shadowPulse: 0.09 },
  celebrate: { cadence: 0.016, bob: 9, squash: 0.12, lean: 0.14, gesture: 'cheer', shadowPulse: 0.2 },
  argue: { cadence: 0.019, bob: 3.8, squash: 0.06, lean: 0.18, gesture: 'argue', shadowPulse: 0.1 },
  dead: { cadence: 0, bob: 0, squash: 0, lean: 0, gesture: 'idle', shadowPulse: 0 }
};

export function creaturePose(creature: CreatureState, moving: boolean): CreaturePose {
  const base = TASK_POSES[creature.alive ? creature.task : 'dead'];
  const critical = Math.min(...Object.values(creature.needs)) < 22;
  const tired = creature.needs.energy < 28;
  const movementBoost = moving && creature.task !== 'sleep' ? 1.18 : 1;
  const distressScale = critical ? 0.76 : tired ? 0.84 : 1;
  return {
    ...base,
    cadence: base.cadence * movementBoost * distressScale,
    bob: base.bob * movementBoost * distressScale,
    lean: base.lean * (moving ? 1.25 : 1),
    eyeScale: creature.task === 'sleep' || tired ? 0.35 : critical ? 1.18 : 1
  };
}

export function presentationBudget(settings: GameSettings, population: number): PresentationBudget {
  if (settings.lowPower) return {
    animationStride: population > 100 ? 4 : 3,
    weatherParticles: 0,
    activeMotes: 8,
    footprintInterval: 720,
    relationshipInterval: 120,
    atmosphereInterval: 100,
    buildingEffects: false
  };
  const scale = settings.quality === 'high' ? 1 : settings.quality === 'medium' ? 0.66 : 0.35;
  const populationPenalty = population >= 180 ? 3 : population >= 100 ? 2 : 1;
  return {
    animationStride: populationPenalty,
    weatherParticles: Math.round(72 * scale / Math.max(1, populationPenalty - 0.5)),
    activeMotes: Math.round(44 * scale),
    footprintInterval: settings.quality === 'high' ? 170 : settings.quality === 'medium' ? 280 : 480,
    relationshipInterval: population >= 120 ? 90 : 45,
    atmosphereInterval: settings.quality === 'high' ? 32 : settings.quality === 'medium' ? 50 : 80,
    buildingEffects: settings.quality !== 'low' && population < 180
  };
}

export function soundscapeMood(world: Pick<WorldState, 'creatures' | 'livingWorld'>): SoundscapeMood {
  const living = world.creatures.filter((creature) => creature.alive);
  if (world.livingWorld.weather === 'storm' || living.some((creature) => creature.needs.health < 24)) return 'danger';
  if (world.livingWorld.groupActivity?.kind === 'celebration' || living.some((creature) => creature.task === 'celebrate')) return 'celebration';
  if (world.livingWorld.weather === 'rain' || world.livingWorld.weather === 'mist') return 'rain';
  if (world.livingWorld.dayTime < 0.18 || world.livingWorld.dayTime > 0.82) return 'night';
  return 'day';
}

export function soundscapeNotes(mood: SoundscapeMood, seed: number): number[] {
  const roots: Record<SoundscapeMood, number[]> = {
    day: [220, 277.18, 329.63, 440],
    night: [146.83, 196, 220, 293.66],
    rain: [174.61, 220, 261.63, 349.23],
    danger: [110, 116.54, 164.81, 174.61],
    celebration: [261.63, 329.63, 392, 523.25]
  };
  const notes = roots[mood];
  const offset = Math.abs(seed) % notes.length;
  return notes.map((_, index) => notes[(index + offset) % notes.length]);
}

export function buildingMotionFrequency(kind: BuildingKind): number {
  return {
    'nutrient-bed': 0.0045,
    'wash-pool': 0.0065,
    'resonance-garden': 0.008,
    nest: 0.0028,
    extractor: 0.014,
    clinic: 0.0055
  }[kind];
}

export function weatherAmbienceFrequency(weather: WeatherKind) {
  return { clear: 235, mist: 190, rain: 145, wind: 175, storm: 92 }[weather];
}
