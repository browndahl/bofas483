import Phaser from 'phaser';
import { BUILDINGS } from '../simulation/building';
import type { BuildingKind } from '../simulation/worldState';
import { panel } from './hud';
import { crisp, DISPLAY_FONT, truncateText, UI_FONT } from './typography';

export class BuildingMenu extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, population: number, researchUnlocked: boolean, onPick: (kind: BuildingKind) => void) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setDepth(200);
    const width = Math.min(570, scene.scale.width - 20);
    const height = Math.min(650, scene.scale.height - 20);
    const compact = width < 470 || height < 620;
    const entryHeight = compact ? 82 : 78;
    const listHeight = entryHeight * 6;
    const startY = -listHeight / 2 + 25;
    this.add(panel(scene, 0, 0, width, height, 0.99));
    this.add(crisp(scene.add.text(-width / 2 + 22, -height / 2 + 18, 'BUILD / AUTOMATION', { fontFamily: DISPLAY_FONT, fontSize: compact ? '15px' : '17px', color: '#91ffd0', letterSpacing: 1.2 })));
    this.add(crisp(scene.add.text(width / 2 - 22, -height / 2 + 21, `LIVING ${population}`, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#a8cdbb' })).setOrigin(1, 0));
    this.add(crisp(scene.add.text(-width / 2 + 22, -height / 2 + 45, 'Choose a facility, then place it inside the habitat.', {
      fontFamily: UI_FONT, fontSize: '11px', color: '#a8cdbb', wordWrap: { width: width - 44, useAdvancedWrap: true }, maxLines: 2
    })));

    (Object.keys(BUILDINGS) as BuildingKind[]).forEach((kind, index) => {
      const def = BUILDINGS[kind];
      const unlocked = population >= def.unlockPopulation;
      const cardWidth = width - 36;
      const base = scene.add.rectangle(0, 0, cardWidth, entryHeight - 7, 0x0d241b, 0.98).setStrokeStyle(1, unlocked ? def.color : 0x466054, unlocked ? 0.65 : 0.36);
      const accent = scene.add.rectangle(-cardWidth / 2 + 3, 0, 4, entryHeight - 15, unlocked ? def.color : 0x466054, 0.9);
      const glyph = crisp(scene.add.text(-cardWidth / 2 + 29, -1, unlocked ? def.glyph : '×', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '20px', color: unlocked ? Phaser.Display.Color.IntegerToColor(def.color).rgba : '#829b90' })).setOrigin(0.5);
      const title = crisp(scene.add.text(-cardWidth / 2 + 54, -entryHeight / 2 + 10, truncateText(def.name.toUpperCase(), 36), { fontFamily: DISPLAY_FONT, fontSize: compact ? '11px' : '12px', color: unlocked ? '#f0fff7' : '#91aa9f', letterSpacing: 0.5, fixedWidth: cardWidth - 78, maxLines: 1 }));
      const effect = crisp(scene.add.text(-cardWidth / 2 + 54, -entryHeight / 2 + 29, truncateText(def.effect, compact ? 78 : 96), {
        fontFamily: UI_FONT, fontSize: compact ? '10px' : '11px', color: unlocked ? '#b8d9c9' : '#8fa99d',
        lineSpacing: 1, wordWrap: { width: cardWidth - 78, useAdvancedWrap: true }, fixedWidth: cardWidth - 78, fixedHeight: 30, maxLines: 2
      }));
      const impactLabel = def.pollution > 0 ? ` · ${compact ? 'P' : 'POLLUTION'} ${def.pollution}/s` : ' · CLEAN';
      const statsLabel = unlocked
        ? compact
          ? `${def.cost.glow}G/${def.cost.alloy}A · ~19s · ${def.operatorRole.toUpperCase()}${impactLabel}`
          : `COST ${def.cost.glow}G/${def.cost.alloy}A · ~19s · ${def.operatorRole.toUpperCase()} + ${def.operatorSkill.toUpperCase()}${impactLabel}`
        : `UNLOCKS AT ${def.unlockPopulation} LIVING LUMA`;
      const stats = crisp(scene.add.text(-cardWidth / 2 + 54, entryHeight / 2 - 19, truncateText(statsLabel, compact ? 62 : 88), {
        fontFamily: UI_FONT, fontStyle: 'bold', fontSize: compact ? '9px' : '10px',
        color: unlocked ? Phaser.Display.Color.IntegerToColor(def.color).rgba : '#789486', fixedWidth: cardWidth - 78, maxLines: 1
      })).setOrigin(0, 1);
      const entry = scene.add.container(0, startY + index * entryHeight, [base, accent, glyph, title, effect, stats]).setSize(cardWidth, entryHeight - 7);
      if (unlocked) {
        entry.setInteractive({ useHandCursor: true });
        entry.on('pointerover', () => base.setFillStyle(0x173d2d));
        entry.on('pointerout', () => base.setFillStyle(0x0d241b));
        entry.on('pointerup', () => onPick(kind));
      } else entry.setAlpha(0.95);
      this.add(entry);
    });
    this.add(crisp(scene.add.text(0, height / 2 - 16, `${researchUnlocked ? 'UPGRADES READY' : 'UNLOCK ANY RESEARCH TO ENABLE LEVEL-2 UPGRADES'} · Open GUIDE for full strategy.`, {
      fontFamily: UI_FONT, fontStyle: 'bold', fontSize: compact ? '9px' : '11px', color: researchUnlocked ? '#7af6bd' : '#f7bd62',
      align: 'center', wordWrap: { width: width - 44, useAdvancedWrap: true }, maxLines: 2
    })).setOrigin(0.5, 1));
  }
}
