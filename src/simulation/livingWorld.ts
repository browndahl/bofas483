import type { BuildingState, CreatureState, GameEvent, JournalEntry, LivingWorldState, RegionId, ResearchBranch, WorldState } from './worldState';
import { appendWorldEvent } from './worldState';
import { updateExpeditions } from './expeditions';
import { updateColonyStories } from './colonyStories';

export const RESEARCH_BRANCHES: Record<ResearchBranch, { name: string; description: string; bonus: string }> = {
  care: { name: 'CARE', description: 'Gentler recovery and stronger offline safety.', bonus: '+5% care efficiency per level' },
  nature: { name: 'NATURE', description: 'Cleaner facilities and richer rare discoveries.', bonus: '-6% pollution per level' },
  technology: { name: 'TECHNOLOGY', description: 'Faster construction and resource output.', bonus: '+5% work speed per level' },
  society: { name: 'SOCIETY', description: 'Faster bonding, teaching, and conflict recovery.', bonus: '+6% social growth per level' },
  exploration: { name: 'EXPLORATION', description: 'New regions, discoveries, and resilient travel.', bonus: '+5% discovery chance per level' }
};

const WEATHERS = ['clear', 'mist', 'rain', 'wind', 'storm'] as const;
const SEASONS = ['bloom', 'suncrest', 'amberfall', 'frostquiet'] as const;
const TITLES = ['Tender Signal', 'Growing Chorus', 'Kindred Habitat', 'Luminous Commonwealth', 'Keeper of the Field'];
const DAILY_EVENTS = [
  ['dewfall', 'A silver dewfall coats the habitat.', 'The Dew Looms produce a little extra glow.'],
  ['shared-song', 'The colony discovers a shared song.', 'Social bonds feel easier today.'],
  ['ruin-signal', 'A faint signal rises from the old stones.', 'Explorers recover a memory crystal.'],
  ['seed-drift', 'Rare seeds drift in from the outer forest.', 'The habitat stores them for future growth.'],
  ['quiet-day', 'The field settles into a gentle quiet.', 'Rest restores the colony’s rhythm.'],
  ['visitor', 'A wandering Luma watches from the tree line.', 'Kind colonies earn reputation with distant travelers.'],
  ['request', 'A personal request enters the colony journal.', 'One Luma asks the habitat for companionship.'],
  ['spore-cough', 'Pale spores drift across the lower field.', 'Prepared clinics prevent the worst of a brief illness.']
] as const;

export function createLivingWorld(): LivingWorldState {
  return {
    reputation: 0,
    level: 1,
    title: TITLES[0],
    researchPoints: 0,
    research: { care: 0, nature: 0, technology: 0, society: 0, exploration: 0 },
    unlockedRegions: ['lumen-field'],
    rareResources: { memoryCrystal: 0, wildSeed: 0 },
    expeditions: [],
    day: 1,
    dayTime: 0.28,
    season: 'bloom',
    weather: 'clear',
    weatherTimer: 80,
    lastDailyEventDay: 0,
    alerts: [],
    journal: [{ id: 'awakening', at: 0, category: 'discovery', title: 'Habitat 483 awakens', detail: 'Pip-01 answered the first signal.' }],
    personalRequests: [],
    storyEvents: [],
    lastRequestDay: 0,
    lastStoryDay: 0,
    lastGroupActivityAt: 0,
    challenges: [
      { id: 'gentle-day', title: 'Gentle Day', description: 'Keep every living Luma above 50 integrity.', progress: 0, target: 1, complete: false },
      { id: 'living-network', title: 'Living Network', description: 'Form five close friendships.', progress: 0, target: 5, complete: false },
      { id: 'master-builder', title: 'Master Builder', description: 'Complete three facility upgrades.', progress: 0, target: 3, complete: false },
      { id: 'specialized-habitat', title: 'Specialized Habitat', description: 'Complete three upgrades on the same Quality or Capacity path.', progress: 0, target: 3, complete: false },
      { id: 'six-fold-network', title: 'Six-Fold Network', description: 'Upgrade one of every facility type.', progress: 0, target: 6, complete: false }
    ],
    settings: {
      muted: false, voiceVolume: 0.7, ambienceVolume: 0.38, textScale: 1.1, highContrast: false, colorBlind: false,
      reducedMotion: false, screenShake: true, lowPower: false, quality: 'high', offlineLimitMinutes: 15, simulationSpeed: 1, paused: false,
      subtitles: true, tutorial: true, alertLevel: 'all'
    },
    telemetry: { averageTickMs: 0, peakTickMs: 0, fps: 60, creatures: 1, visibleCreatures: 1, pathRecoveries: 0 },
    saveVersion: 5
  };
}

