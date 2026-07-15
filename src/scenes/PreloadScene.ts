import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }
  preload() {
    this.load.image('habitat-pixel-map', '/assets/habitat-pixel-map.png');
  }
  create() {
    this.textures.get('habitat-pixel-map').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffffff).fillCircle(32, 32, 30);
    graphics.generateTexture('soft-circle', 64, 64);
    graphics.clear().fillStyle(0xffffff).fillRect(12, 0, 96, 72).fillRect(4, 8, 112, 56).fillRect(0, 16, 120, 40);
    graphics.generateTexture('building-base', 120, 72);
    graphics.destroy();
    this.scene.start('WorldScene');
  }
}
