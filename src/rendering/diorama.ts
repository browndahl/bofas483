import type { Vec2, WeatherKind } from '../simulation/worldState';

export const DIORAMA_DEPTH_BASE = 10;
export const DIORAMA_DEPTH_SPAN = 20;

export function dioramaDepth(y: number, offset = 0): number {
  const normalized = Math.max(0, Math.min(1, y / 1000));
  return DIORAMA_DEPTH_BASE + normalized * DIORAMA_DEPTH_SPAN + offset;
}

export function dioramaSunDirection(dayTime: number): Vec2 {
  const phase = (Math.max(0, Math.min(1, dayTime)) - 0.5) * Math.PI;
  return {
    x: Math.sin(phase) * 0.78,
    y: 0.46 + Math.cos(phase) * 0.18
  };
}

export function dioramaShadowOffset(dayTime: number, elevation: number): Vec2 {
  const direction = dioramaSunDirection(dayTime);
  const distance = Math.max(2, elevation * 0.32);
  return { x: direction.x * distance, y: direction.y * distance };
}

export function dioramaShadowAlpha(dayTime: number, weather: WeatherKind): number {
  const daylight = Math.max(0, Math.sin(Math.max(0, Math.min(1, dayTime)) * Math.PI));
  const weatherMultiplier = weather === 'storm' ? 0.48 : weather === 'rain' ? 0.62 : weather === 'mist' ? 0.55 : 1;
  return (0.24 + daylight * 0.28) * weatherMultiplier;
}

export function dioramaScaleAtY(y: number): number {
  return 0.94 + Math.max(0, Math.min(1, y / 1000)) * 0.1;
}
