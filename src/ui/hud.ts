import Phaser from 'phaser';
import { crisp, UI_FONT } from './typography';

export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, alpha = 0.92) {
  return scene.add.rectangle(x, y, width, height, 0x081a14, alpha).setStrokeStyle(1, 0x4b8f6f, 0.78);
}

export function button(scene: Phaser.Scene, x: number, y: number, width: number, height: number, label: string, color = 0x7af6bd) {
  const glow = scene.add.rectangle(0, 2, width + 5, height + 5, color, 0.06);
  const base = scene.add.rectangle(0, 0, width, height, 0x102b21, 0.98).setStrokeStyle(1, color, 0.82);
  const accent = scene.add.rectangle(-width / 2 + 3, 0, 3, height - 8, color, 0.82);
  const text = crisp(scene.add.text(2, 0, label, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '13px', color: Phaser.Display.Color.IntegerToColor(color).rgba, align: 'center', letterSpacing: 0.35 })).setOrigin(0.5).setName('button-label');
  const container = scene.add.container(x, y, [glow, base, accent, text]).setSize(width, height).setInteractive({ useHandCursor: true });
  container.on('pointerover', () => { base.setFillStyle(0x1b4534); glow.setAlpha(0.14); text.setScale(1.03); });
  container.on('pointerout', () => { base.setFillStyle(0x102b21); glow.setAlpha(0.06); text.setScale(1); container.setScale(1); });
  container.on('pointerdown', () => container.setScale(0.97));
  container.on('pointerup', () => container.setScale(1));
  return container;
}

export function meter(scene: Phaser.Scene, x: number, y: number, width: number, label: string, color: number) {
  const title = crisp(scene.add.text(x, y, label, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#a3cdb9', letterSpacing: 0.3 }));
  const back = scene.add.rectangle(x, y + 15, width, 8, 0x142d23, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x315a49, 0.45);
  const fill = scene.add.rectangle(x, y + 15, width, 6, color, 1).setOrigin(0, 0.5);
  return { title, back, fill, width, target: width };
}
