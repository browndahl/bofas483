import Phaser from 'phaser';
import { saveService } from '../services/saveService';
import { gameStore } from '../state/gameStateStore';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

export class RecoveryScene extends Phaser.Scene {
  private confirmingReset = false;

  constructor() { super('RecoveryScene'); }

  create() {
    this.buildLayout();
    this.scale.on('resize', this.buildLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.buildLayout, this));
  }

  private buildLayout = () => {
    this.children.removeAll(true);
    const { width, height } = this.scale;
    const cardWidth = Math.min(650, width - 24);
    const cardHeight = Math.min(560, height - 24);
    const compact = width < 520;
    this.add.rectangle(width / 2, height / 2, width, height, 0x010403, 0.94).setInteractive().setDepth(400);
    panel(this, width / 2, height / 2, cardWidth, cardHeight, 0.998).setDepth(401);
    crisp(this.add.text(width / 2, height / 2 - cardHeight / 2 + 42, 'THE HABITAT IS SILENT', {
      fontFamily: DISPLAY_FONT, fontSize: compact ? '18px' : '24px', color: '#ff9b89', letterSpacing: 1.3
    })).setOrigin(0.5).setDepth(402);
    crisp(this.add.text(width / 2, height / 2 - cardHeight / 2 + 86,
      'This colony is not a dead end. Choose how its story continues.', {
        fontFamily: UI_FONT, fontStyle: 'bold', fontSize: compact ? '11px' : '13px', color: '#dff5ea',
        align: 'center', wordWrap: { width: cardWidth - 50 }
      })).setOrigin(0.5).setDepth(402);

    const optionWidth = cardWidth - 54;
    const recoveryY = height / 2 - 82;
    this.add.rectangle(width / 2, recoveryY, optionWidth, 116, 0x0d2c20, 0.96).setStrokeStyle(2, 0x7af6bd, 0.7).setDepth(402);
    crisp(this.add.text(width / 2, recoveryY - 37, 'RECOVERY SIGNAL  ·  CONTINUE THIS COLONY', {
      fontFamily: DISPLAY_FONT, fontSize: compact ? '9px' : '13px', color: '#91ffd0', letterSpacing: compact ? 0.25 : 0.7
    })).setOrigin(0.5).setDepth(403);
    crisp(this.add.text(width / 2, recoveryY - 10,
      'One Luma returns with emergency stores. Buildings, research, relationships, and history remain.', {
        fontFamily: UI_FONT, fontSize: compact ? '9px' : '11px', color: '#b9dccc', align: 'center', wordWrap: { width: optionWidth - 32 }
      })).setOrigin(0.5).setDepth(403);
    const recover = button(this, width / 2, recoveryY + 35, Math.min(280, optionWidth - 30), 38, 'SEND RECOVERY SIGNAL', 0x7af6bd).setDepth(404);
    recover.on('pointerup', () => this.recover());

    const backup = saveService.loadBackup();
    const restoreY = height / 2 + 46;
    const restore = button(this, width / 2, restoreY, Math.min(280, optionWidth - 30), 38, backup ? 'RESTORE LAST BACKUP' : 'NO BACKUP AVAILABLE', 0x65c7ff).setDepth(404);
    if (backup) restore.on('pointerup', () => this.restoreBackup());
    else restore.setAlpha(0.42).disableInteractive();
    crisp(this.add.text(width / 2, restoreY + 31, 'Loads the automatic copy from before the most recent save.', {
      fontFamily: UI_FONT, fontSize: compact ? '8px' : '10px', color: '#8eb4a2', align: 'center'
    })).setOrigin(0.5).setDepth(403);

    const reset = button(this, width / 2, height / 2 + cardHeight / 2 - 66, Math.min(280, optionWidth - 30), 38,
      this.confirmingReset ? 'CONFIRM NEW COLONY' : 'BEGIN A NEW COLONY', 0xff735f).setDepth(404);
    reset.on('pointerup', () => this.newColony());
    crisp(this.add.text(width / 2, height / 2 + cardHeight / 2 - 30, 'A new colony starts fresh. Your previous state is kept as a recovery backup.', {
      fontFamily: UI_FONT, fontSize: compact ? '8px' : '9px', color: '#b89187', align: 'center', wordWrap: { width: cardWidth - 50 }
    })).setOrigin(0.5).setDepth(403);
  };

  private recover() {
    const creatureId = gameStore.recoverColony();
    if (!creatureId) { this.scene.stop(); return; }
    saveService.saveLocal(gameStore.get());
    this.scene.stop();
    this.game.events.emit('focus-creature', creatureId);
    this.game.events.emit('toast', 'Recovery signal answered · colony history preserved');
    this.game.events.emit('glitch', 0.45);
  }

  private restoreBackup() {
    const backup = saveService.loadBackup();
    if (!backup) return;
    gameStore.set(backup);
    saveService.saveLocal(backup);
    this.scene.stop();
    this.game.events.emit('toast', 'Last recovery backup restored');
  }

  private newColony() {
    if (!this.confirmingReset) {
      this.confirmingReset = true;
      this.buildLayout();
      this.time.delayedCall(4500, () => { this.confirmingReset = false; if (this.scene.isActive()) this.buildLayout(); });
      return;
    }
    gameStore.reset();
    saveService.saveLocal(gameStore.get());
    this.scene.stop();
    this.game.events.emit('toast', 'A new signal enters the habitat');
    this.game.events.emit('open-dialogue', 'awakening');
  }
}
