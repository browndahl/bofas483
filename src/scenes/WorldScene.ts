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

interface AmbientMote { node: Phaser.GameObjects.Rectangle; originX: number; originY: number; phase: number; speed: number }

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
  private effectPool: Phaser.GameObjects.Rectangle[] = [];
  private ambientMotes: AmbientMote[] = [];
  private pollutionSignature = '';

  constructor() { super('WorldScene'); }
  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setZoom(this.baseZoom()).centerOn(800, 500);
    this.drawHabitat();
    this.pollutionGraphics = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.configureInput();
    for (let i = 0; i < 24; i++) this.effectPool.push(this.add.rectangle(0, 0, 5, 5, 0x7af6bd, 0).setDepth(18));
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
    this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'habitat-pixel-map').setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
    const frame = this.add.graphics().setDepth(1);
    frame.lineStyle(5, 0x3a2918, 0.75).strokeRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12);
    frame.lineStyle(2, 0xc9aa64, 0.35).strokeRect(13, 13, WORLD_WIDTH - 26, WORLD_HEIGHT - 26);

    for (let i = 0; i < 44; i++) {
      const originX = (i * 197 + 47) % WORLD_WIDTH;
      const originY = (i * 83 + 131) % WORLD_HEIGHT;
      const node = this.add.rectangle(originX, originY, 2 + (i % 2) * 2, 2 + (i % 2) * 2, i % 7 === 0 ? 0xd8b6ff : 0xa9ffcf, 0.2 + (i % 4) * 0.04).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
      this.ambientMotes.push({ node, originX, originY, phase: i * 0.73, speed: 0.35 + (i % 5) * 0.08 });
    }
    crisp(this.add.text(52, 42, 'HABITAT 483  ·  LUMEN FIELD', { fontFamily: DISPLAY_FONT, fontSize: '13px', color: '#fff1ba', backgroundColor: '#3a2918cc', padding: { x: 9, y: 5 }, letterSpacing: 1 })).setDepth(3);
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
    const shadow = this.add.ellipse(2, 29, 48, 13, 0x18200e, 0.48);
    const aura = this.add.circle(0, 0, 34, Phaser.Display.Color.HSVToRGB(creature.hue / 360, 0.52, 0.96).color, 0.1).setBlendMode(Phaser.BlendModes.ADD);
    const selection = this.add.circle(0, 0, 34, 0x000000, 0).setStrokeStyle(3, 0xffec9c, 0);
    const body = this.add.graphics(); const eyes = this.add.graphics();
    const status = crisp(this.add.text(29, -34, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '14px', color: '#071410', backgroundColor: '#f7bd62', padding: { x: 4, y: 2 } })).setOrigin(0.5).setVisible(false);
    const actor = this.add.container(0, 0, [aura, selection, body, eyes, status]);
    const label = crisp(this.add.text(0, 45, creature.name, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#fff1ba', backgroundColor: '#352816e8', padding: { x: 7, y: 4 } })).setOrigin(0.5).setStroke('#20170d', 1);
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
    view.label.setColor(selected ? '#fff4a8' : '#f4e2ae');
    if (view.visualSignature === signature) return;
    view.visualSignature = signature;
    const light = Phaser.Display.Color.ValueToColor(color).clone().lighten(24).color;
    const dark = Phaser.Display.Color.ValueToColor(color).clone().darken(38).color;
    view.body.clear(); view.eyes.clear();
    view.selection.setStrokeStyle(selected ? 3 : 1, selected ? 0xffec9c : color, selected ? 0.95 : 0.12).setScale(selected ? 1 : 0.92);
    view.aura.setFillStyle(color, creature.alive ? (selected ? 0.16 : 0.07) : 0.025);
    if (creature.alive) {
      view.body.fillStyle(dark, 1)
        .fillRect(-16, -34, 8, 10).fillRect(8, -34, 8, 10)
        .fillRect(-20, -28, 40, 6).fillRect(-24, -22, 48, 36)
        .fillRect(-20, 14, 40, 10).fillRect(-14, 24, 28, 5);
      view.body.fillStyle(color, 1)
        .fillRect(-12, -30, 5, 9).fillRect(7, -30, 5, 9)
        .fillRect(-16, -24, 32, 7).fillRect(-20, -17, 40, 29)
        .fillRect(-16, 12, 32, 8).fillRect(-10, 20, 20, 4);
      view.body.fillStyle(light, 0.82).fillRect(-16, -18, 7, 22).fillRect(-12, -22, 12, 5).fillRect(-9, 12, 18, 5);
      view.body.fillStyle(dark, 0.8).fillRect(-18, 20, 8, 5).fillRect(10, 20, 8, 5);
    } else {
      view.body.fillStyle(0x273021, 1).fillRect(-26, 11, 52, 14).fillRect(-19, 7, 38, 22);
      view.body.fillStyle(0x64705c, 1).fillRect(-16, 10, 32, 13).fillRect(-22, 15, 44, 7);
    }
    view.eyes.clear().fillStyle(0x06100c, 1);
    if (creature.alive && tired) { view.eyes.fillRect(-14, -5, 9, 3).fillRect(5, -5, 9, 3); }
    else if (creature.alive) {
      view.eyes.fillRect(-14, -8, 7, sad ? 5 : 10).fillRect(7, -8, 7, sad ? 5 : 10);
      if (!sad) view.eyes.fillStyle(0xffffff, 0.9).fillRect(-13, -7, 2, 2).fillRect(8, -7, 2, 2);
    }
    if (creature.alive) {
      view.eyes.fillStyle(0x06100c, 1);
      if (sad) view.eyes.fillRect(-6, 10, 12, 3).fillRect(-8, 13, 3, 3).fillRect(5, 13, 3, 3);
      else view.eyes.fillRect(-7, 9, 3, 3).fillRect(-4, 12, 8, 3).fillRect(4, 9, 3, 3);
      if (!sad && n.happiness > 72) view.eyes.fillStyle(0xffb0c8, 0.55).fillRect(-20, 7, 6, 3).fillRect(14, 7, 6, 3);
      if (dirty) view.eyes.fillStyle(0x5f542d, 1).fillRect(-22, 12, 5, 5).fillRect(18, -16, 4, 4).fillRect(14, 19, 3, 3);
      if (hungry) view.eyes.fillStyle(0xffd56b, 1).fillRect(-7, 17, 14, 3).fillRect(-10, 14, 3, 3).fillRect(7, 14, 3, 3);
    } else {
      view.eyes.fillStyle(0x25301f, 1).fillRect(-13, 14, 9, 3).fillRect(-10, 11, 3, 9).fillRect(4, 14, 9, 3).fillRect(7, 11, 3, 9);
    }
    const status = !creature.alive ? '' : sick ? '☣' : hungry ? '!' : dirty ? '≋' : sad ? '·' : tired ? 'z' : '';
    view.status.setText(status).setVisible(Boolean(status)).setBackgroundColor(sick ? '#ff735f' : hungry ? '#f7bd62' : dirty ? '#65c7ff' : '#bf78ff');
  }
  private createBuildingView(building: BuildingState) {
    const def = BUILDINGS[building.kind];
    const shadow = this.add.ellipse(4, 30, 92, 22, 0x1d2411, 0.52);
    const halo = this.add.rectangle(0, 0, 76, 62, def.color, 0.07).setBlendMode(Phaser.BlendModes.ADD);
    const art = this.add.graphics();
    art.fillStyle(0x3a2918, 1).fillRect(-46, 15, 92, 19).fillRect(-40, 9, 80, 31);
    art.fillStyle(0x83653c, 1).fillRect(-40, 11, 80, 17).fillRect(-34, 7, 68, 25);
    art.fillStyle(0xc7a56a, 1).fillRect(-34, 10, 68, 6);
    if (building.kind === 'nutrient-bed') {
      art.fillStyle(0x5b351d, 1).fillRect(-29, -15, 58, 28).fillStyle(0xa86a33, 1).fillRect(-25, -11, 50, 20);
      art.fillStyle(0x4d8b31, 1).fillRect(-18, -25, 6, 18).fillRect(-2, -29, 6, 22).fillRect(15, -23, 6, 17);
      art.fillStyle(0xf2cb59, 1).fillRect(-22, -26, 10, 7).fillRect(-4, -31, 10, 7).fillRect(13, -25, 10, 7);
    }
    if (building.kind === 'wash-pool') {
      art.fillStyle(0x3e5d58, 1).fillRect(-31, -13, 62, 28).fillStyle(0x79d8e8, 1).fillRect(-25, -9, 50, 17);
      art.fillStyle(0xd4f6ea, 1).fillRect(-15, -6, 12, 3).fillRect(5, 2, 15, 3);
    }
    if (building.kind === 'resonance-garden') {
      art.fillStyle(0x4d3c62, 1).fillRect(-29, -10, 58, 25);
      art.fillStyle(0xb98adf, 1).fillRect(-20, -25, 9, 28).fillRect(-4, -34, 10, 37).fillRect(13, -22, 8, 25);
      art.fillStyle(0xf1dbff, 1).fillRect(-18, -25, 5, 6).fillRect(-2, -34, 6, 7).fillRect(15, -22, 4, 6);
    }
    if (building.kind === 'nest') {
      art.fillStyle(0x684328, 1).fillRect(-29, -17, 58, 34).fillStyle(0xb8783f, 1).fillRect(-34, -21, 68, 10).fillRect(-27, -27, 54, 8);
      art.fillStyle(0x2c2316, 1).fillRect(-9, -3, 18, 20).fillStyle(0xf0c77a, 1).fillRect(-22, -10, 8, 8).fillRect(14, -10, 8, 8);
    }
    if (building.kind === 'extractor') {
      art.fillStyle(0x353b39, 1).fillRect(-28, -22, 56, 39).fillStyle(0x747b72, 1).fillRect(-20, -29, 40, 14);
      art.fillStyle(0xff785e, 1).fillRect(-17, -18, 11, 9).fillRect(7, -18, 11, 9).fillStyle(0x1f2322, 1).fillRect(-6, -10, 12, 27);
    }
    if (building.kind === 'clinic') {
      art.fillStyle(0xd9d3b8, 1).fillRect(-28, -25, 56, 42).fillStyle(0xf8ead0, 1).fillRect(-22, -19, 44, 30);
      art.fillStyle(0xe8759f, 1).fillRect(-5, -16, 10, 24).fillRect(-13, -8, 26, 10);
    }
    const core = this.add.rectangle(0, 3, 7, 7, def.color, 0.95).setBlendMode(Phaser.BlendModes.ADD);
    const glyph = crisp(this.add.text(33, -24, def.glyph, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '14px', color: Phaser.Display.Color.IntegerToColor(def.color).rgba, backgroundColor: '#382918dd', padding: { x: 3, y: 2 } })).setOrigin(0.5);
    const name = crisp(this.add.text(0, 50, def.name.toUpperCase(), { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#fff0ba', backgroundColor: '#382918ee', padding: { x: 7, y: 4 } })).setOrigin(0.5);
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
      const alpha = Math.min(0.25, value / 360);
      this.pollutionGraphics.fillStyle(0x6d4350, alpha).fillRect(x - cw / 2, y - ch / 2, cw, ch);
      if (value > 28) {
        this.pollutionGraphics.fillStyle(0xb45b4f, Math.min(0.38, value / 260));
        for (let p = 0; p < 5; p++) this.pollutionGraphics.fillRect(x - cw / 2 + ((p * 31 + index * 17) % Math.max(8, cw - 8)), y - ch / 2 + ((p * 19 + index * 29) % Math.max(8, ch - 8)), 6, 6);
      }
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
