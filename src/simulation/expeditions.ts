import type { ExpeditionChoice, ExpeditionState, RegionId, ResearchBranch, WorldState } from './worldState';
import { appendWorldEvent } from './worldState';

export interface RegionDefinition {
  id: RegionId;
  name: string;
  glyph: string;
  level: number;
  description: string;
  risk: ExpeditionState['risk'];
  duration: number;
  supply: { glow: number; alloy: number };
  discovery: string;
}

export const REGIONS: Record<RegionId, RegionDefinition> = {
  'lumen-field': { id: 'lumen-field', name: 'Lumen Field', glyph: '⌂', level: 1, description: 'The colony’s protected home clearing.', risk: 'low', duration: 0, supply: { glow: 0, alloy: 0 }, discovery: 'Home signal' },
  'whisper-grove': { id: 'whisper-grove', name: 'Whisper Grove', glyph: '♧', level: 2, description: 'Living paths, seed vaults, and voices beneath old roots.', risk: 'low', duration: 45, supply: { glow: 24, alloy: 4 }, discovery: 'Wild Seed' },
  'mirror-marsh': { id: 'mirror-marsh', name: 'Mirror Marsh', glyph: '◈', level: 3, description: 'Flooded ruins that reflect memories instead of faces.', risk: 'moderate', duration: 70, supply: { glow: 34, alloy: 9 }, discovery: 'Memory Crystal' },
  'old-signal-ridge': { id: 'old-signal-ridge', name: 'Old Signal Ridge', glyph: '⌁', level: 4, description: 'A broken transmission array above the storm line.', risk: 'high', duration: 95, supply: { glow: 48, alloy: 16 }, discovery: 'Crystals and alloy' },
  'aurora-basin': { id: 'aurora-basin', name: 'Aurora Basin', glyph: '✦', level: 5, description: 'The source of the light that first awakened Habitat 483.', risk: 'severe', duration: 125, supply: { glow: 65, alloy: 25 }, discovery: 'Living archive' }
};

const RISK_TARGET: Record<ExpeditionState['risk'], number> = { low: 30, moderate: 48, high: 64, severe: 78 };

function journal(world: WorldState, title: string, detail: string, id: string) {
  if (!world.livingWorld.journal.some((entry) => entry.id === id)) world.livingWorld.journal.push({ id, at: world.time, category: 'discovery', title, detail });
  if (world.livingWorld.journal.length > 120) world.livingWorld.journal.splice(0, world.livingWorld.journal.length - 120);
}

export function expeditionResearchCost(world: WorldState, branch: ResearchBranch) {
  const level = world.livingWorld.research[branch];
  const rp = 20 + level * 15;
  if (level < 2) return { rp } as const;
  const rare = branch === 'technology' || branch === 'exploration' ? 'memoryCrystal' : 'wildSeed';
  return { rp, rare, rareAmount: 1 + Math.floor((level - 2) / 2) } as const;
}

export function launchExpedition(world: WorldState, regionId: RegionId, creatureIds: string[]): { ok: boolean; reason?: string; expeditionId?: string } {
  const region = REGIONS[regionId];
  if (!region || regionId === 'lumen-field' || !world.livingWorld.unlockedRegions.includes(regionId)) return { ok: false, reason: 'That regional permit is still locked' };
  if (world.livingWorld.expeditions.some((item) => item.status === 'active' || item.status === 'decision')) return { ok: false, reason: 'Resolve the current expedition first' };
  const uniqueIds = [...new Set(creatureIds)].slice(0, 3);
  const team = uniqueIds.map((id) => world.creatures.find((creature) => creature.id === id && creature.alive && !creature.expeditionId)).filter((creature) => creature !== undefined);
  if (team.length < 2) return { ok: false, reason: 'Choose at least two available Luma' };
  if (world.resources.glow < region.supply.glow || world.resources.alloy < region.supply.alloy) return { ok: false, reason: 'Not enough expedition supplies' };
  world.resources.glow -= region.supply.glow; world.resources.alloy -= region.supply.alloy;
  const id = `expedition-${Math.floor(world.time)}-${world.livingWorld.expeditions.length + 1}`;
  const expedition: ExpeditionState = { id, regionId, creatureIds: team.map((creature) => creature.id), startedAt: world.time, returnAt: world.time + region.duration, status: 'active', risk: region.risk };
  world.livingWorld.expeditions.push(expedition);
  if (world.livingWorld.expeditions.length > 20) world.livingWorld.expeditions.splice(0, world.livingWorld.expeditions.length - 20);
  team.forEach((creature) => {
    creature.expeditionId = id; creature.currentConcern = `Exploring ${region.name}`;
    creature.history.push({ at: world.time, title: `Departed for ${region.name}`, detail: `Joined ${team.map((member) => member.name).join(', ')} on a regional expedition.` });
  });
  appendWorldEvent(world, { type: 'expedition_launched', at: world.time, payload: { id, regionId, creatureIds: expedition.creatureIds } });
  journal(world, `Expedition departs for ${region.name}`, `${team.map((creature) => creature.name).join(', ')} carry supplies beyond the habitat boundary.`, `${id}-depart`);
  return { ok: true, expeditionId: id };
}

