import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }
  create() {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffffff).fillCircle(32, 32, 30);
    graphics.generateTexture('soft-circle', 64, 64);
    graphics.clear().fillStyle(0xffffff).fillRoundedRect(0, 0, 120, 72, 18);
    graphics.generateTexture('building-base', 120, 72);
    graphics.destroy();
    this.scene.start('WorldScene');
  }
}
