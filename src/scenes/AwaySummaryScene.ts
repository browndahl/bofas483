import Phaser from 'phaser';
import type { OfflineSummary } from '../simulation/offlineProgress';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

function durationLabel(seconds: number) {
  if (seconds < 60) return `${Math.floor(seconds)} SECONDS`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} MINUTES`;
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours}H ${minutes}M`;
}

function signed(value: number) { return `${value >= 0 ? '+' : ''}${Math.round(value)}`; }

export class AwaySummaryScene extends Phaser.Scene {
  private summary?: OfflineSummary;
  constructor() { super('AwaySummaryScene'); }
  init(data: OfflineSummary) { this.summary = data; }
  create() {
    if (!this.summary) { this.scene.stop(); return; }
    this.buildLayout();
    this.scale.on('resize', this.buildLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.buildLayout, this));
  }
  private buildLayout = () => {
    if (!this.summary) return;
    this.children.removeAll(true);
    const { width, height } = this.scale;
    const cardWidth = Math.min(560, width - 24); const cardHeight = Math.min(500, height - 24);
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.88).setInteractive().setDepth(300);
    panel(this, width / 2, height / 2, cardWidth, cardHeight, 0.995).setDepth(301);
    crisp(this.add.text(width / 2, height / 2 - cardHeight / 2 + 30, 'WHILE YOU WERE AWAY', { fontFamily: DISPLAY_FONT, fontSize: width < 500 ? '17px' : '21px', color: '#fff0a8', letterSpacing: 1.4 })).setOrigin(0.5).setDepth(302);
    crisp(this.add.text(width / 2, height / 2 - cardHeight / 2 + 66, `The habitat carried on for ${durationLabel(this.summary.simulatedSeconds)}.`, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#a8cdbb', align: 'center', wordWrap: { width: cardWidth - 48 } })).setOrigin(0.5).setDepth(302);
    const rows = [
      ['GLOW GATHERED', signed(this.summary.glowDelta), 0xf7bd62],
      ['ALLOY GATHERED', signed(this.summary.alloyDelta), 0x65c7ff],
      ['NEW LUMA', `+${this.summary.births}`, 0x7af6bd],
      ['NEW CLOSE BONDS', `+${this.summary.strongerBonds}`, 0xff8fcf]
    ] as const;
    rows.forEach(([label, value, color], index) => {
      const y = height / 2 - 88 + index * 54;
      this.add.rectangle(width / 2, y, cardWidth - 50, 42, 0x0d241b, 0.96).setStrokeStyle(1, color, 0.35).setDepth(302);
      crisp(this.add.text(width / 2 - cardWidth / 2 + 42, y, label, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '11px', color: '#dbeee5' })).setOrigin(0, 0.5).setDepth(303);
      crisp(this.add.text(width / 2 + cardWidth / 2 - 42, y, value, { fontFamily: DISPLAY_FONT, fontSize: '15px', color: Phaser.Display.Color.IntegerToColor(color).rgba })).setOrigin(1, 0.5).setDepth(303);
    });
    const safety = this.summary.livingAtStart === 0
      ? 'The habitat was already silent when this interval began.'
      : this.summary.protectedLuma > 0
        ? `${this.summary.protectedLuma} exhausted Luma protected from permanent offline silence.`
        : `All ${this.summary.livingAtEnd} living Luma remained stable during offline simulation.`;
    crisp(this.add.text(width / 2, height / 2 + cardHeight / 2 - 86, safety, { fontFamily: UI_FONT, fontSize: '10px', color: '#8eb4a2', align: 'center', wordWrap: { width: cardWidth - 52 } })).setOrigin(0.5).setDepth(303);
    if (this.summary.importantEvents.length) crisp(this.add.text(width / 2, height / 2 + cardHeight / 2 - 112, this.summary.importantEvents.join('  ·  '), { fontFamily: UI_FONT, fontSize: '9px', color: '#f7bd62', align: 'center', wordWrap: { width: cardWidth - 54 } })).setOrigin(0.5).setDepth(303);
    const needsRecovery = this.summary.livingAtEnd === 0;
    const resume = button(this, width / 2, height / 2 + cardHeight / 2 - 38, Math.min(260, cardWidth - 60), 42, needsRecovery ? 'OPEN RECOVERY OPTIONS' : 'RETURN TO HABITAT', needsRecovery ? 0xff8fcf : 0x7af6bd).setDepth(304);
    resume.on('pointerup', () => { this.scene.stop(); if (needsRecovery && !this.scene.isActive('RecoveryScene')) this.scene.launch('RecoveryScene'); });
  };
}
