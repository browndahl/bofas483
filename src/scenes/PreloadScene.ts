import Phaser from 'phaser';
import habitatMapUrl from '../assets/habitat-pixel-map.avif?url';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }
  preload() {
    const { width, height } = this.scale;
    const back = this.add.rectangle(width / 2, height / 2 + 30, Math.min(420, width - 48), 8, 0x183326);
    const fill = this.add.rectangle(back.x - back.width / 2, back.y, 0, 8, 0x7af6bd).setOrigin(0, 0.5);
    crisp(this.add.text(width / 2, height / 2 - 26, 'RESTORING HABITAT 483', { fontFamily: DISPLAY_FONT, fontSize: '16px', color: '#fff0a8', letterSpacing: 1.4 })).setOrigin(0.5);
    const status = crisp(this.add.text(width / 2, height / 2 + 54, 'CALIBRATING FIELD…', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#a8cdbb' })).setOrigin(0.5);
    this.load.on('progress', (progress: number) => { fill.width = back.width * progress; status.setText(`CALIBRATING FIELD · ${Math.round(progress * 100)}%`); });
    this.load.image('habitat-pixel-map', habitatMapUrl);
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
