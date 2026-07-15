import Phaser from 'phaser';
import { BUILDINGS, buildingCapacity, buildingDisplayName } from '../simulation/building';
import { personalityLabels } from '../simulation/personality';
import { contextualVocalization, voicePitch, type CreatureMood, type VoiceContext } from '../simulation/vocalization';
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
  thought: Phaser.GameObjects.Container;
  thoughtText: Phaser.GameObjects.Text;
  lastAlive: boolean;
  visualSignature: string;
  lastName: string;
}

interface AmbientMote { node: Phaser.GameObjects.Rectangle; originX: number; originY: number; phase: number; speed: number }

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;

export class WorldScene extends Phaser.Scene {
  private views = new Map<string, CreatureView>();
  private creaturesById = new Map<string, CreatureState>();
  private buildingViews = new Map<string, Phaser.GameObjects.Container>();
  private pollutionGraphics!: Phaser.GameObjects.Graphics;
  private relationshipGraphics!: Phaser.GameObjects.Graphics;
  private pathGraphics!: Phaser.GameObjects.Graphics;
  private weatherGraphics!: Phaser.GameObjects.Graphics;
  private dayOverlay!: Phaser.GameObjects.Rectangle;
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
  private footprintPool: Phaser.GameObjects.Rectangle[] = [];
  private footprintCursor = 0;
  private lastFootprintAt = 0;
  private ambientMotes: AmbientMote[] = [];
  private pollutionSignature = '';
  private audioContext?: AudioContext;
  private vocalBubbleUntil = new Map<string, number>();
  private vocalBubbleText = new Map<string, string>();
  private voiceClickCount = new Map<string, number>();
  private voiceCooldownUntil = new Map<string, number>();
  private lastAmbientVoiceAt = 0;
  private lastAmbienceAt = 0;
  private audioUnlocked = false;
  private returnGreetingPending = false;
  private photoMode = false;
  private buildingSignature = '';

