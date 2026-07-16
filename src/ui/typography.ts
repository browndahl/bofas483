import Phaser from 'phaser';

export const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
export const DISPLAY_FONT = '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif';
export const CODE_FONT = '"SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';

export function crisp<T extends Phaser.GameObjects.Text>(text: T): T {
  return text.setResolution(Math.min(4, Math.max(2.5, (window.devicePixelRatio || 1) * 1.5)));
}
