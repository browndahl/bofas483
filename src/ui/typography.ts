import Phaser from 'phaser';

export const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
export const DISPLAY_FONT = '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif';
export const CODE_FONT = '"SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace';

export function crisp<T extends Phaser.GameObjects.Text>(text: T): T {
  return text.setResolution(Math.min(4, Math.max(2.5, (window.devicePixelRatio || 1) * 1.5)));
}

export function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, Math.max(1, maxLength - 1));
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > maxLength * 0.62 ? boundary : clipped.length).trimEnd()}…`;
}

export function fittedButtonFontSize(label: string, width: number, max = 13, min = 8) {
  const longestLine = label.split('\n').reduce((longest, line) => Math.max(longest, line.length), 1);
  return Math.max(min, Math.min(max, Math.floor((width - 16) * 1.62 / longestLine)));
}
