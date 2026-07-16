import { BUILDINGS, buildingCapacity, maintenanceCost } from './building';
import type {
  BuildingState,
  ColonyManagementState,
  ColonyPolicyKey,
  ColonyZone,
  CreatureSchedule,
  CreatureState,
  JobQueueEntry,
  ManagementPriorityKey,
  SchedulePhase,
  TaskType,
  WorldState
} from './worldState';

export const MANAGEMENT_PRIORITY_KEYS: ManagementPriorityKey[] = ['medical', 'food', 'cleanliness', 'rest', 'morale', 'maintenance', 'construction', 'industry'];
export const COLONY_POLICY_KEYS: ColonyPolicyKey[] = ['emergencyFirst', 'repairBeforeConstruction', 'protectReserves', 'autoStaff'];
export const CREATURE_SCHEDULES: CreatureSchedule[] = ['balanced', 'early', 'late', 'flexible'];

export const MANAGEMENT_LABELS: Record<ManagementPriorityKey, string> = {
  medical: 'MEDICAL', food: 'FOOD', cleanliness: 'CLEANLINESS', rest: 'REST', morale: 'MORALE',
  maintenance: 'REPAIRS', construction: 'BUILDING', industry: 'INDUSTRY'
};

export const DEFAULT_ZONES: ColonyZone[] = [
  { id: 'north-grove', name: 'North Grove', kind: 'home', x: 570, y: 300, radius: 230, color: 0x7af6bd },
  { id: 'central-field', name: 'Central Field', kind: 'work', x: 820, y: 525, radius: 260, color: 0xf7bd62 },
  { id: 'south-meadow', name: 'South Meadow', kind: 'recreation', x: 990, y: 760, radius: 225, color: 0xbf78ff }
];

export function createColonyManagement(): ColonyManagementState {
  return {
    priorities: { medical: 3, food: 3, cleanliness: 2, rest: 3, morale: 2, maintenance: 2, construction: 2, industry: 1 },
    policies: { emergencyFirst: true, repairBeforeConstruction: true, protectReserves: true, autoStaff: true },
    minimumReserves: { glow: 24, alloy: 12 },
    zones: DEFAULT_ZONES.map((zone) => ({ ...zone })),
    groups: [
      { id: 'gentle-shift', name: 'Gentle Shift', color: 0x7af6bd, zoneId: 'north-grove' },
      { id: 'maker-shift', name: 'Maker Shift', color: 0xf7bd62, zoneId: 'central-field' },
      { id: 'free-chorus', name: 'Free Chorus', color: 0xbf78ff, zoneId: 'south-meadow' }
    ],
    autoFundRepairsBelow: 35
  };
}

export function ensureColonyManagement(world: WorldState) {
  const defaults = createColonyManagement();
  world.livingWorld.management = {
    ...defaults,
    ...world.livingWorld.management,
    priorities: { ...defaults.priorities, ...world.livingWorld.management?.priorities },
    policies: { ...defaults.policies, ...world.livingWorld.management?.policies },
    minimumReserves: { ...defaults.minimumReserves, ...world.livingWorld.management?.minimumReserves },
    zones: world.livingWorld.management?.zones?.length ? world.livingWorld.management.zones : defaults.zones,
    groups: world.livingWorld.management?.groups?.length ? world.livingWorld.management.groups : defaults.groups
  };
  world.creatures.forEach((creature, index) => {
    creature.schedule ??= 'balanced';
    creature.managementGroupId ??= defaults.groups[index % defaults.groups.length].id;
    creature.shiftWork ??= 0;
    creature.lastTaskReason ??= 'Choosing freely from current needs';
  });
  world.buildings.forEach((building) => { building.preferredOperatorIds ??= []; });
}

export function schedulePhase(dayTime: number, schedule: CreatureSchedule): SchedulePhase {
  if (schedule === 'flexible') return 'free';
  const shifted = (dayTime + (schedule === 'early' ? 0.08 : schedule === 'late' ? -0.1 : 0) + 1) % 1;
  if (shifted < 0.2 || shifted >= 0.86) return 'rest';
  if (shifted < 0.27 || shifted >= 0.72) return 'free';
  return 'work';
}

const TASK_PRIORITY: Partial<Record<TaskType, ManagementPriorityKey>> = {
  heal: 'medical', eat: 'food', bathe: 'cleanliness', sleep: 'rest', play: 'morale',
  maintain: 'maintenance', construct: 'construction', work: 'industry'
};

