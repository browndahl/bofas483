import Phaser from 'phaser';

export const UI_FONT = 'Arial, "Helvetica Neue", sans-serif';
export const DISPLAY_FONT = '"Arial Black", Arial, sans-serif';
export const CODE_FONT = '"SFMono-Regular", Menlo, Consolas, monospace';

export function crisp<T extends Phaser.GameObjects.Text>(text: T): T {
  return text.setResolution(Math.min(3, Math.max(2, window.devicePixelRatio || 1)));
}