export function ensureLivingWorld(world: WorldState) {
  const defaults = createLivingWorld();
  world.livingWorld ??= defaults;
  world.livingWorld.research = { ...defaults.research, ...world.livingWorld.research };
  world.livingWorld.rareResources = { ...defaults.rareResources, ...world.livingWorld.rareResources };
  world.livingWorld.settings = { ...defaults.settings, ...world.livingWorld.settings };
  world.livingWorld.telemetry = { ...defaults.telemetry, ...world.livingWorld.telemetry };
  world.livingWorld.unlockedRegions ??= ['lumen-field'];
  world.livingWorld.expeditions ??= [];
  world.livingWorld.alerts ??= [];
  world.livingWorld.journal ??= defaults.journal;
  world.livingWorld.personalRequests ??= [];
  world.livingWorld.storyEvents ??= [];
  world.livingWorld.lastRequestDay ??= 0;
  world.livingWorld.lastStoryDay ??= 0;
  world.livingWorld.lastGroupActivityAt ??= 0;
  world.livingWorld.challenges ??= [];
  defaults.challenges.forEach((challenge) => {
    if (!world.livingWorld.challenges.some((candidate) => candidate.id === challenge.id)) world.livingWorld.challenges.push({ ...challenge });
  });
  if ((world.livingWorld.saveVersion ?? 2) < 3) {
    world.livingWorld.settings.textScale = Math.max(1.1, world.livingWorld.settings.textScale);
  }
  world.livingWorld.saveVersion = 5;
}

export function addJournal(world: WorldState, entry: Omit<JournalEntry, 'id' | 'at'> & { id?: string; at?: number }) {
  const id = entry.id ?? `${entry.category}-${Math.floor(world.time)}-${world.livingWorld.journal.length}`;
  if (world.livingWorld.journal.some((item) => item.id === id)) return;
  world.livingWorld.journal.push({ ...entry, id, at: entry.at ?? world.time });
  if (world.livingWorld.journal.length > 120) world.livingWorld.journal.splice(0, world.livingWorld.journal.length - 120);
}

function addAlert(world: WorldState, id: string, severity: 'info' | 'warning' | 'critical', title: string, detail: string, target: Partial<Pick<WorldState['livingWorld']['alerts'][number], 'creatureId' | 'buildingId' | 'actionLabel'>> = {}) {
  const preference = world.livingWorld.settings.alertLevel;
  if ((preference === 'critical' && severity !== 'critical') || (preference === 'important' && severity === 'info')) return;
  const existing = world.livingWorld.alerts.find((alert) => alert.id === id);
  if (existing) { existing.at = world.time; existing.detail = detail; Object.assign(existing, target); return; }
  world.livingWorld.alerts.push({ id, severity, title, detail, at: world.time, dismissed: false, ...target });
  if (world.livingWorld.alerts.length > 20) world.livingWorld.alerts.shift();
}

function relationshipPairs(creatures: CreatureState[], minimum: number) {
  const pairs = new Set<string>();
  creatures.forEach((creature) => Object.entries(creature.bonds).forEach(([partner, strength]) => {
    if (strength >= minimum) pairs.add([creature.id, partner].sort().join(':'));
  }));
  return pairs.size;
}

