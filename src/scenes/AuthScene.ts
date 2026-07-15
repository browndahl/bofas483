import Phaser from 'phaser';
import { authService } from '../services/authService';
import { backendConfigured } from '../services/supabaseClient';
import { button, panel } from '../ui/hud';

export class AuthScene extends Phaser.Scene {
  constructor() { super('AuthScene'); }
  async create() {
    const { width, height } = this.scale; const cardWidth = Math.min(520, width - 24);
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.84).setInteractive(); panel(this, width / 2, height / 2, cardWidth, 440, 0.99);
    this.add.text(width / 2 - cardWidth / 2 + 28, height / 2 - 190, 'WITNESS IDENTITY', { fontFamily: 'monospace', fontSize: '15px', color: '#f7bd62', letterSpacing: 2 });
    const user = await authService.currentUser();
    this.add.text(width / 2 - cardWidth / 2 + 28, height / 2 - 155, !backendConfigured ? 'CLOUD OFFLINE / local saves remain active' : user?.is_anonymous ? 'GUEST SIGNAL / link without losing this habitat' : user ? `CONNECTED / ${user.email ?? 'OAUTH IDENTITY'}` : 'NO IDENTITY / guest play remains available', { fontFamily: 'monospace', fontSize: '10px', color: '#8eb4a2', wordWrap: { width: cardWidth - 56 } });
    const form = document.createElement('div'); form.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:min(420px,calc(100vw - 74px));';
    form.innerHTML = '<input data-field="name" maxlength="40" aria-label="Display name" placeholder="DISPLAY NAME"/><input data-field="email" type="email" aria-label="Email" placeholder="EMAIL"/><input data-field="password" type="password" minlength="8" aria-label="Password" placeholder="PASSWORD (8+ CHARACTERS)"/>';
    form.querySelectorAll('input').forEach((input) => (input as HTMLInputElement).style.cssText = 'width:100%;height:44px;background:#0c1e17;border:1px solid #315a49;color:#e9fff5;padding:0 13px;font:12px monospace;outline:none;border-radius:2px;');
    const dom = this.add.dom(width / 2, height / 2 - 42, form).setDepth(5);
    const status = this.add.text(width / 2, height / 2 + 72, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ff8fcf', align: 'center', wordWrap: { width: cardWidth - 50 } }).setOrigin(0.5);
    const value = (field: string) => (form.querySelector(`[data-field="${field}"]`) as HTMLInputElement).value;
    const run = async (operation: () => Promise<unknown>, success: string) => { try { status.setText('CONNECTING…'); await operation(); status.setColor('#7af6bd').setText(success); this.time.delayedCall(800, () => this.scene.stop()); } catch (error) { status.setColor('#ff735f').setText(error instanceof Error ? error.message : 'Identity request failed'); } };
    const account = button(this, width / 2 - 108, height / 2 + 122, 200, 42, user?.is_anonymous ? 'LINK GUEST → EMAIL' : 'CREATE EMAIL ID', 0x7af6bd);
    account.on('pointerup', () => run(() => user?.is_anonymous ? authService.linkGuest(value('email'), value('password')) : authService.signUp(value('email'), value('password'), value('name') || 'Unnamed Witness'), 'Identity connected. Habitat preserved.'));
    const login = button(this, width / 2 + 108, height / 2 + 122, 200, 42, 'SIGN IN', 0x65c7ff);
    login.on('pointerup', () => run(() => authService.signIn(value('email'), value('password')), 'Welcome back.'));
    const google = button(this, width / 2, height / 2 + 173, 200, 38, 'CONTINUE WITH GOOGLE', 0xbf78ff);
    google.on('pointerup', () => run(() => authService.signInGoogle(), 'Opening Google…'));
    const close = this.add.text(width / 2 + cardWidth / 2 - 24, height / 2 - 196, '×', { fontSize: '26px', color: '#8eb4a2' }).setOrigin(1, 0).setInteractive({ useHandCursor: true }); close.on('pointerup', () => this.scene.stop());
    if (!backendConfigured) { account.setAlpha(0.35).disableInteractive(); login.setAlpha(0.35).disableInteractive(); google.setAlpha(0.35).disableInteractive(); }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { dom.destroy(); form.remove(); });
  }
}
