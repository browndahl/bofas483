import Phaser from 'phaser';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  create() {
    this.cameras.main.setBackgroundColor('#030806');
    const { width, height } = this.scale;
    crisp(this.add.text(width / 2, height / 2 - 18, 'bofas483', { fontFamily: DISPLAY_FONT, fontSize: '29px', color: '#91ffd0', letterSpacing: 3 })).setOrigin(0.5);
    crisp(this.add.text(width / 2, height / 2 + 22, 'RECOVERING HABITAT…', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#8eb4a2', letterSpacing: 1.2 })).setOrigin(0.5);
    this.time.delayedCall(280, () => this.scene.start('PreloadScene'));
  }
}
