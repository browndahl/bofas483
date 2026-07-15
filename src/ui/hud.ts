import Phaser from 'phaser';

export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, alpha = 0.92) {
  return scene.add.rectangle(x, y, width, height, 0x071410, alpha).setStrokeStyle(1, 0x315a49, 0.9);
}

export function button(scene: Phaser.Scene, x: number, y: number, width: number, height: number, label: string, color = 0x7af6bd) {
  const base = scene.add.rectangle(0, 0, width, height, 0x10241c, 0.98).setStrokeStyle(1, color, 0.8);
  const text = scene.add.text(0, 0, label, { fontFamily: 'monospace', fontSize: '12px', color: Phaser.Display.Color.IntegerToColor(color).rgba, align: 'center' }).setOrigin(0.5);
  const container = scene.add.container(x, y, [base, text]).setSize(width, height).setInteractive({ useHandCursor: true });
  container.on('pointerover', () => base.setFillStyle(0x193d2e));
  container.on('pointerout', () => base.setFillStyle(0x10241c));
  container.on('pointerdown', () => container.setScale(0.97));
  container.on('pointerup', () => container.setScale(1));
  return container;
}

export function meter(scene: Phaser.Scene, x: number, y: number, width: number, label: string, color: number) {
  const title = scene.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '9px', color: '#759b89' });
  const back = scene.add.rectangle(x, y + 14, width, 6, 0x173026, 1).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(x, y + 14, width, 6, color, 1).setOrigin(0, 0.5);
  return { title, back, fill, width };
}
