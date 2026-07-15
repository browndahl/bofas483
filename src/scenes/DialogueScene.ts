import Phaser from 'phaser';
import dialogue from '../data/dialogue.json';
import { gameStore } from '../state/gameStateStore';
import { createDialogueBackdrop, createDialogueChoice } from '../ui/dialoguePanel';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

interface DialogueChoice { label: string; effects: Record<string, number>; ending?: string }
interface DialogueEntry { id: string; speaker: string; text: string; choices: DialogueChoice[] }

export class DialogueScene extends Phaser.Scene {
  private entry?: DialogueEntry;
  constructor() { super('DialogueScene'); }
  init(data: { id: string }) { this.entry = dialogue.find((item) => item.id === data.id) as DialogueEntry | undefined; }
  create() {
    if (!this.entry) { this.scene.stop(); return; }
    const { width, height } = this.scale; createDialogueBackdrop(this, width, height);
    const cardWidth = Math.min(700, width - 32);
    crisp(this.add.text(width / 2 - cardWidth / 2 + 34, height / 2 - 175, this.entry.speaker, { fontFamily: DISPLAY_FONT, fontSize: '13px', color: '#91ffd0', letterSpacing: 1.2 }));
    crisp(this.add.text(width / 2 - cardWidth / 2 + 34, height / 2 - 123, this.entry.text, { fontFamily: UI_FONT, fontSize: width < 500 ? '17px' : '20px', color: '#f1fff8', lineSpacing: 9, wordWrap: { width: cardWidth - 68 } }));
    this.entry.choices.forEach((choice, index) => {
      createDialogueChoice(this, width / 2, height / 2 + 82 + index * 60, cardWidth - 68, choice.label, () => {
        if (!this.entry) return;
        gameStore.applyChoice(this.entry.id, choice.effects, choice.ending);
        this.game.events.emit('glitch', choice.ending ? 1 : 0.28);
        this.scene.stop();
        if (choice.ending) this.scene.launch('ProfileScene', { final: true });
      });
    });
  }
}
