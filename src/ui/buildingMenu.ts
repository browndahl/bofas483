import Phaser from 'phaser';
import { BUILDINGS } from '../simulation/building';
import type { BuildingKind } from '../simulation/worldState';
import { button, panel } from './hud';

export class BuildingMenu extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, population: number, onPick: (kind: BuildingKind) => void) {
    super(scene, x, y); scene.add.existing(this); this.setDepth(200);
    this.add(panel(scene, 0, 0, 300, 410));
    this.add(scene.add.text(-126, -178, 'BUILD / AUTOMATION', { fontFamily: 'monospace', fontSize: '14px', color: '#7af6bd', letterSpacing: 1 }));
    (Object.keys(BUILDINGS) as BuildingKind[]).forEach((kind, index) => {
      const def = BUILDINGS[kind]; const unlocked = population >= def.unlockPopulation;
      const entry = button(scene, 0, -126 + index * 54, 260, 44, unlocked ? `${def.glyph}  ${def.name}   ${def.cost.glow}◈ ${def.cost.alloy}⬡` : `LOCKED · POP ${def.unlockPopulation}`, unlocked ? def.color : 0x466054);
      entry.setAlpha(unlocked ? 1 : 0.55);
      if (unlocked) entry.on('pointerup', () => onPick(kind));
      this.add(entry);
    });
  }
}
