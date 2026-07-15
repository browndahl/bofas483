/// <reference lib="webworker" />
import { tickWorld } from './simulation';
import type { WorldState } from './worldState';

let state: WorldState | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (event: MessageEvent<{ type: string; state?: WorldState }>) => {
  if (event.data.type === 'start' && event.data.state) {
    state = event.data.state;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!state) return;
      state = tickWorld(state, 0.2);
      self.postMessage({ type: 'state', state });
    }, 200);
  }
  if (event.data.type === 'replace' && event.data.state) state = event.data.state;
  if (event.data.type === 'stop' && timer) clearInterval(timer);
};

export {};
