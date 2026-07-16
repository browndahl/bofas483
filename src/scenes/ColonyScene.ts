import Phaser from 'phaser';
import { RESEARCH_BRANCHES, relationshipStage } from '../simulation/livingWorld';
import { OBJECTIVES } from '../simulation/progression';
import { ROLE_LABELS, SKILL_KEYS, SKILL_LABELS, skillLevel } from '../simulation/colonyLife';
import { expeditionResearchCost, REGIONS } from '../simulation/expeditions';
import { explainCreatureAction, relationshipTone } from '../simulation/colonyStories';
import type { AlertState, CreatureRole, GameSettings, JournalEntry, RegionId, ResearchBranch } from '../simulation/worldState';
import { gameStore } from '../state/gameStateStore';
import { saveService } from '../services/saveService';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

type Page = 'OVERVIEW' | 'SOCIAL' | 'EXPLORE' | 'RESEARCH' | 'LUMA' | 'HISTORY' | 'SETTINGS' | 'SAVES' | 'CHANGELOG';
const PAGES: Page[] = ['OVERVIEW', 'SOCIAL', 'EXPLORE', 'RESEARCH', 'LUMA', 'HISTORY', 'SETTINGS', 'SAVES', 'CHANGELOG'];
const ROLES: Array<CreatureRole | 'auto'> = ['auto', 'forager', 'caretaker', 'healer', 'builder', 'researcher', 'explorer'];

export class ColonyScene extends Phaser.Scene {
  private state = gameStore.get();
  private page: Page = 'OVERVIEW';
  private selectedCreatureId?: string;
  private unsubscribe?: () => void;
  private content?: Phaser.GameObjects.Container;
  private header?: Phaser.GameObjects.Text;
  private tabs: Phaser.GameObjects.Container[] = [];
  private teamCursor = 0;
  private historyFilter: 'all' | 'relationship' | 'story' | 'life' = 'all';

  constructor() { super('ColonyScene'); }

