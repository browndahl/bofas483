import Phaser from 'phaser';
import { BUILDINGS } from '../simulation/building';
import type { BuildingKind } from '../simulation/worldState';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

const PAGES = [
  {
    title: 'START HERE',
    body: 'YOUR PURPOSE\nKeep the Luma alive while their colony grows. Their needs fall continuously—even while you are watching other screens in the game.\n\nLIVING INDIVIDUALS\nEvery Luma inherits a persistent personality. WARM Luma comfort distress, SOCIAL Luma seek company, CURIOUS Luma explore, STEADY Luma work diligently, and BRAVE Luma withstand pressure. Shared time forms lasting bonds.\n\nTHE CORE LOOP\n1. Select a Luma to inspect its needs and personality.\n2. Use FEED, WASH, and PLAY for immediate care.\n3. Build facilities so the colony can care for itself.\n4. Keep needs high to enable division and grow the population.\n5. Your choices shape the hidden humanity audit.\n\nRESOURCES\nGLOW pays for construction. ALLOY unlocks advanced automation. The Deep Taker produces both, but pollutes.'
  },
  {
    title: 'LUMA NEEDS',
    body: 'NOURISHMENT / hunger\nLow values send a Luma to a Dew Loom. Critical hunger damages health.\n\nCLARITY / hygiene\nRestored at a Mist Basin. Very low clarity contributes to health loss.\n\nRESONANCE / happiness\nRestored at a Chime Grove. Industry also reduces it while a Luma works.\n\nINTEGRITY / health\nWhen this reaches zero, the Luma becomes silent permanently. Clinics restore it and remove pollution exposure.\n\nCHARGE / energy\nRestored at a Warm Archive. Division also consumes charge.\n\nDIVISION\nA mature Luma divides only when every need is healthy: nourishment 72+, clarity 65+, resonance 72+, integrity 80+, and charge 55+.'
  },
  {
    title: 'BUILDINGS',
    body: (Object.keys(BUILDINGS) as BuildingKind[]).map((kind) => {
      const item = BUILDINGS[kind];
      const risk = item.pollution > 0 ? `  POLLUTION ${item.pollution}/sec` : '  CLEAN';
      return `${item.glyph}  ${item.name.toUpperCase()}  ·  POP ${item.unlockPopulation}\n${item.description} ${item.effect}\nCOST ${item.cost.glow} GLOW / ${item.cost.alloy} ALLOY${risk}`;
    }).join('\n\n')
  },
  {
    title: 'CONTROLS & SIGNALS',
    body: 'SELECT\nClick or tap a Luma to make it the active care target. Its ring and name brighten. Thought bubbles explain current intent. Pink links show friendship; green links show comfort.\n\nMOVE THE HABITAT\nDrag empty ground to pan. Use the mouse wheel or pinch with two fingers to zoom. Luma choose open meeting ground and route around structures, water, stone, and each other. Blocked plans time out and recover automatically.\n\nPRIORITIES\nFood, hygiene, sleep, and medical emergencies interrupt social plans. Luma return to friends after their urgent needs are safe.\n\nBUILD\nChoose a facility, then click or tap a valid location. Red means blocked. Structures need clear ground and spacing. Press Escape or right-click to cancel.\n\nSTATUS SIGNALS\n! hungry   ≋ dirty   z tired   · unhappy   ☣ sick   ♡ social   + comforting\nSILENT means the Luma has died and cannot be restored.\n\nSAVE\nLocal progress saves automatically every 15 seconds. SAVE also attempts a cloud save when identity services are connected.'
  }
] as const;

export class GuideScene extends Phaser.Scene {
  private page = 0;
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private tabs: Phaser.GameObjects.Container[] = [];

  constructor() { super('GuideScene'); }

  create() {
    this.buildLayout();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private buildLayout() {
    this.children.removeAll(true);
    this.tabs = [];
    const { width, height } = this.scale;
    const cardWidth = Math.min(760, width - 24);
    const cardHeight = Math.min(680, height - 24);
    const left = width / 2 - cardWidth / 2;
    const top = height / 2 - cardHeight / 2;
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.86).setInteractive();
    panel(this, width / 2, height / 2, cardWidth, cardHeight, 0.99);
    crisp(this.add.text(left + 26, top + 22, 'HABITAT FIELD GUIDE', { fontFamily: DISPLAY_FONT, fontSize: width < 500 ? '16px' : '19px', color: '#91ffd0', letterSpacing: 1.5 }));
    const close = crisp(this.add.text(left + cardWidth - 22, top + 13, '×', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '30px', color: '#a8cdbb' })).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.scene.stop());
    this.titleText = crisp(this.add.text(left + 26, top + 65, '', { fontFamily: DISPLAY_FONT, fontSize: '14px', color: '#f7bd62', letterSpacing: 1.2 }));
    this.bodyText = crisp(this.add.text(left + 26, top + 94, '', { fontFamily: UI_FONT, fontSize: width < 500 ? '12px' : '13px', color: '#e4f7ed', lineSpacing: width < 500 ? 3 : 5, wordWrap: { width: cardWidth - 52 } }));
    const labels = ['START', 'NEEDS', 'BUILD', 'CONTROLS'];
    const gap = 8; const tabWidth = (cardWidth - 52 - gap * 3) / 4;
    labels.forEach((label, index) => {
      const tab = button(this, left + 26 + tabWidth / 2 + index * (tabWidth + gap), top + cardHeight - 30, tabWidth, 38, label, index === 0 ? 0xf7bd62 : 0x7af6bd);
      tab.on('pointerup', () => this.showPage(index)); this.tabs.push(tab);
    });
    this.showPage(this.page);
  }

  private handleResize = () => this.buildLayout();

  private shutdown() { this.scale.off('resize', this.handleResize, this); }

  private showPage(index: number) {
    this.page = index;
    this.titleText.setText(PAGES[index].title);
    this.bodyText.setText(PAGES[index].body);
    this.tabs.forEach((tab, tabIndex) => tab.setAlpha(tabIndex === this.page ? 1 : 0.62));
  }
}
