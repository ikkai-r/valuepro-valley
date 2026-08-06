import Phaser from 'phaser';
import { JOBS, MAX_HEARTS, NPCS, QUESTS } from '@shared/index';
import { getRoom, getSessionId, sendInput } from '../net';
import { GIFT_ITEMS } from './TownScene';
import { px, pxTitle } from '../ui/font';

const STATUS_PANEL = { w: 276, h: 166 };
const SLOT_IDLE_FILL = 0xffd783;
const SLOT_IDLE_STROKE = 0xa85b33;
const SLOT_ACTIVE_FILL = 0xfff3c9;
const SLOT_ACTIVE_STROKE = 0x4e8d43;

const GIFT_LABELS: Record<string, string> = {
  coffee: 'COFFEE',
  turnip: 'TURNIP',
  coffee_bean: 'BEANS',
  sticky_note_flower: 'FLOWER',
};

export class UIScene extends Phaser.Scene {
  private statusPanel!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private inventoryBar!: Phaser.GameObjects.Container;
  private inventorySlots: Phaser.GameObjects.Text[] = [];
  private inventorySlotBgs: Phaser.GameObjects.Rectangle[] = [];
  private noticePanel!: Phaser.GameObjects.Container;
  private noticeTitle!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private noticeTimer?: Phaser.Time.TimerEvent;
  private lastAnnouncement = '';
  private panel!: Phaser.GameObjects.Container;
  private panelBg!: Phaser.GameObjects.Rectangle;
  private panelInner!: Phaser.GameObjects.Rectangle;
  private panelText!: Phaser.GameObjects.Text;
  private jobBoardObjects: Phaser.GameObjects.GameObject[] = [];
  private selectedJobIndex = 0;
  private panelMode: 'none' | 'jobs' | 'quests' | 'hearts' = 'none';
  private tool = 'sword';
  private giftItem = 'coffee';
  private festivalOverlay?: Phaser.GameObjects.Container;
  private sleepOverlay?: Phaser.GameObjects.Container;
  private sleepOverlayBg?: Phaser.GameObjects.Rectangle;
  private sleepTitle?: Phaser.GameObjects.Text;
  private sleepBody?: Phaser.GameObjects.Text;
  private sleepStartedAt = 0;

  constructor() {
    super('UI');
  }

  create() {
    this.createStatusPanel();
    this.createInventoryBar();
    this.createNoticePanel();

    this.panelBg = this.add.rectangle(0, 0, 460, 350, 0xf1bd70, 0.98)
      .setStrokeStyle(7, 0x713b26);
    this.panelInner = this.add.rectangle(0, 0, 442, 332).setStrokeStyle(2, 0xffdf92);
    this.panelText = this.add.text(
      -205,
      -152,
      '',
      px(13, '#5d3022', { wordWrap: { width: 410 }, lineSpacing: 4 }),
    );
    this.panel = this.add
      .container(this.scale.width / 2, this.scale.height / 2, [this.panelBg, this.panelInner, this.panelText])
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false);

    this.input.keyboard!.on('keydown-J', () => this.togglePanel('jobs'));
    this.input.keyboard!.on('keydown-Q', () => this.togglePanel('quests'));
    this.input.keyboard!.on('keydown-C', () => this.togglePanel('hearts'));
    this.input.keyboard!.on('keydown-ESC', () => {
      this.panelMode = 'none';
      this.panel.setVisible(false);
      this.clearJobBoard();
    });

    // number keys 1-3 accept jobs when panel open
    this.input.keyboard!.on('keydown-ONE', () => this.acceptJobIndex(0));
    this.input.keyboard!.on('keydown-TWO', () => {
      if (this.panelMode === 'jobs') this.acceptJobIndex(1);
    });
    this.input.keyboard!.on('keydown-THREE', () => {
      if (this.panelMode === 'jobs') this.acceptJobIndex(2);
    });
    this.input.keyboard!.on('keydown-FOUR', () => {
      if (this.panelMode === 'jobs') this.acceptJobIndex(3);
    });

    this.game.events.on('hud', (data: { tool?: string; giftItem?: string }) => {
      if (data.tool) this.tool = data.tool;
      if (data.giftItem) this.giftItem = data.giftItem;
      this.refreshHud();
    });
    this.game.events.on('state', () => {
      this.refreshHud();
      if (this.panelMode !== 'none' && this.panelMode !== 'jobs') this.renderPanel();
    });
    this.game.events.on('festival', () => this.showFestival());

