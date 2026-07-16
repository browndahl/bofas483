import type {
  ExpeditionChoice,
  OutpostState,
  RegionDiscoveryKind,
  RegionId,
  RegionProgressState,
  RegionalVisitorState,
  SupplyRouteState,
  WorldState
} from './worldState';
import { appendWorldEvent, makeCreature } from './worldState';

const REGION_IDS: RegionId[] = ['lumen-field', 'whisper-grove', 'mirror-marsh', 'old-signal-ridge', 'aurora-basin'];
const HAZARDS: Record<RegionId, RegionProgressState['hazard']> = {
  'lumen-field': 'none',
  'whisper-grove': 'thorns',
  'mirror-marsh': 'flood',
  'old-signal-ridge': 'storm',
  'aurora-basin': 'radiance'
};
const DISCOVERIES: Record<Exclude<RegionId, 'lumen-field'>, RegionDiscoveryKind> = {
  'whisper-grove': 'seed-vault',
  'mirror-marsh': 'memory-ruin',
  'old-signal-ridge': 'signal-array',
  'aurora-basin': 'living-archive'
};
const VISITOR_NAMES = ['Ari-Ve', 'Belo', 'Cinder-9', 'Dewlet', 'Eko-Rin', 'Fara', 'Glim', 'Hush-4'];
const VISITOR_TRAITS = ['root-listener', 'marsh-reader', 'storm-calm', 'archive-dreamer'];
const REGION_META: Record<RegionId, { name: string; level: number }> = {
  'lumen-field': { name: 'Lumen Field', level: 1 },
  'whisper-grove': { name: 'Whisper Grove', level: 2 },
  'mirror-marsh': { name: 'Mirror Marsh', level: 3 },
  'old-signal-ridge': { name: 'Old Signal Ridge', level: 4 },
  'aurora-basin': { name: 'Aurora Basin', level: 5 }
};

export function createRegionProgress(): Record<RegionId, RegionProgressState> {
  return REGION_IDS.reduce<Record<RegionId, RegionProgressState>>((progress, regionId) => {
    progress[regionId] = {
      regionId,
      scouting: regionId === 'lumen-field' ? 100 : 0,
      status: regionId === 'lumen-field' ? 'settled' : 'locked',
      hazard: HAZARDS[regionId],
      discovered: [],
      preserved: regionId === 'lumen-field',
      visits: regionId === 'lumen-field' ? 1 : 0
    };
    return progress;
  }, {} as Record<RegionId, RegionProgressState>);
}

export function ensureRegionalWorld(world: WorldState) {
  const defaults = createRegionProgress();
  world.livingWorld.activeRegion ??= 'lumen-field';
  world.livingWorld.regionProgress = { ...defaults, ...world.livingWorld.regionProgress };
  REGION_IDS.forEach((regionId) => {
    const current = world.livingWorld.regionProgress[regionId];
    world.livingWorld.regionProgress[regionId] = { ...defaults[regionId], ...current, discovered: current?.discovered ?? [] };
    if (world.livingWorld.unlockedRegions.includes(regionId) && world.livingWorld.regionProgress[regionId].status === 'locked') {
      world.livingWorld.regionProgress[regionId].status = 'permitted';
    }
  });
  world.livingWorld.outposts ??= [];
  world.livingWorld.supplyRoutes ??= [];
  world.livingWorld.regionalVisitors ??= [];
}

function journal(world: WorldState, id: string, title: string, detail: string) {
  if (world.livingWorld.journal.some((entry) => entry.id === id)) return;
  world.livingWorld.journal.push({ id, at: world.time, category: 'discovery', title, detail });
  if (world.livingWorld.journal.length > 120) world.livingWorld.journal.splice(0, world.livingWorld.journal.length - 120);
}

export function recordRegionScouting(world: WorldState, regionId: Exclude<RegionId, 'lumen-field'>, success: boolean) {
  ensureRegionalWorld(world);
  const progress = world.livingWorld.regionProgress[regionId];
  const gain = success ? 58 : 34;
  progress.scouting = Math.min(100, progress.scouting + gain);
  progress.visits++;
  if (progress.scouting >= 100) progress.status = world.livingWorld.outposts.some((outpost) => outpost.regionId === regionId) ? 'settled' : 'scouted';
  else progress.status = 'permitted';
  return gain;
}