export function updateExpeditions(world: WorldState) {
  for (const expedition of world.livingWorld.expeditions) {
    if (expedition.status !== 'active' || world.time < expedition.returnAt) continue;
    const region = REGIONS[expedition.regionId];
    const team = expedition.creatureIds.map((id) => world.creatures.find((creature) => creature.id === id)).filter((creature) => creature !== undefined);
    const lead = [...team].sort((a, b) => b.skills.exploration - a.skills.exploration)[0];
    const skill = team.reduce((sum, creature) => sum + creature.skills.exploration, 0) / Math.max(1, team.length);
    const resilience = team.reduce((sum, creature) => sum + creature.personality.resilience * 30, 0) / Math.max(1, team.length);
    const score = skill + resilience + world.livingWorld.research.exploration * 8 + team.length * 7 + (world.seed + expedition.id.length) % 13;
    const success = score >= RISK_TARGET[region.risk];
    const regionIndex = Math.max(1, region.level - 1);
    const glowReward = success ? 26 + regionIndex * 16 : 12 + regionIndex * 7;
    const alloyReward = success ? 8 + regionIndex * 8 : 3 + regionIndex * 3;
    const outcome = success
      ? `${lead?.name ?? 'The team'} followed a buried signal to ${region.discovery.toLowerCase()}. The site is intact, but taking from it will change what remains.`
      : `${lead?.name ?? 'The team'} led everyone home through hostile terrain. They found a damaged ${region.discovery.toLowerCase()} cache and returned shaken but alive.`;
    expedition.status = 'decision'; expedition.success = success; expedition.glowReward = glowReward; expedition.alloyReward = alloyReward; expedition.outcome = outcome;
    world.resources.glow += glowReward; world.resources.alloy += alloyReward; world.livingWorld.reputation += success ? 8 + regionIndex * 2 : 3;
    team.forEach((creature, index) => {
      creature.expeditionId = undefined; creature.x = 740 + index * 54; creature.y = 530 + index * 18; creature.target = { x: creature.x, y: creature.y };
      creature.navigationPath = []; creature.navigationTarget = undefined; creature.destinationBuildingId = undefined; creature.destinationCreatureId = undefined;
      creature.needs.energy = Math.max(28, creature.needs.energy - (success ? 18 : 30)); creature.needs.hunger = Math.max(30, creature.needs.hunger - 14);
      creature.needs.health = Math.max(35, creature.needs.health - (success ? 4 : 18)); creature.skills.exploration = Math.min(100, creature.skills.exploration + (success ? 10 : 6));
      creature.currentConcern = 'Waiting for the colony to decide what the expedition means';
      creature.history.push({ at: world.time, title: `Returned from ${region.name}`, detail: outcome });
    });
    appendWorldEvent(world, { type: 'expedition_complete', at: world.time, payload: { id: expedition.id, regionId: region.id, success, glowReward, alloyReward } });
    journal(world, `${region.name} expedition returns`, `${outcome} Decision required: preserve the site or salvage its relics.`, `${expedition.id}-return`);
  }
}

export function resolveExpeditionDecision(world: WorldState, expeditionId: string, choice: ExpeditionChoice): boolean {
  const expedition = world.livingWorld.expeditions.find((item) => item.id === expeditionId && item.status === 'decision');
  if (!expedition) return false;
  const region = REGIONS[expedition.regionId]; expedition.status = 'complete'; expedition.choice = choice;
  if (choice === 'preserve') {
    world.livingWorld.rareResources.wildSeed += 2; world.livingWorld.reputation += 10; world.profile.sustainability += 2; world.profile.empathy += 1;
  } else {
    world.livingWorld.rareResources.memoryCrystal += 1; world.resources.alloy += 20; world.livingWorld.reputation += 6; world.profile.ambition += 2; world.profile.exploitation += 1;
  }
  expedition.creatureIds.forEach((id) => {
    const creature = world.creatures.find((item) => item.id === id); if (!creature) return;
    creature.currentConcern = choice === 'preserve' ? 'Proud the discovery was protected' : 'Wondering what the salvaged relic remembers';
  });
  const detail = choice === 'preserve'
    ? `The colony protects ${region.name}. +2 Wild Seed, +10 reputation, and a more sustainable future.`
    : `The colony salvages the relic. +1 Memory Crystal, +20 ALLOY, and a more ambitious future.`;
  appendWorldEvent(world, { type: 'expedition_decision', at: world.time, payload: { id: expedition.id, regionId: region.id, choice } });
  journal(world, `${region.name}: ${choice === 'preserve' ? 'site preserved' : 'relic salvaged'}`, detail, `${expedition.id}-decision`);
  return true;
}
