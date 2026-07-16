import {
  advancedUpgradeAvailability,
  advancedUpgradeCost,
  beginBuildingProject,
  BUILDINGS,
  canAfford,
  createBuilding,
  maintenanceCost,
  upgradeAvailability,
  upgradeCost,
  validateBuildingPlacement
} from '../simulation/building';
import { expeditionResearchCost, launchExpedition, resolveExpeditionDecision } from '../simulation/expeditions';
import { resolvePersonalRequest, resolveStoryChoice } from '../simulation/colonyStories';
import { addJournal, RESEARCH_BRANCHES } from '../simulation/livingWorld';
import { recoverSilentColony } from '../simulation/recovery';
import type {
  BuildingKind,
  ColonyPolicyKey,
  CreatureRole,
  CreatureSchedule,
  CreatureState,
  ExpeditionChoice,
  GameSettings,
  ManagementPriorityKey,
  NeedKey,
  PersonalRequestChoice,
  RegionId,
  ResearchBranch,
  StoryChoice,
  WorldState
} from '../simulation/worldState';
import { appendWorldEvent, createInitialWorld } from '../simulation/worldState';

type Listener = (state: WorldState) => void;

class GameStateStore {
  private state = createInitialWorld();
  private listeners = new Set<Listener>();
  private worker?: Worker;
  private lastActionError = '';

