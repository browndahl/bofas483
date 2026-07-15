import type {
  AmbitionKind,
  BuildingKind,
  CreatureAmbition,
  CreaturePersonality,
  CreaturePreferences,
  CreatureRole,
  CreatureSkills,
  CreatureState,
  PreferenceActivity,
  SkillKey,
  TaskType
} from './worldState';

export const SKILL_KEYS: SkillKey[] = ['foraging', 'caregiving', 'healing', 'building', 'research', 'exploration'];

export const SKILL_LABELS: Record<SkillKey, string> = {
  foraging: 'FORAGE',
  caregiving: 'CARE',
  healing: 'HEAL',
  building: 'BUILD',
  research: 'RESEARCH',
  exploration: 'EXPLORE'
};

export const ROLE_LABELS: Record<CreatureRole, string> = {
  forager: 'FORAGER',
  caretaker: 'CARETAKER',
  healer: 'HEALER',
  builder: 'BUILDER',
  researcher: 'RESEARCHER',
  explorer: 'EXPLORER'
};

export const ROLE_SKILL: Record<CreatureRole, SkillKey> = {
  forager: 'foraging',
  caretaker: 'caregiving',
  healer: 'healing',
  builder: 'building',
  researcher: 'research',
  explorer: 'exploration'
};

export const ACTIVITY_LABELS: Record<PreferenceActivity, string> = {
  gathering: 'GATHERING',
  caring: 'CARING',
  healing: 'HEALING',
  making: 'MAKING',
  learning: 'LEARNING',
  exploring: 'EXPLORING'
};

const ROLE_BUILDING: Record<CreatureRole, BuildingKind> = {
  forager: 'nutrient-bed',
  caretaker: 'resonance-garden',
  healer: 'clinic',
  builder: 'extractor',
  researcher: 'wash-pool',
  explorer: 'nest'
};

const ROLE_ACTIVITY: Record<CreatureRole, PreferenceActivity> = {
  forager: 'gathering',
  caretaker: 'caring',
  healer: 'healing',
  builder: 'making',
  researcher: 'learning',
  explorer: 'exploring'
};

function stableNumber(id: string, salt: number) {
  let value = salt;
  for (let index = 0; index < id.length; index++) value = (value * 31 + id.charCodeAt(index)) >>> 0;
  return value;
}

export function createCreatureSkills(id: string): CreatureSkills {
  return Object.fromEntries(SKILL_KEYS.map((key, index) => [key, 4 + stableNumber(id, 97 + index * 17) % 8])) as CreatureSkills;
}

export function chooseCreatureRole(personality: CreaturePersonality, id: string): CreatureRole {
  const scores: Array<[CreatureRole, number]> = [
    ['forager', personality.resilience * 0.55 + personality.diligence * 0.35],
    ['caretaker', personality.empathy * 0.75 + personality.sociability * 0.25],
    ['healer', personality.empathy * 0.55 + personality.diligence * 0.35 + personality.resilience * 0.1],
    ['builder', personality.diligence * 0.72 + personality.resilience * 0.28],
    ['researcher', personality.curiosity * 0.62 + personality.diligence * 0.38],
    ['explorer', personality.curiosity * 0.72 + personality.resilience * 0.28]
  ];
  const offset = stableNumber(id, 41) % scores.length;
  return scores.map(([role, score], index) => [role, score + (index === offset ? 0.04 : 0)] as [CreatureRole, number]).sort((a, b) => b[1] - a[1])[0][0];
}

export function createCreaturePreferences(role: CreatureRole, id: string): CreaturePreferences {
  const buildingOptions = Object.values(ROLE_BUILDING);
  const favoriteBuilding = stableNumber(id, 73) % 5 === 0 ? buildingOptions[stableNumber(id, 17) % buildingOptions.length] : ROLE_BUILDING[role];
  return { favoriteBuilding, favoriteActivity: ROLE_ACTIVITY[role] };
}

function ambitionDescription(kind: AmbitionKind, skill?: SkillKey) {
  if (kind === 'friendships') return 'Form 3 close friendships';
  return `Reach level 5 in ${SKILL_LABELS[skill ?? 'exploration'].toLowerCase()}`;
}

export function createCreatureAmbition(role: CreatureRole, id: string): CreatureAmbition {
  const social = stableNumber(id, 131) % 4 === 0;
  const kind: AmbitionKind = social ? 'friendships' : 'master-skill';
  const skill = social ? undefined : ROLE_SKILL[role];
  return { kind, skill, progress: 0, target: social ? 3 : 75, description: ambitionDescription(kind, skill) };
}

export function ensureCreatureLife(creature: CreatureState) {
  creature.role ??= chooseCreatureRole(creature.personality, creature.id);
  creature.skills ??= createCreatureSkills(creature.id);
  creature.preferences ??= createCreaturePreferences(creature.role, creature.id);
  creature.ambition ??= createCreatureAmbition(creature.role, creature.id);
  creature.queueIndex ??= 0;
  creature.isBeingServed ??= false;
  updateAmbition(creature);
}

export function trainSkill(creature: CreatureState, key: SkillKey, seconds: number, multiplier = 1) {
  const roleBonus = ROLE_SKILL[creature.role] === key ? 1.3 : 1;
  creature.skills[key] = Math.min(100, creature.skills[key] + seconds * 0.34 * roleBonus * multiplier);
  updateAmbition(creature);
}

export function updateAmbition(creature: CreatureState) {
  if (creature.ambition.kind === 'friendships') {
    creature.ambition.progress = Object.values(creature.bonds).filter((strength) => strength >= 50).length;
  } else if (creature.ambition.skill) creature.ambition.progress = creature.skills[creature.ambition.skill];
}

export function skillLevel(value: number) { return Math.min(5, 1 + Math.floor(Math.max(0, value) / 20)); }

export function skillForTask(task: TaskType): SkillKey | undefined {
  if (task === 'eat') return 'foraging';
  if (task === 'comfort' || task === 'socialize') return 'caregiving';
  if (task === 'heal') return 'healing';
  if (task === 'work') return 'building';
  if (task === 'play' || task === 'bathe') return 'research';
  if (task === 'wander') return 'exploration';
  return undefined;
}

export function skillEfficiency(creature: CreatureState, key: SkillKey) {
  return 1 + (skillLevel(creature.skills[key]) - 1) * 0.055;
}
