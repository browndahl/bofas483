import Phaser from 'phaser';
import { authService } from '../services/authService';
import { saveService } from '../services/saveService';
import { backendConfigured } from '../services/supabaseClient';
import { gameStore } from '../state/gameStateStore';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

export class AuthScene extends Phaser.Scene {
  private notice = '';
  constructor() { super('AuthScene'); }
  init(data?: { notice?: string }) { this.notice = data?.notice ?? ''; }
  async create() {
    const { width, height } = this.scale; const cardWidth = Math.min(520, width - 24);
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.84).setInteractive(); panel(this, width / 2, height / 2, cardWidth, 500, 0.99);
    crisp(this.add.text(width / 2 - cardWidth / 2 + 28, height / 2 - 220, 'WITNESS IDENTITY', { fontFamily: DISPLAY_FONT, fontSize: '16px', color: '#f7bd62', letterSpacing: 1.2 }));
    let user: Awaited<ReturnType<typeof authService.currentUser>> = null;
    let identityError = false;
    try { user = await authService.currentUser(); } catch { identityError = true; }
    const identityLabel = !backendConfigured ? 'CLOUD OFFLINE / local saves remain active' : identityError ? 'IDENTITY SERVICE UNREACHABLE / local saves remain active' : user?.is_anonymous ? 'GUEST SIGNAL / link without losing this habitat' : user ? `CONNECTED / ${user.email ?? 'OAUTH IDENTITY'}` : 'NO IDENTITY / guest play remains available';
    crisp(this.add.text(width / 2 - cardWidth / 2 + 28, height / 2 - 185, identityLabel, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#a8cdbb', wordWrap: { width: cardWidth - 56 } }));
    const form = document.createElement('div'); form.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:min(420px,calc(100vw - 74px));';
    form.innerHTML = '<input data-field="name" maxlength="40" aria-label="Display name" placeholder="DISPLAY NAME"/><input data-field="email" type="email" aria-label="Email" placeholder="EMAIL"/><input data-field="password" type="password" minlength="8" aria-label="Password" placeholder="PASSWORD (8+ CHARACTERS)"/>';
    form.querySelectorAll('input').forEach((input) => (input as HTMLInputElement).style.cssText = 'width:100%;height:44px;background:#0c1e17;border:1px solid #4b8f6f;color:#f1fff8;padding:0 13px;font:600 13px Arial,sans-serif;letter-spacing:.02em;outline:none;border-radius:2px;');
    const dom = this.add.dom(width / 2, height / 2 - 68, form).setDepth(5);
    const status = crisp(this.add.text(width / 2, height / 2 + 42, this.notice, { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '12px', color: '#ff8fcf', align: 'center', wordWrap: { width: cardWidth - 50 }, fixedWidth: cardWidth - 50, fixedHeight: 54, maxLines: 3 })).setOrigin(0.5);
    const value = (field: string) => (form.querySelector(`[data-field="${field}"]`) as HTMLInputElement).value;
    const requireEmail = () => {
      const email = value('email').trim();
      if (!email) throw new Error('Enter your email address first.');
      return email;
    };
    const fail = (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Identity request failed';
      status.setColor('#ff735f').setText(message.toLowerCase().includes('email not confirmed') ? 'Email not confirmed. Request a fresh confirmation below, then open the newest email.' : message);
    };
    const account = button(this, width / 2 - 108, height / 2 + 100, 200, 42, user?.is_anonymous ? 'LINK GUEST → EMAIL' : 'CREATE EMAIL ID', 0x7af6bd);
    account.on('pointerup', async () => {
      try {
        status.setColor('#a8cdbb').setText('CONNECTING…');
        const result = user?.is_anonymous
          ? await authService.linkGuest(requireEmail(), value('password'))
          : await authService.signUp(requireEmail(), value('password'), value('name') || 'Unnamed Witness');
        if (result.confirmationRequired) status.setColor('#7af6bd').setText('Confirmation sent. Open the newest email to finish linking this habitat.');
        else { status.setColor('#7af6bd').setText('Identity connected. Habitat preserved.'); this.time.delayedCall(800, () => this.scene.stop()); }
      } catch (error) { fail(error); }
    });
    const login = button(this, width / 2 + 108, height / 2 + 100, 200, 42, 'SIGN IN', 0x65c7ff);
    login.on('pointerup', async () => {
      try {
        status.setColor('#a8cdbb').setText('CONNECTING…');
        await authService.signIn(requireEmail(), value('password'));
        const cloudState = await saveService.loadCloud();
        if (cloudState) gameStore.set(cloudState);
        status.setColor('#7af6bd').setText('Welcome back. Habitat restored.');
        this.time.delayedCall(800, () => this.scene.stop());
      } catch (error) { fail(error); }
    });
    const resend = button(this, width / 2, height / 2 + 153, 250, 36, 'RESEND CONFIRMATION EMAIL', 0xf7bd62);
    resend.on('pointerup', async () => {
      try {
        status.setColor('#a8cdbb').setText('SENDING A FRESH LINK…');
        await authService.resendConfirmation(requireEmail());
        status.setColor('#7af6bd').setText('Fresh confirmation sent. Use only the newest email; older links expire.');
      } catch (error) { fail(error); }
    });
    const google = button(this, width / 2, height / 2 + 202, 200, 38, 'CONTINUE WITH GOOGLE', 0xbf78ff);
    google.on('pointerup', async () => {
      try { status.setColor('#a8cdbb').setText('OPENING GOOGLE…'); await authService.signInGoogle(); }
      catch (error) { fail(error); }
    });
    const close = crisp(this.add.text(width / 2 + cardWidth / 2 - 24, height / 2 - 226, '×', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '28px', color: '#a8cdbb' })).setOrigin(1, 0).setInteractive({ useHandCursor: true }); close.on('pointerup', () => this.scene.stop());
    if (!backendConfigured) {
      [account, login, resend, google].forEach((control) => control.setAlpha(0.35).disableInteractive());
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { dom.destroy(); form.remove(); });
  }
}
