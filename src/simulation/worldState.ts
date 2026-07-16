import { createCreaturePersonality, setBond } from './personality';
import { chooseCreatureRole, createCreatureAmbition, createCreaturePreferences, createCreatureSkills } from './colonyLife';

export type NeedKey = 'hunger' | 'hygiene' | 'happiness' | 'health' | 'energy';
export type TaskType = 'wander' | 'eat' | 'bathe' | 'play' | 'sleep' | 'work' | 'heal' | 'socialize' | 'comfort' | 'construct' | 'maintain' | 'celebrate' | 'argue' | 'dead';
export type BuildingKind = 'nutrient-bed' | 'wash-pool' | 'resonance-garden' | 'nest' | 'extractor' | 'clinic';
export type UpgradeBranch = 'quality' | 'capacity';
export type ConstructionKind = 'new' | 'upgrade' | 'ascend';
export type MaintenanceMode = 'auto' | 'manual';
export type CreatureRole = 'forager' | 'caretaker' | 'healer' | 'builder' | 'researcher' | 'explorer';
export type SkillKey = 'foraging' | 'caregiving' | 'healing' | 'building' | 'research' | 'exploration';
export type CreatureSkills = Record<SkillKey, number>;
export type PreferenceActivity = 'gathering' | 'caring' | 'healing' | 'making' | 'learning' | 'exploring';
export type AmbitionKind = 'master-skill' | 'friendships';
export type ResearchBranch = 'care' | 'nature' | 'technology' | 'society' | 'exploration';
export type WeatherKind = 'clear' | 'mist' | 'rain' | 'wind' | 'storm';
export type SeasonKind = 'bloom' | 'suncrest' | 'amberfall' | 'frostquiet';
export type VoiceStyle = 'chirpy' | 'round' | 'whispery' | 'raspy' | 'musical';
export type RegionId = 'lumen-field' | 'whisper-grove' | 'mirror-marsh' | 'old-signal-ridge' | 'aurora-basin';
export type ExpeditionStatus = 'active' | 'decision' | 'complete';
export type ExpeditionChoice = 'preserve' | 'salvage';
export type ManagementPriorityKey = 'medical' | 'food' | 'cleanliness' | 'rest' | 'morale' | 'maintenance' | 'construction' | 'industry';
export type ColonyPolicyKey = 'emergencyFirst' | 'repairBeforeConstruction' | 'protectReserves' | 'autoStaff';
export type CreatureSchedule = 'balanced' | 'early' | 'late' | 'flexible' | 'custom';
export type SchedulePhase = 'rest' | 'free' | 'work';
export type ColonyOverlay = 'none' | 'zones' | 'capacity' | 'traffic' | 'orders';
export type ManagementPreset = 'balanced' | 'emergency' | 'growth' | 'relaxed' | 'custom';
export type DirectOrderKind = 'move' | 'operate' | 'construct' | 'maintain' | 'rest' | 'recreate';

