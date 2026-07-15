/// <reference lib="webworker" />
import { tickWorld } from './simulation';
import type { WorldState } from './worldState';

let state: WorldState | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let lastTick = performance.now();

self.onmessage = (event: MessageEvent<{ type: string; state?: WorldState }>) => {
  if (event.data.type === 'start' && event.data.state) {
    state = event.data.state;
    lastTick = performance.now();
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!state) return;
      const now = performance.now();
      const seconds = Math.max(0.01, Math.min(1, (now - lastTick) / 1000));
      lastTick = now;
      state = tickWorld(state, seconds);
      self.postMessage({ type: 'state', state });
    }, 200);
  }
  if (event.data.type === 'replace' && event.data.state) { state = event.data.state; lastTick = performance.now(); }
  if (event.data.type === 'stop' && timer) { clearInterval(timer); timer = undefined; }
};

export {};