function updateChallenges(world: WorldState) {
  const living = world.creatures.filter((creature) => creature.alive);
  const values: Record<string, number> = {
    'gentle-day': world.livingWorld.day >= 2 && living.length > 0 && living.every((creature) => creature.needs.health >= 50) ? 1 : 0,
    'living-network': relationshipPairs(living, 50),
    'master-builder': world.buildings.filter((building) => building.level >= 2 && !building.constructing).length,
    'specialized-habitat': Math.max(
      world.buildings.filter((building) => building.level >= 2 && !building.constructing && building.upgradeBranch === 'quality').length,
      world.buildings.filter((building) => building.level >= 2 && !building.constructing && building.upgradeBranch === 'capacity').length
    ),
    'six-fold-network': new Set(world.buildings.filter((building) => building.level >= 2 && !building.constructing).map((building) => building.kind)).size
  };
  world.livingWorld.challenges.forEach((challenge) => {
    challenge.progress = Math.min(challenge.target, values[challenge.id] ?? challenge.progress);
    if (!challenge.complete && challenge.progress >= challenge.target) {
      challenge.complete = true; world.resources.glow += 30; world.livingWorld.reputation += 12;
      addJournal(world, { id: `challenge-${challenge.id}`, category: 'milestone', title: `Challenge complete: ${challenge.title}`, detail: '+30 GLOW and +12 reputation.' });
    }
  });
}