export function priorityForTask(world: WorldState, task: TaskType) {
  const key = TASK_PRIORITY[task];
  return key ? world.livingWorld.management.priorities[key] : 1;
}

function urgentTask(creature: CreatureState, buildings: BuildingState[]): TaskType | undefined {
  if (creature.needs.health < 52 && buildings.some((building) => building.kind === 'clinic' && building.active)) return 'heal';
  if (creature.needs.hunger < 36) return 'eat';
  if (creature.needs.energy < 24) return 'sleep';
  if (creature.needs.hygiene < 28) return 'bathe';
  if (creature.needs.happiness < 26) return 'play';
  return undefined;
}

export function managedTask(world: WorldState, creature: CreatureState, baseTask: TaskType): { task: TaskType; reason: string } {
  const management = world.livingWorld.management;
  const urgent = urgentTask(creature, world.buildings);
  if (urgent && management.policies.emergencyFirst) return { task: urgent, reason: `Emergency-first policy: ${urgent} need is critical` };
  const phase = schedulePhase(world.livingWorld.dayTime, creature.schedule);
  const construction = world.buildings.some((building) => building.constructing);
  const maintenance = world.buildings.some((building) => building.maintenanceFunded && building.durability < 100);
  const canWork = creature.needs.energy > 42 && creature.needs.hunger > 48 && creature.needs.health > 48;
  if (creature.shiftWork > 75 && !urgent) return { task: creature.needs.energy < 82 ? 'sleep' : 'play', reason: 'Shift limit reached: protected recovery prevents overwork' };
  if (phase === 'rest' && !urgent) {
    if (creature.needs.energy < 88) return { task: 'sleep', reason: `${creature.schedule} schedule: protected rest period` };
    return { task: creature.needs.happiness < 68 ? 'play' : 'wander', reason: `${creature.schedule} schedule: recovery and free time` };
  }
  if (phase === 'free' && !urgent && ['construct', 'maintain', 'work'].includes(baseTask)) {
    return { task: creature.needs.happiness < 72 ? 'play' : 'wander', reason: `${creature.schedule} schedule: free-time block` };
  }
  if (phase === 'work' && canWork && (creature.assignedRole === 'builder' || creature.personality.diligence > 0.62)) {
    if (management.policies.repairBeforeConstruction && maintenance) return { task: 'maintain', reason: 'Colony policy: repairs before construction' };
    if (construction && management.priorities.construction >= management.priorities.industry) return { task: 'construct', reason: 'Work block: construction priority is highest' };
    if (maintenance && management.priorities.maintenance >= management.priorities.industry) return { task: 'maintain', reason: 'Work block: funded maintenance is prioritized' };
  }
  if (priorityForTask(world, baseTask) === 0 && !urgent) return { task: 'wander', reason: `${TASK_PRIORITY[baseTask] ?? baseTask} priority is disabled` };
  return { task: baseTask, reason: urgent ? `Critical ${urgent} need overrides the schedule` : `Schedule ${phase}: ${baseTask} priority ${priorityForTask(world, baseTask)}` };
}

export function creatureZone(world: WorldState, creature: CreatureState) {
  const group = world.livingWorld.management.groups.find((candidate) => candidate.id === creature.managementGroupId);
  return world.livingWorld.management.zones.find((candidate) => candidate.id === group?.zoneId);
}

export function canSpendReserve(world: WorldState, cost: { glow: number; alloy: number }) {
  const management = world.livingWorld.management;
  if (!management.policies.protectReserves) return true;
  return world.resources.glow - cost.glow >= management.minimumReserves.glow && world.resources.alloy - cost.alloy >= management.minimumReserves.alloy;
}

export function operatorPreferenceScore(building: BuildingState, creature: CreatureState) {
  if (building.preferredOperatorIds.includes(creature.id)) return 150;
  return 0;
}

export interface ColonyForecast {
  food: { capacity: number; demand: number; status: 'stable' | 'tight' | 'shortage' };
  beds: { capacity: number; demand: number; status: 'stable' | 'tight' | 'shortage' };
  clinics: { capacity: number; demand: number; status: 'stable' | 'tight' | 'shortage' };
  resourceNet: { glowPerMinute: number; alloyPerMinute: number };
  staffing: { preferred: number; assigned: number };
}

