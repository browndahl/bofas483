import Phaser from 'phaser';
import {
  buildingMotionFrequency,
  creaturePose,
  presentationBudget,
  soundscapeMood,
  soundscapeNotes,
  weatherAmbienceFrequency
} from '../rendering/presentation';
import { BUILDINGS, buildingCapacity, buildingDisplayName, materialDeliveryRatio } from '../simulation/building';
import { COLONY_OVERLAYS } from '../simulation/colonyManagement';
import { REGIONS } from '../simulation/expeditions';
import { personalityLabels } from '../simulation/personality';
import { contextualVocalization, voicePitch, type CreatureMood, type VoiceContext } from '../simulation/vocalization';
import type { BuildingKind, BuildingState, CreatureState, DirectOrderKind, RegionId, WorldState } from '../simulation/worldState';
import { gameStore } from '../state/gameStateStore';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

interface CreatureView {
  container: Phaser.GameObjects.Container;
  actor: Phaser.GameObjects.Container;
  pose: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  aura: Phaser.GameObjects.Arc;
  selection: Phaser.GameObjects.Arc;
  body: Phaser.GameObjects.Graphics;
  eyes: Phaser.GameObjects.Graphics;
  gesture: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  thought: Phaser.GameObjects.Container;
  thoughtText: Phaser.GameObjects.Text;
  lastAlive: boolean;
  visualSignature: string;
  lastName: string;
  lastTask: CreatureState['task'];
  facing: -1 | 1;
  blinkAt: number;
  blinkUntil: number;
}

interface AmbientMote { node: Phaser.GameObjects.Rectangle; originX: number; originY: number; phase: number; speed: number }
interface FoliageTuft { node: Phaser.GameObjects.Rectangle; phase: number }
interface WaterGlint { node: Phaser.GameObjects.Arc; phase: number }
interface BuildingView {
  container: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Rectangle;
  core: Phaser.GameObjects.Rectangle;
  activity: Phaser.GameObjects.Graphics;
}

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;

export class WorldScene extends Phaser.Scene {
  private views = new Map<string, CreatureView>();
  private creaturesById = new Map<string, CreatureState>();
  private buildingViews = new Map<string, BuildingView>();
  private habitatImage!: Phaser.GameObjects.Image;
  private pollutionGraphics!: Phaser.GameObjects.Graphics;
  private relationshipGraphics!: Phaser.GameObjects.Graphics;
  private pathGraphics!: Phaser.GameObjects.Graphics;
  private weatherGraphics!: Phaser.GameObjects.Graphics;
  private managementGraphics!: Phaser.GameObjects.Graphics;
  private regionalGraphics!: Phaser.GameObjects.Graphics;
  private regionalLabels: Phaser.GameObjects.Text[] = [];
  private regionalSignature = '';
  private managementLabels: Phaser.GameObjects.Text[] = [];
  private managementToolbar?: Phaser.GameObjects.Container;
  private managementToolbarText?: Phaser.GameObjects.Text;
  private managementOrderMode?: DirectOrderKind;
  private managementDragId?: string;
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
  private effectCursor = 0;
  private footprintPool: Phaser.GameObjects.Rectangle[] = [];
  private footprintCursor = 0;
  private lastFootprintAt = 0;
  private ambientMotes: AmbientMote[] = [];
  private foliage: FoliageTuft[] = [];
  private waterGlints: WaterGlint[] = [];
  private pollutionSignature = '';
  private audioContext?: AudioContext;
  private noiseBuffer?: AudioBuffer;
  private vocalBubbleUntil = new Map<string, number>();
  private vocalBubbleText = new Map<string, string>();
  private voiceClickCount = new Map<string, number>();
  private voiceCooldownUntil = new Map<string, number>();
  private lastAmbientVoiceAt = 0;
  private lastAmbienceAt = 0;
  private lastMusicAt = 0;
  private lastAtmosphereAt = 0;
  private lastRelationshipAt = 0;
  private frameIndex = 0;
  private audioUnlocked = false;
  private returnGreetingPending = false;
  private photoMode = false;
  private buildingSignature = '';
  private buildingLifecycle = new Map<string, string>();