export function recordRegionDecision(world: WorldState, regionId: Exclude<RegionId, 'lumen-field'>, choice: ExpeditionChoice) {
  const progress = world.livingWorld.regionProgress[regionId];
  const discovery = DISCOVERIES[regionId];
  if (!progress.discovered.includes(discovery)) progress.discovered.push(discovery);
  progress.preserved = choice === 'preserve';
  journal(world, `regional-discovery-${regionId}`, `${REGION_META[regionId].name}: ${discovery.replaceAll('-', ' ')}`, choice === 'preserve'
    ? 'The discovery remains alive and improves sustainable outpost production.'
    : 'The discovery was opened for faster industrial supply routes.');
}

export function establishOutpost(world: WorldState, regionId: Exclude<RegionId, 'lumen-field'>) {
  ensureRegionalWorld(world);
  const progress = world.livingWorld.regionProgress[regionId];
  if (!world.livingWorld.unlockedRegions.includes(regionId)) return { ok: false, reason: 'The regional permit is locked' };
  if (progress.scouting < 100) return { ok: false, reason: `Scout ${100 - Math.floor(progress.scouting)}% more of the region first` };
  if (world.livingWorld.outposts.some((outpost) => outpost.regionId === regionId)) return { ok: false, reason: 'This region already has an outpost' };
  const cost = { glow: 80 + REGION_META[regionId].level * 12, alloy: 24 + REGION_META[regionId].level * 6 };
  if (world.resources.glow < cost.glow || world.resources.alloy < cost.alloy) return { ok: false, reason: `Outpost needs ${cost.glow} GLOW and ${cost.alloy} ALLOY` };
  world.resources.glow -= cost.glow; world.resources.alloy -= cost.alloy;
  const outpost: OutpostState = {
    id: `outpost-${regionId}`, regionId, name: `${REGION_META[regionId].name} Relay`, level: 1, condition: 100,
    staffIds: [], storage: { glow: 0, alloy: 0 }, storageCapacity: 120, supplies: { glow: 40, alloy: 12 }, lastTickAt: world.time
  };
  world.livingWorld.outposts.push(outpost); progress.status = 'settled';
  appendWorldEvent(world, { type: 'outpost_established', at: world.time, payload: { regionId, outpostId: outpost.id, cost } });
  journal(world, `outpost-${regionId}`, `${outpost.name} established`, 'The colony can now station Luma here and connect a persistent supply route.');
  return { ok: true, outpostId: outpost.id };
}

export function assignOutpostStaff(world: WorldState, outpostId: string, creatureId: string) {
  const outpost = world.livingWorld.outposts.find((candidate) => candidate.id === outpostId);
  const creature = world.creatures.find((candidate) => candidate.id === creatureId && candidate.alive);
  if (!outpost || !creature) return false;
  const assigned = outpost.staffIds.includes(creatureId);
  if (!assigned && creature.expeditionId) return false;
  if (!assigned && outpost.staffIds.length >= 4) return false;
  if (assigned) {
    outpost.staffIds = outpost.staffIds.filter((id) => id !== creatureId);
    creature.expeditionId = undefined; creature.x = 740; creature.y = 530; creature.target = { x: 740, y: 530 };
    creature.currentConcern = 'Returned from regional outpost duty';
  } else {
    outpost.staffIds.push(creatureId); creature.expeditionId = outpost.id;
    creature.x = 720 + outpost.staffIds.length * 55; creature.y = 520 + outpost.staffIds.length % 2 * 45; creature.target = { x: creature.x, y: creature.y };
    creature.currentConcern = `Stationed at ${outpost.name}`; creature.task = 'work';
  }
  creature.navigationPath = []; creature.navigationTarget = undefined;
  appendWorldEvent(world, { type: 'outpost_staff', at: world.time, payload: { outpostId, creatureId, assigned: !assigned } });
  return true;
}