function updateAlerts(world: WorldState) {
  const living = world.creatures.filter((creature) => creature.alive);
  const hungry = living.filter((creature) => creature.needs.hunger < 25).length;
  const sick = living.filter((creature) => creature.needs.health < 45).length;
  const lonely = living.filter((creature) => creature.needs.happiness < 30).length;
  const queues = world.buildings.filter((building) => world.creatures.filter((creature) => creature.destinationBuildingId === building.id && !creature.isBeingServed).length >= 3);
  const blocked = living.find((creature) => creature.stuckTimer > 1.2);
  const request = world.livingWorld.personalRequests.find((item) => item.status === 'active');
  const story = world.livingWorld.storyEvents.find((item) => item.status === 'decision');
  const worn = world.buildings.find((building) => !building.constructing && building.durability < 35 && !building.maintenanceFunded);
  const managed = new Set(['silent-colony', 'food-shortage', 'illness', 'loneliness', 'overcrowding', 'blocked-route', 'maintenance-shortage']);
  const active = new Set<string>();
  if (!living.length) active.add('silent-colony');
  if (hungry) active.add('food-shortage');
  if (sick) active.add('illness');
  if (lonely) active.add('loneliness');
  if (queues.length) active.add('overcrowding');
  if (blocked) active.add('blocked-route');
  if (worn) active.add('maintenance-shortage');
  if (request) active.add(`personal-request:${request.id}`);
  if (story) active.add(`story-decision:${story.id}`);
  world.livingWorld.alerts = world.livingWorld.alerts.filter((alert) => {
    const managedAlert = managed.has(alert.id) || alert.id.startsWith('personal-request:') || alert.id.startsWith('story-decision:');
    return !managedAlert || active.has(alert.id);
  });
  if (!living.length) addAlert(world, 'silent-colony', 'critical', 'The habitat is silent', 'Use Recovery Options to restore a living signal without erasing colony history.');
  const hungriest = [...living].sort((a, b) => a.needs.hunger - b.needs.hunger)[0];
  const sickest = [...living].sort((a, b) => a.needs.health - b.needs.health)[0];
  const loneliest = [...living].sort((a, b) => a.needs.happiness - b.needs.happiness)[0];
  if (hungry && hungriest) addAlert(world, 'food-shortage', hungry > 2 ? 'critical' : 'warning', `${hungriest.name} needs nourishment`, `${hungriest.name} is at ${Math.round(hungriest.needs.hunger)}%. Build a Dew Loom or select them and FEED.`, { creatureId: hungriest.id, actionLabel: 'SHOW LUMA' });
  if (sick && sickest) addAlert(world, 'illness', sick > 2 ? 'critical' : 'warning', `${sickest.name} needs treatment`, `${sickest.name} has ${Math.round(sickest.needs.health)}% integrity. Build a Mending Prism or reduce nearby pollution.`, { creatureId: sickest.id, actionLabel: 'SHOW LUMA' });
  if (lonely && loneliest) addAlert(world, 'loneliness', 'warning', `${loneliest.name} feels alone`, `${loneliest.name} has ${Math.round(loneliest.needs.happiness)}% resonance. Add a Chime Grove, PLAY, or answer their social request.`, { creatureId: loneliest.id, actionLabel: 'SHOW LUMA' });
  if (queues.length) {
    const building = queues[0];
    addAlert(world, 'overcrowding', 'warning', 'Facility queue is blocking care', `${building.kind.replaceAll('-', ' ')} has 3+ waiting Luma. Add a capacity upgrade or a second facility.`, { buildingId: building.id, actionLabel: 'SHOW BUILDING' });
  }
  if (blocked) addAlert(world, 'blocked-route', 'warning', `${blocked.name} cannot reach the destination`, `${blocked.name}'s ${blocked.task} route is blocked or overcrowded. Move the obstruction, add facility capacity, or let automatic path recovery retry.`, { creatureId: blocked.id, actionLabel: 'SHOW LUMA' });
  if (worn) addAlert(world, 'maintenance-shortage', worn.durability <= 10 ? 'critical' : 'warning', `${worn.kind.replaceAll('-', ' ')} needs maintenance`, `Durability is ${Math.round(worn.durability)}%. Fund repairs from the building panel or enable automatic maintenance.`, { buildingId: worn.id, actionLabel: 'SHOW BUILDING' });
  if (request) {
    const creature = world.creatures.find((candidate) => candidate.id === request.creatureId);
    addAlert(world, `personal-request:${request.id}`, 'info', request.title, `${creature?.name ?? 'A Luma'} is waiting for an answer in COLONY → SOCIAL.`, { creatureId: request.creatureId, actionLabel: 'OPEN SOCIAL' });
  }
  if (story) addAlert(world, `story-decision:${story.id}`, 'info', story.title, `Stage ${story.stage}/2 is waiting in COLONY → SOCIAL. Your choice changes bonds and colony history.`, { actionLabel: 'OPEN SOCIAL' });
  world.livingWorld.alerts = world.livingWorld.alerts.filter((alert) => world.time - alert.at < 180 || !alert.dismissed);
}

function dailyEvent(world: WorldState) {
  const day = world.livingWorld.day;
  if (day <= 1) return;
  if (world.livingWorld.lastDailyEventDay >= day) return;
  world.livingWorld.lastDailyEventDay = day;
  const event = DAILY_EVENTS[(world.seed + day * 7) % DAILY_EVENTS.length];
  const living = world.creatures.filter((creature) => creature.alive);
  const featured = living.length ? living[(world.seed + day * 11) % living.length] : undefined;
  if (event[0] === 'ruin-signal') world.livingWorld.rareResources.memoryCrystal++;
  if (event[0] === 'seed-drift') world.livingWorld.rareResources.wildSeed += 2;
  if (event[0] === 'dewfall') world.resources.glow += 8;
  if (event[0] === 'visitor') world.livingWorld.reputation += living.length && living.every((creature) => creature.needs.happiness > 45) ? 6 : 2;
  if (event[0] === 'request' && featured) { featured.needs.happiness = Math.max(0, featured.needs.happiness - 5); featured.currentConcern = 'Hoping someone will answer a personal request'; }
  if (event[0] === 'spore-cough') {
    const clinic = world.buildings.some((building) => building.kind === 'clinic' && building.active);
    living.forEach((creature) => { creature.needs.health = Math.max(18, creature.needs.health - (clinic ? 2 : 8)); });
    addAlert(world, `spores-${day}`, clinic ? 'warning' : 'critical', 'Spore weather', clinic ? 'The clinic contained a mild outbreak.' : 'A clinic would protect the colony from future spores.');
  }
  const detail = featured && (event[0] === 'request' || event[0] === 'shared-song') ? `${featured.name}: ${event[2]}` : event[2];
  addJournal(world, { id: `daily-${day}`, category: 'event', title: event[1], detail });
  appendWorldEvent(world, { type: 'daily_colony_event', at: world.time, payload: { id: event[0], day } });
}

