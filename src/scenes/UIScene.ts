import Phaser from 'phaser';
import { BUILDINGS, buildingCapacity, buildingDisplayName, canAffordUpgrade, upgradeCost, upgradeDescription } from '../simulation/building';
import { ACTIVITY_LABELS, ROLE_LABELS, SKILL_KEYS, SKILL_LABELS, skillLevel } from '../simulation/colonyLife';
import { personalityLabels } from '../simulation/personality';
import { relationshipStage } from '../simulation/livingWorld';
import { OBJECTIVES } from '../simulation/progression';
import type { BuildingState, CreatureState, WorldState } from '../simulation/worldState';
import { gameStore } from '../state/gameStateStore';
import { saveService } from '../services/saveService';
import { BuildingMenu } from '../ui/buildingMenu';
import { button, meter, panel } from '../ui/hud';
import { CODE_FONT, crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

interface MeterView { fill: Phaser.GameObjects.Rectangle; width: number; target: number }

export class UIScene extends Phaser.Scene {
  private state = gameStore.get();
  private selected?: CreatureState;
  private unsubscribe?: () => void;
  private topPanel!: Phaser.GameObjects.Rectangle;
  private topAccent!: Phaser.GameObjects.Rectangle;
  private resourcesText!: Phaser.GameObjects.Text;
  private populationText!: Phaser.GameObjects.Text;
  private chapterText!: Phaser.GameObjects.Text;
  private creaturePanel!: Phaser.GameObjects.Container;
  private creatureName!: Phaser.GameObjects.Text;
  private creatureStatus!: Phaser.GameObjects.Text;
  private creaturePersonality!: Phaser.GameObjects.Text;
  private creatureRole!: Phaser.GameObjects.Text;
  private creaturePreference!: Phaser.GameObjects.Text;
  private creatureAmbition!: Phaser.GameObjects.Text;
  private creatureSkills!: Phaser.GameObjects.Text;
  private meters = new Map<string, MeterView>();
  private careButtons: Phaser.GameObjects.Container[] = [];
  private buildButton!: Phaser.GameObjects.Container;
  private objectiveText!: Phaser.GameObjects.Text;
  private buildMenu?: BuildingMenu;
  private buildingPanel!: Phaser.GameObjects.Container;
  private selectedBuildingId?: string;
  private buildingName!: Phaser.GameObjects.Text;
  private buildingLevel!: Phaser.GameObjects.Text;
  private buildingDetails!: Phaser.GameObjects.Text;
  private buildingActivity!: Phaser.GameObjects.Text;
  private buildingUpgradeCost!: Phaser.GameObjects.Text;
  private upgradeButton!: Phaser.GameObjects.Container;
  private capacityUpgradeButton!: Phaser.GameObjects.Container;
  private toast?: Phaser.GameObjects.Text;
  private lastChapter = 1;
  private observedDeaths = 0;
  private observedObjectives = 0;
  private observedTime = 0;
  private recoveryTimer?: Phaser.Time.TimerEvent;

  constructor() { super('UIScene'); }
  create() {
    this.cameras.main.setScroll(0, 0);
    this.state = gameStore.get();
    this.lastChapter = this.state.chapter;
    this.observedDeaths = this.state.deaths;
    this.observedObjectives = this.state.completedObjectives.length;
    this.observedTime = this.state.time;
    this.createHud();
    this.unsubscribe = gameStore.subscribe((state) => this.updateState(state));
    this.game.events.on('creature-selected', this.selectCreature, this);
    this.game.events.on('building-selected', this.selectBuilding, this);
    this.game.events.on('toast', this.showToast, this);
    this.game.events.on('open-dialogue', this.openDialogue, this);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.layout();
  }
  private createHud() {
    this.topPanel = panel(this, 0, 0, 100, 58).setOrigin(0, 0).setDepth(100);
    this.topAccent = this.add.rectangle(0, 57, 100, 3, 0xd7b86f, 0.8).setOrigin(0, 0).setDepth(101);
    crisp(this.add.text(20, 11, 'bofas483', { fontFamily: DISPLAY_FONT, fontSize: '19px', color: '#fff0a8', letterSpacing: 2 })).setDepth(101).setName('brand');
    this.chapterText = crisp(this.add.text(20, 36, 'CHAPTER 01 / TENDER SIGNAL', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#d8c69a', letterSpacing: 0.5 })).setDepth(101).setName('chapter');
    this.resourcesText = crisp(this.add.text(0, 15, '', { fontFamily: CODE_FONT, fontStyle: 'bold', fontSize: '13px', color: '#fff2bc' })).setOrigin(1, 0).setDepth(101);
    this.populationText = crisp(this.add.text(0, 35, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#d6c59b' })).setOrigin(1, 0).setDepth(101);
    this.objectiveText = crisp(this.add.text(0, 0, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#fff7d5', backgroundColor: '#3a2e1ff2', padding: { x: 14, y: 10 }, wordWrap: { width: 330 }, lineSpacing: 4 })).setDepth(101).setStroke('#1f180f', 1);
    this.objectiveText.setInteractive({ useHandCursor: true }).on('pointerup', () => this.openObjectiveGuide());

    this.creaturePanel = this.add.container(0, 0).setDepth(110);
    this.creaturePanel.add(panel(this, 0, 0, 330, 420));
    this.creatureName = crisp(this.add.text(-145, -190, 'PIP-01', { fontFamily: DISPLAY_FONT, fontSize: '16px', color: '#fff0a8', letterSpacing: 0.7 }));
    this.creatureStatus = crisp(this.add.text(145, -188, 'ALIVE', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#d8c69a' })).setOrigin(1, 0);
    this.creatureRole = crisp(this.add.text(-145, -167, '', { fontFamily: DISPLAY_FONT, fontSize: '11px', color: '#7af6bd', letterSpacing: 0.7 }));
    this.creaturePersonality = crisp(this.add.text(-145, -149, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '9px', color: '#90c9b0', wordWrap: { width: 290 }, lineSpacing: 2 }));
    this.creaturePreference = crisp(this.add.text(-145, -120, '', { fontFamily: UI_FONT, fontSize: '9px', color: '#d8c69a' }));
    this.creatureAmbition = crisp(this.add.text(-145, -104, '', { fontFamily: UI_FONT, fontSize: '9px', color: '#f7bd62', wordWrap: { width: 290 } }));
    this.creaturePanel.add([this.creatureName, this.creatureStatus, this.creatureRole, this.creaturePersonality, this.creaturePreference, this.creatureAmbition]);
    const meterDefs = [['hunger', 'NOURISHMENT', 0xf7bd62], ['hygiene', 'CLARITY', 0x65c7ff], ['happiness', 'RESONANCE', 0xbf78ff], ['health', 'INTEGRITY', 0x7af6bd], ['energy', 'CHARGE', 0xff8fcf]] as const;
    meterDefs.forEach(([key, label, color], index) => {
      const view = meter(this, -145, -78 + index * 29, 290, label, color);
      this.creaturePanel.add([view.title, view.back, view.fill]); this.meters.set(key, view);
    });
    this.creatureSkills = crisp(this.add.text(-145, 76, '', { fontFamily: CODE_FONT, fontStyle: 'bold', fontSize: '9px', color: '#dff5ea', lineSpacing: 3 }));
    this.creaturePanel.add(this.creatureSkills);
    const labels: Array<[string, string]> = [['FEED +', 'hunger'], ['WASH ≋', 'hygiene'], ['PLAY ✣', 'happiness']];
    labels.forEach(([label, need], index) => {
      const control = button(this, -98 + index * 98, 178, 88, 42, label, [0xf7bd62, 0x65c7ff, 0xbf78ff][index]);
      control.on('pointerup', () => this.game.events.emit('care', need)); this.creaturePanel.add(control); this.careButtons.push(control);
    });

    this.buildingPanel = this.add.container(0, 0).setDepth(111).setVisible(false);
    this.buildingPanel.add(panel(this, 0, 0, 360, 360));
    this.buildingName = crisp(this.add.text(-145, -140, '', { fontFamily: DISPLAY_FONT, fontSize: '16px', color: '#fff0a8', letterSpacing: 0.7 }));
    this.buildingLevel = crisp(this.add.text(145, -138, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#7af6bd' })).setOrigin(1, 0);
    this.buildingDetails = crisp(this.add.text(-145, -106, '', { fontFamily: UI_FONT, fontSize: '11px', color: '#dff5ea', lineSpacing: 5, wordWrap: { width: 290 } }));
    this.buildingActivity = crisp(this.add.text(-145, 20, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#90c9b0', lineSpacing: 5 }));
    this.buildingUpgradeCost = crisp(this.add.text(0, 77, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '9px', color: '#f7bd62', align: 'center', wordWrap: { width: 320 }, lineSpacing: 3 })).setOrigin(0.5);
    this.upgradeButton = button(this, -86, 139, 156, 42, 'QUALITY PATH', 0x7af6bd);
    this.capacityUpgradeButton = button(this, 86, 139, 156, 42, 'CAPACITY PATH', 0x65c7ff);
    this.upgradeButton.on('pointerup', () => this.upgradeSelectedBuilding('quality'));
    this.capacityUpgradeButton.on('pointerup', () => this.upgradeSelectedBuilding('capacity'));
    this.buildingPanel.add([this.buildingName, this.buildingLevel, this.buildingDetails, this.buildingActivity, this.buildingUpgradeCost, this.upgradeButton, this.capacityUpgradeButton]);
    this.buildButton = button(this, 0, 0, 148, 46, 'BUILD  +', 0x7af6bd).setDepth(120);
    this.buildButton.on('pointerup', () => this.toggleBuildMenu());
    const profileButton = button(this, 0, 0, 124, 38, 'AUDIT ↗', 0xbf78ff).setDepth(120).setName('profile-button');
    profileButton.on('pointerup', () => this.scene.launch('ProfileScene'));
    const saveButton = button(this, 0, 0, 100, 38, 'SAVE ◇', 0x65c7ff).setDepth(120).setName('save-button');
    saveButton.on('pointerup', async () => {
      try { const result = await saveService.saveCloud(this.state); this.showToast('local' in result ? 'Saved on this device' : 'Cloud save secured'); }
      catch (error) { this.showToast(error instanceof Error && error.message.includes('429') ? 'Saving too frequently — please wait a moment' : 'Cloud unavailable — saved locally'); saveService.saveLocal(this.state); }
    });
    const authButton = button(this, 0, 0, 100, 38, 'IDENTITY', 0xf7bd62).setDepth(120).setName('auth-button');
    authButton.on('pointerup', () => this.scene.launch('AuthScene'));
    const guideButton = button(this, 0, 0, 104, 38, 'GUIDE  ?', 0xff8fcf).setDepth(120).setName('guide-button');
    guideButton.on('pointerup', () => this.scene.launch('GuideScene'));
    const colonyButton = button(this, 0, 0, 114, 38, 'COLONY ◈', 0x7af6bd).setDepth(120).setName('colony-button');
    colonyButton.on('pointerup', () => this.scene.launch('ColonyScene'));
    const speedButton = button(this, 0, 0, 110, 34, 'RUN 1×', 0x65c7ff).setDepth(120).setName('speed-button');
    speedButton.on('pointerup', () => gameStore.cycleSpeed());
  }
  private layout = () => {
    const { width, height } = this.scale; const portrait = width < 650;
    this.topPanel.setSize(width, 58);
    this.topAccent.setSize(width, 2);
    this.resourcesText.setPosition(width - 18, 14); this.populationText.setPosition(width - 18, 35);
    this.objectiveText.setPosition(portrait ? 12 : width / 2, portrait ? 212 : 68).setOrigin(portrait ? 0 : 0.5, 0);
    this.creaturePanel.setPosition(portrait ? width / 2 : 178, portrait ? height - 214 : height - 226).setScale(portrait ? 0.72 : 1);
    this.buildingPanel.setPosition(portrait ? width / 2 : 182, portrait ? height - 190 : height - 182).setScale(portrait ? 0.78 : 1);
    this.buildButton.setPosition(portrait ? width - 84 : width - 92, height - 40);
    (this.children.getByName('profile-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? 68 : width - 230, height - 40);
    (this.children.getByName('save-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? 174 : width - 356, height - 40);
    (this.children.getByName('auth-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? this.scale.width - 58 : width - 468, portrait ? 92 : height - 40);
    (this.children.getByName('guide-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? this.scale.width - 64 : width - 582, portrait ? 140 : height - 40);
    (this.children.getByName('colony-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? 64 : width - 704, portrait ? 92 : height - 40);
    (this.children.getByName('speed-button') as Phaser.GameObjects.Container | null)?.setPosition(width - 70, portrait ? 184 : 88);
    if (this.buildMenu) { this.buildMenu.destroy(true); this.buildMenu = undefined; }
  };
  private updateState(state: WorldState) {
    if (state.time < this.observedTime) {
      this.lastChapter = state.chapter;
      this.observedDeaths = state.deaths;
      this.observedObjectives = state.completedObjectives.length;
    }
    this.observedTime = state.time;
    this.state = state;
    this.topPanel.setFillStyle(state.livingWorld.settings.highContrast ? 0x07100d : 0x2c281c, state.livingWorld.settings.highContrast ? 1 : 0.92);
    const living = state.creatures.filter((c) => c.alive);
    this.resourcesText.setText(`GLOW ${Math.floor(state.resources.glow)}   ·   ALLOY ${Math.floor(state.resources.alloy)}`);
    const silent = state.creatures.filter((creature) => !creature.alive).length;
    this.populationText.setText(`LIVING ${living.length}  /  SILENT ${silent}  /  ${Math.floor(state.time)}s`);
    const activeAlerts = state.livingWorld.alerts.filter((alert) => !alert.dismissed).length;
    const speedButton = this.children.getByName('speed-button') as Phaser.GameObjects.Container | null;
    (speedButton?.getByName('button-label') as Phaser.GameObjects.Text | null)?.setText(`${state.livingWorld.settings.paused ? 'PAUSED' : `RUN ${state.livingWorld.settings.simulationSpeed}×`}${activeAlerts ? `  !${activeAlerts}` : ''}`);
    const chapterNames = ['TENDER SIGNAL', 'THE CHORUS', 'THROUGHPUT', 'THE AUDIT', 'VERDICT'];
    this.chapterText.setText(`CHAPTER 0${state.chapter} / ${chapterNames[state.chapter - 1]}`);
    this.selected = state.creatures.find((c) => c.id === this.selected?.id) ?? living[0] ?? state.creatures[0];
    if (this.selected) this.renderCreature(this.selected);
    if (this.selectedBuildingId) {
      const building = state.buildings.find((candidate) => candidate.id === this.selectedBuildingId);
      if (building) this.renderBuilding(building); else this.showCreaturePanel();
    }
    this.updateObjective(state);
    this.queueRecoveryIfNeeded(living.length);
    if (state.completedObjectives.length > this.observedObjectives) {
      const completedIds = state.completedObjectives.slice(this.observedObjectives);
      const completed = completedIds.map((id) => OBJECTIVES.find((objective) => objective.id === id)).filter((objective) => objective !== undefined);
      if (completed.length) {
        const reward = completed.reduce((sum, objective) => sum + objective.reward, 0);
        const alloy = completed.reduce((sum, objective) => sum + (objective.alloyReward ?? 0), 0);
        const research = completed.reduce((sum, objective) => sum + (objective.researchReward ?? 0), 0);
        const extras = [alloy ? `+${alloy} ALLOY` : '', research ? `+${research} RP` : ''].filter(Boolean).join(' · ');
        const optionalOnly = completed.every((objective) => objective.optional);
        this.showToast(optionalOnly ? 'Optional colony memory recorded' : `${completed.length === 1 ? 'Guided step complete' : `${completed.length} guided steps complete`} · +${reward} GLOW${extras ? ` · ${extras}` : ''}`);
        this.game.events.emit('glitch', 0.18);
        const next = OBJECTIVES.filter((objective) => !objective.optional).find((objective) => !state.completedObjectives.includes(objective.id));
        if (!optionalOnly && state.livingWorld.settings.tutorial && next) this.time.delayedCall(2300, () => this.showToast(`NEXT · ${next.hint}`));
      }
      this.observedObjectives = state.completedObjectives.length;
    }
    if (state.chapter > this.lastChapter) {
      this.lastChapter = state.chapter; this.game.events.emit('glitch', 0.65); this.time.delayedCall(500, () => this.scene.launch('ProfileScene', { checkpoint: true }));
      const nextDialogue = state.chapter === 2 ? 'division' : state.chapter === 3 ? 'pollution' : state.chapter === 4 ? 'freedom' : undefined;
      if (nextDialogue) this.time.delayedCall(1200, () => this.openDialogue(nextDialogue));
    }
    if (state.deaths > this.observedDeaths) { this.observedDeaths = state.deaths; this.time.delayedCall(800, () => this.openDialogue('death')); }
    if (state.chapter === 4 && !state.dialogueHistory.includes('mirror') && state.time > 240) this.openDialogue('mirror');
    if (state.chapter === 4 && state.time > 330 && !state.endingId) this.openDialogue('ending');
  }
  private renderCreature(creature: CreatureState) {
    this.creatureName.setText(creature.name); this.creatureStatus.setText(creature.alive ? `${creature.task.toUpperCase()} · GEN ${creature.generation}` : 'SILENT').setColor(creature.alive ? '#90c9b0' : '#ff735f');
    this.creatureRole.setText(`${ROLE_LABELS[creature.assignedRole]}  ·  ${creature.autoRole ? 'SELF-DIRECTED' : 'ASSIGNED'}  ·  STRESS ${Math.round(creature.stress)}%`);
    const strongestBond = Object.entries(creature.bonds).sort((a, b) => b[1] - a[1])[0];
    const bondName = strongestBond ? this.state.creatures.find((candidate) => candidate.id === strongestBond[0])?.name : undefined;
    this.creaturePersonality.setText(`${personalityLabels(creature.personality).join(' · ')}${bondName ? `  /  ${relationshipStage(strongestBond[1])} ${bondName} ${Math.round(strongestBond[1])}%` : ''}\nCONCERN  ${creature.currentConcern}`);
    this.creaturePreference.setText(`LOVES ${ACTIVITY_LABELS[creature.preferences.favoriteActivity]}  ·  ${BUILDINGS[creature.preferences.favoriteBuilding].name.toUpperCase()}`);
    this.creatureAmbition.setText(`AMBITION  ${creature.ambition.description.toUpperCase()}  ·  ${Math.min(100, Math.round(creature.ambition.progress / creature.ambition.target * 100))}%`);
    const skillRows = [0, 2, 4].map((index) => {
      const left = SKILL_KEYS[index]; const right = SKILL_KEYS[index + 1];
      return `${SKILL_LABELS[left].padEnd(8)} L${skillLevel(creature.skills[left])} ${Math.round(creature.skills[left]).toString().padStart(2)}%    ${SKILL_LABELS[right].padEnd(8)} L${skillLevel(creature.skills[right])} ${Math.round(creature.skills[right]).toString().padStart(2)}%`;
    });
    this.creatureSkills.setText(`SKILLS / PRACTICE\n${skillRows.join('\n')}`);
    Object.entries(creature.needs).forEach(([key, value]) => {
      const view = this.meters.get(key); if (view) {
        view.target = view.width * value / 100;
        const colors = this.state.livingWorld.settings.colorBlind
          ? { hunger: 0xffc857, hygiene: 0x2ec4e6, happiness: 0xf45bba, health: 0x8cff98, energy: 0xf4f1de }
          : { hunger: 0xf7bd62, hygiene: 0x65c7ff, happiness: 0xbf78ff, health: 0x7af6bd, energy: 0xff8fcf };
        view.fill.setFillStyle((colors as Record<string, number>)[key]);
      }
    });
    this.careButtons.forEach((control) => control.setAlpha(creature.alive ? 1 : 0.3));
  }
  private renderBuilding(building: BuildingState) {
    const def = BUILDINGS[building.kind];
    const occupants = this.state.creatures.filter((creature) => creature.alive && creature.destinationBuildingId === building.id);
    const active = occupants.filter((creature) => creature.isBeingServed).length;
    const queued = Math.max(0, occupants.length - active);
    this.buildingName.setText(`${def.glyph}  ${buildingDisplayName(building).toUpperCase()}`);
    this.buildingLevel.setText(`LEVEL ${building.level} / 2`);
    this.buildingDetails.setText(`${def.description}\n\nCURRENT EFFECT\n${building.level >= 2 ? upgradeDescription(building, building.upgradeBranch ?? 'quality') : def.effect}\n\nINFLUENCE ${building.influenceRadius}m  ·  DURABILITY ${Math.round(building.durability)}%`);
    this.buildingActivity.setText(`SERVICE STATIONS  ${active} / ${buildingCapacity(building)}\nWAITING IN QUEUE  ${queued}\nFACILITY STATUS  ${building.constructing ? `CONSTRUCTION ${Math.floor(building.constructionProgress)}%` : building.active ? 'ACTIVE' : 'OFFLINE'}`);
    if (building.level >= 2) {
      this.buildingUpgradeCost.setText('MAXIMUM UPGRADE INSTALLED');
      this.upgradeButton.setAlpha(0.35).disableInteractive();
      this.capacityUpgradeButton.setAlpha(0.35).disableInteractive();
    } else {
      const qualityCost = upgradeCost(building, 'quality'); const capacityCost = upgradeCost(building, 'capacity');
      const qualityAffordable = canAffordUpgrade(this.state.resources, building, 'quality'); const capacityAffordable = canAffordUpgrade(this.state.resources, building, 'capacity');
      this.buildingUpgradeCost.setText(`QUALITY: ${upgradeDescription(building, 'quality')}  ·  ${qualityCost.glow}G/${qualityCost.alloy}A\nCAPACITY: ${upgradeDescription(building, 'capacity')}  ·  ${capacityCost.glow}G/${capacityCost.alloy}A`);
      this.upgradeButton.setAlpha(qualityAffordable ? 1 : 0.48); this.capacityUpgradeButton.setAlpha(capacityAffordable ? 1 : 0.48);
      if (qualityAffordable) this.upgradeButton.setInteractive({ useHandCursor: true }); else this.upgradeButton.disableInteractive();
      if (capacityAffordable) this.capacityUpgradeButton.setInteractive({ useHandCursor: true }); else this.capacityUpgradeButton.disableInteractive();
    }
  }
  private updateObjective(state: WorldState) {
    const guided = OBJECTIVES.filter((objective) => !objective.optional);
    const completed = guided.filter((objective) => state.completedObjectives.includes(objective.id)).length;
    const current = guided.find((objective) => !state.completedObjectives.includes(objective.id));
    if (!current) { this.objectiveText.setText('GUIDED JOURNEY COMPLETE / THE HABITAT REMEMBERS'); return; }
    const rewards = [`+${current.reward} GLOW`, current.alloyReward ? `+${current.alloyReward} ALLOY` : '', current.researchReward ? `+${current.researchReward} RP` : ''].filter(Boolean).join(' · ');
    this.objectiveText.setText(`GUIDED STEP ${completed + 1} / ${guided.length}  ·  ${current.title.toUpperCase()}\n${current.hint}\nREWARD ${rewards}  ·  CLICK FOR HELP`);
  }
  private openObjectiveGuide() {
    const current = OBJECTIVES.filter((objective) => !objective.optional).find((objective) => !this.state.completedObjectives.includes(objective.id));
    const roleOrResearch = current && ['assign-role', 'first-research'].includes(current.id);
    const building = current && ['place-food', 'complete-food', 'place-wash', 'first-upgrade', 'complete-upgrade', 'place-play', 'industry'].includes(current.id);
    this.scene.launch('GuideScene', { page: roleOrResearch ? 4 : building ? 2 : 0 });
  }
  private queueRecoveryIfNeeded(living: number) {
    if (living > 0) { this.recoveryTimer?.remove(false); this.recoveryTimer = undefined; return; }
    if (this.scene.isActive('RecoveryScene') || this.recoveryTimer) return;
    this.recoveryTimer = this.time.delayedCall(1200, () => {
      this.recoveryTimer = undefined;
      if (gameStore.get().creatures.some((creature) => creature.alive) || this.scene.isActive('RecoveryScene')) return;
      if (this.scene.isActive('AwaySummaryScene')) { this.queueRecoveryIfNeeded(0); return; }
      this.scene.launch('RecoveryScene');
    });
  }
  private showCreaturePanel() { this.selectedBuildingId = undefined; this.buildingPanel.setVisible(false); this.creaturePanel.setVisible(true); }
  private selectCreature = (creature?: CreatureState) => { if (creature) { this.showCreaturePanel(); this.selected = creature; this.renderCreature(creature); } };
  private selectBuilding = (building?: BuildingState) => {
    if (!building) return;
    this.selectedBuildingId = building.id; this.creaturePanel.setVisible(false); this.buildingPanel.setVisible(true); this.renderBuilding(building);
  };
  private upgradeSelectedBuilding(branch: 'quality' | 'capacity') {
    if (!this.selectedBuildingId) return;
    const building = this.state.buildings.find((candidate) => candidate.id === this.selectedBuildingId); if (!building) return;
    if (gameStore.upgradeBuilding(building.id, branch)) {
      this.showToast(`${branch === 'quality' ? 'Quality' : 'Capacity'} construction started · builders will carry the work`);
      this.game.events.emit('glitch', 0.22);
    } else this.showToast('Not enough GLOW or ALLOY for this upgrade');
  }
  private toggleBuildMenu() {
    if (this.buildMenu) { this.buildMenu.destroy(true); this.buildMenu = undefined; return; }
    const living = this.state.creatures.filter((c) => c.alive).length;
    this.buildMenu = new BuildingMenu(this, this.scale.width / 2, this.scale.height / 2, living, (kind) => {
      this.buildMenu?.destroy(true); this.buildMenu = undefined; this.game.events.emit('build-select', kind); this.showToast(`Place ${BUILDINGS[kind].name} inside the habitat`);
    });
  }
  private openDialogue = (id: string) => {
    if (!this.state.dialogueHistory.includes(id) && !this.scene.isActive('DialogueScene')) this.scene.launch('DialogueScene', { id });
  };
  private showToast = (message: string) => {
    this.toast?.destroy(); this.toast = crisp(this.add.text(this.scale.width / 2, this.scale.height - 84, message, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '13px', color: '#071410', backgroundColor: '#7af6bd', padding: { x: 14, y: 9 } })).setOrigin(0.5).setDepth(500);
    this.tweens.add({ targets: this.toast, alpha: 0, y: this.toast.y - 18, delay: 1600, duration: 500, onComplete: () => { this.toast?.destroy(); this.toast = undefined; } });
  };
  update(_time: number, delta: number) {
    const smoothing = 1 - Math.exp(-Math.min(delta, 50) * 0.018);
    this.meters.forEach((view) => { view.fill.width += (view.target - view.fill.width) * smoothing; });
  }
  shutdown() {
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.game.events.off('creature-selected', this.selectCreature, this);
    this.game.events.off('building-selected', this.selectBuilding, this);
    this.game.events.off('toast', this.showToast, this);
    this.game.events.off('open-dialogue', this.openDialogue, this);
    this.scale.off('resize', this.layout, this);
    this.buildMenu?.destroy(true); this.buildMenu = undefined;
    this.toast?.destroy(); this.toast = undefined;
    this.recoveryTimer?.remove(false); this.recoveryTimer = undefined;
  }
}