export function createSupplyRoute(world: WorldState, outpostId: string) {
  const outpost = world.livingWorld.outposts.find((candidate) => candidate.id === outpostId);
  if (!outpost) return { ok: false, reason: 'Outpost not found' };
  const existing = world.livingWorld.supplyRoutes.find((route) => route.regionId === outpost.regionId);
  if (existing) { existing.active = !existing.active; return { ok: true, active: existing.active }; }
  const cost = { glow: 45, alloy: 15 };
  if (world.resources.glow < cost.glow || world.resources.alloy < cost.alloy) return { ok: false, reason: 'A new route needs 45 GLOW and 15 ALLOY' };
  world.resources.glow -= cost.glow; world.resources.alloy -= cost.alloy;
  const progress = world.livingWorld.regionProgress[outpost.regionId];
  const route: SupplyRouteState = {
    id: `route-${outpost.regionId}`, regionId: outpost.regionId, active: true,
    throughput: progress.preserved ? 0.82 : 1, risk: REGION_META[outpost.regionId].level * 0.04,
    nextDeliveryAt: world.time + 60, delivered: { glow: 0, alloy: 0 }
  };
  world.livingWorld.supplyRoutes.push(route);
  appendWorldEvent(world, { type: 'supply_route_created', at: world.time, payload: { regionId: outpost.regionId } });
  return { ok: true, active: true };
}

function updateOutpost(world: WorldState, outpost: OutpostState, seconds: number) {
  const staff = outpost.staffIds.map((id) => world.creatures.find((creature) => creature.id === id && creature.alive)).filter((creature) => creature !== undefined);
  const region = world.livingWorld.regionProgress[outpost.regionId];
  const hazardPressure = REGION_META[outpost.regionId].level * 0.004 * seconds;
  const supplyFactor = outpost.supplies.glow > 0 ? 1 : 0.35;
  const skill = staff.reduce((sum, creature) => sum + creature.skills.exploration, 0) / Math.max(1, staff.length);
  const repairSkill = staff.reduce((sum, creature) => sum + creature.skills.building, 0) / Math.max(1, staff.length);
  const preservedBonus = region.preserved ? 1.16 : 1;
  const conditionFactor = 0.35 + outpost.condition / 100 * 0.65;
  const output = staff.length * (0.09 + skill / 1000) * supplyFactor * preservedBonus * conditionFactor * seconds;
  if (staff.length) {
    outpost.storage.glow = Math.min(outpost.storageCapacity, outpost.storage.glow + output * (outpost.regionId === 'whisper-grove' ? 1.4 : 0.7));
    outpost.storage.alloy = Math.min(outpost.storageCapacity, outpost.storage.alloy + output * (outpost.regionId === 'whisper-grove' ? 0.35 : 1.1));
    outpost.supplies.glow = Math.max(0, outpost.supplies.glow - seconds * staff.length * 0.012);
    const repair = outpost.condition < 72 && outpost.supplies.alloy > 0 ? staff.length * (0.002 + repairSkill / 18000) * seconds : 0;
    if (repair > 0) outpost.supplies.alloy = Math.max(0, outpost.supplies.alloy - repair * 0.18);
    outpost.condition = Math.max(20, Math.min(100, outpost.condition - hazardPressure + repair));
    staff.forEach((creature) => {
      creature.skills.exploration = Math.min(100, creature.skills.exploration + seconds * 0.018);
      creature.needs.hunger = Math.max(45, creature.needs.hunger - seconds * 0.015);
      creature.needs.energy = Math.max(42, creature.needs.energy - seconds * 0.012);
      creature.needs.health = Math.max(55, creature.needs.health - Math.max(0, hazardPressure - 0.015));
      creature.task = outpost.condition < 45 ? 'maintain' : 'work';
      creature.lastTaskReason = `${REGION_META[outpost.regionId].name} outpost: ${outpost.condition < 45 ? 'protecting the relay from ' + region.hazard : 'gathering regional resources'}`;
    });
  }
  outpost.lastTickAt = world.time;
}