export function updateLivingWorld(world: WorldState, seconds: number) {
  ensureLivingWorld(world);
  updateExpeditions(world);
  const living = world.creatures.filter((creature) => creature.alive);
  const averageWellbeing = living.length ? living.reduce((sum, creature) => sum + Object.values(creature.needs).reduce((a, b) => a + b, 0) / 5, 0) / living.length : 0;
  world.livingWorld.dayTime = (world.livingWorld.dayTime + seconds / 240) % 1;
  world.livingWorld.day = Math.max(1, Math.floor(world.time / 240) + 1);
  world.livingWorld.season = SEASONS[Math.floor((world.livingWorld.day - 1) / 5) % SEASONS.length];
  world.livingWorld.weatherTimer -= seconds;
  if (world.livingWorld.weatherTimer <= 0) {
    const index = (world.seed + world.livingWorld.day * 13 + Math.floor(world.time / 60)) % WEATHERS.length;
    world.livingWorld.weather = WEATHERS[index]; world.livingWorld.weatherTimer = 70 + index * 18;
    addJournal(world, { category: 'weather', title: `${world.livingWorld.weather.toUpperCase()} crosses the field`, detail: `The ${world.livingWorld.season} habitat adjusts its rhythm.` });
  }
  if (averageWellbeing >= 65) world.livingWorld.reputation += seconds * living.length * 0.003;
  world.livingWorld.researchPoints += seconds * living.filter((creature) => creature.needs.health > 55 && creature.needs.happiness > 45).length * 0.03;
  const level = Math.min(5, 1 + Math.floor(world.livingWorld.reputation / 45));
  if (level > world.livingWorld.level) {
    world.livingWorld.level = level; world.resources.glow += level * 20; world.livingWorld.title = TITLES[level - 1];
    addJournal(world, { id: `colony-level-${level}`, category: 'milestone', title: `Habitat level ${level}: ${world.livingWorld.title}`, detail: `The colony receives +${level * 20} GLOW and a new regional permit.` });
  }
  const regionNames: RegionId[] = ['lumen-field', 'whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin'];
  world.livingWorld.unlockedRegions = regionNames.slice(0, world.livingWorld.level);
  world.livingWorld.title = TITLES[world.livingWorld.level - 1];
  world.livingWorld.telemetry.creatures = living.length;
  [3, 6, 10, 25, 50, 100, 250].forEach((population) => {
    const id = `population-${population}`;
    if (living.length >= population && !world.livingWorld.journal.some((entry) => entry.id === id)) {
      world.livingWorld.reputation += Math.max(2, Math.log2(population));
      addJournal(world, { id, category: 'milestone', title: `${population} voices celebration`, detail: 'The colony gathers for a shared chorus and earns reputation.', at: world.time });
    }
  });
  dailyEvent(world);
  updateColonyStories(world, seconds);
  if (Math.floor(world.time) % 5 === 0) { updateAlerts(world); updateChallenges(world); }
}

export function researchBonus(world: WorldState, branch: ResearchBranch) { return 1 + world.livingWorld.research[branch] * 0.05; }

export function relationshipStage(strength: number) {
  return strength >= 85 ? 'LIFEBOND' : strength >= 60 ? 'CLOSE FRIEND' : strength >= 35 ? 'FRIEND' : strength >= 12 ? 'FAMILIAR' : 'STRANGER';
}