  create() {
    this.state = gameStore.get();
    this.selectedCreatureId = this.state.creatures.find((creature) => creature.alive)?.id;
    this.unsubscribe = gameStore.subscribe((state) => { this.state = state; this.renderPage(); });
    this.scale.on('resize', this.rebuild, this);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.stop());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.rebuild();
  }

  private rebuild = () => {
    this.children.removeAll(true); this.tabs = [];
    const { width, height } = this.scale;
    const cardWidth = Math.min(980, width - 20); const cardHeight = Math.min(720, height - 20);
    const left = width / 2 - cardWidth / 2; const top = height / 2 - cardHeight / 2;
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.91).setInteractive();
    panel(this, width / 2, height / 2, cardWidth, cardHeight, 0.99);
    this.header = crisp(this.add.text(left + 24, top + 18, '', { fontFamily: DISPLAY_FONT, fontSize: width < 560 ? '14px' : '19px', color: '#91ffd0', letterSpacing: 1.2 }));
    const close = crisp(this.add.text(left + cardWidth - 18, top + 8, '×', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '32px', color: '#fff0a8' })).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.scene.stop());
    const usable = cardWidth - 48; const gap = 5; const compactTabs = width < 640; const columns = compactTabs ? 4 : PAGES.length;
    const tabWidth = (usable - gap * (columns - 1)) / columns;
    PAGES.forEach((page, index) => {
      const column = index % columns; const row = Math.floor(index / columns);
      const control = button(this, left + 24 + tabWidth / 2 + column * (tabWidth + gap), top + 66 + row * 36, tabWidth, 32, compactTabs ? page.slice(0, 4) : page, page === this.page ? 0xf7bd62 : 0x7af6bd);
      control.setScale(width < 480 ? 0.98 : 1); control.on('pointerup', () => { this.page = page; this.rebuild(); }); this.tabs.push(control);
    });
    const tabRows = Math.ceil(PAGES.length / columns);
    const contentTop = top + (compactTabs ? 62 + tabRows * 36 : 98);
    this.content = this.add.container(left + 24, contentTop);
    this.content.setData({ width: usable, height: top + cardHeight - 18 - contentTop });
    this.renderPage();
  };

  private renderPage() {
    if (!this.content || !this.header) return;
    this.content.removeAll(true);
    this.header.setText(`COLONY COMMAND  /  ${this.page}`);
    if (this.page === 'OVERVIEW') this.renderOverview();
    if (this.page === 'SOCIAL') this.renderSocial();
    if (this.page === 'EXPLORE') this.renderExplore();
    if (this.page === 'RESEARCH') this.renderResearch();
    if (this.page === 'LUMA') this.renderLuma();
    if (this.page === 'HISTORY') this.renderHistory();
    if (this.page === 'SETTINGS') this.renderSettings();
    if (this.page === 'SAVES') this.renderSaves();
    if (this.page === 'CHANGELOG') this.renderChangelog();
  }

  private dimensions() { return { width: Number(this.content?.getData('width') ?? 800), height: Number(this.content?.getData('height') ?? 560) }; }
  private addText(x: number, y: number, value: string, size = 12, color = '#e4f7ed', width?: number) {
    const text = crisp(this.add.text(x, y, value, { fontFamily: UI_FONT, fontSize: `${Math.round(size * this.state.livingWorld.settings.textScale)}px`, color, lineSpacing: 5, wordWrap: width ? { width } : undefined }));
    this.content?.add(text); return text;
  }
  private addHeading(x: number, y: number, value: string, color = '#f7bd62') {
    const text = crisp(this.add.text(x, y, value, { fontFamily: DISPLAY_FONT, fontSize: `${Math.round(13 * this.state.livingWorld.settings.textScale)}px`, color, letterSpacing: 0.7 })); this.content?.add(text); return text;
  }
  private addButton(x: number, y: number, width: number, label: string, color: number, action: () => void) {
    const control = button(this, x, y, width, 34, label, color); control.on('pointerup', action); this.content?.add(control); return control;
  }
  private toast(message: string) { this.game.events.emit('toast', message); }

  private renderOverview() {
    const { width } = this.dimensions(); const world = this.state.livingWorld;
    const living = this.state.creatures.filter((creature) => creature.alive);
    const activeAlerts = world.alerts.filter((alert) => !alert.dismissed);
    const friends = new Set(living.flatMap((creature) => Object.entries(creature.bonds).filter(([, bond]) => bond >= 35).map(([id]) => [creature.id, id].sort().join(':')))).size;
    const guided = OBJECTIVES.filter((objective) => !objective.optional);
    const guidedComplete = guided.filter((objective) => this.state.completedObjectives.includes(objective.id)).length;
    const nextObjective = guided.find((objective) => !this.state.completedObjectives.includes(objective.id));
    this.addHeading(0, 0, `LEVEL ${world.level}  ·  ${world.title.toUpperCase()}`);
    this.addText(0, 28, `REPUTATION ${Math.floor(world.reputation)}  ·  DAY ${world.day} / ${world.season.toUpperCase()}  ·  ${world.weather.toUpperCase()}\nPOPULATION ${living.length}  ·  FRIENDSHIPS ${friends}  ·  REGIONS ${world.unlockedRegions.length}/5\nRARE STORES  ${world.rareResources.memoryCrystal} MEMORY CRYSTAL  ·  ${world.rareResources.wildSeed} WILD SEED`, 12, '#dff5ea', width);
    this.addText(0, 88, `GUIDED JOURNEY  ${guidedComplete}/${guided.length}${nextObjective ? `  ·  NEXT: ${nextObjective.title.toUpperCase()}` : '  ·  COMPLETE'}`, 10, nextObjective ? '#f7bd62' : '#7af6bd', width);
    this.addHeading(0, 122, 'ACTIVE SIGNALS', activeAlerts.some((alert) => alert.severity === 'critical') ? '#ff735f' : '#65c7ff');
    if (!activeAlerts.length) this.addText(0, 148, 'No urgent colony alerts. The habitat is stable.', 12, '#90c9b0');
    activeAlerts.slice(0, 4).forEach((alert, index) => {
      const y = 152 + index * 54; this.addText(0, y, `${alert.severity === 'critical' ? '!!' : '!'}  ${alert.title.toUpperCase()}\n${alert.detail}`, 11, alert.severity === 'critical' ? '#ff9b89' : '#ffe1a0', width - 126);
      this.addButton(width - 55, y + 14, 104, alert.actionLabel ?? 'DISMISS', alert.actionLabel ? 0x7af6bd : 0x65c7ff, () => this.handleAlert(alert));
    });
    const challengeY = 188 + Math.max(1, activeAlerts.slice(0, 4).length) * 54;
    this.addHeading(0, challengeY, 'OPTIONAL CHALLENGES');
    world.challenges.forEach((challenge, index) => this.addText(0, challengeY + 27 + index * 42, `${challenge.complete ? '✓' : '◇'} ${challenge.title.toUpperCase()}  ${Math.floor(challenge.progress)}/${challenge.target}\n${challenge.description}`, 11, challenge.complete ? '#7af6bd' : '#dff5ea', width));
  }

  private handleAlert(alert: AlertState) {
    if (alert.actionLabel === 'OPEN SOCIAL') { this.page = 'SOCIAL'; this.rebuild(); return; }
    if (alert.creatureId) {
      const creature = this.state.creatures.find((candidate) => candidate.id === alert.creatureId);
      if (creature) { this.game.events.emit('creature-selected', creature); this.game.events.emit('focus-creature', creature.id); this.scene.stop(); }
      return;
    }
    if (alert.buildingId) {
      const building = this.state.buildings.find((candidate) => candidate.id === alert.buildingId);
      if (building) { this.game.events.emit('building-selected', building); this.scene.stop(); }
      return;
    }
    gameStore.dismissAlert(alert.id);
  }

  private renderSocial() {
    const { width } = this.dimensions(); const compact = width < 600; const world = this.state.livingWorld;
    const living = this.state.creatures.filter((creature) => creature.alive);
    const request = world.personalRequests.find((item) => item.status === 'active');
    const story = world.storyEvents.find((item) => item.status === 'decision');
    const activity = world.groupActivity;
    this.addHeading(0, 0, 'COLONY MOMENT');
    this.addText(0, 27, activity
      ? `${activity.kind.toUpperCase()} IN PROGRESS · ${activity.creatureIds.map((id) => this.state.creatures.find((creature) => creature.id === id)?.name).filter(Boolean).join(' · ')}`
      : 'No group activity is active. Healthy colonies naturally gather for meals, games, and celebrations.', compact ? 9 : 11, activity ? '#f7bd62' : '#90c9b0', width);

    const requestY = 68;
    this.addHeading(0, requestY, 'PERSONAL REQUEST', request ? '#ff8fcf' : '#758b80');
    if (!request) this.addText(0, requestY + 27, 'No Luma is waiting for an answer. New named requests emerge as colony days pass.', compact ? 9 : 11, '#90c9b0', width);
    else {
      this.addText(0, requestY + 27, `${request.title.toUpperCase()}\n${request.detail}`, compact ? 9 : 11, '#e4f7ed', width);
      const y = requestY + (compact ? 91 : 84); const buttonWidth = compact ? Math.floor((width - 12) / 3) : 150;
      this.addButton(buttonWidth / 2, y, buttonWidth, 'HELP · 8G', 0x7af6bd, () => { if (!gameStore.answerPersonalRequest(request.id, 'help')) this.toast('Helping this request needs 8 GLOW'); });
      this.addButton(buttonWidth * 1.5 + 6, y, buttonWidth, 'ENCOURAGE', 0x65c7ff, () => gameStore.answerPersonalRequest(request.id, 'encourage'));
      this.addButton(buttonWidth * 2.5 + 12, y, buttonWidth, 'DECLINE', 0xff735f, () => gameStore.answerPersonalRequest(request.id, 'decline'));
    }

    const storyY = request ? 205 : 145;
    this.addHeading(0, storyY, 'COLONY STORY', story ? '#bf78ff' : '#758b80');
    if (!story) this.addText(0, storyY + 27, 'No story decision is waiting. Colony history, conflicts, and relationships shape what appears next.', compact ? 9 : 11, '#90c9b0', width);
    else {
      const names = story.creatureIds.map((id) => this.state.creatures.find((creature) => creature.id === id)?.name).filter(Boolean).join(' · ');
      this.addText(0, storyY + 27, `STAGE ${story.stage}/2 · ${story.title.toUpperCase()} · ${names}\n${story.description}`, compact ? 9 : 11, '#e4f7ed', width);
      const y = storyY + (compact ? 104 : 88);
      this.addButton(width * 0.25, y, Math.min(220, width * 0.45), story.stage === 1 ? 'GIVE THEM TIME' : 'KEEP IT PERSONAL', 0x7af6bd, () => gameStore.answerStory(story.id, 'gentle'));
      this.addButton(width * 0.75, y, Math.min(220, width * 0.45), story.stage === 1 ? 'ASK FOR CLARITY' : 'SHARE THE MOMENT', 0xf7bd62, () => gameStore.answerStory(story.id, 'bold'));
    }

    const relationshipY = storyY + (story ? (compact ? 155 : 140) : 75);
    this.addHeading(0, relationshipY, 'RELATIONSHIP NETWORK');
    const pairs = living.flatMap((first) => Object.entries(first.bonds).map(([id, strength]) => {
      const second = living.find((candidate) => candidate.id === id);
      return second && first.id < second.id ? { first, second, strength } : undefined;
    })).filter((pair): pair is { first: typeof living[number]; second: typeof living[number]; strength: number } => Boolean(pair))
      .sort((a, b) => b.strength - a.strength);
    const socialGroups: string[][] = [];
    const grouped = new Set<string>();
    living.forEach((creature) => {
      if (grouped.has(creature.id)) return;
      const queue = [creature]; const group: string[] = []; grouped.add(creature.id);
      while (queue.length) {
        const member = queue.shift(); if (!member) continue; group.push(member.name);
        Object.entries(member.bonds).filter(([, strength]) => strength >= 35).forEach(([id]) => {
          const next = living.find((candidate) => candidate.id === id);
          if (next && !grouped.has(next.id)) { grouped.add(next.id); queue.push(next); }
        });
      }
      if (group.length > 1) socialGroups.push(group);
    });
    if (socialGroups.length && !compact) this.addText(width * 0.52, relationshipY, `${socialGroups.length} SOCIAL GROUP${socialGroups.length === 1 ? '' : 'S'}  ·  LARGEST ${Math.max(...socialGroups.map((group) => group.length))}`, 10, '#90c9b0', width * 0.48);
    if (!pairs.length) this.addText(0, relationshipY + 28, 'The colony has no established bonds yet. Shared activities and social time will create them.', compact ? 9 : 11, '#90c9b0', width);
    pairs.slice(0, compact ? 2 : 6).forEach((pair, index) => {
      const y = relationshipY + 29 + index * (compact ? 34 : 30);
      this.addText(0, y, `${relationshipTone(this.state, pair.first, pair.second)}  ·  ${pair.first.name} ↔ ${pair.second.name}  ·  ${Math.round(pair.strength)}%`, compact ? 9 : 10, pair.strength >= 60 ? '#7af6bd' : '#dff5ea', width);
    });
    const familyY = relationshipY + 48 + Math.min(compact ? 2 : 6, Math.max(1, pairs.length)) * (compact ? 34 : 30);
    this.addHeading(0, familyY, 'FAMILY & MENTOR LINES');
    const lines = living.filter((creature) => creature.parentId || creature.mentorId).slice(0, compact ? 2 : 5).map((creature) => {
      const parent = this.state.creatures.find((candidate) => candidate.id === creature.parentId)?.name;
      const mentor = this.state.creatures.find((candidate) => candidate.id === creature.mentorId)?.name;
      return `GEN ${creature.generation}  ${creature.name}  ←  ${parent ? `PARENT ${parent}` : ''}${parent && mentor ? ' · ' : ''}${mentor ? `MENTOR ${mentor}` : ''}`;
    });
    this.addText(0, familyY + 27, lines.length ? lines.join('\n') : 'The first generation is still forming family and mentorship lines.', compact ? 9 : 10, '#d8c69a', width);
  }

  private renderResearch() {
    const { width } = this.dimensions(); const world = this.state.livingWorld;
    this.addText(0, 0, `AVAILABLE RESEARCH  ${Math.floor(world.researchPoints)} RP\nHealthy, happy Luma generate research over time. Each branch reaches level 5.`, 12, '#e4f7ed', width);
    (Object.keys(RESEARCH_BRANCHES) as ResearchBranch[]).forEach((branch, index) => {
      const item = RESEARCH_BRANCHES[branch]; const level = world.research[branch]; const cost = expeditionResearchCost(this.state, branch); const y = 70 + index * 88;
      this.addHeading(0, y, `${item.name}  ·  LEVEL ${level}/5`, ['#7af6bd', '#9fe36b', '#65c7ff', '#bf78ff', '#f7bd62'][index]);
      this.addText(0, y + 25, `${item.description}\n${item.bonus}`, 11, '#dff5ea', width - 174);
      const rare = cost.rare ? ` + ${cost.rareAmount} ${cost.rare === 'memoryCrystal' ? 'CRYSTAL' : 'SEED'}` : '';
      const control = this.addButton(width - 86, y + 29, 170, level >= 5 ? 'MASTERED' : `UNLOCK ${cost.rp} RP${rare}`, 0xf7bd62, () => {
        if (!gameStore.unlockResearch(branch)) this.toast(level >= 5 ? 'This research branch is mastered' : 'This tier needs more research or regional rare matter');
      });
      const rareReady = !cost.rare || world.rareResources[cost.rare] >= cost.rareAmount;
      if (level >= 5 || world.researchPoints < cost.rp || !rareReady) control.setAlpha(0.48);
    });
  }

  private expeditionTeam() {
    const available = this.state.creatures.filter((creature) => creature.alive && !creature.expeditionId)
      .sort((a, b) => (b.assignedRole === 'explorer' ? 40 : 0) + b.skills.exploration - ((a.assignedRole === 'explorer' ? 40 : 0) + a.skills.exploration));
    if (available.length <= 2) return available;
    const offset = this.teamCursor % available.length;
    return [...available.slice(offset), ...available.slice(0, offset)].slice(0, Math.min(3, available.length));
  }

  private renderExplore() {
    const { width } = this.dimensions(); const world = this.state.livingWorld; const compact = width < 600;
    const unresolved = [...world.expeditions].reverse().find((item) => item.status === 'active' || item.status === 'decision');
    this.addText(0, 0, 'Send 2–3 Luma beyond the habitat. Teams leave the map, return alive with named outcomes, and ask you what their discoveries should become.', compact ? 9 : 11, '#dff5ea', width);
    if (unresolved?.status === 'active') {
      const region = REGIONS[unresolved.regionId]; const team = unresolved.creatureIds.map((id) => this.state.creatures.find((creature) => creature.id === id)?.name).filter(Boolean).join(' · ');
      const total = Math.max(1, unresolved.returnAt - unresolved.startedAt); const progress = Phaser.Math.Clamp((this.state.time - unresolved.startedAt) / total, 0, 1);
      this.addHeading(0, 62, `${region.glyph}  EXPEDITION ACTIVE / ${region.name.toUpperCase()}`, '#65c7ff');
      this.addText(0, 88, `TEAM  ${team}\nRISK  ${unresolved.risk.toUpperCase()}  ·  RETURN IN ${Math.max(0, Math.ceil(unresolved.returnAt - this.state.time))}s`, 12, '#e4f7ed', width);
      const back = this.add.rectangle(0, 145, width, 12, 0x211d15).setOrigin(0, 0.5).setStrokeStyle(1, 0x65c7ff); const fill = this.add.rectangle(0, 145, width * progress, 8, 0x65c7ff).setOrigin(0, 0.5); this.content?.add([back, fill]);
      this.addText(0, 166, 'Their needs are safely paused from colony work. No expedition outcome can kill a Luma.', 11, '#90c9b0', width);
      return;
    }
    if (unresolved?.status === 'decision') {
      const region = REGIONS[unresolved.regionId];
      this.addHeading(0, 62, `${region.glyph}  DECISION REQUIRED / ${region.name.toUpperCase()}`, '#ff8fcf');
      this.addText(0, 91, `${unresolved.outcome}\n\nRETURNED  +${unresolved.glowReward} GLOW · +${unresolved.alloyReward} ALLOY`, 12, '#e4f7ed', width);
      this.addText(0, 190, 'PRESERVE  +2 Wild Seed · +10 reputation · sustainability\nSALVAGE  +1 Memory Crystal · +20 ALLOY · ambition', 11, '#ffe1a0', width);
      this.addButton(width * 0.25, 260, Math.min(250, width * 0.42), 'PRESERVE SITE', 0x7af6bd, () => gameStore.resolveExpedition(unresolved.id, 'preserve'));
      this.addButton(width * 0.75, 260, Math.min(250, width * 0.42), 'SALVAGE RELIC', 0xff735f, () => gameStore.resolveExpedition(unresolved.id, 'salvage'));
      return;
    }
    const team = this.expeditionTeam(); const teamNames = team.map((creature) => `${creature.name} L${skillLevel(creature.skills.exploration)}`).join(' · ');
    this.addHeading(0, compact ? 72 : 60, 'RECOMMENDED TEAM'); this.addText(0, compact ? 98 : 86, teamNames || 'At least two available Luma are required.', compact ? 10 : 12, '#e4f7ed', width - 170);
    this.addButton(width - 75, compact ? 104 : 92, 146, 'CHANGE TEAM', 0x65c7ff, () => { this.teamCursor++; this.renderPage(); });
    const regionIds = (Object.keys(REGIONS) as RegionId[]).filter((id) => id !== 'lumen-field');
    regionIds.forEach((regionId, index) => {
      const region = REGIONS[regionId]; const y = (compact ? 150 : 136) + index * (compact ? 112 : 104); const unlocked = world.unlockedRegions.includes(regionId); const affordable = this.state.resources.glow >= region.supply.glow && this.state.resources.alloy >= region.supply.alloy && team.length >= 2;
      this.addHeading(0, y, compact ? `${region.glyph}  ${region.name.toUpperCase()}` : `${region.glyph}  ${region.name.toUpperCase()}  ·  ${unlocked ? region.risk.toUpperCase() : `LOCKED / LEVEL ${region.level}`}`, unlocked ? '#f7bd62' : '#6d8177');
      const detail = compact ? `${unlocked ? region.risk.toUpperCase() : `PERMIT LEVEL ${region.level}`}\n${region.duration}s · ${region.supply.glow} GLOW / ${region.supply.alloy} ALLOY\nDISCOVERY ${region.discovery.toUpperCase()}` : `${region.description}\n${region.duration}s · ${region.supply.glow} GLOW / ${region.supply.alloy} ALLOY · DISCOVERY ${region.discovery.toUpperCase()}`;
      this.addText(0, y + 25, detail, compact ? 9 : 10, unlocked ? '#dff5ea' : '#788b82', width - 180);
      const control = this.addButton(width - 76, y + (compact ? 57 : 42), compact ? 146 : 160, unlocked ? 'BEGIN EXPEDITION' : 'PERMIT LOCKED', unlocked ? 0x7af6bd : 0x788b82, () => {
        const result = gameStore.startExpedition(regionId, team.map((creature) => creature.id)); if (!result.ok) this.toast(result.reason ?? 'The expedition could not depart');
      });
      if (!unlocked || !affordable) control.setAlpha(0.45);
    });
  }

  private renderLuma() {
    const { width } = this.dimensions(); const compact = width < 600; const living = this.state.creatures.filter((creature) => creature.alive);
    const creature = living.find((item) => item.id === this.selectedCreatureId) ?? living[0];
    if (!creature) { this.addText(0, 0, 'No living signal remains.', 14, '#ff735f'); return; }
    this.selectedCreatureId = creature.id;
    const index = living.indexOf(creature); const strongest = Object.entries(creature.bonds).sort((a, b) => b[1] - a[1])[0];
    const partner = strongest ? this.state.creatures.find((candidate) => candidate.id === strongest[0]) : undefined;
    this.addHeading(0, 0, `${creature.name.toUpperCase()}  ·  GEN ${creature.generation}  ·  ${creature.voiceStyle.toUpperCase()} VOICE`);
    const navY = compact ? 43 : 10;
    this.addText(0, compact ? 70 : 28, `${ROLE_LABELS[creature.assignedRole]}${creature.autoRole ? ' / SELF-DIRECTED' : ' / ASSIGNED'}  ·  AGE ${Math.floor(creature.age)}\nWHY  ${explainCreatureAction(this.state, creature)}\nTRAITS  ${creature.traits.length ? creature.traits.join(' · ').toUpperCase() : 'STILL EMERGING'}\nFAVORITES  ${creature.favoriteFood.toUpperCase()}  ·  ${creature.preferences.favoriteActivity.toUpperCase()}${partner && strongest ? `\nSTRONGEST BOND  ${partner.name} / ${relationshipStage(strongest[1])} ${Math.floor(strongest[1])}%` : ''}`, compact ? 9 : 11, '#dff5ea', compact ? width : width * 0.48);
    this.addButton(compact ? 36 : width - 282, navY, 64, '◀', 0x65c7ff, () => { this.selectedCreatureId = living[(index - 1 + living.length) % living.length].id; this.renderPage(); });
    this.addButton(compact ? 106 : width - 200, navY, 64, '▶', 0x65c7ff, () => { this.selectedCreatureId = living[(index + 1) % living.length].id; this.renderPage(); });
    this.addButton(compact ? width - 68 : width - 92, navY, compact ? 128 : 126, 'RENAME', 0xff8fcf, () => {
      const name = window.prompt('Give this Luma a new name (24 characters maximum):', creature.name);
      if (name && gameStore.renameCreature(creature.id, name)) this.toast(`${creature.name} listens to its new name`);
    });
    const roleY = compact ? 180 : 60; const roleX = compact ? 0 : width * 0.53;
    this.addHeading(roleX, roleY, 'ROLE & WORK');
    const roleIndex = ROLES.indexOf(creature.autoRole ? 'auto' : creature.assignedRole);
    this.addText(roleX, roleY + 27, `Preferred: ${ROLE_LABELS[creature.role]}  ·  Work stress: ${Math.round(creature.stress)}%`, compact ? 9 : 11, creature.stress > 50 ? '#ff9b89' : '#90c9b0');
    this.addButton(compact ? width - 80 : width - 92, roleY + 40, compact ? 150 : 170, `ASSIGN ${ROLES[(roleIndex + 1) % ROLES.length] === 'auto' ? 'AUTONOMY' : ROLE_LABELS[ROLES[(roleIndex + 1) % ROLES.length] as CreatureRole]}`, 0x7af6bd, () => gameStore.assignRole(creature.id, ROLES[(roleIndex + 1) % ROLES.length]));
    const skillY = compact ? 260 : 178;
    this.addHeading(0, skillY, 'SKILLS / EXPERIENCE');
    SKILL_KEYS.forEach((key, skillIndex) => {
      const column = skillIndex % 2; const row = Math.floor(skillIndex / 2); const value = creature.skills[key];
      this.addText(column * width * 0.5, skillY + 26 + row * (compact ? 38 : 42), `${SKILL_LABELS[key].padEnd(9)} L${skillLevel(value)}  ${Math.floor(value)}%\n${'■'.repeat(Math.floor(value / 10))}${'·'.repeat(10 - Math.floor(value / 10))}`, compact ? 9 : 11, '#e4f7ed');
    });
    const historyY = compact ? 408 : 340;
    this.addHeading(0, historyY, 'LIFE HISTORY & MEMORIES');
    const history = [...creature.history].slice(-4).reverse().map((entry) => `DAY ${Math.floor(entry.at / 240) + 1}  ${entry.title.toUpperCase()} — ${entry.detail}`).join('\n');
    const family = `${creature.parentId ? `PARENT ${this.state.creatures.find((item) => item.id === creature.parentId)?.name ?? 'UNKNOWN'}` : 'FIRST GENERATION'}  ·  ${creature.childrenIds.length} CHILDREN${creature.mentorId ? `  ·  MENTOR ${this.state.creatures.find((item) => item.id === creature.mentorId)?.name ?? 'UNKNOWN'}` : ''}`;
    this.addText(0, historyY + 27, `${family}\n${history || 'Its story is only beginning.'}`, compact ? 9 : 10, '#d8c69a', width);
  }

  private renderHistory() {
    const { width } = this.dimensions(); const compact = width < 600;
    this.addText(0, 0, 'A filterable colony timeline of discoveries, choices, births, friendships, conflicts, losses, and milestones.', compact ? 9 : 11, '#90c9b0', width);
    const filters: Array<typeof this.historyFilter> = ['all', 'relationship', 'story', 'life'];
    const buttonWidth = (width - 15) / 4;
    filters.forEach((filter, index) => this.addButton(buttonWidth / 2 + index * (buttonWidth + 5), 55, buttonWidth, filter.toUpperCase(), this.historyFilter === filter ? 0xf7bd62 : 0x65c7ff, () => {
      this.historyFilter = filter; this.renderPage();
    }));
    const filtered = [...this.state.livingWorld.journal].filter((entry) => {
      if (this.historyFilter === 'all') return true;
      if (this.historyFilter === 'relationship') return entry.category === 'relationship';
      if (this.historyFilter === 'story') return entry.category === 'event' || entry.id.startsWith('story-');
      return ['birth', 'loss', 'milestone'].includes(entry.category);
    }).slice(-(compact ? 6 : 9)).reverse();
    if (!filtered.length) this.addText(0, 92, 'No entries match this timeline filter yet.', 11, '#90c9b0');
    filtered.forEach((entry: JournalEntry, index) => {
      const y = 94 + index * (compact ? 62 : 52);
      this.addHeading(0, y, `DAY ${Math.floor(entry.at / 240) + 1}  /  ${entry.category.toUpperCase()}  /  ${entry.title}`);
      this.addText(0, y + 22, entry.detail, compact ? 9 : 10, '#dff5ea', width);
    });
  }

  private renderSettings() {
    const { width } = this.dimensions(); const settings = this.state.livingWorld.settings;
    const toggles: Array<[keyof GameSettings, string, string]> = [
      ['muted', 'CREATURE VOICES', settings.muted ? 'MUTED' : 'ON'], ['subtitles', 'VOCAL SUBTITLES', settings.subtitles ? 'ON' : 'OFF'],
      ['reducedMotion', 'REDUCED MOTION', settings.reducedMotion ? 'ON' : 'OFF'], ['screenShake', 'SCREEN FEEDBACK', settings.screenShake ? 'ON' : 'OFF'],
      ['highContrast', 'HIGH CONTRAST', settings.highContrast ? 'ON' : 'OFF'], ['colorBlind', 'COLOR-SAFE NEEDS', settings.colorBlind ? 'ON' : 'OFF'],
      ['lowPower', 'LOW-POWER MODE', settings.lowPower ? 'ON' : 'OFF'], ['tutorial', 'CONTEXTUAL GUIDE', settings.tutorial ? 'ON' : 'OFF']
    ];
    const compact = width < 600;
    toggles.forEach(([key, label, status], index) => {
      const column = compact ? 0 : index % 2; const row = compact ? index : Math.floor(index / 2); const x = column * width * 0.5; const y = 18 + row * (compact ? 39 : 58);
      this.addText(x, y - 8, label, compact ? 9 : 11, '#dff5ea');
      this.addButton(compact ? width - 49 : x + width * 0.37, y, compact ? 92 : 100, status, status === 'ON' ? 0x7af6bd : 0xff8fcf, () => gameStore.updateSetting(key, !settings[key] as never));
    });
    const sectionY = compact ? 335 : 260; const infoY = sectionY + 32;
    this.addHeading(0, sectionY, 'AUDIO / DISPLAY / SIMULATION');
    this.addText(0, infoY, `VOICE ${Math.round(settings.voiceVolume * 100)}%  ·  TEXT ${Math.round(settings.textScale * 100)}%  ·  ${settings.quality.toUpperCase()}\nOFFLINE ${settings.offlineLimitMinutes} MIN  ·  ${settings.paused ? 'PAUSED' : `${settings.simulationSpeed}× SPEED`}`, compact ? 9 : 11, '#e4f7ed');
    const left = compact ? width * 0.22 : width * 0.48; const right = compact ? width * 0.66 : width * 0.65; const controlWidth = compact ? 138 : 140;
    this.addButton(left, sectionY + 88, controlWidth, 'VOICE −', 0x65c7ff, () => gameStore.updateSetting('voiceVolume', Math.max(0, settings.voiceVolume - 0.1)));
    this.addButton(right, sectionY + 88, controlWidth, 'VOICE +', 0x65c7ff, () => gameStore.updateSetting('voiceVolume', Math.min(1, settings.voiceVolume + 0.1)));
    this.addButton(left, sectionY + 130, controlWidth, 'TEXT −', 0xf7bd62, () => gameStore.updateSetting('textScale', Math.max(0.85, settings.textScale - 0.1)));
    this.addButton(right, sectionY + 130, controlWidth, 'TEXT +', 0xf7bd62, () => gameStore.updateSetting('textScale', Math.min(1.4, settings.textScale + 0.1)));
    this.addButton(left, sectionY + 172, controlWidth, `QUALITY ${settings.quality.toUpperCase()}`, 0xbf78ff, () => gameStore.updateSetting('quality', settings.quality === 'high' ? 'medium' : settings.quality === 'medium' ? 'low' : 'high'));
    this.addButton(right, sectionY + 172, controlWidth, `OFFLINE ${settings.offlineLimitMinutes}`, 0xbf78ff, () => gameStore.updateSetting('offlineLimitMinutes', settings.offlineLimitMinutes >= 60 ? 0 : settings.offlineLimitMinutes === 0 ? 15 : settings.offlineLimitMinutes + 15));
    this.addButton(left, sectionY + 214, controlWidth, settings.paused ? 'RESUME' : 'PAUSE', 0x7af6bd, () => gameStore.togglePause());
    this.addButton(right, sectionY + 214, controlWidth, `SPEED ${settings.simulationSpeed}×`, 0x7af6bd, () => gameStore.cycleSpeed());
    this.addButton(width * 0.27, sectionY + 260, compact ? 164 : 190, `ALERTS ${settings.alertLevel.toUpperCase()}`, 0x65c7ff, () => gameStore.updateSetting('alertLevel', settings.alertLevel === 'all' ? 'important' : settings.alertLevel === 'important' ? 'critical' : 'all'));
    this.addButton(width * 0.73, sectionY + 260, compact ? 164 : 190, 'FULLSCREEN', 0xff8fcf, () => this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen());
    this.addText(0, sectionY + 292, 'KEYS  SPACE pause  ·  1/2/3 speed  ·  P photo  ·  G guide  ·  ESC close', compact ? 8 : 10, '#90c9b0', width);
  }

  private renderSaves() {
    const { width } = this.dimensions(); const compact = width < 600;
    this.addText(0, 0, `AUTOSAVE  every 15 seconds\nLAST SAVE  ${saveService.lastSavedAt() ? new Date(saveService.lastSavedAt()).toLocaleString() : 'not yet this session'}\nEvery write keeps a recovery backup.`, compact ? 9 : 11, '#dff5ea', width);
    saveService.slotMetadata().forEach((metadata, index) => {
      const y = (compact ? 80 : 100) + index * (compact ? 112 : 92); this.addHeading(0, y, `SAVE SLOT ${metadata.slot}`);
      this.addText(0, y + 25, metadata.empty ? 'EMPTY' : `${metadata.title}  ·  ${metadata.living} LIVING\n${new Date(metadata.savedAt).toLocaleString()}`, compact ? 9 : 11, metadata.empty ? '#90c9b0' : '#e4f7ed');
      const buttonsY = compact ? y + 70 : y + 27;
      this.addButton(compact ? 50 : width - 330, buttonsY, compact ? 92 : 96, 'SAVE', 0x7af6bd, () => { saveService.saveLocal(this.state, metadata.slot); this.toast(`Saved to slot ${metadata.slot}`); this.renderPage(); });
      this.addButton(compact ? 151 : width - 222, buttonsY, compact ? 92 : 96, 'LOAD', 0x65c7ff, () => { const loaded = saveService.loadLocal(metadata.slot); if (loaded) { gameStore.set(loaded); this.toast(`Loaded slot ${metadata.slot}`); } else this.toast('This slot is empty'); });
      this.addButton(compact ? 267 : width - 114, buttonsY, compact ? 120 : 112, 'RECOVER', 0xff8fcf, () => { const backup = saveService.loadBackup(metadata.slot); if (backup) { gameStore.set(backup); this.toast(`Recovered slot ${metadata.slot}`); } else this.toast('No recovery backup exists'); });
    });
    const portableY = compact ? 430 : 404;
    this.addHeading(0, portableY, 'PORTABLE COLONY');
    this.addButton(compact ? width * 0.25 : 94, portableY + 46, compact ? 155 : 176, 'EXPORT SAVE', 0xf7bd62, () => this.exportSave());
    this.addButton(compact ? width * 0.75 : 292, portableY + 46, compact ? 155 : 176, 'IMPORT SAVE', 0xbf78ff, () => this.importSave());
    this.addText(0, portableY + 84, 'Colony state only—no account token, email, or private diagnostics.', compact ? 8 : 10, '#90c9b0', width);
  }

  private exportSave() {
    const blob = new Blob([saveService.exportState(this.state)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bofas483-day-${this.state.livingWorld.day}.json`; anchor.click(); URL.revokeObjectURL(url); this.toast('Portable colony exported');
  }
  private importSave() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return; const imported = saveService.importState(await file.text());
      if (imported) { gameStore.set(imported); saveService.saveLocal(imported); this.toast('Colony imported and backed up'); } else this.toast('That save file is invalid');
    }; input.click();
  }

  private renderChangelog() {
    const { width } = this.dimensions();
    this.addHeading(0, 0, 'COLONY STORIES & RELATIONSHIPS UPDATE  /  2026.07');
    this.addText(0, 30, 'LIVING SOCIETY\nHealthy Luma now gather for group meals, games, and celebrations. Social behavior includes friendship, comfort, arguments, automatic reconciliation, mentorship, admiration, rivalry, family, and Lifebonds—with stronger visual reactions in the habitat.\n\nPERSONAL REQUESTS\nNamed Luma ask for companionship, favorite places, or purpose. HELP, ENCOURAGE, and DECLINE have explicit costs and lasting effects on happiness, stress, bonds, personality, and personal history.\n\nCOLONY STORIES\nMulti-stage events reference real creatures and colony history. Give them time or demand clarity, then decide whether the result remains personal or becomes a shared tradition. Consequences persist in bonds, research, reputation, memories, and the timeline.\n\nSOCIAL COMMAND & HISTORY\nA dedicated SOCIAL overview maps relationship types and family lines. HISTORY replaces the flat journal with filters for relationships, stories, and life milestones. Actionable alerts now name the affected Luma or building, explain why, and navigate directly to the problem.', 12, '#e4f7ed', width);
  }

  private shutdown() { this.unsubscribe?.(); this.unsubscribe = undefined; this.scale.off('resize', this.rebuild, this); this.input.keyboard?.removeAllListeners(); }
}
