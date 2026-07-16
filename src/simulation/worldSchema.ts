import { z } from 'zod';
import { createCreaturePersonality } from './personality';
import { ensureCreatureLife } from './colonyLife';
import { ensureBuildingLife, ensureCreatureHistory, ensureLivingWorld } from './livingWorld';
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
  task: z.enum(['wander', 'eat', 'bathe', 'play', 'sleep', 'work', 'heal', 'socialize', 'comfort', 'construct', 'maintain', 'celebrate', 'argue', 'dead']), age: finite,
  exposure: finite, reproduction: finite, alive: z.boolean(), deathAge: finite.optional(), generation: z.number().int().min(0), hue: finite,
  personality: creaturePersonality.optional(), bonds: z.record(finite.min(0).max(100)).optional(),
  role: role.optional(), skills: skills.optional(), preferences: preferences.optional(), ambition: ambition.optional(),
  socialCooldown: finite.nonnegative().optional(), socialTimer: finite.nonnegative().optional(), socialPursuitTimer: finite.nonnegative().optional(),
  socialTarget: vec2.optional(), stuckTimer: finite.nonnegative().optional(), queueIndex: z.number().int().min(0).optional(), isBeingServed: z.boolean().optional(),
  assignedRole: role.optional(), autoRole: z.boolean().optional(), stress: finite.min(0).max(100).optional(), traits: z.array(z.string().max(40)).max(16).optional(),
  memories: z.array(z.object({ id: z.string().max(100), at: finite, text: z.string().max(240), valence: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })).max(24).optional(),
  history: z.array(z.object({ at: finite, title: z.string().max(100), detail: z.string().max(240) })).max(100).optional(),
  parentId: z.string().max(40).optional(), childrenIds: z.array(z.string().max(40)).max(32).optional(), mentorId: z.string().max(40).optional(),
  favoriteFood: z.string().max(60).optional(), favoriteCompanionId: z.string().max(40).optional(), routeMemory: z.array(vec2).max(12).optional(),
  voiceStyle: z.enum(['chirpy', 'round', 'whispery', 'raspy', 'musical']).optional(), voiceCooldown: finite.nonnegative().optional(), ageMilestone: z.number().int().min(0).optional(), currentConcern: z.string().max(120).optional(), expeditionId: z.string().max(80).optional(),
  schedule: z.enum(['balanced', 'early', 'late', 'flexible', 'custom']).optional(),
  customSchedule: z.array(z.enum(['rest', 'free', 'work'])).length(8).optional(),
  managementGroupId: z.string().max(40).optional(), shiftWork: finite.nonnegative().optional(), lastTaskReason: z.string().max(180).optional(),
  directOrder: z.object({
    kind: z.enum(['move', 'operate', 'construct', 'maintain', 'rest', 'recreate']), issuedAt: finite.nonnegative(), expiresAt: finite.nonnegative(),
    buildingId: z.string().max(40).optional(), target: vec2.optional()
  }).optional()
});
const building = z.object({
  id: z.string().min(1).max(40), kind: z.enum(['nutrient-bed', 'wash-pool', 'resonance-garden', 'nest', 'extractor', 'clinic']),
  x: finite, y: finite, level: z.number().int().min(1).max(3), active: z.boolean(), upgradeBranch: z.enum(['quality', 'capacity']).optional(),
  durability: finite.min(0).max(100).optional(), constructionProgress: finite.min(0).max(100).optional(), constructing: z.boolean().optional(),
  constructionKind: z.enum(['new', 'upgrade', 'ascend']).optional(), constructionWork: finite.min(0).max(100).optional(),
  materialsRequired: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }).optional(),
  materialsDelivered: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }).optional(),
  influenceRadius: finite.min(50).max(400).optional(), maintenanceMode: z.enum(['auto', 'manual']).optional(),
  maintenanceFunded: z.boolean().optional(), lastOperatorId: z.string().max(40).optional(), preferredOperatorIds: z.array(z.string().max(40)).max(4).optional()
});
const personality = z.object({
  empathy: finite, exploitation: finite, sustainability: finite, curiosity: finite,
  ambition: finite, obedience: finite, aggression: finite, honesty: finite
});
const event = z.object({ type: z.string().min(1).max(80), at: finite, payload: z.record(z.unknown()) });
const research = z.object({ care: z.number().int().min(0).max(5), nature: z.number().int().min(0).max(5), technology: z.number().int().min(0).max(5), society: z.number().int().min(0).max(5), exploration: z.number().int().min(0).max(5) });
const settings = z.object({
  muted: z.boolean(), voiceVolume: finite.min(0).max(1), ambienceVolume: finite.min(0).max(1), musicVolume: finite.min(0).max(1).optional(), textScale: finite.min(0.8).max(1.5), highContrast: z.boolean(), colorBlind: z.boolean(),
  reducedMotion: z.boolean(), screenShake: z.boolean(), lowPower: z.boolean(), quality: z.enum(['low', 'medium', 'high']), offlineLimitMinutes: z.number().int().min(0).max(240),
  simulationSpeed: z.union([z.literal(1), z.literal(2), z.literal(4)]), paused: z.boolean(), subtitles: z.boolean(), tutorial: z.boolean(), alertLevel: z.enum(['critical', 'important', 'all'])
});
const management = z.object({
  priorities: z.object({
    medical: z.number().int().min(0).max(3), food: z.number().int().min(0).max(3), cleanliness: z.number().int().min(0).max(3), rest: z.number().int().min(0).max(3),
    morale: z.number().int().min(0).max(3), maintenance: z.number().int().min(0).max(3), construction: z.number().int().min(0).max(3), industry: z.number().int().min(0).max(3)
  }),
  policies: z.object({ emergencyFirst: z.boolean(), repairBeforeConstruction: z.boolean(), protectReserves: z.boolean(), autoStaff: z.boolean() }),
  minimumReserves: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }),
  zones: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), kind: z.enum(['home', 'work', 'recreation']), x: finite, y: finite, radius: finite.min(80).max(500), color: z.number().int().nonnegative() })).max(8),
  groups: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), color: z.number().int().nonnegative(), zoneId: z.string().max(40) })).max(8),
  autoFundRepairsBelow: finite.min(5).max(80),
  overlay: z.enum(['none', 'zones', 'capacity', 'traffic', 'orders']).optional(),
  activePreset: z.enum(['balanced', 'emergency', 'growth', 'relaxed', 'custom']).optional(),
  tutorialStep: z.number().int().min(0).max(10).optional(),
  metrics: z.array(z.object({
    at: finite.nonnegative(), glow: finite.nonnegative(), alloy: finite.nonnegative(), population: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(), averageNeed: finite.min(0).max(100)
  })).max(48).optional()
});
const regionId = z.enum(['lumen-field', 'whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin']);
const regionProgress = z.object({
  regionId, scouting: finite.min(0).max(100), status: z.enum(['locked', 'permitted', 'scouted', 'settled']),
  hazard: z.enum(['none', 'thorns', 'flood', 'storm', 'radiance']),
  discovered: z.array(z.enum(['seed-vault', 'memory-ruin', 'signal-array', 'living-archive'])).max(4),
  preserved: z.boolean(), visits: z.number().int().nonnegative()
});
const outpost = z.object({
  id: z.string().max(80), regionId: z.enum(['whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin']),
  name: z.string().max(100), level: z.number().int().min(1).max(3), condition: finite.min(0).max(100),
  staffIds: z.array(z.string().max(40)).max(4), storage: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }),
  storageCapacity: finite.positive(), supplies: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }), lastTickAt: finite.nonnegative()
});
const supplyRoute = z.object({
  id: z.string().max(80), regionId: z.enum(['whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin']),
  active: z.boolean(), throughput: finite.min(0).max(2), risk: finite.min(0).max(1), nextDeliveryAt: finite.nonnegative(),
  delivered: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() })
});
const regionalVisitor = z.object({
  id: z.string().max(100), regionId: z.enum(['whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin']),
  name: z.string().max(80), voiceStyle: z.enum(['chirpy', 'round', 'whispery', 'raspy', 'musical']), trait: z.string().max(60),
  arrivedAt: finite.nonnegative(), expiresAt: finite.nonnegative(), status: z.enum(['waiting', 'joined', 'departed'])
});
const livingWorld = z.object({
  reputation: finite.nonnegative(), level: z.number().int().min(1).max(5), title: z.string().max(100), researchPoints: finite.nonnegative(), research,
  unlockedRegions: z.array(z.enum(['lumen-field', 'whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin'])).max(5), rareResources: z.object({ memoryCrystal: z.number().int().nonnegative(), wildSeed: z.number().int().nonnegative() }),
  expeditions: z.array(z.object({
    id: z.string().min(1).max(80), regionId: z.enum(['lumen-field', 'whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin']), creatureIds: z.array(z.string().max(40)).min(1).max(3),
    startedAt: finite.nonnegative(), returnAt: finite.nonnegative(), status: z.enum(['active', 'decision', 'complete']), risk: z.enum(['low', 'moderate', 'high', 'severe']),
    outcome: z.string().max(500).optional(), success: z.boolean().optional(), glowReward: finite.nonnegative().optional(), alloyReward: finite.nonnegative().optional(), choice: z.enum(['preserve', 'salvage']).optional(),
    progress: finite.min(0).max(1).optional(), scoutingReward: finite.min(0).max(100).optional()
  })).max(20).optional(),
  day: z.number().int().min(1), dayTime: finite.min(0).max(1), season: z.enum(['bloom', 'suncrest', 'amberfall', 'frostquiet']), weather: z.enum(['clear', 'mist', 'rain', 'wind', 'storm']),
  weatherTimer: finite, lastDailyEventDay: z.number().int().min(0),
  alerts: z.array(z.object({
    id: z.string().max(100), severity: z.enum(['info', 'warning', 'critical']), title: z.string().max(100), detail: z.string().max(240), at: finite, dismissed: z.boolean(),
    creatureId: z.string().max(40).optional(), buildingId: z.string().max(40).optional(), actionLabel: z.string().max(30).optional()
  })).max(20),
  journal: z.array(z.object({ id: z.string().max(120), at: finite, category: z.enum(['discovery', 'event', 'weather', 'relationship', 'birth', 'loss', 'milestone']), title: z.string().max(160), detail: z.string().max(300) })).max(120),
  personalRequests: z.array(z.object({
    id: z.string().max(100), creatureId: z.string().max(40), targetCreatureId: z.string().max(40).optional(),
    kind: z.enum(['companionship', 'favorite-place', 'purpose']), title: z.string().max(120), detail: z.string().max(300),
    createdAt: finite.nonnegative(), expiresAt: finite.nonnegative(), status: z.enum(['active', 'resolved', 'expired']), choice: z.enum(['help', 'encourage', 'decline']).optional()
  })).max(30).optional(),
  storyEvents: z.array(z.object({
    id: z.string().max(100), kind: z.enum(['lost-song', 'shared-home', 'reconciliation']), title: z.string().max(140), description: z.string().max(500),
    creatureIds: z.array(z.string().max(40)).min(1).max(4), stage: z.union([z.literal(1), z.literal(2)]), status: z.enum(['decision', 'resolved']),
    createdAt: finite.nonnegative(), choices: z.array(z.enum(['gentle', 'bold'])).length(2)
  })).max(20).optional(),
  groupActivity: z.object({
    id: z.string().max(100), kind: z.enum(['meal', 'game', 'celebration']), creatureIds: z.array(z.string().max(40)).min(2).max(8),
    startedAt: finite.nonnegative(), endsAt: finite.nonnegative(), center: vec2
  }).optional(),
  lastRequestDay: z.number().int().min(0).optional(), lastStoryDay: z.number().int().min(0).optional(), lastGroupActivityAt: finite.nonnegative().optional(),
  challenges: z.array(z.object({ id: z.string().max(100), title: z.string().max(100), description: z.string().max(240), progress: finite.nonnegative(), target: finite.positive(), complete: z.boolean() })).max(20),
  settings, management: management.optional(),
  activeRegion: regionId.optional(),
  regionProgress: z.record(regionProgress).optional(),
  outposts: z.array(outpost).max(4).optional(),
  supplyRoutes: z.array(supplyRoute).max(4).optional(),
  regionalVisitors: z.array(regionalVisitor).max(40).optional(),
  telemetry: z.object({ averageTickMs: finite.nonnegative(), peakTickMs: finite.nonnegative(), fps: finite.nonnegative(), creatures: z.number().int().nonnegative(), visibleCreatures: z.number().int().nonnegative(), pathRecoveries: z.number().int().nonnegative() }), saveVersion: z.number().int().min(2)
});

const schema = z.object({
  version: z.literal(1), seed: finite, time: finite.nonnegative(), chapter: z.number().int().min(1).max(5),
  creatures: z.array(creature).min(1).max(250), buildings: z.array(building).max(500),
  resources: z.object({ glow: finite.nonnegative(), alloy: finite.nonnegative() }),
  pollution: z.array(finite).max(4096), pollutionWidth: z.number().int().min(1).max(64), pollutionHeight: z.number().int().min(1).max(64),
  technologies: z.array(z.string().max(80)).max(100), completedObjectives: z.array(z.string().max(80)).max(100),
  dialogueHistory: z.array(z.string().max(80)).max(100), profile: personality,
  events: z.array(event).max(2000), deaths: z.number().int().min(0).max(250), populationPeak: z.number().int().min(1).max(250),
  endingId: z.string().max(80).optional(), livingWorld: livingWorld.optional()
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
    ensureCreatureHistory(creatureState as WorldState['creatures'][number]);
  });
  const world = result.data as WorldState;
  world.buildings.forEach(ensureBuildingLife);
  ensureLivingWorld(world);
  if (world.events.length > MAX_EVENT_HISTORY) world.events = world.events.slice(-MAX_EVENT_HISTORY);
  return world;
}