export interface Vec2 { x: number; y: number }
export interface Needs { hunger: number; hygiene: number; happiness: number; health: number; energy: number }
export interface CreaturePersonality { sociability: number; curiosity: number; diligence: number; empathy: number; resilience: number }
export interface CreaturePreferences { favoriteBuilding: BuildingKind; favoriteActivity: PreferenceActivity }
export interface CreatureAmbition { kind: AmbitionKind; skill?: SkillKey; progress: number; target: number; description: string }
export interface CreatureMemory { id: string; at: number; text: string; valence: -1 | 0 | 1 }
export interface HistoryEntry { at: number; title: string; detail: string }
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
  role: CreatureRole;
  skills: CreatureSkills;
  preferences: CreaturePreferences;
  ambition: CreatureAmbition;
  bonds: Record<string, number>;
  socialCooldown: number;
  socialTimer: number;
  socialPursuitTimer: number;
  socialTarget?: Vec2;
  stuckTimer: number;
  queueIndex: number;
  isBeingServed: boolean;
  assignedRole: CreatureRole;
  autoRole: boolean;
  stress: number;
  traits: string[];
  memories: CreatureMemory[];
  history: HistoryEntry[];
  parentId?: string;
  childrenIds: string[];
  mentorId?: string;
  favoriteFood: string;
  favoriteCompanionId?: string;
  routeMemory: Vec2[];
  voiceStyle: VoiceStyle;
  voiceCooldown: number;
  ageMilestone: number;
  currentConcern: string;
  expeditionId?: string;
  schedule: CreatureSchedule;
  customSchedule: SchedulePhase[];
  managementGroupId: string;
  shiftWork: number;
  lastTaskReason: string;
  directOrder?: { kind: DirectOrderKind; issuedAt: number; expiresAt: number; buildingId?: string; target?: Vec2 };
}
export interface BuildingState {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  active: boolean;
  upgradeBranch?: UpgradeBranch;
  durability: number;
  constructionProgress: number;
  constructing: boolean;
  constructionKind?: ConstructionKind;
  constructionWork: number;
  materialsRequired: Resources;
  materialsDelivered: Resources;
  influenceRadius: number;
  maintenanceMode: MaintenanceMode;
  maintenanceFunded: boolean;
  lastOperatorId?: string;
  preferredOperatorIds: string[];
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
export interface AlertState {
  id: string; severity: 'info' | 'warning' | 'critical'; title: string; detail: string; at: number; dismissed: boolean;
  creatureId?: string; buildingId?: string; actionLabel?: string;
}
export interface JournalEntry { id: string; at: number; category: 'discovery' | 'event' | 'weather' | 'relationship' | 'birth' | 'loss' | 'milestone'; title: string; detail: string }
export interface ChallengeState { id: string; title: string; description: string; progress: number; target: number; complete: boolean }
export type PersonalRequestChoice = 'help' | 'encourage' | 'decline';
export interface PersonalRequestState {
  id: string; creatureId: string; targetCreatureId?: string; kind: 'companionship' | 'favorite-place' | 'purpose';
  title: string; detail: string; createdAt: number; expiresAt: number; status: 'active' | 'resolved' | 'expired'; choice?: PersonalRequestChoice;
}
export type StoryChoice = 'gentle' | 'bold';
export interface StoryEventState {
  id: string; kind: 'lost-song' | 'shared-home' | 'reconciliation'; title: string; description: string; creatureIds: string[];
  stage: 1 | 2; status: 'decision' | 'resolved'; createdAt: number; choices: StoryChoice[];
}
export interface GroupActivityState {
  id: string; kind: 'meal' | 'game' | 'celebration'; creatureIds: string[]; startedAt: number; endsAt: number; center: Vec2;
}
export interface ColonyZone { id: string; name: string; kind: 'home' | 'work' | 'recreation'; x: number; y: number; radius: number; color: number }
export interface ColonyGroup { id: string; name: string; color: number; zoneId: string }
export interface ColonyManagementState {
  priorities: Record<ManagementPriorityKey, 0 | 1 | 2 | 3>;
  policies: Record<ColonyPolicyKey, boolean>;
  minimumReserves: Resources;
  zones: ColonyZone[];
  groups: ColonyGroup[];
  autoFundRepairsBelow: number;
  overlay: ColonyOverlay;
  activePreset: ManagementPreset;
  tutorialStep: number;
  metrics: Array<{ at: number; glow: number; alloy: number; population: number; queued: number; averageNeed: number }>;
}
export interface JobQueueEntry {
  id: string; kind: 'care' | 'construction' | 'maintenance' | 'queue'; priority: number; title: string;
  status: 'active' | 'waiting' | 'blocked'; creatureId?: string; buildingId?: string;
}
export interface ExpeditionState {
  id: string;
  regionId: RegionId;
  creatureIds: string[];
  startedAt: number;
  returnAt: number;
  status: ExpeditionStatus;
  risk: 'low' | 'moderate' | 'high' | 'severe';
  outcome?: string;
  success?: boolean;
  glowReward?: number;
  alloyReward?: number;
  choice?: ExpeditionChoice;
}
export interface GameSettings {
  muted: boolean; voiceVolume: number; ambienceVolume: number; musicVolume: number; textScale: number; highContrast: boolean; colorBlind: boolean;
  reducedMotion: boolean; screenShake: boolean; lowPower: boolean; quality: 'low' | 'medium' | 'high'; offlineLimitMinutes: number;
  simulationSpeed: 1 | 2 | 4; paused: boolean; subtitles: boolean; tutorial: boolean; alertLevel: 'critical' | 'important' | 'all';
}
export interface LivingWorldState {
  reputation: number; level: number; title: string; researchPoints: number; research: Record<ResearchBranch, number>;
  unlockedRegions: RegionId[]; rareResources: { memoryCrystal: number; wildSeed: number }; expeditions: ExpeditionState[]; day: number; dayTime: number;
  season: SeasonKind; weather: WeatherKind; weatherTimer: number; lastDailyEventDay: number; alerts: AlertState[]; journal: JournalEntry[];
  personalRequests: PersonalRequestState[]; storyEvents: StoryEventState[]; groupActivity?: GroupActivityState;
  lastRequestDay: number; lastStoryDay: number; lastGroupActivityAt: number;
  challenges: ChallengeState[]; settings: GameSettings; telemetry: { averageTickMs: number; peakTickMs: number; fps: number; creatures: number; visibleCreatures: number; pathRecoveries: number }; saveVersion: number;
  management: ColonyManagementState;
}
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
  livingWorld: LivingWorldState;
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
  const personality = createCreaturePersonality(id, generation, parentPersonality);
  const role = chooseCreatureRole(personality, id);
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
    personality,
    role,
    skills: createCreatureSkills(id),
    preferences: createCreaturePreferences(role, id),
    ambition: createCreatureAmbition(role, id),
    bonds: {},
    socialCooldown: 5 + index % 8,
    socialTimer: 0,
    socialPursuitTimer: 0,
    stuckTimer: 0,
    queueIndex: 0,
    isBeingServed: false,
    assignedRole: role,
    autoRole: true,
    stress: 0,
    traits: [],
    memories: [{ id: 'born', at: 0, text: `Born into generation ${generation}.`, valence: 1 }],
    history: [{ at: 0, title: 'Awakened', detail: `Entered the habitat as ${names[index % names.length]}.` }],
    childrenIds: [],
    favoriteFood: ['sun-dew', 'moss nectar', 'glow fruit'][index % 3],
    routeMemory: [],
    voiceStyle: ['chirpy', 'round', 'whispery', 'raspy', 'musical'][index % 5] as VoiceStyle,
    voiceCooldown: 0,
    ageMilestone: 0,
    currentConcern: 'Feeling secure',
    schedule: 'balanced',
    customSchedule: ['rest', 'rest', 'free', 'work', 'work', 'work', 'free', 'rest'],
    managementGroupId: ['gentle-shift', 'maker-shift', 'free-chorus'][index % 3],
    shiftWork: 0,
    lastTaskReason: 'Choosing freely from current needs'
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
    populationPeak: 1,
    livingWorld: {
      reputation: 0, level: 1, title: 'Tender Signal', researchPoints: 0,
      research: { care: 0, nature: 0, technology: 0, society: 0, exploration: 0 }, unlockedRegions: ['lumen-field'],
      rareResources: { memoryCrystal: 0, wildSeed: 0 }, expeditions: [], day: 1, dayTime: 0.28, season: 'bloom', weather: 'clear', weatherTimer: 80, lastDailyEventDay: 0,
      alerts: [], journal: [{ id: 'awakening', at: 0, category: 'discovery', title: 'Habitat 483 awakens', detail: 'Pip-01 answered the first signal.' }],
      personalRequests: [], storyEvents: [], lastRequestDay: 0, lastStoryDay: 0, lastGroupActivityAt: 0,
      challenges: [],
      settings: { muted: false, voiceVolume: 0.7, ambienceVolume: 0.38, musicVolume: 0.3, textScale: 1.1, highContrast: false, colorBlind: false, reducedMotion: false, screenShake: true, lowPower: false, quality: 'high', offlineLimitMinutes: 15, simulationSpeed: 1, paused: false, subtitles: true, tutorial: true, alertLevel: 'all' },
      telemetry: { averageTickMs: 0, peakTickMs: 0, fps: 60, creatures: 1, visibleCreatures: 1, pathRecoveries: 0 },
      management: {
        priorities: { medical: 3, food: 3, cleanliness: 2, rest: 3, morale: 2, maintenance: 2, construction: 2, industry: 1 },
        policies: { emergencyFirst: true, repairBeforeConstruction: true, protectReserves: true, autoStaff: true },
        minimumReserves: { glow: 24, alloy: 12 },
        zones: [
          { id: 'north-grove', name: 'North Grove', kind: 'home', x: 570, y: 300, radius: 230, color: 0x7af6bd },
          { id: 'central-field', name: 'Central Field', kind: 'work', x: 820, y: 525, radius: 260, color: 0xf7bd62 },
          { id: 'south-meadow', name: 'South Meadow', kind: 'recreation', x: 990, y: 760, radius: 225, color: 0xbf78ff }
        ],
        groups: [
          { id: 'gentle-shift', name: 'Gentle Shift', color: 0x7af6bd, zoneId: 'north-grove' },
          { id: 'maker-shift', name: 'Maker Shift', color: 0xf7bd62, zoneId: 'central-field' },
          { id: 'free-chorus', name: 'Free Chorus', color: 0xbf78ff, zoneId: 'south-meadow' }
        ],
        autoFundRepairsBelow: 35,
        overlay: 'none',
        activePreset: 'balanced',
        tutorialStep: 0,
        metrics: []
      },
      saveVersion: 8
    }
  };
}

export function livingCreatures(world: WorldState): CreatureState[] {
  return world.creatures.filter((creature) => creature.alive);
}
