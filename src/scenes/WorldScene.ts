import Phaser from 'phaser';
import { BUILDINGS } from '../simulation/building';
import type { BuildingKind, BuildingState, CreatureState, WorldState } from '../simulation/worldState';
import { gameStore } from '../state/gameStateStore';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

interface CreatureView {
  container: Phaser.GameObjects.Container;
  actor: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  aura: Phaser.GameObjects.Arc;
  selection: Phaser.GameObjects.Arc;
  body: Phaser.GameObjects.Graphics;
  eyes: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  lastAlive: boolean;
  visualSignature: string;
}

interface AmbientMote { node: Phaser.GameObjects.Arc; originX: number; originY: number; phase: number; speed: number }

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
  private ambientMotes: AmbientMote[] = [];
  private pollutionSignature = '';

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
    background.fillGradientStyle(0x0d251b, 0x071710, 0x10271f, 0x06100c, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const islands = [
      { x: 300, y: 280, w: 430, h: 250, color: 0x173d2d },
      { x: 840, y: 600, w: 650, h: 350, color: 0x12392d },
      { x: 1320, y: 250, w: 370, h: 230, color: 0x1b352c },
      { x: 1320, y: 820, w: 400, h: 200, color: 0x152f28 }
    ];
    islands.forEach((island, index) => {
      background.fillStyle(0x7af6bd, 0.025).fillEllipse(island.x, island.y, island.w + 90, island.h + 80);
      background.fillStyle(island.color, 0.7).fillEllipse(island.x, island.y, island.w, island.h);
      background.lineStyle(2, index % 2 ? 0x315a49 : 0x285f46, 0.38).strokeEllipse(island.x, island.y, island.w, island.h);
      background.lineStyle(1, 0x7af6bd, 0.12).strokeEllipse(island.x, island.y, island.w - 42, island.h - 34);
    });

    background.lineStyle(2, 0x4da77b, 0.16);
    const paths = [
      [[110, 620], [350, 520], [610, 610], [850, 470], [1110, 560], [1490, 440]],
      [[220, 160], [470, 260], [700, 210], [960, 340], [1260, 250], [1480, 330]]
    ];
    paths.forEach((points) => {
      background.beginPath().moveTo(points[0][0], points[0][1]);
      points.slice(1).forEach(([x, y]) => background.lineTo(x, y));
      background.strokePath();
    });

    background.lineStyle(1, 0x315a49, 0.15);
    for (let x = 0; x <= WORLD_WIDTH; x += 100) background.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += 100) background.lineBetween(0, y, WORLD_WIDTH, y);
    background.lineStyle(3, 0x4b8f6f, 0.5).strokeRoundedRect(28, 28, WORLD_WIDTH - 56, WORLD_HEIGHT - 56, 42);
    background.lineStyle(1, 0x7af6bd, 0.13).strokeRoundedRect(40, 40, WORLD_WIDTH - 80, WORLD_HEIGHT - 80, 34);

    for (let i = 0; i < 44; i++) {
      const originX = (i * 197 + 47) % WORLD_WIDTH;
      const originY = (i * 83 + 131) % WORLD_HEIGHT;
      const node = this.add.circle(originX, originY, 1 + (i % 3), i % 7 === 0 ? 0xd69aff : 0x88ffd0, 0.16 + (i % 4) * 0.04).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
      this.ambientMotes.push({ node, originX, originY, phase: i * 0.73, speed: 0.35 + (i % 5) * 0.08 });
    }
    crisp(this.add.text(64, 58, 'HABITAT 483  ·  LUMEN FIELD ONLINE', { fontFamily: DISPLAY_FONT, fontSize: '13px', color: '#72b895', letterSpacing: 1.2 })).setDepth(3);
    crisp(this.add.text(WORLD_WIDTH - 64, 58, 'LOCAL TIME / CONTINUOUS WHILE OBSERVED', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#63997e', letterSpacing: 0.5 })).setOrigin(1, 0).setDepth(3);
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
    if (creature) { this.selectedId = id; this.syncState(this.state); this.cameras.main.pan(creature.x, creature.y, 420, 'Sine.easeInOut'); this.game.events.emit('creature-selected', creature); }
  };
  private handleBuildSelect = (kind: BuildingKind) => {
    this.placementKind = kind;
    this.placementGhost?.destroy();
    const def = BUILDINGS[kind];
    const base = this.add.image(0, 0, 'building-base').setTint(def.color).setAlpha(0.45);
    const glyph = crisp(this.add.text(0, 0, def.glyph, { fontFamily: UI_FONT, fontSize: '28px', color: '#071410' })).setOrigin(0.5);
    this.placementGhost = this.add.container(800, 500, [base, glyph]).setDepth(20);
  };
  private createCreatureView(creature: CreatureState): CreatureView {
    const shadow = this.add.ellipse(0, 28, 54, 17, 0x000000, 0.32);
    const aura = this.add.circle(0, 0, 38, Phaser.Display.Color.HSVToRGB(creature.hue / 360, 0.52, 0.96).color, 0.12).setBlendMode(Phaser.BlendModes.ADD);
    const selection = this.add.circle(0, 0, 35, 0x000000, 0).setStrokeStyle(2, 0x7af6bd, 0);
    const body = this.add.graphics(); const eyes = this.add.graphics();
    const status = crisp(this.add.text(29, -34, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '14px', color: '#071410', backgroundColor: '#f7bd62', padding: { x: 4, y: 2 } })).setOrigin(0.5).setVisible(false);
    const actor = this.add.container(0, 0, [aura, selection, body, eyes, status]);
    const label = crisp(this.add.text(0, 44, creature.name, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#d9f5e7', backgroundColor: '#06100cf0', padding: { x: 7, y: 4 } })).setOrigin(0.5).setStroke('#06100c', 1);
    const container = this.add.container(creature.x, creature.y, [shadow, actor, label]).setSize(82, 98).setDepth(10).setInteractive({ useHandCursor: true });
    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 8) { this.selectedId = creature.id; this.syncState(this.state); this.game.events.emit('creature-selected', this.state.creatures.find((c) => c.id === creature.id)); this.soundPulse(520, 80); }
    });
    return { container, actor, shadow, aura, selection, body, eyes, status, label, lastAlive: creature.alive, visualSignature: '' };
  }
  private drawCreature(view: CreatureView, creature: CreatureState) {
    const n = creature.needs; const sick = n.health < 48; const tired = n.energy < 25; const sad = n.happiness < 38;
    const color = creature.alive ? Phaser.Display.Color.HSVToRGB(creature.hue / 360, sick ? 0.18 : 0.5, sick ? 0.55 : 0.95).color : 0x39463f;
    const selected = creature.id === this.selectedId;
    const dirty = n.hygiene < 35; const hungry = n.hunger < 30;
    const signature = [creature.alive, sick, tired, sad, dirty, hungry, selected].join(':');
    const labelText = creature.alive ? `${creature.name}  ·  ${creature.task.toUpperCase()}` : `${creature.name}  ·  SILENT`;
    if (view.label.text !== labelText) view.label.setText(labelText);
    view.label.setColor(selected ? '#a6ffcf' : '#b5d9c8');
    if (view.visualSignature === signature) return;
    view.visualSignature = signature;
    const light = Phaser.Display.Color.ValueToColor(color).clone().lighten(24).color;
    const dark = Phaser.Display.Color.ValueToColor(color).clone().darken(38).color;
    view.body.clear(); view.eyes.clear();
    view.selection.setStrokeStyle(selected ? 2 : 1, selected ? 0xa6ffcf : color, selected ? 0.85 : 0.16).setScale(selected ? 1 : 0.92);
    view.aura.setFillStyle(color, creature.alive ? (selected ? 0.2 : 0.11) : 0.035);
    if (creature.alive) {
      view.body.fillStyle(dark, 0.52).fillEllipse(0, 5, 57, 62);
      view.body.fillStyle(color, 1).fillEllipse(0, 0, 54, 62);
      view.body.fillTriangle(-20, -20, -10, -42, -2, -24).fillTriangle(20, -20, 10, -42, 2, -24);
      view.body.lineStyle(2, light, 0.55).strokeEllipse(0, 0, 51, 59);
      view.body.fillStyle(light, 0.26).fillEllipse(-11, -13, 20, 25);
      view.body.fillStyle(0xffffff, 0.3).fillCircle(-14, -18, 4);
      view.body.fillStyle(light, 0.18).fillEllipse(0, 16, 33, 21);
    } else {
      view.body.fillStyle(0x26352e, 0.78).fillEllipse(0, 18, 62, 25).lineStyle(2, 0x758a7e, 0.4).strokeEllipse(0, 18, 62, 25);
      view.body.lineStyle(2, 0xb1c0b7, 0.42).lineBetween(-13, 10, -6, 17).lineBetween(-6, 10, -13, 17).lineBetween(6, 10, 13, 17).lineBetween(13, 10, 6, 17);
    }
    view.eyes.clear().fillStyle(0x06100c, 1);
    if (creature.alive && tired) { view.eyes.lineStyle(3, 0x06100c).lineBetween(-14, -4, -6, -4).lineBetween(6, -4, 14, -4); }
    else if (creature.alive) {
      view.eyes.fillEllipse(-10, -4, 7, sad ? 6 : 12).fillEllipse(10, -4, 7, sad ? 6 : 12);
      if (!sad) view.eyes.fillStyle(0xffffff, 0.8).fillCircle(-11, -7, 1.5).fillCircle(9, -7, 1.5);
    }
    if (creature.alive) {
      view.eyes.lineStyle(2, 0x06100c);
      if (sad) view.eyes.beginPath().arc(0, 15, 7, Math.PI, 0, false).strokePath(); else view.eyes.beginPath().arc(0, 9, 7, 0, Math.PI, false).strokePath();
      if (!sad && n.happiness > 72) view.eyes.fillStyle(0xffb0c8, 0.32).fillEllipse(-18, 8, 8, 4).fillEllipse(18, 8, 8, 4);
      if (dirty) view.eyes.fillStyle(0x6f653f, 0.9).fillCircle(-23, 14, 4).fillCircle(21, -17, 3).fillCircle(16, 22, 2);
      if (hungry) view.eyes.lineStyle(2, 0xf7bd62, 0.85).strokeCircle(0, 10, 10);
    }
    const status = !creature.alive ? '' : sick ? '☣' : hungry ? '!' : dirty ? '≋' : sad ? '·' : tired ? 'z' : '';
    view.status.setText(status).setVisible(Boolean(status)).setBackgroundColor(sick ? '#ff735f' : hungry ? '#f7bd62' : dirty ? '#65c7ff' : '#bf78ff');
  }
  private createBuildingView(building: BuildingState) {
    const def = BUILDINGS[building.kind];
    const shadow = this.add.ellipse(0, 28, 112, 30, 0x000000, 0.38);
    const halo = this.add.circle(0, -2, 54, def.color, 0.09).setBlendMode(Phaser.BlendModes.ADD);
    const art = this.add.graphics();
    art.fillStyle(0x081510, 0.98).fillEllipse(0, 22, 108, 35).lineStyle(2, def.color, 0.55).strokeEllipse(0, 22, 108, 35);
    art.fillStyle(def.color, 0.16).fillRoundedRect(-47, -25, 94, 53, 14).lineStyle(2, def.color, 0.72).strokeRoundedRect(-47, -25, 94, 53, 14);
    art.fillStyle(0x0a1b14, 0.96).fillRoundedRect(-38, -17, 76, 37, 10);
    if (building.kind === 'nutrient-bed') art.lineStyle(3, def.color, 0.75).lineBetween(-22, 10, -12, -11).lineBetween(-12, -11, 0, 11).lineBetween(0, 11, 13, -12).lineBetween(13, -12, 25, 9);
    if (building.kind === 'wash-pool') art.lineStyle(3, def.color, 0.8).beginPath().arc(0, 4, 24, Math.PI, 0, false).strokePath();
    if (building.kind === 'resonance-garden') art.lineStyle(2, def.color, 0.8).strokeCircle(0, 2, 17).strokeCircle(0, 2, 27);
    if (building.kind === 'nest') art.fillStyle(def.color, 0.45).fillTriangle(-24, 12, 0, -14, 24, 12).fillStyle(0x081510, 1).fillCircle(0, 6, 9);
    if (building.kind === 'extractor') art.lineStyle(4, def.color, 0.8).lineBetween(-22, 13, 0, -14).lineBetween(0, -14, 22, 13).lineBetween(-22, 13, 22, 13);
    if (building.kind === 'clinic') art.fillStyle(def.color, 0.75).fillRect(-4, -14, 8, 31).fillRect(-15, -3, 30, 8);
    const core = this.add.circle(0, 2, 6, def.color, 0.92).setBlendMode(Phaser.BlendModes.ADD);
    const glyph = crisp(this.add.text(31, -18, def.glyph, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '14px', color: Phaser.Display.Color.IntegerToColor(def.color).rgba })).setOrigin(0.5);
    const name = crisp(this.add.text(0, 49, def.name.toUpperCase(), { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#d5eee2', backgroundColor: '#06100cf0', padding: { x: 7, y: 4 } })).setOrigin(0.5);
    const container = this.add.container(building.x, building.y, [shadow, halo, art, core, glyph, name]).setDepth(7);
    this.tweens.add({ targets: [core, halo], alpha: { from: 0.35, to: 0.9 }, scale: { from: 0.88, to: 1.12 }, duration: 1200 + (building.id.charCodeAt(1) % 5) * 110, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return container;
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
    const signature = state.pollution.map((value) => Math.floor(value / 3)).join(',');
    if (signature === this.pollutionSignature) return;
    this.pollutionSignature = signature;
    this.pollutionGraphics.clear();
    const cw = WORLD_WIDTH / state.pollutionWidth; const ch = WORLD_HEIGHT / state.pollutionHeight;
    state.pollution.forEach((value, index) => {
      if (value < 1) return;
      const x = (index % state.pollutionWidth) * cw + cw / 2; const y = Math.floor(index / state.pollutionWidth) * ch + ch / 2;
      this.pollutionGraphics.fillStyle(0xff6b4f, Math.min(0.19, value / 420)).fillCircle(x, y, cw * (0.36 + value / 150));
      if (value > 28) this.pollutionGraphics.lineStyle(1, 0xffa06c, Math.min(0.25, value / 300)).strokeCircle(x, y, cw * (0.24 + value / 240));
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
  update(time: number, delta: number) {
    const smoothing = 1 - Math.exp(-Math.min(delta, 50) * 0.012);
    const camera = this.cameras.main;
    this.ambientMotes.forEach((mote) => {
      mote.node.x = mote.originX + Math.sin(time * 0.0005 * mote.speed + mote.phase) * 12;
      mote.node.y = mote.originY + Math.cos(time * 0.00038 * mote.speed + mote.phase) * 9;
      mote.node.alpha = 0.13 + (Math.sin(time * 0.0012 + mote.phase) + 1) * 0.09;
    });
    this.state.creatures.forEach((creature) => {
      const view = this.views.get(creature.id); if (!view) return;
      const dx = creature.x - view.container.x; const dy = creature.y - view.container.y;
      view.container.x += dx * smoothing; view.container.y += dy * smoothing;
      const phase = Number(creature.id.replace(/\D/g, '')) * 0.71;
      view.actor.y = creature.alive ? Math.sin(time * 0.004 + phase) * 2.5 : 0;
      view.actor.rotation = Phaser.Math.Linear(view.actor.rotation, creature.alive ? Phaser.Math.Clamp(dx * 0.002, -0.11, 0.11) : 0, smoothing * 0.5);
      const pulse = 1 + Math.sin(time * 0.003 + phase) * 0.055;
      view.aura.setScale(pulse); view.shadow.setScale(1 - (pulse - 1) * 1.5, 1);
      const inView = view.container.x > camera.worldView.left - 100 && view.container.x < camera.worldView.right + 100 && view.container.y > camera.worldView.top - 100 && view.container.y < camera.worldView.bottom + 100;
      view.container.setVisible(inView);
      view.label.setVisible(inView && ((camera.zoom > 0.68 && this.state.creatures.length < 90) || creature.id === this.selectedId));
    });
  }
  shutdown() {
    this.unsubscribe?.(); this.game.events.off('care', this.handleCare, this); this.game.events.off('build-select', this.handleBuildSelect, this); this.game.events.off('care-effect', this.playCareEffect, this); this.scale.off('resize', this.handleResize, this);
  }
}
