import Phaser from 'phaser';
import { button, panel } from './hud';

export function createDialogueChoice(scene: Phaser.Scene, x: number, y: number, width: number, label: string, onChoose: () => void) {
  const choice = button(scene, x, y, width, 48, label, 0x7af6bd);
  choice.on('pointerup', onChoose);
  return choice;
}

export function createDialogueBackdrop(scene: Phaser.Scene, width: number, height: number) {
  const shade = scene.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.76).setInteractive();
  const card = panel(scene, width / 2, height / 2, Math.min(700, width - 32), Math.min(430, height - 48), 0.98);
  return { shade, card };
}