  constructor() { super('WorldScene'); }
  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setZoom(this.baseZoom()).centerOn(800, 500);
    this.drawHabitat();
    this.pollutionGraphics = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.relationshipGraphics = this.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.pathGraphics = this.add.graphics().setDepth(1);
    this.regionalGraphics = this.add.graphics().setDepth(5);
    this.managementGraphics = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.weatherGraphics = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.dayOverlay = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x08152a, 0).setDepth(40).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.configureInput();
    this.createManagementToolbar();
    for (let i = 0; i < 42; i++) this.effectPool.push(this.add.rectangle(0, 0, 5, 5, 0x7af6bd, 0).setDepth(18));
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
    this.habitatImage = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'habitat-pixel-map').setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
    const frame = this.add.graphics().setDepth(1);
    frame.lineStyle(5, 0x3a2918, 0.75).strokeRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12);
    frame.lineStyle(2, 0xc9aa64, 0.35).strokeRect(13, 13, WORLD_WIDTH - 26, WORLD_HEIGHT - 26);

    for (let i = 0; i < 44; i++) {
      const originX = (i * 197 + 47) % WORLD_WIDTH;
      const originY = (i * 83 + 131) % WORLD_HEIGHT;
      const node = this.add.rectangle(originX, originY, 2 + (i % 2) * 2, 2 + (i % 2) * 2, i % 7 === 0 ? 0xd8b6ff : 0xa9ffcf, 0.2 + (i % 4) * 0.04).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
      this.ambientMotes.push({ node, originX, originY, phase: i * 0.73, speed: 0.35 + (i % 5) * 0.08 });
    }
    for (let i = 0; i < 28; i++) {
      const x = 72 + (i * 179) % (WORLD_WIDTH - 144); const y = 100 + (i * 113) % (WORLD_HEIGHT - 170);
      const tuft = this.add.rectangle(x, y, 4, 14 + i % 3 * 4, i % 4 === 0 ? 0x9ccf52 : 0x4f8b38, 0.38).setOrigin(0.5, 1).setDepth(3);
      this.foliage.push({ node: tuft, phase: i * 0.47 });
    }
    [[154, 166], [250, 164], [1230, 146], [1370, 174], [1435, 807], [1510, 765]].forEach(([x, y], index) => {
      const glint = this.add.circle(x, y, 3 + index % 2, 0xa5ffff, 0.3).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
      this.waterGlints.push({ node: glint, phase: index * 1.37 });
    });
    crisp(this.add.text(52, 42, 'HABITAT 483  ·  LUMEN FIELD', { fontFamily: DISPLAY_FONT, fontSize: '13px', color: '#fff1ba', backgroundColor: '#3a2918cc', padding: { x: 9, y: 5 }, letterSpacing: 1 })).setDepth(3);
  }
  private configureInput() {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audioUnlocked = true;
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
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
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
      } else if (this.managementOrderMode && !gameObjects.length && pointer.getDistance() < 8 && pointer.y > (this.scale.width < 650 ? 190 : 130) && pointer.y < this.scale.height - 66) {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.applyManagementOrder(point.x, point.y);
      }
      this.dragging = false;
    });
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      this.zoomAt(pointer.x, pointer.y, this.cameras.main.zoom - dy * 0.001);
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.managementOrderMode) {
        this.managementOrderMode = undefined; this.refreshManagementToolbar(); this.game.events.emit('toast', 'Direct order mode cleared');
      } else this.cancelPlacement();
    });
    this.input.keyboard?.on('keydown-P', () => this.togglePhotoMode());
    this.input.keyboard?.on('keydown-SPACE', () => gameStore.togglePause());
    this.input.keyboard?.on('keydown-ONE', () => gameStore.updateSetting('simulationSpeed', 1));
    this.input.keyboard?.on('keydown-TWO', () => gameStore.updateSetting('simulationSpeed', 2));
    this.input.keyboard?.on('keydown-THREE', () => gameStore.updateSetting('simulationSpeed', 4));
    this.input.keyboard?.on('keydown-G', () => this.scene.launch('GuideScene'));
    this.input.keyboard?.on('keydown-U', () => this.game.events.emit('toast', gameStore.undoLastBuild() ? 'Recent construction undone · 80% of materials returned' : 'Nothing recent is safe to undo'));
    this.input.keyboard?.on('keydown-O', () => this.cycleManagementOverlay());
    this.input.keyboard?.on('keydown-R', () => this.cycleManagementOrder());
    this.input.keyboard?.on('keydown-M', () => this.cycleActiveRegion());
    this.input.keyboard?.on('keydown-X', () => {
      if (gameStore.clearDirectOrder(this.selectedId)) this.game.events.emit('toast', 'Selected Luma returned to autonomy');
    });
  }
  private createManagementToolbar() {
    const background = this.add.rectangle(0, 0, 390, 34, 0x231c12, 0.9).setStrokeStyle(1, 0xf7bd62, 0.65);
    const text = crisp(this.add.text(0, 0, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#fff0ba', align: 'center' })).setOrigin(0.5);
    this.managementToolbarText = text;
    this.managementToolbar = this.add.container(this.scale.width - 206, 104, [background, text]).setDepth(102).setScrollFactor(0).setInteractive(new Phaser.Geom.Rectangle(-195, -17, 390, 34), Phaser.Geom.Rectangle.Contains);
    this.managementToolbar.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x < this.scale.width - 205) this.cycleManagementOverlay();
      else this.cycleManagementOrder();
    });
    this.refreshManagementToolbar();
  }
  private refreshManagementToolbar() {
    this.managementToolbar?.setPosition(Math.max(206, this.scale.width - 206), this.scale.width < 650 ? 154 : 104);
    this.managementToolbarText?.setText(`REGION ${REGIONS[this.state.livingWorld.activeRegion].glyph} [M]  ·  OVERLAY ${this.state.livingWorld.management.overlay.toUpperCase()} [O]  ·  ORDER ${(this.managementOrderMode ?? 'none').toUpperCase()} [R]`);
  }
  private cycleActiveRegion() {
    const regions = this.state.livingWorld.unlockedRegions;
    const current = Math.max(0, regions.indexOf(this.state.livingWorld.activeRegion));
    const next = regions[(current + 1) % regions.length] ?? 'lumen-field';
    if (gameStore.setActiveRegion(next)) this.game.events.emit('toast', `${REGIONS[next].name} · ${next === 'lumen-field' ? 'home habitat' : 'regional field view'}`);
  }
  private cycleManagementOverlay() {
    const current = COLONY_OVERLAYS.indexOf(this.state.livingWorld.management.overlay);
    gameStore.setManagementOverlay(COLONY_OVERLAYS[(current + 1) % COLONY_OVERLAYS.length]);
  }
  private cycleManagementOrder() {
    const orders: Array<DirectOrderKind | undefined> = [undefined, 'move', 'operate', 'construct', 'maintain', 'rest', 'recreate'];
    const current = orders.indexOf(this.managementOrderMode);
    this.managementOrderMode = orders[(current + 1) % orders.length];
    if (this.managementOrderMode) gameStore.setManagementOverlay('orders');
    this.refreshManagementToolbar();
    this.game.events.emit('toast', this.managementOrderMode ? `${this.managementOrderMode.toUpperCase()} order armed · select a Luma, then click a target` : 'Direct order mode cleared');
  }
  private applyManagementOrder(x: number, y: number, building?: BuildingState) {
    if (!this.managementOrderMode) return false;
    const targetBuilding = building ?? this.state.buildings.filter((candidate) => Math.hypot(candidate.x - x, candidate.y - y) < 95).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    const options = this.managementOrderMode === 'move' ? { target: { x, y } } : { buildingId: targetBuilding?.id };
    const ok = gameStore.issueDirectOrder(this.selectedId, this.managementOrderMode, options);
    this.game.events.emit('toast', ok ? `${this.managementOrderMode.toUpperCase()} order assigned` : gameStore.actionError());
    return ok;
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
    this.refreshManagementToolbar();
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
    if (this.state.livingWorld.activeRegion !== 'lumen-field') {
      this.game.events.emit('toast', 'Return to Lumen Field [M] to place habitat facilities');
      return;
    }
    this.placementKind = kind;
    this.placementGhost?.destroy();
    const def = BUILDINGS[kind];
    const base = this.add.image(0, 0, 'building-base').setTint(def.color).setAlpha(0.45);
    const influence = this.add.circle(0, 0, 130, def.color, 0.055).setStrokeStyle(2, def.color, 0.32);
    const clearance = this.add.circle(0, 0, 112, 0x000000, 0).setStrokeStyle(2, 0x7af6bd, 0.7);
    const glyph = crisp(this.add.text(0, 0, def.glyph, { fontFamily: UI_FONT, fontSize: '28px', color: '#071410' })).setOrigin(0.5);
    const status = crisp(this.add.text(0, 154, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#eafff4', backgroundColor: '#1f2a20ee', padding: { x: 8, y: 5 }, align: 'center' })).setOrigin(0.5);
    this.placementGhost = this.add.container(800, 500, [influence, clearance, base, glyph, status]).setDepth(20);
    const pointer = this.input.activePointer;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.placementGhost.setPosition(point.x, point.y);
    this.updatePlacementGhost(point.x, point.y);
  };
  private updatePlacementGhost(x: number, y: number) {
    if (!this.placementGhost || !this.placementKind) return;
    const clearance = this.placementGhost.getAt(1) as Phaser.GameObjects.Arc;
    const base = this.placementGhost.getAt(2) as Phaser.GameObjects.Image;
    const status = this.placementGhost.getAt(4) as Phaser.GameObjects.Text;
    const placement = gameStore.canPlace(this.placementKind, x, y);
    base.setTint(placement.ok ? BUILDINGS[this.placementKind].color : 0xff735f).setAlpha(placement.ok ? 0.55 : 0.38);
    clearance.setStrokeStyle(2, placement.ok ? 0x7af6bd : 0xff735f, 0.8);
    status.setText(`${placement.ok ? 'CLEAR' : 'BLOCKED'} · ${placement.reason ?? ''}\nINFLUENCE · ${placement.influenceSummary ?? '0 nearby facilities'}`)
      .setColor(placement.ok ? '#baffdc' : '#ffb3a6');
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
    const body = this.add.graphics(); const eyes = this.add.graphics(); const gesture = this.add.graphics();
    const pose = this.add.container(0, 0, [body, eyes, gesture]);
    const status = crisp(this.add.text(29, -34, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '14px', color: '#071410', backgroundColor: '#f7bd62', padding: { x: 4, y: 2 } })).setOrigin(0.5).setVisible(false);
    const actor = this.add.container(0, 0, [aura, selection, pose, status]);
    const label = crisp(this.add.text(0, 45, creature.name, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#fff1ba', backgroundColor: '#352816e8', padding: { x: 7, y: 4 } })).setOrigin(0.5).setStroke('#20170d', 1);
    const thoughtTail = this.add.triangle(0, 16, 0, 0, 10, 0, 5, 7, 0xfff3c4, 0.96).setOrigin(0.5, 0);
    const thoughtText = crisp(this.add.text(0, 0, '', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#2c2417', backgroundColor: '#fff3c4', padding: { x: 7, y: 4 }, align: 'center' })).setOrigin(0.5);
    const thought = this.add.container(0, -69, [thoughtTail, thoughtText]).setVisible(false);
    const container = this.add.container(creature.x, creature.y, [shadow, actor, label, thought]).setSize(82, 110).setDepth(10).setInteractive({ useHandCursor: true });
    this.input.setDraggable(container, this.state.livingWorld.management.overlay === 'orders');
    const serial = Number(creature.id.replace(/\D/g, '')) || 1;
    const view: CreatureView = {
      container, actor, pose, shadow, aura, selection, body, eyes, gesture, status, label, thought, thoughtText,
      lastAlive: creature.alive, visualSignature: '', lastName: creature.name, lastTask: creature.task, facing: serial % 2 ? 1 : -1,
      blinkAt: this.time.now + 900 + serial % 7 * 260, blinkUntil: 0
    };
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
        view.facing = pointer.worldX < current.x ? -1 : 1;
        this.tweens.killTweensOf(view.actor); this.tweens.add({ targets: view.actor, y: -9, rotation: view.facing * -0.09, scaleX: 1.08, scaleY: 0.94, duration: 105, yoyo: true, ease: 'Sine.easeOut' });
        this.emitWorldParticles(current.x, current.y - 18, Phaser.Display.Color.HSVToRGB(current.hue / 360, 0.42, 1).color, 6, 34);
        this.syncState(this.state); this.game.events.emit('creature-selected', current);
        const answer = this.state.creatures.filter((candidate) => candidate.alive && candidate.id !== current.id && Math.hypot(candidate.x - current.x, candidate.y - current.y) < 240).sort((a, b) => (b.bonds[current.id] ?? 0) - (a.bonds[current.id] ?? 0))[0];
        if (answer && (answer.bonds[current.id] ?? 0) > 18) this.time.delayedCall(280, () => this.voiceCreature(answer, 'answer'));
      }
    });
    container.on('dragstart', () => {
      if (this.state.livingWorld.management.overlay !== 'orders') return;
      this.managementDragId = creature.id; this.dragging = false; container.setDepth(25);
    });
    container.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (this.managementDragId !== creature.id) return;
      container.setPosition(dragX, dragY);
    });
    container.on('dragend', () => {
      if (this.managementDragId !== creature.id) return;
      this.managementDragId = undefined; container.setDepth(10);
      const current = this.state.creatures.find((candidate) => candidate.id === creature.id) ?? creature;
      const building = this.state.buildings.filter((candidate) => candidate.active && !candidate.constructing)
        .sort((a, b) => Math.hypot(a.x - container.x, a.y - container.y) - Math.hypot(b.x - container.x, b.y - container.y))[0];
      if (building && Math.hypot(building.x - container.x, building.y - container.y) < 120) {
        if (!building.preferredOperatorIds.includes(creature.id)) gameStore.togglePreferredOperator(building.id, creature.id);
        this.game.events.emit('toast', `${current.name} is now preferred staff at ${BUILDINGS[building.kind].name}`);
      } else this.game.events.emit('toast', 'Drop the Luma directly on an active facility to assign preferred staff');
      container.setPosition(current.x, current.y);
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
    if (creature.task === 'celebrate') return 'Sharing a colony moment ✦';
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
    const social = ['socialize', 'comfort', 'argue', 'celebrate'].includes(creature.task);
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
    view.body.clear(); view.eyes.clear(); view.gesture.clear();
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
      if (creature.task === 'construct') {
        view.body.fillStyle(0x3a2918, 1).fillRect(-25, 12, 18, 15);
        view.body.fillStyle(0xd4a65f, 1).fillRect(-22, 9, 16, 15).fillStyle(0xffdda0, 0.85).fillRect(-19, 11, 10, 3);
      }
      if (creature.task === 'maintain') {
        view.body.fillStyle(0x65c7ff, 1).fillRect(16, 10, 5, 16).fillRect(11, 15, 15, 5);
      }
      if (creature.task === 'eat') {
        view.gesture.fillStyle(0xf7bd62, 1).fillCircle(23, 7, 6).fillStyle(0x7cbf4f, 1).fillRect(21, -1, 4, 7);
      } else if (creature.task === 'bathe') {
        view.gesture.fillStyle(0x9fe9ff, 0.9).fillCircle(-25, 5, 4).fillCircle(24, -8, 3).fillCircle(19, 17, 2);
      } else if (creature.task === 'play' || creature.task === 'celebrate') {
        view.gesture.fillStyle(0xfff0a8, 0.95).fillRect(-31, -15, 5, 5).fillRect(26, -24, 6, 6).fillRect(27, 10, 4, 4);
      } else if (creature.task === 'sleep') {
        view.gesture.lineStyle(3, 0xd8b6ff, 0.85).strokeCircle(25, -16, 5).strokeCircle(31, -25, 3);
      } else if (creature.task === 'work') {
        view.gesture.lineStyle(4, 0xd4a65f, 1).lineBetween(17, 3, 29, 20).fillStyle(0x69736d, 1).fillRect(24, 16, 12, 7);
      } else if (creature.task === 'heal') {
        view.gesture.fillStyle(0xff8fcf, 0.95).fillRect(19, -4, 6, 22).fillRect(11, 4, 22, 6);
      } else if (creature.task === 'socialize' || creature.task === 'comfort') {
        view.gesture.lineStyle(4, creature.task === 'comfort' ? 0x7af6bd : 0xffa6d8, 0.9).lineBetween(18, 5, 32, -2).fillCircle(33, -3, 4);
      } else if (creature.task === 'argue') {
        view.gesture.lineStyle(3, 0xff735f, 0.95).lineBetween(20, -18, 31, -8).lineBetween(31, -18, 20, -8);
      }
    } else {
      view.eyes.fillStyle(0x25301f, 1).fillRect(-13, 14, 9, 3).fillRect(-10, 11, 3, 9).fillRect(4, 14, 9, 3).fillRect(7, 11, 3, 9);
    }
    const status = !creature.alive ? '' : sick ? '☣' : hungry ? '!' : dirty ? '≋' : sad ? '·' : tired ? 'z' : creature.task === 'comfort' ? '+' : creature.task === 'socialize' ? '♡' : creature.task === 'argue' ? '×' : creature.task === 'celebrate' ? '✦' : '';
    const statusColor = sick ? '#ff735f' : hungry ? '#f7bd62' : dirty ? '#65c7ff' : creature.task === 'comfort' ? '#7af6bd' : creature.task === 'argue' ? '#ff735f' : creature.task === 'celebrate' ? '#f7bd62' : '#bf78ff';
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
    if (building.level >= 2 && building.upgradeBranch === 'quality') {
      art.fillStyle(def.color, 0.9).fillRect(-36, -38, 9, 9).fillRect(27, -38, 9, 9)
        .fillStyle(0xfff0ba, 0.9).fillRect(-33, -35, 3, 3).fillRect(30, -35, 3, 3)
        .fillStyle(def.color, 0.72).fillRect(-4, -48, 8, 18);
    }
    if (building.level >= 2 && building.upgradeBranch === 'capacity') {
      art.fillStyle(0x6e5331, 1).fillRect(-56, 4, 16, 25).fillRect(40, 4, 16, 25)
        .fillStyle(def.color, 0.82).fillRect(-53, -3, 10, 10).fillRect(43, -3, 10, 10);
    }
    if (building.level >= 3) art.fillStyle(0xfff0ba, 0.95).fillRect(-22, -47, 44, 5).fillStyle(def.color, 0.65).fillRect(-15, -52, 30, 4);
    if (building.constructing) {
      const delivery = materialDeliveryRatio(building);
      art.lineStyle(3, 0xd4a65f, 0.8).lineBetween(-48, 32, -48, -42).lineBetween(48, 32, 48, -42).lineBetween(-48, -42, 48, -42);
      const crates = Math.max(1, Math.floor(delivery * 4));
      for (let index = 0; index < crates; index++) art.fillStyle(0xb87a3e, 1).fillRect(-43 + index * 17, 21, 14, 12).fillStyle(0xf0c77a, 0.8).fillRect(-40 + index * 17, 23, 8, 3);
    }
    if (!building.constructing && building.durability < 55) art.fillStyle(0xff735f, 0.9).fillRect(-44, -34, 10, 10).fillStyle(0xffd4c9, 1).fillRect(-41, -31, 4, 4);
    const activity = this.add.graphics();
    if (building.kind === 'nutrient-bed') activity.fillStyle(0xf7e77a, 0.8).fillCircle(-18, -30, 3).fillCircle(1, -36, 3).fillCircle(19, -28, 3);
    if (building.kind === 'wash-pool') activity.lineStyle(2, 0xc9ffff, 0.65).strokeCircle(0, -1, 18).strokeCircle(0, -1, 25);
    if (building.kind === 'resonance-garden') activity.lineStyle(2, 0xe4c7ff, 0.75).lineBetween(-26, -35, -26, -12).lineBetween(26, -35, 26, -12);
    if (building.kind === 'nest') activity.fillStyle(0xffd58a, 0.16).fillCircle(0, -4, 32);
    if (building.kind === 'extractor') activity.lineStyle(4, 0xff9a73, 0.7).strokeCircle(0, -8, 22).lineBetween(0, -33, 0, 17).lineBetween(-25, -8, 25, -8);
    if (building.kind === 'clinic') activity.fillStyle(0xffb9da, 0.24).fillCircle(0, -5, 30).fillStyle(0xffffff, 0.8).fillRect(-2, -28, 4, 8);
    const level = crisp(this.add.text(-34, -27, building.level >= 3 ? 'Ⅲ' : building.level >= 2 ? 'Ⅱ' : 'Ⅰ', { fontFamily: DISPLAY_FONT, fontStyle: 'bold', fontSize: '12px', color: '#fff0ba', backgroundColor: '#382918dd', padding: { x: 3, y: 2 } })).setOrigin(0.5);
    const name = crisp(this.add.text(0, 50, `${buildingDisplayName(building).toUpperCase()}${building.constructing ? ` ${Math.floor(building.constructionProgress)}%` : ''}`, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: '#fff0ba', backgroundColor: '#382918ee', padding: { x: 7, y: 4 } })).setOrigin(0.5);
    const container = this.add.container(building.x, building.y, [shadow, halo, art, activity, core, glyph, level, name]).setDepth(7).setSize(120, 104).setInteractive({ useHandCursor: true }).setData('level', building.level);
    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 8 && !this.placementKind) {
        if (this.managementOrderMode) {
          this.applyManagementOrder(building.x, building.y, building);
          return;
        }
        this.audioUnlocked = true; this.playBuildingSound(building.kind);
        this.game.events.emit('building-selected', this.state.buildings.find((candidate) => candidate.id === building.id));
      }
    });
    return { container, halo, core, activity };
  }
  private syncState(state: WorldState) {
    this.creaturesById = new Map(state.creatures.map((creature) => [creature.id, creature]));
    const creatureIds = new Set(state.creatures.map((creature) => creature.id));
    this.views.forEach((view, id) => { if (!creatureIds.has(id)) { view.container.destroy(); this.views.delete(id); } });
    const buildingIds = new Set(state.buildings.map((building) => building.id));
    this.buildingViews.forEach((view, id) => { if (!buildingIds.has(id)) { view.container.destroy(); this.buildingViews.delete(id); this.buildingLifecycle.delete(id); } });
    state.creatures.forEach((creature) => {
      let view = this.views.get(creature.id);
      if (!view) { view = this.createCreatureView(creature); this.views.set(creature.id, view); }
      this.input.setDraggable(view.container, state.livingWorld.management.overlay === 'orders');
      view.container.setVisible(this.creatureVisibleInActiveRegion(creature, state));
      if (view.lastAlive && !creature.alive) { if (state.livingWorld.settings.screenShake) this.cameras.main.shake(400, 0.006); this.game.events.emit('glitch', state.livingWorld.settings.reducedMotion ? 0.25 : 0.9); }
      if (view.lastName !== creature.name) { view.lastName = creature.name; this.voiceCreature(creature, 'rename'); }
      if (view.lastTask !== creature.task) {
        this.playTaskTransition(creature, view.lastTask, creature.task);
        view.lastTask = creature.task;
      }
      view.lastAlive = creature.alive;
      this.drawCreature(view, creature);
    });
    state.buildings.forEach((building) => {
      const existing = this.buildingViews.get(building.id);
      const signature = `${building.level}:${building.upgradeBranch ?? ''}:${Math.floor(building.constructionProgress / 10)}:${Math.floor(materialDeliveryRatio(building) * 5)}:${Math.floor(building.durability / 10)}:${building.maintenanceFunded}`;
      const lifecycle = `${building.constructing}:${building.level}`;
      const previousLifecycle = this.buildingLifecycle.get(building.id);
      if (previousLifecycle && previousLifecycle !== lifecycle && (!building.constructing || Number(previousLifecycle.split(':')[1]) < building.level)) this.playBuildingCompletion(building);
      this.buildingLifecycle.set(building.id, lifecycle);
      if (existing && existing.container.getData('signature') !== signature) { existing.container.destroy(); this.buildingViews.delete(building.id); }
      if (!this.buildingViews.has(building.id)) this.buildingViews.set(building.id, this.createBuildingView(building));
    });
    this.buildingViews.forEach((view, id) => {
      const building = state.buildings.find((item) => item.id === id);
      if (building) {
        view.container.setData('signature', `${building.level}:${building.upgradeBranch ?? ''}:${Math.floor(building.constructionProgress / 10)}:${Math.floor(materialDeliveryRatio(building) * 5)}:${Math.floor(building.durability / 10)}:${building.maintenanceFunded}`);
        view.container.setVisible(state.livingWorld.activeRegion === 'lumen-field');
      }
    });
    this.drawRegionalView(state);
    this.drawPaths(state);
    this.drawManagementOverlay(state);
    this.drawPollution(state);
  }
  private drawManagementOverlay(state: WorldState) {
    this.managementGraphics.clear();
    this.managementLabels.forEach((label) => label.destroy()); this.managementLabels = [];
    const overlay = state.livingWorld.management.overlay;
    const view = this.cameras.main.worldView;
    const visibleAt = (x: number, y: number, margin = 160) => x >= view.left - margin && x <= view.right + margin && y >= view.top - margin && y <= view.bottom + margin;
    this.refreshManagementToolbar();
    if (state.livingWorld.activeRegion !== 'lumen-field') return;
    if (overlay === 'none') return;
    const label = (x: number, y: number, value: string, color: number) => {
      const node = crisp(this.add.text(x, y, value, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '10px', color: Phaser.Display.Color.IntegerToColor(color).rgba, backgroundColor: '#241b12dd', padding: { x: 5, y: 3 }, align: 'center' })).setOrigin(0.5).setDepth(12);
      this.managementLabels.push(node);
    };
    if (overlay === 'zones') {
      state.livingWorld.management.zones.forEach((zone) => {
        this.managementGraphics.fillStyle(zone.color, 0.045).fillCircle(zone.x, zone.y, zone.radius);
        this.managementGraphics.lineStyle(4, zone.color, 0.48).strokeCircle(zone.x, zone.y, zone.radius);
        const group = state.livingWorld.management.groups.find((candidate) => candidate.zoneId === zone.id);
        const population = state.creatures.filter((creature) => creature.alive && creature.managementGroupId === group?.id).length;
        label(zone.x, zone.y - zone.radius + 18, `${zone.name.toUpperCase()} · ${population} LUMA\nEDIT ZONE IN COLONY → MANAGE → MAP`, zone.color);
      });
    }
    if (overlay === 'capacity') {
      state.buildings.filter((building) => visibleAt(building.x, building.y, building.influenceRadius)).slice(0, 120).forEach((building) => {
        const color = BUILDINGS[building.kind].color; const waiting = state.creatures.filter((creature) => creature.destinationBuildingId === building.id && !creature.isBeingServed).length;
        this.managementGraphics.fillStyle(color, 0.035).fillCircle(building.x, building.y, building.influenceRadius);
        this.managementGraphics.lineStyle(waiting ? 5 : 3, waiting >= 3 ? 0xff735f : color, waiting ? 0.58 : 0.3).strokeCircle(building.x, building.y, building.influenceRadius);
        label(building.x, building.y - 72, `${buildingDisplayName(building).toUpperCase()}\nCAP ${buildingCapacity(building)} · QUEUE ${waiting} · DUR ${Math.round(building.durability)}%`, waiting >= 3 ? 0xff735f : color);
      });
    }
    if (overlay === 'traffic') {
      state.creatures.filter((creature) => creature.alive && creature.navigationPath.length && visibleAt(creature.x, creature.y)).slice(0, 120).forEach((creature) => {
        const points = [{ x: creature.x, y: creature.y }, ...creature.navigationPath];
        this.managementGraphics.lineStyle(creature.stuckTimer > 1 ? 5 : 2, creature.stuckTimer > 1 ? 0xff735f : 0x65c7ff, creature.stuckTimer > 1 ? 0.8 : 0.24);
        this.managementGraphics.beginPath(); points.forEach((point, index) => index ? this.managementGraphics.lineTo(point.x, point.y) : this.managementGraphics.moveTo(point.x, point.y)); this.managementGraphics.strokePath();
        if (creature.stuckTimer > 1 || creature.id === this.selectedId) {
          const destination = creature.destinationBuildingId ? state.buildings.find((building) => building.id === creature.destinationBuildingId) : undefined;
          label(creature.x, creature.y - 72, creature.stuckTimer > 1
            ? `${creature.name.toUpperCase()} · ROUTE DELAYED\n${destination ? `${buildingDisplayName(destination)} queue/approach is congested` : 'No open path; automatic recovery is retrying'}`
            : `${creature.name.toUpperCase()} · ${creature.task.toUpperCase()}\n${creature.lastTaskReason}`, creature.stuckTimer > 1 ? 0xff735f : 0x65c7ff);
        }
      });
      state.buildings.filter((building) => visibleAt(building.x, building.y)).slice(0, 120).forEach((building) => {
        const waiting = state.creatures.filter((creature) => creature.destinationBuildingId === building.id && !creature.isBeingServed).length;
        if (waiting) this.managementGraphics.fillStyle(waiting >= 3 ? 0xff735f : 0xf7bd62, Math.min(0.45, waiting * 0.1)).fillCircle(building.x, building.y, 44 + waiting * 8);
      });
    }
    if (overlay === 'orders') {
      state.creatures.filter((creature) => creature.alive && (creature.directOrder || creature.id === this.selectedId)).forEach((creature) => {
        const targetBuilding = creature.directOrder?.buildingId ? state.buildings.find((building) => building.id === creature.directOrder?.buildingId) : undefined;
        const target = creature.directOrder?.target ?? targetBuilding ?? creature.target;
        this.managementGraphics.lineStyle(4, creature.id === this.selectedId ? 0xfff0a8 : 0xbf78ff, 0.72).lineBetween(creature.x, creature.y, target.x, target.y);
        this.managementGraphics.fillStyle(0xfff0a8, 0.8).fillCircle(target.x, target.y, 7);
        if (creature.directOrder) label(creature.x, creature.y - 74, `${creature.name.toUpperCase()} · ${creature.directOrder.kind.toUpperCase()}\n${creature.lastTaskReason}`, 0xfff0a8);
      });
    }
  }
  private drawRelationships() {
    this.relationshipGraphics.clear();
    const rendered = new Set<string>();
    for (const creature of this.state.creatures) {
      if (!creature.alive || !creature.destinationCreatureId || !['socialize', 'comfort', 'argue'].includes(creature.task)) continue;
      const partner = this.creaturesById.get(creature.destinationCreatureId);
      const from = this.views.get(creature.id); const to = partner ? this.views.get(partner.id) : undefined;
      if (!partner?.alive || !from || !to) continue;
      const key = [creature.id, partner.id].sort().join(':'); if (rendered.has(key)) continue; rendered.add(key);
      const active = creature.socialTimer > 0;
      const relationshipColor = creature.task === 'comfort' ? 0x7af6bd : creature.task === 'argue' ? 0xff735f : 0xffa6d8;
      this.relationshipGraphics.lineStyle(active ? 3 : 2, relationshipColor, active ? 0.52 : 0.2);
      this.relationshipGraphics.lineBetween(from.container.x, from.container.y - 4, to.container.x, to.container.y - 4);
      if (active) {
        const midpointX = (from.container.x + to.container.x) / 2; const midpointY = (from.container.y + to.container.y) / 2;
        this.relationshipGraphics.fillStyle(relationshipColor, 0.8).fillCircle(midpointX, midpointY - 5, creature.task === 'argue' ? 4 : 3);
      }
    }
  }
  private drawPaths(state: WorldState) {
    if (state.livingWorld.activeRegion !== 'lumen-field') { this.pathGraphics.clear(); this.buildingSignature = ''; return; }
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
    if (state.livingWorld.activeRegion !== 'lumen-field') { this.pollutionGraphics.clear(); this.pollutionSignature = ''; return; }
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
  private creatureVisibleInActiveRegion(creature: CreatureState, state = this.state) {
    if (!creature.alive) return true;
    if (state.livingWorld.activeRegion === 'lumen-field') return !creature.expeditionId;
    const outpost = state.livingWorld.outposts.find((candidate) => candidate.regionId === state.livingWorld.activeRegion);
    return creature.expeditionId === outpost?.id;
  }
  private drawRegionalView(state: WorldState) {
    const regionId = state.livingWorld.activeRegion;
    const progress = state.livingWorld.regionProgress[regionId];
    const outpost = state.livingWorld.outposts.find((candidate) => candidate.regionId === regionId);
    const route = state.livingWorld.supplyRoutes.find((candidate) => candidate.regionId === regionId);
    const activeExpedition = state.livingWorld.expeditions.find((expedition) => expedition.regionId === regionId && expedition.status === 'active');
    const expeditionTravel = activeExpedition ? Phaser.Math.Clamp((state.time - activeExpedition.startedAt) / Math.max(1, activeExpedition.returnAt - activeExpedition.startedAt), 0, 1) : 0;
    const signature = `${regionId}:${Math.floor(progress.scouting / 5)}:${outpost?.staffIds.length ?? 0}:${Math.floor(outpost?.condition ?? 0)}:${route?.active}:${activeExpedition?.id ?? ''}:${Math.floor(expeditionTravel * 20)}`;
    if (signature === this.regionalSignature) return;
    this.regionalSignature = signature; this.regionalGraphics.clear();
    this.regionalLabels.forEach((label) => label.destroy()); this.regionalLabels = [];
    this.habitatImage.clearTint();
    if (regionId === 'lumen-field') return;
    const colors: Record<Exclude<RegionId, 'lumen-field'>, { tint: number; veil: number; accent: number }> = {
      'whisper-grove': { tint: 0xa9d878, veil: 0x163d20, accent: 0xc8ff92 },
      'mirror-marsh': { tint: 0x73bed0, veil: 0x133642, accent: 0x9fefff },
      'old-signal-ridge': { tint: 0xc2a7d8, veil: 0x322948, accent: 0xe2c6ff },
      'aurora-basin': { tint: 0xffb7df, veil: 0x44244b, accent: 0xffd5f2 }
    };
    const palette = colors[regionId]; this.habitatImage.setTint(palette.tint);
    this.regionalGraphics.fillStyle(palette.veil, 0.25).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let index = 0; index < Math.max(0, Math.ceil((100 - progress.scouting) / 8)); index++) {
      const x = 80 + (index * 223 + regionId.length * 31) % 1450; const y = 110 + (index * 157 + regionId.length * 53) % 790;
      this.regionalGraphics.fillStyle(0x07110d, 0.22).fillCircle(x, y, 105 + index % 4 * 24);
    }
    this.regionalGraphics.lineStyle(5, palette.accent, 0.3).strokeCircle(800, 520, 118);
    this.regionalGraphics.fillStyle(palette.accent, 0.1).fillCircle(800, 520, 100);
    if (outpost) {
      this.regionalGraphics.fillStyle(0x3a2918, 0.95).fillRect(724, 456, 152, 92);
      this.regionalGraphics.lineStyle(4, palette.accent, 0.75).strokeRect(724, 456, 152, 92);
      this.regionalGraphics.fillStyle(palette.accent, 0.85).fillRect(746, 480, 108, 14);
      this.regionalGraphics.fillStyle(outpost.condition < 45 ? 0xff735f : 0x7af6bd, 0.9).fillRect(746, 511, Math.max(5, 108 * outpost.condition / 100), 8);
    }
    if (route?.active) {
      this.regionalGraphics.lineStyle(9, palette.accent, 0.18).lineBetween(800, 520, 1530, 135);
      this.regionalGraphics.lineStyle(3, palette.accent, 0.72).lineBetween(800, 520, 1530, 135);
      for (let index = 0; index < 6; index++) this.regionalGraphics.fillStyle(0xfff0a8, 0.85).fillCircle(900 + index * 105, 467 - index * 54, 5);
    }
    if (activeExpedition) {
      this.regionalGraphics.lineStyle(3, 0x65c7ff, 0.65).lineBetween(90, 845, 800, 520);
      this.regionalGraphics.fillStyle(0x65c7ff, 1).fillCircle(90 + 710 * expeditionTravel, 845 - 325 * expeditionTravel, 12);
    }
    const title = crisp(this.add.text(52, 42, `${REGIONS[regionId].glyph}  ${REGIONS[regionId].name.toUpperCase()}  ·  ${Math.floor(progress.scouting)}% SCOUTED  ·  ${progress.hazard.toUpperCase()} HAZARD`, { fontFamily: DISPLAY_FONT, fontSize: '13px', color: '#fff1ba', backgroundColor: '#281f20dd', padding: { x: 9, y: 5 }, letterSpacing: 1 })).setDepth(13);
    const relay = crisp(this.add.text(800, 405, outpost ? `${outpost.name.toUpperCase()}\n${outpost.staffIds.length} STAFF · ${route?.active ? 'ROUTE ACTIVE' : 'LOCAL STORAGE'}` : 'UNSETTLED REGION\nSCOUT TO ESTABLISH A RELAY', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#fff0ba', backgroundColor: '#281f20dd', padding: { x: 8, y: 5 }, align: 'center' })).setOrigin(0.5).setDepth(13);
    this.regionalLabels.push(title, relay);
  }
  private emitWorldParticles(x: number, y: number, color: number, count: number, radius: number) {
    const settings = this.state.livingWorld.settings;
    if (settings.lowPower || settings.reducedMotion) return;
    const actualCount = settings.quality === 'high' ? count : Math.max(2, Math.ceil(count * 0.55));
    for (let index = 0; index < actualCount; index++) {
      const particle = this.effectPool[this.effectCursor++ % this.effectPool.length];
      const angle = index / actualCount * Math.PI * 2 + this.effectCursor * 0.17;
      particle.setPosition(x, y).setFillStyle(color).setAlpha(0.85).setScale(index % 3 === 0 ? 1.4 : 0.85).setAngle(index * 23);
      this.tweens.killTweensOf(particle);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius - 8,
        alpha: 0,
        scale: 0.2,
        angle: particle.angle + 90,
        duration: 420 + index * 22,
        ease: 'Cubic.easeOut'
      });
    }
  }
  private playTaskTransition(creature: CreatureState, previous: CreatureState['task'], next: CreatureState['task']) {
    if (!creature.alive || previous === next) return;
    const color = next === 'bathe' ? 0x9fe9ff : next === 'heal' ? 0xff8fcf : next === 'play' || next === 'celebrate' ? 0xfff0a8 : next === 'construct' || next === 'maintain' ? 0xd4a65f : next === 'socialize' || next === 'comfort' ? 0xffa6d8 : 0x7af6bd;
    if (['bathe', 'heal', 'play', 'celebrate', 'construct', 'maintain', 'socialize', 'comfort'].includes(next)) this.emitWorldParticles(creature.x, creature.y + 6, color, next === 'celebrate' ? 10 : 5, next === 'celebrate' ? 55 : 28);
  }
  private playBuildingCompletion(building: BuildingState) {
    const def = BUILDINGS[building.kind];
    this.emitWorldParticles(building.x, building.y - 8, def.color, building.level >= 3 ? 24 : 16, building.level >= 3 ? 105 : 78);
    this.playBuildingSound(building.kind, true);
    if (this.state.livingWorld.settings.screenShake && !this.state.livingWorld.settings.reducedMotion) this.cameras.main.shake(building.level >= 3 ? 280 : 170, building.level >= 3 ? 0.004 : 0.002);
    this.cameras.main.flash(160, 255, 240, 170, true);
  }
  private playBuildingSound(kind: BuildingKind, completed = false) {
    const frequencies: Record<BuildingKind, number[]> = {
      'nutrient-bed': [220, 330, 440],
      'wash-pool': [310, 420, 540],
      'resonance-garden': [392, 523, 659],
      nest: [165, 220, 277],
      extractor: [98, 147, 196],
      clinic: [262, 349, 523]
    };
    frequencies[kind].forEach((frequency, index) => this.time.delayedCall(index * (completed ? 95 : 55), () => this.soundPulse(frequency, completed ? 420 : 190)));
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
  private playAmbientTexture() {
    try {
      const settings = this.state.livingWorld.settings; if (settings.muted || settings.ambienceVolume <= 0) return;
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = this.audioContext ?? new AudioContextClass(); this.audioContext = context;
      if (context.state === 'suspended') void context.resume();
      if (!this.noiseBuffer) {
        const length = Math.floor(context.sampleRate * 1.1);
        this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length * 0.35);
      }
      const source = context.createBufferSource(); const filter = context.createBiquadFilter(); const envelope = context.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = this.state.livingWorld.weather === 'rain' || this.state.livingWorld.weather === 'storm' ? 'bandpass' : 'lowpass';
      filter.frequency.value = this.state.livingWorld.weather === 'rain' ? 2400 : this.state.livingWorld.weather === 'storm' ? 1300 : this.state.livingWorld.weather === 'wind' ? 850 : 520;
      filter.Q.value = this.state.livingWorld.weather === 'mist' ? 2.4 : 0.8;
      const now = context.currentTime;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime((this.state.livingWorld.weather === 'clear' ? 0.012 : 0.035) * settings.ambienceVolume, now + 0.08);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1);
      source.connect(filter).connect(envelope).connect(context.destination); source.start(now); source.stop(now + 1.04);
      const tone = context.createOscillator(); const toneGain = context.createGain();
      tone.type = 'sine'; tone.frequency.value = weatherAmbienceFrequency(this.state.livingWorld.weather);
      toneGain.gain.setValueAtTime(0.0001, now); toneGain.gain.exponentialRampToValueAtTime(0.018 * settings.ambienceVolume, now + 0.1); toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
      tone.connect(toneGain).connect(context.destination); tone.start(now); tone.stop(now + 1.35);
    } catch { /* ambience is optional */ }
  }
  private playMusicPhrase() {
    try {
      const settings = this.state.livingWorld.settings; if (settings.muted || settings.musicVolume <= 0) return;
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = this.audioContext ?? new AudioContextClass(); this.audioContext = context;
      if (context.state === 'suspended') void context.resume();
      const mood = soundscapeMood(this.state); const notes = soundscapeNotes(mood, this.state.seed + this.state.livingWorld.day);
      const master = context.createGain(); const now = context.currentTime; const quiet = mood === 'night' || mood === 'rain';
      master.gain.setValueAtTime(0.0001, now); master.gain.exponentialRampToValueAtTime((quiet ? 0.028 : 0.038) * settings.musicVolume, now + 0.08);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 2.45); master.connect(context.destination);
      notes.forEach((frequency, index) => {
        const start = now + index * (mood === 'danger' ? 0.28 : 0.39);
        const oscillator = context.createOscillator(); const filter = context.createBiquadFilter(); const noteGain = context.createGain();
        oscillator.type = mood === 'danger' ? 'sawtooth' : mood === 'celebration' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        if (mood === 'celebration') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.01, start + 0.42);
        filter.type = 'lowpass'; filter.frequency.value = quiet ? 900 : 1600; filter.Q.value = 1.1;
        noteGain.gain.setValueAtTime(0.0001, start); noteGain.gain.exponentialRampToValueAtTime(index === 0 ? 0.7 : 0.42, start + 0.04); noteGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);
        oscillator.connect(filter).connect(noteGain).connect(master); oscillator.start(start); oscillator.stop(start + 0.76);
      });
    } catch { /* music is optional */ }
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
    const stormDarkness = living.weather === 'storm' ? 0.16 : living.weather === 'rain' ? 0.07 : 0;
    this.dayOverlay.setFillStyle(living.season === 'frostquiet' ? 0x152949 : living.season === 'amberfall' ? 0x3a1d16 : 0x08152a, Math.min(0.58, night * 0.48 + stormDarkness));
    this.weatherGraphics.clear();
    const sunrise = Math.max(0, 1 - Math.abs(living.dayTime - 0.2) / 0.12); const sunset = Math.max(0, 1 - Math.abs(living.dayTime - 0.8) / 0.12);
    if (sunrise + sunset > 0) this.weatherGraphics.fillStyle(0xffb36a, (sunrise + sunset) * 0.045).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const budget = presentationBudget(living.settings, this.state.creatures.length);
    if (!budget.weatherParticles) return;
    const weatherLimit = living.weather === 'storm' ? budget.weatherParticles : living.weather === 'rain' ? Math.round(budget.weatherParticles * 0.68) : living.weather === 'mist' ? Math.round(budget.weatherParticles * 0.34) : living.weather === 'wind' ? Math.round(budget.weatherParticles * 0.3) : 0;
    const count = Math.max(0, weatherLimit);
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
    const budget = presentationBudget(this.state.livingWorld.settings, this.state.creatures.length);
    if (time - this.lastAmbienceAt > (this.state.livingWorld.settings.lowPower ? 18000 : 6800)) {
      this.lastAmbienceAt = time;
      this.playAmbientTexture();
    }
    const mood = soundscapeMood(this.state);
    const musicInterval = this.state.livingWorld.settings.lowPower ? 22000 : mood === 'celebration' ? 6200 : mood === 'danger' ? 7600 : 10800;
    if (time - this.lastMusicAt > musicInterval) {
      this.lastMusicAt = time;
      this.playMusicPhrase();
    }
    if (time - this.lastAmbientVoiceAt < (this.state.livingWorld.settings.lowPower ? 12000 : 5200 + budget.animationStride * 350)) return;
    const visible = this.state.creatures.filter((creature) => creature.alive && this.views.get(creature.id)?.container.visible);
    const critical = visible.find((creature) => Math.min(...Object.values(creature.needs)) < 18);
    const social = visible.find((creature) => ['socialize', 'comfort', 'celebrate'].includes(creature.task) && (creature.socialTimer > 0 || creature.task === 'celebrate'));
    const sleeper = visible.find((creature) => creature.task === 'sleep' && creature.isBeingServed);
    const player = visible.find((creature) => creature.task === 'play' && creature.isBeingServed);
    const speaker = critical ?? social ?? sleeper ?? player; if (!speaker) return;
    this.lastAmbientVoiceAt = time; this.voiceCreature(speaker, critical ? 'critical' : social ? 'social' : sleeper ? 'sleep' : 'play');
  }
  update(time: number, delta: number) {
    const smoothing = 1 - Math.exp(-Math.min(delta, 50) * 0.012);
    const camera = this.cameras.main; const budget = presentationBudget(this.state.livingWorld.settings, this.state.creatures.length);
    const night = this.state.livingWorld.dayTime < 0.18 || this.state.livingWorld.dayTime > 0.82;
    this.frameIndex++;
    this.ambientMotes.forEach((mote, index) => {
      const active = index < budget.activeMotes;
      mote.node.setVisible(active);
      if (!active) return;
      mote.node.x = mote.originX + Math.sin(time * 0.0005 * mote.speed + mote.phase) * 12;
      mote.node.y = mote.originY + Math.cos(time * 0.00038 * mote.speed + mote.phase) * 9;
      mote.node.alpha = (night ? 0.2 : 0.1) + (Math.sin(time * 0.0012 + mote.phase) + 1) * (night ? 0.14 : 0.07);
    });
    if (!this.state.livingWorld.settings.lowPower) {
      const windStrength = this.state.livingWorld.weather === 'storm' ? 0.18 : this.state.livingWorld.weather === 'wind' ? 0.12 : this.state.livingWorld.weather === 'rain' ? 0.07 : 0.035;
      this.foliage.forEach((tuft) => { tuft.node.rotation = Math.sin(time * 0.0018 + tuft.phase) * windStrength; });
      this.waterGlints.forEach((glint) => {
        glint.node.alpha = 0.12 + (Math.sin(time * 0.003 + glint.phase) + 1) * (night ? 0.2 : 0.12);
        glint.node.setScale(0.75 + (Math.sin(time * 0.0023 + glint.phase) + 1) * 0.3);
      });
    }
    if (time - this.lastAtmosphereAt >= budget.atmosphereInterval) { this.lastAtmosphereAt = time; this.updateAtmosphere(time); }
    this.updateAmbientVoices(time);
    if (!this.state.livingWorld.settings.lowPower && time - this.lastFootprintAt > budget.footprintInterval) {
      const walkers = this.state.creatures.filter((creature) => creature.alive && Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) > 18 && this.views.get(creature.id)?.container.visible);
      const walker = walkers[this.footprintCursor % Math.max(1, walkers.length)];
      if (walker) {
        const footprint = this.footprintPool[this.footprintCursor++ % this.footprintPool.length]; this.lastFootprintAt = time;
        footprint.setPosition(walker.x, walker.y + 25).setAlpha(0.28).setAngle(this.footprintCursor % 2 ? 12 : -12);
        this.tweens.killTweensOf(footprint); this.tweens.add({ targets: footprint, alpha: 0, duration: 900 });
      }
    }
    this.state.creatures.forEach((creature, index) => {
      const view = this.views.get(creature.id); if (!view) return;
      const dx = creature.x - view.container.x; const dy = creature.y - view.container.y;
      if (this.managementDragId !== creature.id) { view.container.x += dx * smoothing; view.container.y += dy * smoothing; }
      const inView = view.container.x > camera.worldView.left - 100 && view.container.x < camera.worldView.right + 100 && view.container.y > camera.worldView.top - 100 && view.container.y < camera.worldView.bottom + 100;
      const regionVisible = this.creatureVisibleInActiveRegion(creature);
      view.container.setVisible(inView && regionVisible);
      view.label.setVisible(inView && ((camera.zoom > 0.68 && this.state.creatures.length < 90) || creature.id === this.selectedId));
      if (!inView || !regionVisible || (this.frameIndex + index) % budget.animationStride !== 0) return;
      const phase = Number(creature.id.replace(/\D/g, '')) * 0.71;
      const motionScale = this.state.livingWorld.settings.reducedMotion ? 0.25 : 1;
      const moving = Math.hypot(creature.target.x - creature.x, creature.target.y - creature.y) > 12 || Math.hypot(dx, dy) > 1;
      const profile = creaturePose(creature, moving); const cycle = Math.sin(time * profile.cadence + phase); const step = moving ? Math.abs(cycle) : cycle * 0.45;
      if (Math.abs(dx) > 0.7) view.facing = dx < 0 ? -1 : 1;
      view.actor.y = creature.alive ? -Math.max(0, step) * profile.bob * motionScale : 0;
      const targetRotation = creature.alive ? Phaser.Math.Clamp(view.facing * profile.lean * (moving ? cycle : 0.25 * cycle), -0.22, 0.22) : 0;
      view.pose.rotation = Phaser.Math.Linear(view.pose.rotation, targetRotation, Math.min(1, smoothing * 1.4));
      view.pose.scaleX = view.facing * (1 + Math.abs(cycle) * profile.squash * motionScale);
      view.pose.scaleY = 1 - Math.abs(cycle) * profile.squash * motionScale;
      if (time >= view.blinkAt) { view.blinkUntil = time + 95; view.blinkAt = time + 1900 + (Number(creature.id.replace(/\D/g, '')) % 7) * 230; }
      view.eyes.scaleY = time < view.blinkUntil ? 0.12 : profile.eyeScale;
      view.gesture.rotation = profile.gesture === 'repair' || profile.gesture === 'work' ? cycle * 0.32 : profile.gesture === 'cheer' || profile.gesture === 'dance' ? cycle * 0.18 : cycle * 0.06;
      view.gesture.y = profile.gesture === 'splash' ? -Math.abs(cycle) * 5 : profile.gesture === 'nibble' ? cycle * 2 : 0;
      view.gesture.alpha = creature.alive ? 0.78 + Math.abs(cycle) * 0.22 : 0;
      const pulse = 1 + Math.sin(time * 0.003 + phase) * 0.055;
      view.aura.setScale(pulse); view.shadow.setScale(1 - (pulse - 1) * 1.5, 1);
      view.shadow.alpha = 0.4 - Math.max(0, step) * profile.shadowPulse;
      view.thought.y = -69 - (Number(creature.id.replace(/\D/g, '')) % 2) * 8 + Math.sin(time * 0.0025 + phase) * 2;
      view.thought.alpha = 0.9 + (Math.sin(time * 0.003 + phase) + 1) * 0.05;
    });
    this.buildingViews.forEach((view, id) => {
      const building = this.state.buildings.find((candidate) => candidate.id === id); if (!building) return;
      const inView = building.x > camera.worldView.left - 140 && building.x < camera.worldView.right + 140 && building.y > camera.worldView.top - 120 && building.y < camera.worldView.bottom + 120;
      const homeVisible = this.state.livingWorld.activeRegion === 'lumen-field';
      view.container.setVisible(homeVisible && inView); if (!homeVisible || !inView) return;
      const phase = (Number(building.id.replace(/\D/g, '')) || 1) * 0.83; const frequency = buildingMotionFrequency(building.kind); const cycle = Math.sin(time * frequency + phase);
      const operating = building.active && this.state.creatures.some((creature) => creature.alive && creature.destinationBuildingId === building.id && creature.isBeingServed);
      view.core.setScale(0.9 + (cycle + 1) * (operating ? 0.16 : 0.07)).setAlpha(operating ? 0.82 + cycle * 0.16 : 0.48 + cycle * 0.14);
      view.halo.setScale(1 + cycle * (operating ? 0.09 : 0.035)).setAlpha(operating ? 0.13 : 0.065);
      view.activity.setVisible(budget.buildingEffects).setAlpha(building.active ? (operating ? 0.82 : 0.38) : 0.16);
      if (budget.buildingEffects) {
        view.activity.rotation = building.kind === 'extractor' ? time * 0.0018 : cycle * 0.08;
        view.activity.y = building.kind === 'wash-pool' ? cycle * 3 : building.kind === 'resonance-garden' ? -Math.abs(cycle) * 4 : 0;
        view.activity.setScale(1 + cycle * (operating ? 0.08 : 0.025));
      }
    });
    if (time - this.lastRelationshipAt >= budget.relationshipInterval) { this.lastRelationshipAt = time; this.drawRelationships(); }
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
    this.input.keyboard?.off('keydown-O'); this.input.keyboard?.off('keydown-R'); this.input.keyboard?.off('keydown-M');
    this.input.keyboard?.off('keydown-X');
    this.cancelPlacement(false);
    if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close();
    this.audioContext = undefined;
  }
}
