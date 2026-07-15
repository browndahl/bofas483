import { z } from 'zod';
import { createCreaturePersonality } from './personality';
import { ensureCreatureLife } from './colonyLife';
import type { WorldState } from './worldState';
import { MAX_EVENT_HISTORY } from './worldState';

const finite = z.number().finite();
const vec2 = z.object({ x: finite, y: finite });
const needs = z.object({ hunger: finite, hygiene: finite, happiness: finite, health: finite, energy: finite });
const creaturePersonality = z.object({ sociability: finite.min(0).max(1), curiosity: finite.min(0).max(1), diligence: finite.min(0).max(1), empathy: finite.min(0).max(1), resilience: finite.min(0).max(1) });
const skillKey = z.enum(['foraging', 'caregiving', 'healing', 'building', 'research', 'exploration']);
const role = z.enum(['forager', 'caretaker', 'healer', 'builder', 'researcher', 'explorer']);
const skills = z.object({ foraging: finite.min(0).max(100), caregiving: finite.min(0).max(100), healing: finite.min(0).max(100), building: finite.min(0).max(100), research: finite.min(0).max(100), exploration: finite.min(0).max(100) });
const preferences = z.object({
  favoriteBuilding: z.enum(['nutrient-bed', 'wash-pool', 'resonance-garden', 'nest', 'extractor', 'clinic']),
  favoriteActivity: z.enum(['gathering', 'caring', 'healing', 'making', 'learning', 'exploring'])
});
const ambition = z.object({ kind: z.enum(['master-skill', 'friendships']), skill: skillKey.optional(), progress: finite.min(0), target: finite.positive(), description: z.string().min(1).max(120) });
const creature = z.object({
  id: z.string().min(1).max(40), name: z.string().min(1).max(80), x: finite, y: finite,
  target: vec2, destinationBuildingId: z.string().max(40).optional(), destinationCreatureId: z.string().max(40).optional(),
  navigationPath: z.array(vec2).max(128).optional(), navigationTarget: vec2.optional(), needs,
  task: z.enum(['wander', 'eat', 'bathe', 'play', 'sleep', 'work', 'heal', 'socialize', 'comfort', 'dead']), age: finite,
  exposure: finite, reproduction: finite, alive: z.boolean(), deathAge: finite.optional(), generation: z.number().int().min(0), hue: finite,
  personality: creaturePersonality.optional(), bonds: z.record(finite.min(0).max(100)).optional(),
  role: role.optional(), skills: skills.optional(), preferences: preferences.optional(), ambition: ambition.optional(),
  socialCooldown: finite.nonnegative().optional(), socialTimer: finite.nonnegative().optional(), socialPursuitTimer: finite.nonnegative().optional(),
  socialTarget: vec2.optional(), stuckTimer: finite.nonnegative().optional(), queueIndex: z.number().int().min(0).optional(), isBeingServed: z.boolean().optional()
});
const building = z.object({
  id: z.string().min(1).max(40), kind: z.enum(['nutrient-bed', 'wash-pool', 'resonance-garden', 'nest', 'extractor', 'clinic']),
  x: finite, y: finite, level: z.number().int().min(1).max(2), active: z.boolean()
});
const personality = z.object({
  empathy: finite, exploitation: finite, sustainability: finite, curiosity: finite,
  ambition: finite, obedience: finite, aggression: finite, honesty: finite
});
const event = z.object({ type: z.string().min(1).max(80), at: finite, payload: z.record(z.unknown()) });

const schema = z.object({
  version: z.literal(1), seed: finite, time: finite.nonnegative(), chapter: z.number().int().min(1).max(5),
  creatures: z.array(creature).min(1).max(250), buildings: z.array(building).max(500),
  resources: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }),
  pollution: z.array(finite).max(4096), pollutionWidth: z.number().int().min(1).max(64), pollutionHeight: z.number().int().min(1).max(64),
  technologies: z.array(z.string().max(80)).max(100), completedObjectives: z.array(z.string().max(80)).max(100),
  dialogueHistory: z.array(z.string().max(80)).max(100), profile: personality,
  events: z.array(event).max(2000), deaths: z.number().int().min(0).max(250), populationPeak: z.number().int().min(1).max(250),
  endingId: z.string().max(80).optional()
}).refine((world) => world.pollution.length === world.pollutionWidth * world.pollutionHeight, { message: 'Invalid pollution grid' });

export function parseWorldState(value: unknown): WorldState | null {
  const result = schema.safeParse(value);
  if (!result.success) return null;
  result.data.creatures.forEach((creatureState) => {
    creatureState.navigationPath ??= [];
    creatureState.personality ??= createCreaturePersonality(creatureState.id, creatureState.generation);
    creatureState.bonds = Object.fromEntries(Object.entries(creatureState.bonds ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8));
    creatureState.socialCooldown ??= 0;
    creatureState.socialTimer ??= 0;
    creatureState.socialPursuitTimer ??= 0;
    creatureState.stuckTimer ??= 0;
    ensureCreatureLife(creatureState as WorldState['creatures'][number]);
  });
  const world = result.data as WorldState;
  if (world.events.length > MAX_EVENT_HISTORY) world.events = world.events.slice(-MAX_EVENT_HISTORY);
  return world;
}
