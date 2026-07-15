import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  create() {
    this.cameras.main.setBackgroundColor('#030806');
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 18, 'bofas483', { fontFamily: 'monospace', fontSize: '28px', color: '#7af6bd', letterSpacing: 5 }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 22, 'RECOVERING HABITAT…', { fontFamily: 'monospace', fontSize: '11px', color: '#678779', letterSpacing: 2 }).setOrigin(0.5);
    this.time.delayedCall(280, () => this.scene.start('PreloadScene'));
  }
}
