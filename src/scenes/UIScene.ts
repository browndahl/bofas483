import Phaser from 'phaser';
import objectives from '../data/objectives.json';
import { BUILDINGS } from '../simulation/building';
import { personalityLabels } from '../simulation/personality';
import type { CreatureState, WorldState } from '../simulation/worldState';
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
  private meters = new Map<string, MeterView>();
  private careButtons: Phaser.GameObjects.Container[] = [];
  private buildButton!: Phaser.GameObjects.Container;
  private objectiveText!: Phaser.GameObjects.Text;
  private buildMenu?: BuildingMenu;
  private toast?: Phaser.GameObjects.Text;
  private lastChapter = 1;
  private observedDeaths = 0;
  private observedObjectives = 0;
  private observedTime = 0;

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

    this.creaturePanel = this.add.container(0, 0).setDepth(110);
    this.creaturePanel.add(panel(this, 0, 0, 280, 294));
    this.creatureName = crisp(this.add.text(-120, -124, 'PIP-01', { fontFamily: DISPLAY_FONT, fontSize: '16px', color: '#fff0a8', letterSpacing: 0.7 }));
    this.creatureStatus = crisp(this.add.text(120, -122, 'ALIVE', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#d8c69a' })).setOrigin(1, 0);
    this.creaturePersonality = crisp(this.add.text(-120, -105, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '9px', color: '#90c9b0', letterSpacing: 0.6 }));
    this.creaturePanel.add([this.creatureName, this.creatureStatus, this.creaturePersonality]);
    const meterDefs = [['hunger', 'NOURISHMENT', 0xf7bd62], ['hygiene', 'CLARITY', 0x65c7ff], ['happiness', 'RESONANCE', 0xbf78ff], ['health', 'INTEGRITY', 0x7af6bd], ['energy', 'CHARGE', 0xff8fcf]] as const;
    meterDefs.forEach(([key, label, color], index) => {
      const view = meter(this, -120, -88 + index * 31, 240, label, color);
      this.creaturePanel.add([view.title, view.back, view.fill]); this.meters.set(key, view);
    });
    const labels: Array<[string, string]> = [['FEED +', 'hunger'], ['WASH ≋', 'hygiene'], ['PLAY ✣', 'happiness']];
    labels.forEach(([label, need], index) => {
      const control = button(this, -82 + index * 82, 112, 74, 42, label, [0xf7bd62, 0x65c7ff, 0xbf78ff][index]);
      control.on('pointerup', () => this.game.events.emit('care', need)); this.creaturePanel.add(control); this.careButtons.push(control);
    });
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
  }
  private layout = () => {
    const { width, height } = this.scale; const portrait = width < 650;
    this.topPanel.setSize(width, 58);
    this.topAccent.setSize(width, 2);
    this.resourcesText.setPosition(width - 18, 14); this.populationText.setPosition(width - 18, 35);
    this.objectiveText.setPosition(portrait ? 12 : width / 2, 68).setOrigin(portrait ? 0 : 0.5, 0);
    this.creaturePanel.setPosition(portrait ? width / 2 : 158, portrait ? height - 240 : height - 166).setScale(portrait ? 0.88 : 1);
    this.buildButton.setPosition(portrait ? width - 84 : width - 92, height - 40);
    (this.children.getByName('profile-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? 68 : width - 230, height - 40);
    (this.children.getByName('save-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? 174 : width - 356, height - 40);
    (this.children.getByName('auth-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? this.scale.width - 58 : width - 468, portrait ? 92 : height - 40);
    (this.children.getByName('guide-button') as Phaser.GameObjects.Container | null)?.setPosition(portrait ? this.scale.width - 64 : width - 582, portrait ? 140 : height - 40);
    if (this.buildMenu) { this.buildMenu.setPosition(width / 2, height / 2); }
  };
  private updateState(state: WorldState) {
    if (state.time < this.observedTime) {
      this.lastChapter = state.chapter;
      this.observedDeaths = state.deaths;
      this.observedObjectives = state.completedObjectives.length;
    }
    this.observedTime = state.time;
    this.state = state;
    const living = state.creatures.filter((c) => c.alive);
    this.resourcesText.setText(`GLOW ${Math.floor(state.resources.glow)}   ·   ALLOY ${Math.floor(state.resources.alloy)}`);
    this.populationText.setText(`LIVING ${living.length}  /  SILENT ${state.deaths}  /  ${Math.floor(state.time)}s`);
    const chapterNames = ['TENDER SIGNAL', 'THE CHORUS', 'THROUGHPUT', 'THE AUDIT', 'VERDICT'];
    this.chapterText.setText(`CHAPTER 0${state.chapter} / ${chapterNames[state.chapter - 1]}`);
    this.selected = state.creatures.find((c) => c.id === this.selected?.id) ?? living[0] ?? state.creatures[0];
    if (this.selected) this.renderCreature(this.selected);
    this.updateObjective(state);
    if (state.completedObjectives.length > this.observedObjectives) {
      const completedIds = state.completedObjectives.slice(this.observedObjectives);
      const completed = completedIds.map((id) => objectives.find((objective) => objective.id === id)).filter((objective) => objective !== undefined);
      if (completed.length) {
        const reward = completed.reduce((sum, objective) => sum + objective.reward, 0);
        this.showToast(completed.length === 1 ? `Objective complete · +${reward} GLOW` : `${completed.length} objectives complete · +${reward} GLOW`);
        this.game.events.emit('glitch', 0.18);
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
    this.creatureName.setText(creature.name); this.creatureStatus.setText(creature.alive ? `${creature.task.toUpperCase()} · GEN ${creature.generation}` : 'SILENT').setColor(creature.alive ? '#678779' : '#ff735f');
    const strongestBond = Object.entries(creature.bonds).sort((a, b) => b[1] - a[1])[0];
    const bondName = strongestBond ? this.state.creatures.find((candidate) => candidate.id === strongestBond[0])?.name : undefined;
    this.creaturePersonality.setText(`${personalityLabels(creature.personality).join(' · ')}${bondName ? `  /  CLOSE TO ${bondName}` : ''}`);
    Object.entries(creature.needs).forEach(([key, value]) => {
      const view = this.meters.get(key); if (view) view.target = view.width * value / 100;
    });
    this.careButtons.forEach((control) => control.setAlpha(creature.alive ? 1 : 0.3));
  }
  private updateObjective(state: WorldState) {
    const current = objectives.find((objective) => !state.completedObjectives.includes(objective.id));
    this.objectiveText.setText(current ? `OBJECTIVE / ${current.title.toUpperCase()}\n${current.hint}` : 'OBJECTIVES COMPLETE / THE HABITAT REMEMBERS');
  }
  private selectCreature = (creature?: CreatureState) => { if (creature) { this.selected = creature; this.renderCreature(creature); } };
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
    this.game.events.off('toast', this.showToast, this);
    this.game.events.off('open-dialogue', this.openDialogue, this);
    this.scale.off('resize', this.layout, this);
    this.buildMenu?.destroy(true); this.buildMenu = undefined;
    this.toast?.destroy(); this.toast = undefined;
  }
}