export function remember(creature: CreatureState, event: GameEvent, text: string, valence: -1 | 0 | 1 = 0) {
  creature.memories.push({ id: `${event.type}-${Math.floor(event.at)}-${creature.memories.length}`, at: event.at, text, valence });
  if (creature.memories.length > 24) creature.memories.shift();
}

export function ensureCreatureHistory(creature: CreatureState) {
  creature.assignedRole ??= creature.role;
  creature.autoRole ??= true;
  creature.stress ??= 0;
  creature.traits ??= [];
  creature.memories ??= [{ id: 'born', at: 0, text: `Born into generation ${creature.generation}.`, valence: 1 }];
  creature.history ??= [{ at: 0, title: 'Awakened', detail: `Entered the habitat as ${creature.name}.` }];
  creature.childrenIds ??= [];
  creature.favoriteFood ??= ['sun-dew', 'moss nectar', 'glow fruit'][Number(creature.id.replace(/\D/g, '')) % 3];
  creature.routeMemory ??= [];
  creature.voiceStyle ??= ['chirpy', 'round', 'whispery', 'raspy', 'musical'][Number(creature.id.replace(/\D/g, '')) % 5] as CreatureState['voiceStyle'];
  creature.voiceCooldown ??= 0;
  creature.ageMilestone ??= 0;
}

export function updateCreatureHistory(creature: CreatureState, seconds: number) {
  ensureCreatureHistory(creature);
  creature.voiceCooldown = Math.max(0, creature.voiceCooldown - seconds);
  const milestone = Math.floor(creature.age / 60);
  if (milestone > creature.ageMilestone) {
    creature.ageMilestone = milestone;
    creature.history.push({ at: creature.age, title: `Age milestone ${milestone}`, detail: `${creature.name} has lived another habitat cycle.` });
  }
  if (creature.needs.health < 35 && !creature.traits.includes('fragile')) creature.traits.push('fragile');
  if (creature.personality.resilience > 0.72 && creature.age > 90 && !creature.traits.includes('steadfast')) creature.traits.push('steadfast');
  if (Object.values(creature.bonds).some((strength) => strength >= 70) && !creature.traits.includes('devoted')) creature.traits.push('devoted');
  if (creature.skills.building >= 65 && !creature.traits.includes('craftwise')) creature.traits.push('craftwise');
  if (!creature.autoRole && creature.assignedRole !== creature.role) creature.stress = Math.min(100, creature.stress + seconds * 0.12);
  else creature.stress = Math.max(0, creature.stress - seconds * 0.08);
  if (creature.stress > 55) creature.needs.happiness = Math.max(0, creature.needs.happiness - seconds * 0.18);
  const favorite = Object.entries(creature.bonds).sort((a, b) => b[1] - a[1])[0]; creature.favoriteCompanionId = favorite?.[0];
  creature.currentConcern = creature.needs.health < 45 ? 'Needs medical care' : creature.needs.hunger < 35 ? 'Searching for nourishment' : creature.stress > 50 ? 'Unhappy with assigned work' : creature.needs.happiness < 40 ? 'Longing for company' : 'Feeling secure';
}

export function ensureBuildingLife(building: BuildingState) {
  building.upgradeBranch ??= building.level >= 2 ? 'quality' : undefined;
  building.durability ??= 100;
  building.constructionProgress ??= building.active ? 100 : 0;
  building.constructing ??= building.constructionProgress < 100;
  building.constructionWork ??= building.constructionProgress;
  building.materialsRequired ??= { glow: 0, alloy: 0 };
  building.materialsDelivered ??= building.constructing ? { glow: 0, alloy: 0 } : { ...building.materialsRequired };
  building.influenceRadius ??= 130;
  building.maintenanceMode ??= 'auto';
  building.maintenanceFunded ??= false;
}