  get() { return this.state; }
  actionError() { return this.lastActionError; }
  subscribe(listener: Listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private emit() { this.listeners.forEach((listener) => listener(this.state)); }
  set(state: WorldState, send = true) { this.state = state; if (send) this.worker?.postMessage({ type: 'replace', state }); this.emit(); }
  start() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../simulation/simulationWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<{ type: string; state: WorldState }>) => {
      if (event.data.type === 'state') { this.state = event.data.state; this.emit(); }
    };
    this.worker.onerror = (event) => window.dispatchEvent(new CustomEvent('worker-error', { detail: event.message }));
    this.worker.postMessage({ type: 'start', state: this.state });
  }
  stop() { this.worker?.postMessage({ type: 'stop' }); this.worker?.terminate(); this.worker = undefined; }
  reset() { this.set(createInitialWorld()); }
  recoverColony() {
    const recovered = recoverSilentColony(this.state);
    if (!recovered) return undefined;
    this.set(recovered.state);
    return recovered.creatureId;
  }
  selectCreature(id: string): CreatureState | undefined { return this.state.creatures.find((c) => c.id === id); }
  care(id: string, need: Extract<NeedKey, 'hunger' | 'hygiene' | 'happiness'>) {
    const next = structuredClone(this.state);
    const creature = next.creatures.find((c) => c.id === id && c.alive);
    if (!creature || creature.expeditionId || next.resources.glow < 2) return false;
    const amount = next.technologies.includes('gentle-hands') ? 34 : 24;
    creature.needs[need] = Math.min(100, creature.needs[need] + amount);
    if (need === 'hunger') creature.needs.energy = Math.min(100, creature.needs.energy + 5);
    next.resources.glow -= 2;
    next.profile.empathy += 0.15;
    appendWorldEvent(next, { type: `manual_${need}`, at: next.time, payload: { creatureId: id } });
    this.set(next); return true;
  }
  place(kind: BuildingKind, x: number, y: number) {
    const next = structuredClone(this.state);
    const placement = this.canPlace(kind, x, y);
    if (!placement.ok) { this.lastActionError = placement.reason ?? 'Invalid building site'; return false; }
    const cost = BUILDINGS[kind].cost;
    next.resources.glow -= cost.glow; next.resources.alloy -= cost.alloy;
    const building = createBuilding(kind, x, y, next.buildings.length + 1);
    beginBuildingProject(building, 'new', cost);
    next.buildings.push(building);
    next.profile.ambition += kind === 'extractor' ? 2 : 0.5;
    next.profile.sustainability += BUILDINGS[kind].pollution === 0 ? 0.5 : -1;
    appendWorldEvent(next, { type: 'place_building', at: next.time, payload: { kind, x, y } });
    this.lastActionError = ''; this.set(next); return true;
  }
  upgradeBuilding(id: string, branch: 'quality' | 'capacity' = 'quality') {
    const next = structuredClone(this.state);
    const building = next.buildings.find((candidate) => candidate.id === id);
    if (!building) { this.lastActionError = 'Building not found'; return false; }
    const availability = upgradeAvailability(next.resources, next.livingWorld, building, branch);
    if (!availability.ok) { this.lastActionError = availability.reason ?? 'Upgrade unavailable'; return false; }
    const cost = upgradeCost(building, branch);
    next.resources.glow -= cost.glow; next.resources.alloy -= cost.alloy;
    building.level = 2; building.upgradeBranch = branch; beginBuildingProject(building, 'upgrade', cost);
    next.profile.ambition += 1;
    next.profile.sustainability += building.kind === 'extractor' ? 0.6 : 0.25;
    appendWorldEvent(next, { type: 'upgrade_building', at: next.time, payload: { id: building.id, kind: building.kind, level: building.level, branch } });
    addJournal(next, { category: 'milestone', title: `${branch === 'quality' ? 'Quality' : 'Capacity'} upgrade begun`, detail: `${BUILDINGS[building.kind].name} awaits skilled construction.` });
    this.lastActionError = ''; this.set(next); return true;
  }
  advanceBuilding(id: string) {
    const next = structuredClone(this.state);
    const building = next.buildings.find((candidate) => candidate.id === id);
    if (!building) { this.lastActionError = 'Building not found'; return false; }
    const availability = advancedUpgradeAvailability(next.resources, next.livingWorld, building);
    if (!availability.ok) { this.lastActionError = availability.reason ?? 'Ascendant evolution unavailable'; return false; }
    const cost = advancedUpgradeCost(building);
    next.resources.glow -= cost.glow; next.resources.alloy -= cost.alloy;
    next.livingWorld.rareResources.memoryCrystal -= cost.memoryCrystal; next.livingWorld.rareResources.wildSeed -= cost.wildSeed;
    building.level = 3; beginBuildingProject(building, 'ascend', { glow: cost.glow, alloy: cost.alloy });
    next.profile.ambition += 1.5; next.livingWorld.reputation += 5;
    appendWorldEvent(next, { type: 'advanced_upgrade', at: next.time, payload: { id: building.id, kind: building.kind, level: 3 } });
    addJournal(next, { category: 'milestone', title: `Ascendant ${BUILDINGS[building.kind].name} begun`, detail: 'Rare matter is reshaping this facility into its final form.' });
    this.lastActionError = ''; this.set(next); return true;
  }
  setMaintenanceMode(id: string, mode: 'auto' | 'manual') {
    const next = structuredClone(this.state); const building = next.buildings.find((candidate) => candidate.id === id);
    if (!building) return false;
    building.maintenanceMode = mode;
    appendWorldEvent(next, { type: 'maintenance_mode', at: next.time, payload: { buildingId: id, mode } });
    this.lastActionError = ''; this.set(next); return true;
  }
  requestMaintenance(id: string) {
    const next = structuredClone(this.state); const building = next.buildings.find((candidate) => candidate.id === id);
    if (!building || building.constructing) { this.lastActionError = 'Finish construction before maintenance'; return false; }
    if (building.durability >= 100) { this.lastActionError = 'This facility is already at full durability'; return false; }
    if (building.maintenanceFunded) { this.lastActionError = 'A maintenance cycle is already funded'; return false; }
    const cost = maintenanceCost(building);
    if (next.resources.glow < cost.glow || next.resources.alloy < cost.alloy) {
      this.lastActionError = `Repairs need ${cost.glow} GLOW and ${cost.alloy} ALLOY`; return false;
    }
    next.resources.glow -= cost.glow; next.resources.alloy -= cost.alloy; building.maintenanceFunded = true;
    appendWorldEvent(next, { type: 'maintenance_funded', at: next.time, payload: { buildingId: id, automatic: false, glow: cost.glow, alloy: cost.alloy } });
    this.lastActionError = ''; this.set(next); return true;
  }
  assignRole(id: string, role: CreatureRole | 'auto') {
    const next = structuredClone(this.state); const creature = next.creatures.find((candidate) => candidate.id === id && candidate.alive); if (!creature) return false;
    creature.autoRole = role === 'auto'; creature.assignedRole = role === 'auto' ? creature.role : role;
    creature.history.push({ at: next.time, title: role === 'auto' ? 'Autonomy restored' : `Assigned ${role}`, detail: role === 'auto' ? 'Allowed to choose work from personality again.' : 'The operator selected a colony role.' });
    appendWorldEvent(next, { type: 'role_assignment', at: next.time, payload: { creatureId: id, role } }); this.set(next); return true;
  }
  setCreatureSchedule(id: string, schedule: CreatureSchedule) {
    const next = structuredClone(this.state); const creature = next.creatures.find((candidate) => candidate.id === id && candidate.alive); if (!creature) return false;
    creature.schedule = schedule; creature.history.push({ at: next.time, title: `${schedule} schedule`, detail: 'The colony adjusted this Luma’s protected work, free-time, and rest blocks.' });
    appendWorldEvent(next, { type: 'schedule_assignment', at: next.time, payload: { creatureId: id, schedule } }); this.set(next); return true;
  }
  setCreatureGroup(id: string, groupId: string) {
    const next = structuredClone(this.state); const creature = next.creatures.find((candidate) => candidate.id === id && candidate.alive);
    const group = next.livingWorld.management.groups.find((candidate) => candidate.id === groupId); if (!creature || !group) return false;
    creature.managementGroupId = groupId; creature.history.push({ at: next.time, title: `Joined ${group.name}`, detail: 'Free movement now favors the group’s assigned habitat zone.' });
    appendWorldEvent(next, { type: 'management_group', at: next.time, payload: { creatureId: id, groupId } }); this.set(next); return true;
  }
  setManagementPriority(key: ManagementPriorityKey, priority: 0 | 1 | 2 | 3) {
    const next = structuredClone(this.state); next.livingWorld.management.priorities[key] = priority;
    appendWorldEvent(next, { type: 'management_priority', at: next.time, payload: { key, priority } }); this.set(next); return true;
  }
  setColonyPolicy(key: ColonyPolicyKey, enabled: boolean) {
    const next = structuredClone(this.state); next.livingWorld.management.policies[key] = enabled;
    appendWorldEvent(next, { type: 'colony_policy', at: next.time, payload: { key, enabled } }); this.set(next); return true;
  }
  setMinimumReserves(glow: number, alloy: number) {
    const next = structuredClone(this.state); next.livingWorld.management.minimumReserves = { glow: Math.max(0, glow), alloy: Math.max(0, alloy) };
    appendWorldEvent(next, { type: 'reserve_policy', at: next.time, payload: { glow, alloy } }); this.set(next); return true;
  }
  togglePreferredOperator(buildingId: string, creatureId: string) {
    const next = structuredClone(this.state); const building = next.buildings.find((candidate) => candidate.id === buildingId);
    const creature = next.creatures.find((candidate) => candidate.id === creatureId && candidate.alive); if (!building || !creature) return false;
    if (building.preferredOperatorIds.includes(creatureId)) building.preferredOperatorIds = building.preferredOperatorIds.filter((id) => id !== creatureId);
    else building.preferredOperatorIds = [...building.preferredOperatorIds, creatureId].slice(-4);
    appendWorldEvent(next, { type: 'preferred_operator', at: next.time, payload: { buildingId, creatureId, enabled: building.preferredOperatorIds.includes(creatureId) } }); this.set(next); return true;
  }
  renameCreature(id: string, name: string) {
    const clean = name.trim().slice(0, 24); if (!clean) return false;
    const next = structuredClone(this.state); const creature = next.creatures.find((candidate) => candidate.id === id); if (!creature) return false;
    const previous = creature.name; creature.name = clean; creature.history.push({ at: next.time, title: 'Received a new name', detail: `${previous} became ${clean}.` });
    appendWorldEvent(next, { type: 'creature_renamed', at: next.time, payload: { creatureId: id, previous, name: clean } }); this.set(next); return true;
  }
  unlockResearch(branch: ResearchBranch) {
    const next = structuredClone(this.state); const level = next.livingWorld.research[branch]; const cost = expeditionResearchCost(next, branch);
    if (level >= 5 || next.livingWorld.researchPoints < cost.rp) return false;
    if (cost.rare && next.livingWorld.rareResources[cost.rare] < cost.rareAmount) return false;
    next.livingWorld.researchPoints -= cost.rp;
    if (cost.rare) next.livingWorld.rareResources[cost.rare] -= cost.rareAmount;
    next.livingWorld.research[branch]++;
    addJournal(next, { category: 'discovery', title: `${RESEARCH_BRANCHES[branch].name} research level ${level + 1}`, detail: RESEARCH_BRANCHES[branch].bonus });
    appendWorldEvent(next, { type: 'research_unlock', at: next.time, payload: { branch, level: level + 1 } }); this.set(next); return true;
  }
  startExpedition(regionId: RegionId, creatureIds: string[]) {
    const next = structuredClone(this.state); const result = launchExpedition(next, regionId, creatureIds);
    if (result.ok) this.set(next);
    return result;
  }
  resolveExpedition(id: string, choice: ExpeditionChoice) {
    const next = structuredClone(this.state);
    if (!resolveExpeditionDecision(next, id, choice)) return false;
    this.set(next); return true;
  }
  answerPersonalRequest(id: string, choice: PersonalRequestChoice) {
    const next = structuredClone(this.state);
    if (!resolvePersonalRequest(next, id, choice)) return false;
    this.set(next); return true;
  }
  answerStory(id: string, choice: StoryChoice) {
    const next = structuredClone(this.state);
    if (!resolveStoryChoice(next, id, choice)) return false;
    this.set(next); return true;
  }
  updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    const next = structuredClone(this.state); next.livingWorld.settings[key] = value; this.set(next); return true;
  }
  cycleSpeed() {
    const current = this.state.livingWorld.settings.simulationSpeed; const nextSpeed = current === 1 ? 2 : current === 2 ? 4 : 1;
    return this.updateSetting('simulationSpeed', nextSpeed);
  }
  togglePause() { return this.updateSetting('paused', !this.state.livingWorld.settings.paused); }
  dismissAlert(id: string) { const next = structuredClone(this.state); const alert = next.livingWorld.alerts.find((item) => item.id === id); if (!alert) return false; alert.dismissed = true; this.set(next); return true; }
  undoLastBuild() {
    const next = structuredClone(this.state); const event = [...next.events].reverse().find((item) => item.type === 'place_building' && next.time - item.at <= 30); if (!event) return false;
    const building = next.buildings.find((item) => item.kind === event.payload.kind && Math.hypot(item.x - Number(event.payload.x), item.y - Number(event.payload.y)) < 2); if (!building || building.constructionProgress >= 100) return false;
    const cost = BUILDINGS[building.kind].cost; next.resources.glow += cost.glow * 0.8; next.resources.alloy += cost.alloy * 0.8; next.buildings = next.buildings.filter((item) => item.id !== building.id);
    appendWorldEvent(next, { type: 'undo_building', at: next.time, payload: { id: building.id } }); this.set(next); return true;
  }
  canPlace(kind: BuildingKind, x: number, y: number) {
    if (!canAfford(this.state.resources, kind)) return { ok: false, reason: 'Not enough GLOW or ALLOY' };
    return validateBuildingPlacement(this.state.buildings, x, y, kind);
  }
  applyChoice(dialogueId: string, effects: Partial<Record<keyof WorldState['profile'], number>>, ending?: string) {
    const next = structuredClone(this.state);
    if (!next.dialogueHistory.includes(dialogueId)) next.dialogueHistory.push(dialogueId);
    Object.entries(effects).forEach(([key, value]) => { next.profile[key as keyof typeof next.profile] += value ?? 0; });
    appendWorldEvent(next, { type: 'dialogue_choice', at: next.time, payload: { dialogueId, effects, ending } });
    if (ending) { next.endingId = ending; next.chapter = 5; }
    this.set(next);
  }
}

export const gameStore = new GameStateStore();