function updateRoutes(world: WorldState) {
  world.livingWorld.supplyRoutes.filter((route) => route.active).forEach((route) => {
    if (world.time < route.nextDeliveryAt) return;
    const outpost = world.livingWorld.outposts.find((candidate) => candidate.regionId === route.regionId);
    if (!outpost) return;
    const glow = Math.floor(outpost.storage.glow * route.throughput);
    const alloy = Math.floor(outpost.storage.alloy * route.throughput);
    outpost.storage.glow -= glow; outpost.storage.alloy -= alloy;
    world.resources.glow += glow; world.resources.alloy += alloy;
    outpost.supplies.glow = Math.min(80, outpost.supplies.glow + 16);
    outpost.supplies.alloy = Math.min(30, outpost.supplies.alloy + 4);
    route.delivered.glow += glow; route.delivered.alloy += alloy; route.nextDeliveryAt = world.time + 60;
    appendWorldEvent(world, { type: 'route_delivery', at: world.time, payload: { regionId: route.regionId, glow, alloy } });
  });
}

function maybeCreateVisitor(world: WorldState) {
  if (world.livingWorld.regionalVisitors.some((visitor) => visitor.status === 'waiting')) return;
  const settled = world.livingWorld.outposts.filter((outpost) => outpost.staffIds.length > 0);
  if (!settled.length || world.livingWorld.day < 3 || world.livingWorld.day % 2 !== 1) return;
  const id = `visitor-day-${world.livingWorld.day}`;
  if (world.livingWorld.regionalVisitors.some((visitor) => visitor.id === id)) return;
  const outpost = settled[(world.seed + world.livingWorld.day) % settled.length];
  const index = (world.seed + world.livingWorld.day * 3) % VISITOR_NAMES.length;
  const visitor: RegionalVisitorState = {
    id, regionId: outpost.regionId, name: VISITOR_NAMES[index], voiceStyle: ['chirpy', 'round', 'whispery', 'raspy', 'musical'][index % 5] as RegionalVisitorState['voiceStyle'],
    trait: VISITOR_TRAITS[REGION_META[outpost.regionId].level - 2] ?? 'far-wanderer', arrivedAt: world.time, expiresAt: world.time + 180, status: 'waiting'
  };
  world.livingWorld.regionalVisitors.push(visitor);
  journal(world, id, `${visitor.name} arrives at ${outpost.name}`, `A ${visitor.trait.replaceAll('-', ' ')} asks whether Habitat 483 has room for another voice.`);
}

export function resolveRegionalVisitor(world: WorldState, visitorId: string, invite: boolean) {
  const visitor = world.livingWorld.regionalVisitors.find((candidate) => candidate.id === visitorId && candidate.status === 'waiting');
  if (!visitor) return false;
  if (invite) {
    const creature = makeCreature(`c${world.creatures.length + 1}`, 780, 540);
    creature.name = visitor.name; creature.voiceStyle = visitor.voiceStyle; creature.traits.push(visitor.trait);
    creature.history.push({ at: world.time, title: `Arrived from ${REGION_META[visitor.regionId].name}`, detail: 'Joined the habitat through a regional outpost invitation.' });
    world.creatures.push(creature); visitor.status = 'joined'; world.livingWorld.reputation += 8;
  } else visitor.status = 'departed';
  appendWorldEvent(world, { type: 'regional_visitor', at: world.time, payload: { visitorId, invite } });
  return true;
}

export function updateRegionalWorld(world: WorldState, seconds: number) {
  ensureRegionalWorld(world);
  world.livingWorld.outposts.forEach((outpost) => updateOutpost(world, outpost, seconds));
  updateRoutes(world);
  world.livingWorld.regionalVisitors.filter((visitor) => visitor.status === 'waiting' && visitor.expiresAt <= world.time).forEach((visitor) => { visitor.status = 'departed'; });
  maybeCreateVisitor(world);
}

export function regionalSummary(world: WorldState) {
  const activeRoutes = world.livingWorld.supplyRoutes.filter((route) => route.active);
  return {
    settled: world.livingWorld.outposts.length,
    staffed: world.livingWorld.outposts.reduce((sum, outpost) => sum + outpost.staffIds.length, 0),
    routes: activeRoutes.length,
    storedGlow: world.livingWorld.outposts.reduce((sum, outpost) => sum + outpost.storage.glow, 0),
    storedAlloy: world.livingWorld.outposts.reduce((sum, outpost) => sum + outpost.storage.alloy, 0),
    waitingVisitors: world.livingWorld.regionalVisitors.filter((visitor) => visitor.status === 'waiting').length
  };
}
