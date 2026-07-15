import Phaser from 'phaser';
import { crisp, UI_FONT } from '../ui/typography';

export class GlitchOverlayScene extends Phaser.Scene {
  private strips: Phaser.GameObjects.Rectangle[] = [];
  constructor() { super('GlitchOverlayScene'); }
  create() {
    for (let i = 0; i < 12; i++) this.strips.push(this.add.rectangle(0, 0, 20, 2, i % 2 ? 0xbf78ff : 0x7af6bd, 0).setOrigin(0).setDepth(1000));
    this.game.events.on('glitch', this.glitch, this);
  }
  private glitch = (intensity = 0.5) => {
    const { width, height } = this.scale;
    this.strips.forEach((strip, index) => {
      strip.setPosition(Phaser.Math.Between(-30, 30), Phaser.Math.Between(0, height)).setSize(width + 60, Phaser.Math.Between(1, 10)).setAlpha(intensity * (index % 3 === 0 ? 0.32 : 0.12));
      this.tweens.add({ targets: strip, x: Phaser.Math.Between(-80, 80), alpha: 0, duration: Phaser.Math.Between(80, 310) });
    });
    const error = crisp(this.add.text(width / 2 + Phaser.Math.Between(-40, 40), height / 2, intensity > 0.8 ? 'ERR_483: WITNESS STATE DIVERGED' : 'memory boundary unstable', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: intensity > 0.8 ? '19px' : '12px', color: '#ff735f', backgroundColor: '#071410' })).setOrigin(0.5).setDepth(1001);
    this.tweens.add({ targets: error, x: error.x + 16, alpha: 0, duration: 450, onComplete: () => error.destroy() });
  };
  shutdown() { this.game.events.off('glitch', this.glitch, this); }
}
