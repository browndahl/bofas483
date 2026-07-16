import Phaser from 'phaser';
import * as Sentry from '@sentry/browser';
import { registerSW } from 'virtual:pwa-register';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { WorldScene } from './scenes/WorldScene';
import { UIScene } from './scenes/UIScene';
import { DialogueScene } from './scenes/DialogueScene';
import { ProfileScene } from './scenes/ProfileScene';
import { GlitchOverlayScene } from './scenes/GlitchOverlayScene';
import { AuthScene } from './scenes/AuthScene';
import { GuideScene } from './scenes/GuideScene';
import { AwaySummaryScene } from './scenes/AwaySummaryScene';
import { ColonyScene } from './scenes/ColonyScene';
import { RecoveryScene } from './scenes/RecoveryScene';
import { clearAuthRedirectError, parseAuthRedirectError } from './services/authRedirect';
import { gameStore } from './state/gameStateStore';
import { saveService } from './services/saveService';
import './style.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) Sentry.init({
  dsn: sentryDsn,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event) { delete event.user; delete event.request; return event; }
});

window.addEventListener('worker-error', (event) => Sentry.captureException(new Error((event as CustomEvent<string>).detail)));
window.addEventListener('unhandledrejection', (event) => Sentry.captureException(event.reason));
registerSW({ immediate: true });

const authRedirectNotice = parseAuthRedirectError(window.location.href);
if (authRedirectNotice) window.history.replaceState({}, document.title, clearAuthRedirectError(window.location.href));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#050b09',
  transparent: false,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
  fps: { target: 60, min: 30, smoothStep: true },
  input: { activePointers: 3 },
  dom: { createContainer: true },
  scene: [BootScene, PreloadScene, WorldScene, UIScene, DialogueScene, ProfileScene, GlitchOverlayScene, AuthScene, GuideScene, AwaySummaryScene, ColonyScene, RecoveryScene]
});
if (authRedirectNotice) game.registry.set('auth-redirect-notice', authRedirectNotice.message);

const restored = saveService.loadLocalWithProgress();
if (restored?.version === 1) gameStore.set(restored);
const offlineSummary = saveService.consumeOfflineSummary();
if (offlineSummary) game.registry.set('offline-summary', offlineSummary);
gameStore.start();

const autosave = window.setInterval(() => saveService.saveLocal(gameStore.get()), 15_000);
window.addEventListener('pagehide', (event) => {
  saveService.saveLocal(gameStore.get());
  if (!event.persisted) { window.clearInterval(autosave); gameStore.stop(); }
});

if (import.meta.env.DEV) {
  (window as Window & { game?: Phaser.Game; gameStore?: typeof gameStore }).game = game;
  (window as Window & { game?: Phaser.Game; gameStore?: typeof gameStore }).gameStore = gameStore;
}