function forecastStatus(capacity: number, demand: number): ColonyForecast['food']['status'] {
  if (capacity < demand) return 'shortage';
  if (capacity < demand * 1.35) return 'tight';
  return 'stable';
}

export function colonyForecast(world: WorldState): ColonyForecast {
  const living = world.creatures.filter((creature) => creature.alive && !creature.expeditionId);
  const capacity = (kind: BuildingState['kind']) => world.buildings.filter((building) => building.kind === kind && building.active && !building.constructing).reduce((sum, building) => sum + buildingCapacity(building), 0);
  const foodDemand = Math.max(1, Math.ceil(living.length / 5));
  const bedDemand = Math.max(1, Math.ceil(living.filter((creature) => creature.needs.energy < 72).length / 3));
  const clinicDemand = living.filter((creature) => creature.needs.health < 60 || creature.exposure > 25).length;
  const extractors = world.buildings.filter((building) => building.kind === 'extractor' && building.active).length;
  const maintenanceDrain = world.buildings.filter((building) => building.durability < 55).reduce((sum, building) => sum + maintenanceCost(building).glow / 8, 0);
  const preferred = world.buildings.reduce((sum, building) => sum + building.preferredOperatorIds.length, 0);
  const assigned = world.buildings.filter((building) => building.lastOperatorId && building.preferredOperatorIds.includes(building.lastOperatorId)).length;
  return {
    food: { capacity: capacity('nutrient-bed'), demand: foodDemand, status: forecastStatus(capacity('nutrient-bed'), foodDemand) },
    beds: { capacity: capacity('nest'), demand: bedDemand, status: forecastStatus(capacity('nest'), bedDemand) },
    clinics: { capacity: capacity('clinic'), demand: clinicDemand, status: forecastStatus(capacity('clinic'), clinicDemand) },
    resourceNet: { glowPerMinute: extractors * 21 - maintenanceDrain, alloyPerMinute: extractors * 48 - maintenanceDrain * 0.45 },
    staffing: { preferred, assigned }
  };
}

export function colonyJobQueue(world: WorldState): JobQueueEntry[] {
  const entries: JobQueueEntry[] = [];
  world.creatures.filter((creature) => creature.alive).forEach((creature) => {
    const critical = Math.min(creature.needs.health, creature.needs.hunger, creature.needs.energy);
    if (critical < 30) entries.push({ id: `care-${creature.id}`, kind: 'care', priority: 100 - critical, title: `${creature.name}: ${creature.lastTaskReason}`, status: creature.isBeingServed ? 'active' : 'waiting', creatureId: creature.id });
  });
  world.buildings.forEach((building) => {
    if (building.constructing) {
      const builders = world.creatures.filter((creature) => creature.alive && creature.assignedRole === 'builder' && creature.needs.energy > 42).length;
      entries.push({ id: `build-${building.id}`, kind: 'construction', priority: 40 + world.livingWorld.management.priorities.construction * 10, title: `${BUILDINGS[building.kind].name} ${Math.floor(building.constructionProgress)}%${builders ? '' : ' · delayed: no ready Builder'}`, status: building.constructionProgress > 0 ? 'active' : builders ? 'waiting' : 'blocked', buildingId: building.id });
    }
    if (building.maintenanceFunded) {
      const builders = world.creatures.filter((creature) => creature.alive && (creature.assignedRole === 'builder' || creature.personality.diligence > 0.62) && creature.needs.energy > 40).length;
      entries.push({ id: `repair-${building.id}`, kind: 'maintenance', priority: 45 + world.livingWorld.management.priorities.maintenance * 10, title: `${BUILDINGS[building.kind].name} repair ${Math.floor(building.durability)}%${builders ? '' : ' · delayed: no rested repairer'}`, status: building.lastOperatorId ? 'active' : builders ? 'waiting' : 'blocked', buildingId: building.id });
    }
    const waiting = world.creatures.filter((creature) => creature.destinationBuildingId === building.id && !creature.isBeingServed).length;
    if (waiting) entries.push({ id: `queue-${building.id}`, kind: 'queue', priority: 25 + waiting * 5, title: `${BUILDINGS[building.kind].name}: ${waiting} waiting`, status: 'blocked', buildingId: building.id });
  });
  return entries.sort((a, b) => b.priority - a.priority).slice(0, 20);
}