  constructor() { super('WorldScene'); }
  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setZoom(this.baseZoom()).centerOn(800, 500);
    this.drawHabitat();
    this.pollutionGraphics = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.relationshipGraphics = this.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.pathGraphics = this.add.graphics().setDepth(1);
    this.weatherGraphics = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.dayOverlay = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x08152a, 0).setDepth(40).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.configureInput();
    for (let i = 0; i < 24; i++) this.effectPool.push(this.add.rectangle(0, 0, 5, 5, 0x7af6bd, 0).setDepth(18));
    for (let i = 0; i < 32; i++) this.footprintPool.push(this.add.rectangle(0, 0, 6, 3, 0x4b3e25, 0).setDepth(6));
    this.unsubscribe = gameStore.subscribe((state) => { this.state = state; this.syncState(state); });
    this.game.events.on('care', this.handleCare, this);
    this.game.events.on('build-select', this.handleBuildSelect, this);
    this.game.events.on('focus-creature', this.focusCreature, this);
    this.game.events.on('care-effect', this.playCareEffect, this);
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.scene.launch('UIScene');
    this.scene.launch('GlitchOverlayScene');
    const offlineSummary = this.registry.get('offline-summary');
    if (offlineSummary) {
      this.registry.remove('offline-summary');
      this.returnGreetingPending = true;
      this.time.delayedCall(950, () => this.scene.launch('AwaySummaryScene', offlineSummary));
    }
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
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) { this.cancelPlacement(); return; }
      if (this.placementGhost) return;
      this.dragging = true; this.dragStart.set(pointer.x, pointer.y); this.cameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.placementGhost) {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.placementGhost.setPosition(point.x, point.y);
        this.updatePlacementGhost(point.x, point.y);
      } else if (this.dragging && pointer.isDown && pointer.getDistance() > 8) {
        const zoom = this.cameras.main.zoom;
        this.cameras.main.scrollX = this.cameraStart.x - (pointer.x - this.dragStart.x) / zoom;
        this.cameras.main.scrollY = this.cameraStart.y - (pointer.y - this.dragStart.y) / zoom;
      }
      const p1 = this.input.pointer1; const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.lastPinchDistance) this.zoomAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, this.cameras.main.zoom * (distance / this.lastPinchDistance));
        this.lastPinchDistance = distance;
      } else this.lastPinchDistance = 0;
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) { this.cancelPlacement(); this.dragging = false; return; }
      if (this.placementKind && this.placementGhost) {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const placement = gameStore.canPlace(this.placementKind, point.x, point.y);
        if (pointer.y > 58 && pointer.y < this.scale.height - 66 && placement.ok && gameStore.place(this.placementKind, point.x, point.y)) {
          this.game.events.emit('toast', `${BUILDINGS[this.placementKind].name} connected`);
          this.soundPulse(180, 320);
          this.cancelPlacement(false);
        } else {
          this.game.events.emit('toast', pointer.y <= 58 || pointer.y >= this.scale.height - 66 ? 'Place it away from interface controls' : placement.reason ?? 'Invalid building site');
        }
      }
      this.dragging = false;
    });
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      this.zoomAt(pointer.x, pointer.y, this.cameras.main.zoom - dy * 0.001);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.cancelPlacement());
    this.input.keyboard?.on('keydown-P', () => this.togglePhotoMode());
    this.input.keyboard?.on('keydown-SPACE', () => gameStore.togglePause());
    this.input.keyboard?.on('keydown-ONE', () => gameStore.updateSetting('simulationSpeed', 1));
    this.input.keyboard?.on('keydown-TWO', () => gameStore.updateSetting('simulationSpeed', 2));
    this.input.keyboard?.on('keydown-THREE', () => gameStore.updateSetting('simulationSpeed', 4));
    this.input.keyboard?.on('keydown-G', () => this.scene.launch('GuideScene'));
    this.input.keyboard?.on('keydown-U', () => this.game.events.emit('toast', gameStore.undoLastBuild() ? 'Recent construction undone · 80% of materials returned' : 'Nothing recent is safe to undo'));
  }
  private zoomAt(screenX: number, screenY: number, requestedZoom: number) {
    const camera = this.cameras.main;
    const nextZoom = Phaser.Math.Clamp(requestedZoom, 0.55, 1.7);
    if (Math.abs(nextZoom - camera.zoom) < 0.0001) return;
    const before = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(nextZoom);
    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
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
    const influence = this.add.circle(0, 0, 130, def.color, 0.055).setStrokeStyle(2, def.color, 0.32);
    const glyph = crisp(this.add.text(0, 0, def.glyph, { fontFamily: UI_FONT, fontSize: '28px', color: '#071410' })).setOrigin(0.5);
    this.placementGhost = this.add.container(800, 500, [influence, base, glyph]).setDepth(20);
    const pointer = this.input.activePointer;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.placementGhost.setPosition(point.x, point.y);
    this.updatePlacementGhost(point.x, point.y);
  };
  private updatePlacementGhost(x: number, y: number) {
    if (!this.placementGhost || !this.placementKind) return;
    const base = this.placementGhost.getAt(1) as Phaser.GameObjects.Image;
    const placement = gameStore.canPlace(this.placementKind, x, y);
    base.setTint(placement.ok ? BUILDINGS[this.placementKind].color : 0xff735f).setAlpha(placement.ok ? 0.55 : 0.38);
  }
  private cancelPlacement(showMessage = true) {
    if (!this.placementGhost && !this.placementKind) return;
    this.placementGhost?.destroy(); this.placementGhost = undefined; this.placementKind = undefined;
    if (showMessage) this.game.events.emit('toast', 'Building placement cancelled');
  }
  private createCreatureView(creature: CreatureState): CreatureView {
    const shadow = this.add.ellipse(2, 29, 48, 13, 0x18200e, 0.48);
    const aura = this.add.circle(0, 0, 34, Phaser.Display.Color.HSVToRGB(creature.hue / 360, 0.52, 0.96).color, 0.1).setBlendMode(Phaser.BlendModes.ADD);
    const selection = this.add.circle(0, 0, 34, 0x000000, 0).setStrokeStyle(3, 0xffec9c, 0);
    const body = this.add.graphics(); const eyes = this.add.graphics();
    const status = crisp(this.add.text(29, -34, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '14px', color: '#071410', backgroundColor: '#f7bd62', padding: { x: 4, y: 2 } })).setOrigin(0.5).setVisible(false);
    const actor = this.add.container(0, 0, [aura, selection, body, eyes, status]);
    const label = crisp(this.add.text(0, 45, creature.name, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#fff1ba', backgroundColor: '#352816e8', padding: { x: 7, y: 4 } })).setOrigin(0.5).setStroke('#20170d', 1);
    const thoughtTail = this.add.triangle(0, 16, 0, 0, 10, 0, 5, 7, 0xfff3c4, 0.96).setOrigin(0.5, 0);
    const thoughtText = crisp(this.add.text(0, 0, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#2c2417', backgroundColor: '#fff3c4', padding: { x: 7, y: 4 }, align: 'center' })).setOrigin(0.5);
    const thought = this.add.container(0, -69, [thoughtTail, thoughtText]).setVisible(false);
    const container = this.add.container(creature.x, creature.y, [shadow, actor, label, thought]).setSize(82, 110).setDepth(10).setInteractive({ useHandCursor: true });
    const view: CreatureView = { container, actor, shadow, aura, selection, body, eyes, status, label, thought, thoughtText, lastAlive: creature.alive, visualSignature: '', lastName: creature.name };
    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 8) {
        const current = this.state.creatures.find((c) => c.id === creature.id); if (!current) return;
        this.selectedId = creature.id;
        this.audioUnlocked = true;
        if ((this.voiceCooldownUntil.get(creature.id) ?? 0) > this.time.now) { this.game.events.emit('creature-selected', current); return; }
        const variant = (this.voiceClickCount.get(creature.id) ?? 0) + 1; this.voiceClickCount.set(creature.id, variant);
        const context: VoiceContext = this.returnGreetingPending ? 'return' : 'click'; this.returnGreetingPending = false;
        const voice = contextualVocalization(current, variant, context, this.state.livingWorld.weather === 'storm' && current.personality.resilience < 0.55);
        this.vocalBubbleText.set(creature.id, voice.text); this.vocalBubbleUntil.set(creature.id, this.time.now + 1900);
        this.voiceCooldownUntil.set(creature.id, this.time.now + 850); this.playCreatureVoice(current, voice.mood, variant, context);
        this.tweens.killTweensOf(view.actor); this.tweens.add({ targets: view.actor, y: -9, scaleX: 1.08, scaleY: 0.94, duration: 105, yoyo: true, ease: 'Sine.easeOut' });
        this.syncState(this.state); this.game.events.emit('creature-selected', current);
        const answer = this.state.creatures.filter((candidate) => candidate.alive && candidate.id !== current.id && Math.hypot(candidate.x - current.x, candidate.y - current.y) < 240).sort((a, b) => (b.bonds[current.id] ?? 0) - (a.bonds[current.id] ?? 0))[0];
        if (answer && (answer.bonds[current.id] ?? 0) > 18) this.time.delayedCall(280, () => this.voiceCreature(answer, 'answer'));
      }
    });
    return view;
  }
  private thoughtFor(creature: CreatureState): string {
    if (!creature.alive) return '…';
    const partner = creature.destinationCreatureId ? this.creaturesById.get(creature.destinationCreatureId) : undefined;
    const destination = creature.destinationBuildingId ? this.state.buildings.find((building) => building.id === creature.destinationBuildingId) : undefined;
    if (destination && !creature.isBeingServed) return `Waiting at ${buildingDisplayName(destination)} · #${creature.queueIndex - buildingCapacity(destination) + 1}`;
    if (creature.task === 'socialize') return creature.socialTimer > 0 ? `Sharing light with ${partner?.name ?? 'a friend'} ♡` : `Finding ${partner?.name ?? 'company'} ♡`;
    if (creature.task === 'comfort') return `Helping ${partner?.name ?? 'someone'} +`;
    if (creature.task === 'eat') return this.state.buildings.some((building) => building.kind === 'nutrient-bed') ? 'Seeking nourishment' : 'I need a Dew Loom';
    if (creature.task === 'bathe') return this.state.buildings.some((building) => building.kind === 'wash-pool') ? 'Looking for mist' : 'I need a Mist Basin';
    if (creature.task === 'play') return this.state.buildings.some((building) => building.kind === 'resonance-garden') ? 'Seeking resonance' : 'I need a Chime Grove';
    if (creature.task === 'sleep') return this.state.buildings.some((building) => building.kind === 'nest') ? 'Finding somewhere warm' : 'I need a Warm Archive';
    if (creature.task === 'heal') return 'Searching for treatment';
    if (creature.task === 'work') return 'Gathering alloy';
    if (creature.task === 'construct') return 'Carrying materials to construction';
    if (creature.task === 'maintain') return 'Repairing a worn facility';
    if (creature.task === 'argue') return `Arguing with ${partner?.name ?? 'someone'}`;
    const dominant = personalityLabels(creature.personality, 1)[0];
    return dominant === 'CURIOUS' ? 'What lies beyond the trees?' : dominant === 'WARM' ? 'Is anyone lonely?' : dominant === 'SOCIAL' ? 'I hope someone visits' : dominant === 'STEADY' ? 'One task at a time' : 'I can endure this';
  }
  private updateThought(view: CreatureView, creature: CreatureState) {
    const vocalizing = (this.vocalBubbleUntil.get(creature.id) ?? 0) > this.time.now;
    if (vocalizing) {
      view.thought.setVisible(creature.alive && this.state.livingWorld.settings.subtitles);
      view.thoughtText.setText(this.vocalBubbleText.get(creature.id) ?? 'Hey!');
      return;
    }
    const serial = Number(creature.id.replace(/\D/g, '')) || 1;
    const urgent = Math.min(creature.needs.hunger, creature.needs.hygiene, creature.needs.happiness, creature.needs.health, creature.needs.energy) < 30;
    const social = creature.task === 'socialize' || creature.task === 'comfort';
    const partnerSerial = creature.destinationCreatureId ? Number(creature.destinationCreatureId.replace(/\D/g, '')) || serial : serial;
    const socialSpeaker = serial <= partnerSerial;
    const periodic = (Math.floor(this.state.time / 7) + serial) % 7 === 0;
    const visible = creature.id === this.selectedId || (social && socialSpeaker) || urgent || (periodic && this.state.creatures.length < 36);
    view.thought.setVisible(visible && creature.alive);
    if (visible) view.thoughtText.setText(this.thoughtFor(creature));
  }
  private drawCreature(view: CreatureView, creature: CreatureState) {
    const n = creature.needs; const sick = n.health < 48; const tired = n.energy < 25; const sad = n.happiness < 38;
    const color = creature.alive ? Phaser.Display.Color.HSVToRGB(creature.hue / 360, sick ? 0.18 : 0.5, sick ? 0.55 : 0.95).color : 0x39463f;
    const selected = creature.id === this.selectedId;
    const dirty = n.hygiene < 35; const hungry = n.hunger < 30;
    const signature = [creature.alive, sick, tired, sad, dirty, hungry, selected, creature.task].join(':');
    const labelText = creature.alive ? `${creature.name}  ·  ${creature.task.toUpperCase()}` : `${creature.name}  ·  SILENT`;
    if (view.label.text !== labelText) view.label.setText(labelText);
    view.label.setColor(selected ? '#fff4a8' : '#f4e2ae');
    this.updateThought(view, creature);
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
    const status = !creature.alive ? '' : sick ? '☣' : hungry ? '!' : dirty ? '≋' : sad ? '·' : tired ? 'z' : creature.task === 'comfort' ? '+' : creature.task === 'socialize' ? '♡' : '';
    const statusColor = sick ? '#ff735f' : hungry ? '#f7bd62' : dirty ? '#65c7ff' : creature.task === 'comfort' ? '#7af6bd' : '#bf78ff';
    view.status.setText(status).setVisible(Boolean(status)).setBackgroundColor(statusColor);
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
    if (building.constructing) { art.fillStyle(0xf7bd62, 0.95).fillRect(-44, -36, 88 * building.constructionProgress / 100, 5); }
    if (building.level >= 2) art.fillStyle(def.color, 0.9).fillRect(-36, -38, 9, 9).fillRect(27, -38, 9, 9).fillStyle(0xfff0ba, 0.9).fillRect(-33, -35, 3, 3).fillRect(30, -35, 3, 3);
    const level = crisp(this.add.text(-34, -27, building.level >= 2 ? 'Ⅱ' : 'Ⅰ', { fontFamily: DISPLAY_FONT, fontSize: '11px', color: '#fff0ba', backgroundColor: '#382918dd', padding: { x: 3, y: 2 } })).setOrigin(0.5);
    const name = crisp(this.add.text(0, 50, `${buildingDisplayName(building).toUpperCase()}${building.constructing ? ` ${Math.floor(building.constructionProgress)}%` : ''}`, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#fff0ba', backgroundColor: '#382918ee', padding: { x: 7, y: 4 } })).setOrigin(0.5);
    const container = this.add.container(building.x, building.y, [shadow, halo, art, core, glyph, level, name]).setDepth(7).setSize(120, 104).setInteractive({ useHandCursor: true }).setData('level', building.level);
    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 8 && !this.placementKind) {
        this.audioUnlocked = true; this.soundPulse(160 + (Object.keys(BUILDINGS).indexOf(building.kind) + 1) * 55, 260);
        this.game.events.emit('building-selected', this.state.buildings.find((candidate) => candidate.id === building.id));
      }
    });
    this.tweens.add({ targets: [core, halo], alpha: { from: 0.35, to: 0.9 }, scale: { from: 0.88, to: 1.12 }, duration: 1200 + (building.id.charCodeAt(1) % 5) * 110, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return container;
  }
  private syncState(state: WorldState) {
    this.creaturesById = new Map(state.creatures.map((creature) => [creature.id, creature]));
    const creatureIds = new Set(state.creatures.map((creature) => creature.id));
    this.views.forEach((view, id) => { if (!creatureIds.has(id)) { view.container.destroy(); this.views.delete(id); } });
    const buildingIds = new Set(state.buildings.map((building) => building.id));
    this.buildingViews.forEach((view, id) => { if (!buildingIds.has(id)) { view.destroy(); this.buildingViews.delete(id); } });
    state.creatures.forEach((creature) => {
      let view = this.views.get(creature.id);
      if (!view) { view = this.createCreatureView(creature); this.views.set(creature.id, view); }
      if (view.lastAlive && !creature.alive) { if (state.livingWorld.settings.screenShake) this.cameras.main.shake(400, 0.006); this.game.events.emit('glitch', state.livingWorld.settings.reducedMotion ? 0.25 : 0.9); }
      if (view.lastName !== creature.name) { view.lastName = creature.name; this.voiceCreature(creature, 'rename'); }
      view.lastAlive = creature.alive;
      this.drawCreature(view, creature);
    });
    state.buildings.forEach((building) => {
      const existing = this.buildingViews.get(building.id);
      const signature = `${building.level}:${building.upgradeBranch ?? ''}:${Math.floor(building.constructionProgress / 10)}`;
      if (existing && existing.getData('signature') !== signature) { existing.destroy(); this.buildingViews.delete(building.id); }
      if (!this.buildingViews.has(building.id)) this.buildingViews.set(building.id, this.createBuildingView(building));
    });
    this.buildingViews.forEach((container, id) => { const building = state.buildings.find((item) => item.id === id); if (building) container.setData('signature', `${building.level}:${building.upgradeBranch ?? ''}:${Math.floor(building.constructionProgress / 10)}`); });
    this.drawPaths(state);
    this.drawPollution(state);
  }
  private drawRelationships() {
    this.relationshipGraphics.clear();
    const rendered = new Set<string>();
    for (const creature of this.state.creatures) {
      if (!creature.alive || !creature.destinationCreatureId || !['socialize', 'comfort'].includes(creature.task)) continue;
      const partner = this.creaturesById.get(creature.destinationCreatureId);
      const from = this.views.get(creature.id); const to = partner ? this.views.get(partner.id) : undefined;
      if (!partner?.alive || !from || !to) continue;
      const key = [creature.id, partner.id].sort().join(':'); if (rendered.has(key)) continue; rendered.add(key);
      const active = creature.socialTimer > 0;
      this.relationshipGraphics.lineStyle(active ? 3 : 2, creature.task === 'comfort' ? 0x7af6bd : 0xffa6d8, active ? 0.52 : 0.2);
      this.relationshipGraphics.lineBetween(from.container.x, from.container.y - 4, to.container.x, to.container.y - 4);
      if (active) {
        const midpointX = (from.container.x + to.container.x) / 2; const midpointY = (from.container.y + to.container.y) / 2;
        this.relationshipGraphics.fillStyle(creature.task === 'comfort' ? 0x7af6bd : 0xffa6d8, 0.8).fillCircle(midpointX, midpointY - 5, 3);
      }
    }
  }
  private drawPaths(state: WorldState) {
    const signature = state.buildings.map((building) => `${building.id}:${Math.round(building.x)}:${Math.round(building.y)}:${building.active}`).join('|');
    if (signature === this.buildingSignature) return; this.buildingSignature = signature; this.pathGraphics.clear();
    const connected = state.buildings.filter((building) => building.active);
    connected.forEach((building, index) => {
      let nearest: BuildingState | undefined; let distance = 390;
      connected.forEach((candidate, candidateIndex) => { if (candidateIndex >= index || candidate.id === building.id) return; const next = Math.hypot(candidate.x - building.x, candidate.y - building.y); if (next < distance) { distance = next; nearest = candidate; } });
      if (!nearest) return;
      this.pathGraphics.lineStyle(18, 0x5b5630, 0.24).lineBetween(building.x, building.y + 55, nearest.x, nearest.y + 55);
      this.pathGraphics.lineStyle(4, 0xb6a566, 0.18).lineBetween(building.x, building.y + 55, nearest.x, nearest.y + 55);
    });
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
      const settings = this.state.livingWorld.settings; if (settings.muted || settings.ambienceVolume <= 0) return;
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = this.audioContext ?? new AudioContextClass(); this.audioContext = context;
      if (context.state === 'suspended') void context.resume();
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, context.currentTime + duration / 1000);
      gain.gain.setValueAtTime(0.055 * settings.ambienceVolume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration / 1000);
      oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration / 1000);
    } catch { /* audio is optional */ }
  }
  private voiceCreature(creature: CreatureState, context: VoiceContext) {
    if (!creature.alive || (this.voiceCooldownUntil.get(creature.id) ?? 0) > this.time.now) return;
    const variant = (this.voiceClickCount.get(creature.id) ?? 0) + 1; this.voiceClickCount.set(creature.id, variant);
    const voice = contextualVocalization(creature, variant, context, this.state.livingWorld.weather === 'storm' && creature.personality.resilience < 0.55);
    this.vocalBubbleText.set(creature.id, voice.text); this.vocalBubbleUntil.set(creature.id, this.time.now + (context === 'social' ? 1100 : 1650)); this.voiceCooldownUntil.set(creature.id, this.time.now + 1200);
    this.playCreatureVoice(creature, voice.mood, variant, context);
  }
  private playCreatureVoice(creature: CreatureState, mood: CreatureMood, variant: number, voiceContext: VoiceContext = 'click') {
    try {
      const settings = this.state.livingWorld.settings; if (settings.muted || settings.voiceVolume <= 0) return;
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = this.audioContext ?? new AudioContextClass(); this.audioContext = context;
      if (context.state === 'suspended') void context.resume();
      const base = voicePitch(creature) * (mood === 'tired' ? 0.76 : mood === 'unwell' ? 0.82 : mood === 'bright' ? 1.08 : 1);
      const syllables = mood === 'tired' || mood === 'unwell' ? 2 : 3;
      const output = context.createGain(); output.gain.setValueAtTime(0.0001, context.currentTime);
      const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : undefined;
      if (panner) { panner.pan.value = Phaser.Math.Clamp((creature.x - this.cameras.main.worldView.centerX) / Math.max(300, this.cameras.main.worldView.width / 2), -0.85, 0.85); output.connect(panner).connect(context.destination); }
      else output.connect(context.destination);
      for (let index = 0; index < syllables; index++) {
        const start = context.currentTime + index * 0.105;
        const duration = 0.09 + (variant + index) % 3 * 0.018;
        const direction = mood === 'lonely' || mood === 'hungry' ? -1 : index % 2 === 0 ? 1 : -0.4;
        const pitch = base * (1 + ((variant * 3 + index * 2) % 7 - 3) * 0.035);
        const oscillator = context.createOscillator(); const formant = context.createBiquadFilter(); const envelope = context.createGain();
        oscillator.type = creature.voiceStyle === 'raspy' ? 'sawtooth' : creature.voiceStyle === 'whispery' ? 'sine' : index % 2 === 0 ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(pitch, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(120, pitch * (1 + direction * 0.18)), start + duration);
        formant.type = 'bandpass'; formant.frequency.value = 850 + creature.personality.curiosity * 500; formant.Q.value = 1.2;
        envelope.gain.setValueAtTime(0.0001, start); envelope.gain.exponentialRampToValueAtTime(0.16, start + 0.012); envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(formant).connect(envelope).connect(output); oscillator.start(start); oscillator.stop(start + duration + 0.01);
      }
      const contextGain = voiceContext === 'social' || voiceContext === 'sleep' ? 0.032 : voiceContext === 'critical' ? 0.07 : 0.055;
      output.gain.exponentialRampToValueAtTime(contextGain * settings.voiceVolume, context.currentTime + 0.015);
      output.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + syllables * 0.105 + 0.12);
    } catch { /* audio is optional */ }
  }
  private togglePhotoMode() {
    this.photoMode = !this.photoMode;
    const ui = this.scene.get('UIScene'); if (this.photoMode) ui.scene.sleep(); else ui.scene.wake();
    this.game.events.emit('toast', this.photoMode ? 'Photo mode · press P to restore interface' : 'Interface restored');
  }
  private updateAtmosphere(time: number) {
    const living = this.state.livingWorld; const dayLight = Math.max(0, Math.sin(living.dayTime * Math.PI)); const night = 1 - dayLight;
    this.dayOverlay.setFillStyle(living.season === 'frostquiet' ? 0x152949 : living.season === 'amberfall' ? 0x3a1d16 : 0x08152a, night * 0.48);
    this.weatherGraphics.clear();
    if (living.settings.lowPower || living.settings.quality === 'low') return;
    const count = living.weather === 'storm' ? 70 : living.weather === 'rain' ? 46 : living.weather === 'mist' ? 20 : living.weather === 'wind' ? 18 : 0;
    for (let index = 0; index < count; index++) {
      const x = (index * 97 + time * (living.weather === 'wind' ? 0.045 : 0.018)) % WORLD_WIDTH;
      const y = (index * 53 + time * 0.09) % WORLD_HEIGHT;
      if (living.weather === 'rain' || living.weather === 'storm') this.weatherGraphics.lineStyle(2, 0x9fe9ff, living.weather === 'storm' ? 0.42 : 0.28).lineBetween(x, y, x - 5, y + 16);
      else if (living.weather === 'mist') this.weatherGraphics.fillStyle(0xd8fff4, 0.035).fillCircle(x, y, 38);
      else this.weatherGraphics.fillStyle(0xf0ca70, 0.24).fillRect(x, y, 5, 2);
    }
  }
  private updateAmbientVoices(time: number) {
    if (!this.audioUnlocked || this.state.livingWorld.settings.muted) return;
    if (time - this.lastAmbienceAt > (this.state.livingWorld.settings.lowPower ? 18000 : 9000)) {
      this.lastAmbienceAt = time;
      const night = this.state.livingWorld.dayTime < 0.18 || this.state.livingWorld.dayTime > 0.82;
      const danger = this.state.livingWorld.weather === 'storm' || this.state.creatures.some((creature) => creature.alive && creature.needs.health < 25);
      this.soundPulse(danger ? 105 : night ? 175 : 235, danger ? 950 : 620);
    }
    if (time - this.lastAmbientVoiceAt < (this.state.livingWorld.settings.lowPower ? 12000 : 5200)) return;
    const visible = this.state.creatures.filter((creature) => creature.alive && this.views.get(creature.id)?.container.visible);
    const critical = visible.find((creature) => Math.min(...Object.values(creature.needs)) < 18);
    const social = visible.find((creature) => ['socialize', 'comfort'].includes(creature.task) && creature.socialTimer > 0);
    const sleeper = visible.find((creature) => creature.task === 'sleep' && creature.isBeingServed);
    const player = visible.find((creature) => creature.task === 'play' && creature.isBeingServed);
    const speaker = critical ?? social ?? sleeper ?? player; if (!speaker) return;
    this.lastAmbientVoiceAt = time; this.voiceCreature(speaker, critical ? 'critical' : social ? 'social' : sleeper ? 'sleep' : 'play');
  }
  update(time: number, delta: number) {
    const smoothing = 1 - Math.exp(-Math.min(delta, 50) * 0.012);
    const camera = this.cameras.main;
    this.ambientMotes.forEach((mote) => {
      mote.node.x = mote.originX + Math.sin(time * 0.0005 * mote.speed + mote.phase) * 12;
      mote.node.y = mote.originY + Math.cos(time * 0.00038 * mote.speed + mote.phase) * 9;
      mote.node.alpha = 0.13 + (Math.sin(time * 0.0012 + mote.phase) + 1) * 0.09;
    });
    this.updateAtmosphere(time); this.updateAmbientVoices(time);
    if (!this.state.livingWorld.settings.lowPower && time - this.lastFootprintAt > 180) {
      const walkers = this.state.creatures.filter((creature) => creature.alive && Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) > 18 && this.views.get(creature.id)?.container.visible);
      const walker = walkers[this.footprintCursor % Math.max(1, walkers.length)];
      if (walker) {
        const footprint = this.footprintPool[this.footprintCursor++ % this.footprintPool.length]; this.lastFootprintAt = time;
        footprint.setPosition(walker.x, walker.y + 25).setAlpha(0.28).setAngle(this.footprintCursor % 2 ? 12 : -12);
        this.tweens.killTweensOf(footprint); this.tweens.add({ targets: footprint, alpha: 0, duration: 900 });
      }
    }
    this.state.creatures.forEach((creature) => {
      const view = this.views.get(creature.id); if (!view) return;
      const dx = creature.x - view.container.x; const dy = creature.y - view.container.y;
      view.container.x += dx * smoothing; view.container.y += dy * smoothing;
      const phase = Number(creature.id.replace(/\D/g, '')) * 0.71;
      const motionScale = this.state.livingWorld.settings.reducedMotion ? 0.25 : 1;
      view.actor.y = creature.alive ? Math.sin(time * 0.004 + phase) * 2.5 * motionScale : 0;
      view.actor.rotation = Phaser.Math.Linear(view.actor.rotation, creature.alive ? Phaser.Math.Clamp(dx * 0.002, -0.11, 0.11) : 0, smoothing * 0.5);
      const pulse = 1 + Math.sin(time * 0.003 + phase) * 0.055;
      view.aura.setScale(pulse); view.shadow.setScale(1 - (pulse - 1) * 1.5, 1);
      view.thought.y = -69 - (Number(creature.id.replace(/\D/g, '')) % 2) * 8 + Math.sin(time * 0.0025 + phase) * 2;
      view.thought.alpha = 0.9 + (Math.sin(time * 0.003 + phase) + 1) * 0.05;
      const inView = view.container.x > camera.worldView.left - 100 && view.container.x < camera.worldView.right + 100 && view.container.y > camera.worldView.top - 100 && view.container.y < camera.worldView.bottom + 100;
      view.container.setVisible(inView);
      view.label.setVisible(inView && ((camera.zoom > 0.68 && this.state.creatures.length < 90) || creature.id === this.selectedId));
    });
    this.drawRelationships();
  }
  shutdown() {
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.game.events.off('care', this.handleCare, this);
    this.game.events.off('build-select', this.handleBuildSelect, this);
    this.game.events.off('focus-creature', this.focusCreature, this);
    this.game.events.off('care-effect', this.playCareEffect, this);
    this.scale.off('resize', this.handleResize, this);
    this.input.keyboard?.off('keydown-ESC');
    this.input.keyboard?.off('keydown-P'); this.input.keyboard?.off('keydown-SPACE'); this.input.keyboard?.off('keydown-ONE'); this.input.keyboard?.off('keydown-TWO'); this.input.keyboard?.off('keydown-THREE'); this.input.keyboard?.off('keydown-G'); this.input.keyboard?.off('keydown-U');
    this.cancelPlacement(false);
    if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close();
    this.audioContext = undefined;
  }
}
