import Phaser from 'phaser';
import { BUILDINGS } from '../simulation/building';
import type { BuildingKind, BuildingState, CreatureState, WorldState } from '../simulation/worldState';
import { gameStore } from '../state/gameStateStore';

interface CreatureView { container: Phaser.GameObjects.Container; aura: Phaser.GameObjects.Arc; body: Phaser.GameObjects.Graphics; eyes: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; lastAlive: boolean }

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;

export class WorldScene extends Phaser.Scene {
  private views = new Map<string, CreatureView>();
  private buildingViews = new Map<string, Phaser.GameObjects.Container>();
  private pollutionGraphics!: Phaser.GameObjects.Graphics;
  private selectedId = 'c1';
  private unsubscribe?: () => void;
  private state = gameStore.get();
  private dragging = false;
  private dragStart = new Phaser.Math.Vector2();
  private cameraStart = new Phaser.Math.Vector2();
  private placementKind?: BuildingKind;
  private placementGhost?: Phaser.GameObjects.Container;
  private lastPinchDistance = 0;
  private effectPool: Phaser.GameObjects.Arc[] = [];

  constructor() { super('WorldScene'); }
  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setZoom(this.baseZoom()).centerOn(800, 500);
    this.drawHabitat();
    this.pollutionGraphics = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.configureInput();
    for (let i = 0; i < 24; i++) this.effectPool.push(this.add.circle(0, 0, 3, 0x7af6bd, 0).setDepth(18));
    this.unsubscribe = gameStore.subscribe((state) => { this.state = state; this.syncState(state); });
    this.game.events.on('care', this.handleCare, this);
    this.game.events.on('build-select', this.handleBuildSelect, this);
    this.game.events.on('focus-creature', this.focusCreature, this);
    this.game.events.on('care-effect', this.playCareEffect, this);
    this.scale.on('resize', this.handleResize, this);
    this.scene.launch('UIScene');
    this.scene.launch('GlitchOverlayScene');
    this.time.delayedCall(700, () => this.game.events.emit('open-dialogue', 'awakening'));
  }
  private baseZoom() { return Phaser.Math.Clamp(Math.max(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT), 0.55, 1.25); }
  private drawHabitat() {
    const background = this.add.graphics().setDepth(0);
    background.fillGradientStyle(0x081711, 0x081711, 0x0b1b16, 0x06100c, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    background.lineStyle(1, 0x173c2e, 0.35);
    for (let x = 0; x <= WORLD_WIDTH; x += 80) background.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += 80) background.lineBetween(0, y, WORLD_WIDTH, y);
    background.lineStyle(2, 0x315a49, 0.55).strokeRoundedRect(28, 28, WORLD_WIDTH - 56, WORLD_HEIGHT - 56, 38);
    for (let i = 0; i < 70; i++) {
      const x = (i * 197 + 47) % WORLD_WIDTH;
      const y = (i * 83 + 131) % WORLD_HEIGHT;
      this.add.circle(x, y, 1 + (i % 3), i % 5 === 0 ? 0xbf78ff : 0x7af6bd, 0.12 + (i % 4) * 0.03).setDepth(1);
    }
    this.add.text(64, 58, 'HABITAT 483 / RECOVERED PROCESS', { fontFamily: 'monospace', fontSize: '12px', color: '#315a49', letterSpacing: 2 }).setDepth(1);
  }
  private configureInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true; this.dragStart.set(pointer.x, pointer.y); this.cameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.placementGhost) {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.placementGhost.setPosition(point.x, point.y);
      } else if (this.dragging && pointer.isDown && pointer.getDistance() > 8) {
        const zoom = this.cameras.main.zoom;
        this.cameras.main.scrollX = this.cameraStart.x - (pointer.x - this.dragStart.x) / zoom;
        this.cameras.main.scrollY = this.cameraStart.y - (pointer.y - this.dragStart.y) / zoom;
      }
      const p1 = this.input.pointer1; const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.lastPinchDistance) this.cameras.main.zoom = Phaser.Math.Clamp(this.cameras.main.zoom * (distance / this.lastPinchDistance), 0.55, 1.7);
        this.lastPinchDistance = distance;
      } else this.lastPinchDistance = 0;
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.placementKind && this.placementGhost) {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (point.x > 60 && point.x < 1540 && point.y > 80 && point.y < 930 && gameStore.place(this.placementKind, point.x, point.y)) {
          this.game.events.emit('toast', `${BUILDINGS[this.placementKind].name} connected`);
          this.soundPulse(180, 320);
        } else this.game.events.emit('toast', 'Insufficient resources or invalid site');
        this.placementGhost.destroy(); this.placementGhost = undefined; this.placementKind = undefined;
      }
      this.dragging = false;
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      this.cameras.main.zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.55, 1.7);
    });
  }
  private handleResize = () => {
    if (this.scale.width < 650 || this.cameras.main.zoom < 0.7) this.cameras.main.setZoom(this.baseZoom());
  };
  private handleCare = (need: 'hunger' | 'hygiene' | 'happiness') => {
    if (gameStore.care(this.selectedId, need)) { this.soundPulse(need === 'hunger' ? 220 : need === 'hygiene' ? 420 : 620, 200); this.game.events.emit('care-effect', need); }
  };
  private playCareEffect = (need: 'hunger' | 'hygiene' | 'happiness') => {
    const creature = this.state.creatures.find((item) => item.id === this.selectedId); if (!creature) return;
    const color = need === 'hunger' ? 0xf7bd62 : need === 'hygiene' ? 0x65c7ff : 0xbf78ff;
    this.effectPool.slice(0, 10).forEach((particle, index) => {
      const angle = index / 10 * Math.PI * 2; particle.setPosition(creature.x, creature.y).setFillStyle(color).setAlpha(0.9).setScale(1);
      this.tweens.killTweensOf(particle); this.tweens.add({ targets: particle, x: creature.x + Math.cos(angle) * 58, y: creature.y + Math.sin(angle) * 58, alpha: 0, scale: 0.2, duration: 500, ease: 'Cubic.easeOut' });
    });
  };
  private focusCreature = (id: string) => {
    const creature = this.state.creatures.find((c) => c.id === id);
    if (creature) { this.selectedId = id; this.cameras.main.pan(creature.x, creature.y, 420, 'Sine.easeInOut'); this.game.events.emit('creature-selected', creature); }
  };
  private handleBuildSelect = (kind: BuildingKind) => {
    this.placementKind = kind;
    this.placementGhost?.destroy();
    const def = BUILDINGS[kind];
    const base = this.add.image(0, 0, 'building-base').setTint(def.color).setAlpha(0.45);
    const glyph = this.add.text(0, 0, def.glyph, { fontSize: '28px', color: '#071410' }).setOrigin(0.5);
    this.placementGhost = this.add.container(800, 500, [base, glyph]).setDepth(20);
  };
  private createCreatureView(creature: CreatureState): CreatureView {
    const aura = this.add.circle(0, 3, 31, Phaser.Display.Color.HSVToRGB(creature.hue / 360, 0.52, 0.96).color, 0.13);
    const body = this.add.graphics(); const eyes = this.add.graphics();
    const label = this.add.text(0, 42, creature.name, { fontFamily: 'monospace', fontSize: '10px', color: '#a9cabc', backgroundColor: '#071410aa', padding: { x: 4, y: 2 } }).setOrigin(0.5);
    const container = this.add.container(creature.x, creature.y, [aura, body, eyes, label]).setSize(76, 92).setDepth(10).setInteractive({ useHandCursor: true });
    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 8) { this.selectedId = creature.id; this.game.events.emit('creature-selected', this.state.creatures.find((c) => c.id === creature.id)); this.soundPulse(520, 80); }
    });
    return { container, aura, body, eyes, label, lastAlive: creature.alive };
  }
  private drawCreature(view: CreatureView, creature: CreatureState) {
    const n = creature.needs; const sick = n.health < 48; const tired = n.energy < 25; const sad = n.happiness < 38;
    const color = creature.alive ? Phaser.Display.Color.HSVToRGB(creature.hue / 360, sick ? 0.18 : 0.5, sick ? 0.55 : 0.95).color : 0x39463f;
    view.body.clear().fillStyle(color, creature.alive ? 1 : 0.7);
    if (creature.alive) view.body.fillRoundedRect(-25, -27, 50, 56, 20).fillTriangle(-15, -22, -4, -38, 2, -23).fillTriangle(15, -22, 4, -38, -2, -23);
    else view.body.fillEllipse(0, 14, 58, 24).lineStyle(2, 0x99aa9f, 0.45).lineBetween(-12, 8, -6, 14).lineBetween(-6, 8, -12, 14).lineBetween(6, 8, 12, 14).lineBetween(12, 8, 6, 14);
    view.eyes.clear().fillStyle(0x06100c, 1);
    if (creature.alive && tired) { view.eyes.lineStyle(3, 0x06100c).lineBetween(-14, -4, -6, -4).lineBetween(6, -4, 14, -4); }
    else if (creature.alive) view.eyes.fillEllipse(-10, -4, 6, sad ? 5 : 10).fillEllipse(10, -4, 6, sad ? 5 : 10);
    if (creature.alive) {
      view.eyes.lineStyle(2, 0x06100c);
      if (sad) view.eyes.beginPath().arc(0, 15, 7, Math.PI, 0, false).strokePath(); else view.eyes.beginPath().arc(0, 9, 7, 0, Math.PI, false).strokePath();
      if (n.hygiene < 35) view.eyes.fillStyle(0x5f5b3b, 0.9).fillCircle(-23, 14, 4).fillCircle(20, -17, 3);
      if (n.hunger < 30) view.eyes.lineStyle(2, 0xf7bd62, 0.8).strokeCircle(0, 9, 10);
    }
    view.aura.setFillStyle(color, creature.alive ? 0.13 : 0.04).setScale(1 + Math.sin(this.time.now / 380 + Number(creature.id.slice(1))) * 0.08);
    view.label.setText(creature.alive ? `${creature.name} · ${creature.task.toUpperCase()}` : `${creature.name} · SILENT`).setColor(creature.id === this.selectedId ? '#7af6bd' : '#a9cabc');
  }
  private createBuildingView(building: BuildingState) {
    const def = BUILDINGS[building.kind];
    const shadow = this.add.ellipse(0, 26, 108, 28, 0x000000, 0.35);
    const base = this.add.image(0, 0, 'building-base').setTint(def.color).setAlpha(0.88);
    const inner = this.add.rectangle(0, 4, 93, 48, 0x071410, 0.62).setStrokeStyle(1, 0xffffff, 0.18);
    const glyph = this.add.text(0, -1, def.glyph, { fontFamily: 'monospace', fontSize: '27px', color: Phaser.Display.Color.IntegerToColor(def.color).rgba }).setOrigin(0.5);
    const name = this.add.text(0, 48, def.name.toUpperCase(), { fontFamily: 'monospace', fontSize: '9px', color: '#a9cabc', backgroundColor: '#071410cc', padding: { x: 5, y: 2 } }).setOrigin(0.5);
    return this.add.container(building.x, building.y, [shadow, base, inner, glyph, name]).setDepth(7);
  }
  private syncState(state: WorldState) {
    const creatureIds = new Set(state.creatures.map((creature) => creature.id));
    this.views.forEach((view, id) => { if (!creatureIds.has(id)) { view.container.destroy(); this.views.delete(id); } });
    const buildingIds = new Set(state.buildings.map((building) => building.id));
    this.buildingViews.forEach((view, id) => { if (!buildingIds.has(id)) { view.destroy(); this.buildingViews.delete(id); } });
    state.creatures.forEach((creature) => {
      let view = this.views.get(creature.id);
      if (!view) { view = this.createCreatureView(creature); this.views.set(creature.id, view); }
      if (view.lastAlive && !creature.alive) { this.cameras.main.shake(400, 0.006); this.game.events.emit('glitch', 0.9); }
      view.lastAlive = creature.alive;
      this.drawCreature(view, creature);
    });
    state.buildings.forEach((building) => { if (!this.buildingViews.has(building.id)) this.buildingViews.set(building.id, this.createBuildingView(building)); });
    this.drawPollution(state);
  }
  private drawPollution(state: WorldState) {
    this.pollutionGraphics.clear();
    const cw = WORLD_WIDTH / state.pollutionWidth; const ch = WORLD_HEIGHT / state.pollutionHeight;
    state.pollution.forEach((value, index) => {
      if (value < 1) return;
      const x = (index % state.pollutionWidth) * cw + cw / 2; const y = Math.floor(index / state.pollutionWidth) * ch + ch / 2;
      this.pollutionGraphics.fillStyle(0xa85342, Math.min(0.24, value / 320)).fillCircle(x, y, cw * (0.4 + value / 160));
    });
  }
  private soundPulse(frequency: number, duration: number) {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, context.currentTime + duration / 1000);
      gain.gain.setValueAtTime(0.055, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration / 1000);
      oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration / 1000);
    } catch { /* audio is optional */ }
  }
  update() {
    this.state.creatures.forEach((creature) => {
      const view = this.views.get(creature.id); if (!view) return;
      view.container.x = Phaser.Math.Linear(view.container.x, creature.x, 0.16);
      view.container.y = Phaser.Math.Linear(view.container.y, creature.y, 0.16);
    });
  }
  shutdown() {
    this.unsubscribe?.(); this.game.events.off('care', this.handleCare, this); this.game.events.off('build-select', this.handleBuildSelect, this); this.game.events.off('care-effect', this.playCareEffect, this); this.scale.off('resize', this.handleResize, this);
  }
}