    const room = getRoom();
    room?.onMessage('dialogue', (data: { name: string; text: string; hearts: number }) => {
      this.showNotice(data.name, `${data.text}\n♥ Friendship: ${data.hearts}/${MAX_HEARTS}`, 6500);
    });
    room?.onMessage('notification', (data: { title: string; text: string }) => {
      this.showNotice(data.title, data.text, 5000);
    });
    room?.onMessage('openJobs', () => this.openPanel('jobs'));
    room?.onMessage('sleepStarted', (data: { day: number }) => this.showSleepTransition(data.day));
    room?.onMessage('dayAdvanced', (data: { day: number }) => this.finishSleepTransition(data.day));

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.statusPanel.setPosition(
        size.width - STATUS_PANEL.w / 2 - 24,
        STATUS_PANEL.h / 2 + 22,
      );
      this.inventoryBar.setPosition(size.width / 2, size.height - 62);
      this.noticePanel.setPosition(size.width / 2, size.height - 184);
      this.panel.setPosition(size.width / 2, size.height / 2);
      this.sleepOverlay?.setPosition(size.width / 2, size.height / 2);
      this.sleepOverlayBg?.setSize(size.width, size.height);
    });

    this.refreshHud();
  }

  private createStatusPanel() {
    const w = STATUS_PANEL.w;
    const h = STATUS_PANEL.h;
    const shadow = this.add.rectangle(6, 8, w, h, 0x3c1d18);
    const bg = this.add.rectangle(0, 0, w, h, 0xefb45f).setStrokeStyle(6, 0x713b26);
    const parchment = this.add
      .rectangle(0, 12, w - 24, h - 46, 0xffe7b5)
      .setStrokeStyle(2, 0xd58a48);
    const ribbon = this.add
      .rectangle(0, -h / 2 + 20, w - 44, 34, 0x4e8d43)
      .setStrokeStyle(3, 0x285c36);
    this.dayText = this.add.text(0, -h / 2 + 20, '', pxTitle(11, '#fff8d5')).setOrigin(0.5);
    this.statusText = this.add.text(-w / 2 + 22, -h / 2 + 48, '', px(19, '#5d3022', {
      lineSpacing: 6,
    }));
    this.statusPanel = this.add
      .container(this.scale.width - w / 2 - 24, h / 2 + 22, [
        shadow,
        bg,
        parchment,
        ribbon,
        this.dayText,
        this.statusText,
      ])
      .setScrollFactor(0)
      .setDepth(1000);
  }

  private createInventoryBar() {
    const slotWidth = 96;
    const slotCount = 6;
    const barWidth = slotWidth * slotCount + 24;
    const barHeight = 98;
    const shadow = this.add.rectangle(6, 8, barWidth, barHeight, 0x3c1d18);
    const bg = this.add
      .rectangle(0, 0, barWidth, barHeight, 0xefb45f)
      .setStrokeStyle(6, 0x713b26);
    const children: Phaser.GameObjects.GameObject[] = [shadow, bg];
    for (let i = 0; i < slotCount; i++) {
      const x = -barWidth / 2 + 14 + slotWidth / 2 + i * slotWidth;
      const slot = this.add
        .rectangle(x, 2, slotWidth - 10, barHeight - 24, SLOT_IDLE_FILL)
        .setStrokeStyle(3, SLOT_IDLE_STROKE);
      const keyBadge = this.add
        .rectangle(x - slotWidth / 2 + 19, -barHeight / 2 + 18, 26, 22, 0x6b3024)
        .setStrokeStyle(2, 0xffefbd);
      const keyText = this.add
        .text(x - slotWidth / 2 + 19, -barHeight / 2 + 18, String(i + 1), pxTitle(8, '#fff8d5'))
        .setOrigin(0.5);
      const text = this.add
        .text(x, 10, '', px(16, '#5d3022', { align: 'center', lineSpacing: 2 }))
        .setOrigin(0.5);
      children.push(slot, keyBadge, keyText, text);
      this.inventorySlotBgs.push(slot);
      this.inventorySlots.push(text);
    }
    this.inventoryBar = this.add
      .container(this.scale.width / 2, this.scale.height - 62, children)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  private createNoticePanel() {
    const width = Math.min(620, this.scale.width - 64);
    const shadow = this.add.rectangle(6, 8, width, 132, 0x241612, 0.8);
    const bg = this.add.rectangle(0, 0, width, 132, 0xf4c77d).setStrokeStyle(7, 0x713b26);
    const inner = this.add.rectangle(0, 0, width - 18, 114).setStrokeStyle(2, 0xffe4a3);
    const ribbon = this.add.rectangle(0, -66, 210, 34, 0xffd783).setStrokeStyle(4, 0x713b26);
    this.noticeTitle = this.add.text(0, -66, 'VALLEY', pxTitle(12, '#713b26')).setOrigin(0.5);
    this.noticeText = this.add.text(0, 5, '', px(16, '#4f2a20', {
      align: 'center',
      wordWrap: { width: width - 64 },
      lineSpacing: 4,
    })).setOrigin(0.5);
    this.noticePanel = this.add
      .container(this.scale.width / 2, this.scale.height - 184, [
        shadow, bg, inner, ribbon, this.noticeTitle, this.noticeText,
      ])
      .setScrollFactor(0)
      .setDepth(1050)
      .setVisible(false);
  }

  private showNotice(title: string, text: string, duration = 4500) {
    this.noticeTitle.setText(title.toUpperCase());
    this.noticeText.setText(text.replaceAll('_', ' '));
    this.noticePanel.setVisible(true);
    this.noticeTimer?.remove(false);
    this.noticeTimer = this.time.delayedCall(duration, () => this.noticePanel.setVisible(false));
  }

  private showSleepTransition(day: number) {
    this.sleepOverlay?.destroy();
    this.sleepStartedAt = this.time.now;
    this.panelMode = 'none';
    this.panel.setVisible(false);
    this.clearJobBoard();
    this.noticePanel.setVisible(false);

    this.sleepOverlayBg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000);
    this.sleepTitle = this.add
      .text(0, -24, 'RESTING…', pxTitle(18, '#fff0a8'))
      .setOrigin(0.5);
    this.sleepBody = this.add
      .text(0, 26, `DAY ${day}\nWaiting for the valley to wake`, px(16, '#d8d8d8', {
        align: 'center',
        lineSpacing: 8,
      }))
      .setOrigin(0.5);
    this.sleepOverlay = this.add
      .container(this.scale.width / 2, this.scale.height / 2, [
        this.sleepOverlayBg,
        this.sleepTitle,
        this.sleepBody,
      ])
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(0);

    this.tweens.add({
      targets: this.sleepOverlay,
      alpha: 1,
      duration: 650,
      ease: 'Sine.easeInOut',
    });
  }

  private finishSleepTransition(day: number) {
    if (!this.sleepOverlay) return;
    const overlay = this.sleepOverlay;
    const remainingDarkTime = Math.max(0, 900 - (this.time.now - this.sleepStartedAt));

    this.time.delayedCall(remainingDarkTime, () => {
      if (this.sleepOverlay !== overlay) return;
      this.sleepTitle?.setText(`DAWN OF DAY ${day}`);
      this.sleepBody?.setText('HP restored · New jobs are waiting');
      this.tweens.add({
        targets: overlay,
        alpha: 0,
        delay: 650,
        duration: 850,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          overlay.destroy();
          if (this.sleepOverlay === overlay) {
            this.sleepOverlay = undefined;
            this.sleepOverlayBg = undefined;
            this.sleepTitle = undefined;
            this.sleepBody = undefined;
          }
        },
      });
    });
  }

  private jobList(): string[] {
    const room = getRoom();
    if (!room?.state?.availableJobs) return [];
    const ids: string[] = [];
    room.state.availableJobs.forEach((_v: string, k: string) => ids.push(k));
    return ids;
  }

  private acceptJobIndex(i: number) {
    if (this.panelMode !== 'jobs') return;
    const id = this.jobList()[i];
    if (id) {
      sendInput({ type: 'acceptJob', jobId: id });
      this.panelMode = 'none';
      this.panel.setVisible(false);
      this.clearJobBoard();
    }
  }

  private togglePanel(mode: 'jobs' | 'quests' | 'hearts') {
    if (this.panelMode === mode) {
      this.panelMode = 'none';
      this.panel.setVisible(false);
      this.clearJobBoard();
      return;
    }
    this.openPanel(mode);
  }

  private openPanel(mode: 'jobs' | 'quests' | 'hearts') {
    this.clearJobBoard();
    this.panelMode = mode;
    this.panel.setVisible(true);
    this.renderPanel();
  }

  private clearJobBoard() {
    for (const object of this.jobBoardObjects) object.destroy();
    this.jobBoardObjects = [];
  }

  private renderPanel() {
    const room = getRoom();
    if (!room?.state) return;
    const state = room.state;
    let text = '';

    if (this.panelMode === 'jobs') {
      this.renderJobBoard(state.activeJobId);
      return;
    }

    this.panelBg.setSize(460, 350);
    this.panelInner.setSize(442, 332);
    this.panelText.setPosition(-205, -152).setVisible(true);

    if (this.panelMode === 'quests') {
      text = 'QUEST LOG\n(hand in at noticeboard with E)\n\n';
      for (const q of QUESTS) {
        const done = !!state.questCompleted?.get?.(q.id);
        const unlocked = !!state.questUnlocked?.get?.(q.id) || done;
        const mark = done ? '[x]' : unlocked ? '[ ]' : '[?]';
        text += `${mark} ${q.title}${q.required ? ' *' : ''}\n   ${q.description}\n\n`;
      }
      text += `House floors unlocked: ${state.houseFloorUnlocked}/4`;
    } else if (this.panelMode === 'hearts') {
      text = 'FRIENDSHIP HEARTS\n(E talk · G gift · H cycle gift)\n\n';
      for (const npc of NPCS) {
        const h = state.hearts?.get?.(npc.id);
        const pts = h?.points ?? 0;
        const hearts = Math.floor(pts / 100);
        const bar = '♥'.repeat(hearts) + '♡'.repeat(MAX_HEARTS - hearts);
        text += `${npc.name} · ${npc.role}\n${bar}  ${hearts}/${MAX_HEARTS}\n\n`;
      }
    }

    this.panelText.setText(text);
  }

  private renderJobBoard(activeJobId: string) {
    this.clearJobBoard();
    this.panelText.setVisible(false);
    this.panelBg.setSize(540, 460);
    this.panelInner.setSize(522, 442);

    const ids = this.jobList();
    this.selectedJobIndex = Phaser.Math.Clamp(this.selectedJobIndex, 0, Math.max(0, ids.length - 1));
    const id = ids[this.selectedJobIndex];
    const job = JOBS.find((candidate) => candidate.id === id);

    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      this.panel.add(object);
      this.jobBoardObjects.push(object);
      return object;
    };
    const button = (x: number, y: number, w: number, label: string, onClick: () => void) => {
      const bg = add(this.add.rectangle(x, y, w, 40, 0xe5a85d).setStrokeStyle(4, 0x713b26));
      add(this.add.text(x, y, label, pxTitle(10, '#5d3022')).setOrigin(0.5));
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0xffd783));
      bg.on('pointerout', () => bg.setFillStyle(0xe5a85d));
      bg.on('pointerdown', onClick);
    };

    add(this.add.text(0, -198, 'HELP WANTED', pxTitle(17, '#713b26')).setOrigin(0.5));
    add(this.add.text(-235, -198, '❦', px(28, '#4e8d43')).setOrigin(0.5));
    add(this.add.text(235, -198, '❦', px(28, '#4e8d43')).setOrigin(0.5).setScale(-1, 1));
    add(this.add.rectangle(0, -2, 470, 326, 0xffe4ad).setStrokeStyle(3, 0xb56b3b));
    add(this.add.rectangle(0, -2, 446, 302).setStrokeStyle(2, 0xf7c97d));

    if (!job) {
      add(this.add.text(0, -10, 'No jobs posted today.', px(18, '#5d3022')).setOrigin(0.5));
    } else {
      add(this.add.text(0, -125, job.title, pxTitle(13, '#713b26', {
        align: 'center',
        wordWrap: { width: 400 },
      })).setOrigin(0.5));
      add(this.add.text(0, -40, job.flavour, px(18, '#5d3022', {
        align: 'center',
        wordWrap: { width: 390 },
        lineSpacing: 5,
      })).setOrigin(0.5));
      add(this.add.text(0, 57, `Reward: $${job.payout}\nFirm reputation: +${job.reputation}`, px(16, '#5d3022', {
        align: 'center',
        lineSpacing: 5,
      })).setOrigin(0.5));
      add(this.add.text(0, 119, `${this.selectedJobIndex + 1} / ${ids.length}`, px(13, '#8d5a3b')).setOrigin(0.5));

      if (ids.length > 1) {
        button(-205, 119, 52, '◀', () => {
          this.selectedJobIndex = (this.selectedJobIndex - 1 + ids.length) % ids.length;
          this.renderJobBoard(activeJobId);
        });
        button(205, 119, 52, '▶', () => {
          this.selectedJobIndex = (this.selectedJobIndex + 1) % ids.length;
          this.renderJobBoard(activeJobId);
        });
      }
      button(0, 183, 210, id === activeJobId ? 'ACTIVE JOB' : 'ACCEPT JOB', () => {
        if (id !== activeJobId) sendInput({ type: 'acceptJob', jobId: id });
        this.panelMode = 'none';
        this.panel.setVisible(false);
        this.clearJobBoard();
      });
    }

    button(245, -205, 36, 'X', () => {
      this.panelMode = 'none';
      this.panel.setVisible(false);
      this.clearJobBoard();
    });
  }

  private refreshHud() {
    const room = getRoom();
    const state = room?.state;
    const me = state?.players?.get?.(getSessionId());
    const code = state?.roomCode || room?.roomId || '—';
    this.dayText.setText(`DAY ${state?.day ?? 1}  ·  ${code}`);
    this.statusText.setText([
      `COINS  ${me?.coins ?? 0}`,
      `REP    ${state?.reputation ?? 0}`,
      `HP     ${me?.hp ?? 10}/${me?.maxHp ?? 10}`,
    ].join('\n'));

    const qty = (id: string) => state?.inventory?.get?.(id)?.qty ?? 0;
    const selectedGift = GIFT_LABELS[this.giftItem] || 'GIFT';
    const slots = [
      'SWORD',
      `GIFT\n${selectedGift}`,
      ...GIFT_ITEMS.map((id) => `${GIFT_LABELS[id]}\n×${qty(id)}`),
    ];
    this.inventorySlots.forEach((slot, index) => slot.setText(slots[index] || ''));

    const activeSlot =
      this.tool === 'sword' ? 0 : 2 + Math.max(0, GIFT_ITEMS.indexOf(this.giftItem));
    this.inventorySlotBgs.forEach((slot, index) => {
      const active = index === activeSlot || (this.tool === 'gift' && index === 1);
      slot.setFillStyle(active ? SLOT_ACTIVE_FILL : SLOT_IDLE_FILL);
      slot.setStrokeStyle(3, active ? SLOT_ACTIVE_STROKE : SLOT_IDLE_STROKE);
    });

    const announcement = state?.lastAnnouncement || '';
    if (announcement && announcement !== this.lastAnnouncement) {
      this.lastAnnouncement = announcement;
      const friendship = /\b(liked|loved|hated)\b/i.test(announcement);
      this.showNotice(friendship ? 'Friendship' : 'Valley Update', announcement);
    }
  }

  private showFestival() {
    if (this.festivalOverlay) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.72);
    const title = this.add
      .text(0, -40, 'Housewarming Festival!', pxTitle(18, '#ffecb3'))
      .setOrigin(0.5);
    const body = this.add
      .text(
        0,
        30,
        'The Big House is alive again.\nValuePro Valley is open for business — and brunch.',
        px(15, '#e8f5e9', { align: 'center' }),
      )
      .setOrigin(0.5);
    const credits = this.add
      .text(
        0,
        100,
        'Support: Maillene · Al · Sudhir · David · Savi · Gabe\nR&D: Stewart · Zach · Kat · Rica · Elaine · Ed',
        px(12, '#a5d6a7', { align: 'center' }),
      )
      .setOrigin(0.5);
    this.festivalOverlay = this.add
      .container(w / 2, h / 2, [bg, title, body, credits])
      .setScrollFactor(0)
      .setDepth(2000);
  }
}
