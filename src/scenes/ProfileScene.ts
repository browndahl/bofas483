import Phaser from 'phaser';
import { gameStore } from '../state/gameStateStore';
import { saveService } from '../services/saveService';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

export class ProfileScene extends Phaser.Scene {
  private final = false;
  constructor() { super('ProfileScene'); }
  init(data: { final?: boolean }) { this.final = Boolean(data.final); }
  create() {
    const { width, height } = this.scale; const state = gameStore.get(); const cardWidth = Math.min(720, width - 28); const cardHeight = Math.min(620, height - 32);
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.82).setInteractive(); panel(this, width / 2, height / 2, cardWidth, cardHeight, 0.98);
    crisp(this.add.text(width / 2 - cardWidth / 2 + 30, height / 2 - cardHeight / 2 + 28, this.final ? 'FINAL HUMANITY MODEL' : `PARTIAL AUDIT / CHAPTER 0${state.chapter}`, { fontFamily: DISPLAY_FONT, fontSize: '16px', color: '#d69aff', letterSpacing: 1.2 }));
    const traits = Object.entries(state.profile); const max = Math.max(3, ...traits.map(([, value]) => Math.abs(value)));
    traits.forEach(([trait, value], index) => {
      const y = height / 2 - cardHeight / 2 + 84 + index * 42; const barWidth = cardWidth - 230;
      crisp(this.add.text(width / 2 - cardWidth / 2 + 30, y, trait.toUpperCase(), { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#a8cdbb' }));
      this.add.rectangle(width / 2 - cardWidth / 2 + 152, y + 6, barWidth, 8, 0x173026).setOrigin(0, 0.5);
      this.add.rectangle(width / 2 - cardWidth / 2 + 152, y + 6, Math.max(2, barWidth * Math.max(0, value) / max), 8, value >= 0 ? 0x7af6bd : 0xff735f).setOrigin(0, 0.5);
      crisp(this.add.text(width / 2 + cardWidth / 2 - 36, y - 2, value.toFixed(1), { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#f1fff8' })).setOrigin(1, 0);
    });
    const dominant = traits.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'uncertain';
    const verdict = state.endingId === 'release' ? 'They leave carrying a complicated tenderness for their maker.' : state.endingId === 'custody' ? 'They remain safe, and learn that safety can be a beautiful cage.' : `Current inference: your strongest visible pressure is ${dominant}. Portions remain intentionally obscured.`;
    crisp(this.add.text(width / 2, height / 2 + cardHeight / 2 - 92, verdict, { fontFamily: UI_FONT, fontSize: '13px', color: '#e4f7ed', align: 'center', lineSpacing: 4, wordWrap: { width: cardWidth - 70 } })).setOrigin(0.5);
    const close = button(this, width / 2 + 66, height / 2 + cardHeight / 2 - 38, 160, 38, this.final ? 'RETURN' : 'CONTINUE', 0xbf78ff);
    close.on('pointerup', () => this.scene.stop());
    const reset = button(this, width / 2 - cardWidth / 2 + 74, height / 2 + cardHeight / 2 - 38, 118, 38, 'NEW HABITAT', 0xff735f);
    let confirming = false;
    reset.on('pointerup', () => {
      const label = reset.getByName('button-label') as Phaser.GameObjects.Text;
      if (!confirming) { confirming = true; label.setText('CONFIRM RESET'); this.time.delayedCall(4000, () => { confirming = false; label.setText('NEW HABITAT'); }); return; }
      gameStore.reset(); saveService.saveLocal(gameStore.get()); this.game.events.emit('toast', 'A new signal enters the habitat'); this.scene.stop();
    });
  }
}
