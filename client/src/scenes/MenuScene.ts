import Phaser from 'phaser';
import { Client } from 'colyseus.js';
import { ROOM_NAME } from '@shared/index';
import type { PlayerGender } from '@shared/types';
import {
  colyseusUrl,
  getPlayerGender,
  getPlayerName,
  setPlayerGender,
  setPlayerName,
  setRoom,
} from '../net';
import { px, pxTitle } from '../ui/font';

export class MenuScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private setupDom?: Phaser.GameObjects.DOMElement;
  private setupSky: Phaser.GameObjects.GameObject[] = [];
  private menuButtons: Array<{
    container: Phaser.GameObjects.Container;
    face: Phaser.GameObjects.Rectangle;
  }> = [];

  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;
    const compact = height < 760;
    this.menuButtons = [];
    this.drawSky(width, height);
    this.drawTitleSign(width, height);
    this.drawHowToPlay(width, height, compact);

    const buttonY = compact ? Math.max(430, height - 170) : Math.min(height - 180, height * 0.76);
    const buttonGap = Math.min(130, Math.max(104, width * 0.18));
    this.menuButtons.push(
      this.makeWoodButton(
        width / 2 - buttonGap,
        buttonY,
        'CREATE',
        'HOST A VALLEY',
        '+',
        0x4e8d43,
        () => this.showCharacterSetup('create'),
      ),
      this.makeWoodButton(
        width / 2 + buttonGap,
        buttonY,
        'JOIN',
        'USE ROOM CODE',
        '>',
        0x3b79a8,
        () => this.showCharacterSetup('join'),
      ),
    );

    this.statusText = this.add
      .text(width / 2, buttonY + 72, 'Choose CREATE or JOIN to begin', px(15, '#5d2f20', {
        align: 'center',
        wordWrap: { width: width - 64 },
      }))
      .setOrigin(0.5);

    this.scale.on('resize', this.restartMenu, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.restartMenu, this);
    });
  }

  private restartMenu() {
    this.scene.restart();
  }

  private drawSky(width: number, height: number, depth = 0) {
    const skyObjects: Phaser.GameObjects.GameObject[] = [];
    const g = this.add.graphics().setDepth(depth);
    skyObjects.push(g);
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x0754a6),
        Phaser.Display.Color.ValueToColor(0x65dfda),
        bands - 1,
        i,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b));
      g.fillRect(0, (height / bands) * i, width, height / bands + 1);
    }

    const stars = [
      [0.05, 0.07], [0.16, 0.04], [0.27, 0.12], [0.39, 0.06], [0.52, 0.03],
      [0.63, 0.1], [0.75, 0.04], [0.88, 0.12], [0.96, 0.05],
    ];
    for (const [x, y] of stars) {
      const star = this.add.star(width * x, height * y, 4, 2, 7, 0xfff4bd).setDepth(depth + 1);
      skyObjects.push(star);
    }

    skyObjects.push(
      this.drawCloud(width * 0.1, height * 0.28, 0.8, depth + 2),
      this.drawCloud(width * 0.88, height * 0.2, 1, depth + 2),
      this.drawCloud(width * 0.72, height * 0.38, 0.65, depth + 2),
    );
    return skyObjects;
  }

  private drawCloud(x: number, y: number, scale: number, depth: number) {
    const cloud = this.add.container(x, y).setScale(scale).setDepth(depth);
    const shadow = 0xb5dff1;
    const white = 0xf4fbff;
    cloud.add([
      this.add.ellipse(0, 12, 150, 46, shadow),
      this.add.circle(-48, 0, 32, white),
      this.add.circle(-12, -18, 44, white),
      this.add.circle(30, -8, 36, white),
      this.add.circle(58, 10, 24, white),
      this.add.ellipse(2, 12, 142, 42, white),
    ]);
    return cloud;
  }

  private drawTitleSign(width: number, height: number) {
    const signWidth = Math.min(700, width - 56);
    const signHeight = Math.min(height < 760 ? 150 : 240, signWidth * 0.36);
    const x = width / 2;
    const y = height < 760 ? 100 : 175;
    const g = this.add.graphics().setDepth(5);

    g.fillStyle(0x5b2d1f);
    g.fillRoundedRect(x - signWidth / 2 - 8, y - signHeight / 2 - 8, signWidth + 16, signHeight + 16, 18);
    g.fillStyle(0xf2b45f);
    g.fillRoundedRect(x - signWidth / 2, y - signHeight / 2, signWidth, signHeight, 14);
    g.lineStyle(5, 0xc66b39);
    g.strokeRoundedRect(x - signWidth / 2 + 5, y - signHeight / 2 + 5, signWidth - 10, signHeight - 10, 12);
    g.lineStyle(2, 0xd98645, 0.7);
    for (let plank = 1; plank < 4; plank++) {
      const plankY = y - signHeight / 2 + (signHeight / 4) * plank;
      g.lineBetween(x - signWidth / 2 + 12, plankY, x + signWidth / 2 - 12, plankY);
    }

    const titleSize = Phaser.Math.Clamp(Math.round(signWidth / 18), 24, 38);
    this.add.text(x + 4, y + 5, 'VALUEPRO\nVALLEY', pxTitle(titleSize, '#6b3024', {
      align: 'center',
      lineSpacing: 12,
    })).setOrigin(0.5).setDepth(6);
    this.add.text(x, y, 'VALUEPRO\nVALLEY', pxTitle(titleSize, '#fff0a8', {
      align: 'center',
      lineSpacing: 12,
    })).setOrigin(0.5).setDepth(7);
  }

  private drawHowToPlay(width: number, height: number, compact: boolean) {
    const panelWidth = Math.min(960, width - 48);
    const panelHeight = compact ? 210 : 300;
    const x = width / 2;
    const y = compact ? 300 : height * 0.48;
    const left = x - panelWidth / 2;
    const top = y - panelHeight / 2;
    const g = this.add.graphics().setDepth(5);

    // Timber frame and inset parchment.
    g.fillStyle(0x321812, 0.9);
    g.fillRoundedRect(left + 9, top + 11, panelWidth, panelHeight, 14);
    g.fillStyle(0x8e452c);
    g.fillRoundedRect(left, top, panelWidth, panelHeight, 14);
    g.fillStyle(0xffd98f);
    g.fillRoundedRect(left + 8, top + 8, panelWidth - 16, panelHeight - 16, 10);
    g.lineStyle(2, 0xffefbd, 0.9);
    g.strokeRoundedRect(left + 15, top + 15, panelWidth - 30, panelHeight - 30, 7);

    // Ribbon heading.
    const ribbonWidth = compact ? 230 : 290;
    g.fillStyle(0x5b2d1f);
    g.fillTriangle(x - ribbonWidth / 2 - 20, top + 10, x - ribbonWidth / 2 + 8, top + 10, x - ribbonWidth / 2 + 8, top + 42);
    g.fillTriangle(x + ribbonWidth / 2 + 20, top + 10, x + ribbonWidth / 2 - 8, top + 10, x + ribbonWidth / 2 - 8, top + 42);
    g.fillStyle(0x4e8d43);
    g.fillRoundedRect(x - ribbonWidth / 2, top + 2, ribbonWidth, 46, 5);
    g.lineStyle(3, 0x285c36);
    g.strokeRoundedRect(x - ribbonWidth / 2, top + 2, ribbonWidth, 46, 5);
    this.add.text(x, top + 25, 'HOW TO PLAY', pxTitle(compact ? 13 : 17, '#fff8d5'))
      .setOrigin(0.5)
      .setDepth(7);

    // Goal — win by clearing every Help Wanted job.
    const goalY = top + 56;
    const goalH = compact ? 28 : 32;
    g.fillStyle(0x5b2d1f, 0.92);
    g.fillRoundedRect(left + 22, goalY, panelWidth - 44, goalH, 6);
    g.lineStyle(2, 0xc9a227);
    g.strokeRoundedRect(left + 22, goalY, panelWidth - 44, goalH, 6);
    this.add
      .text(
        x,
        goalY + goalH / 2,
        compact
          ? 'GOAL  ·  Finish every Help Wanted job to win'
          : 'GOAL  ·  Finish every Help Wanted job to reopen the valley',
        pxTitle(compact ? 8 : 10, '#fff8d5'),
      )
      .setOrigin(0.5)
      .setDepth(7);

    const steps = [
      {
        number: '1',
        badge: 'ROOM',
        heading: 'START TOGETHER',
        detail: 'Create a valley and share the 5-letter room code.',
        accent: 0x4e8d43,
      },
      {
        number: '2',
        badge: 'JOB',
        heading: 'HELP WANTED',
        detail: 'Accept a job, glowing door + E. Party shares one fight — everyone acts, then dodge together.',
        accent: 0xc97843,
      },
      {
        number: '3',
        badge: 'FIGHT',
        heading: 'PARTY TURNS',
        detail: 'Each fighter: SPACE or C once. When all ready (or timer), shared dodge with WASD.',
        accent: 0xa84232,
      },
    ];

    if (compact) {
      steps.forEach((step, index) => {
        const rowY = top + 92 + index * 35;
        g.fillStyle(0xffe7b5, 0.95);
        g.fillRoundedRect(left + 18, rowY, panelWidth - 36, 30, 5);
        g.fillStyle(step.accent);
        g.fillRoundedRect(left + 18, rowY, 116, 30, 5);
        this.add.text(left + 32, rowY + 15, `${step.number}  ${step.badge}`, pxTitle(9, '#fff8d5'))
          .setOrigin(0, 0.5)
          .setDepth(7);
        this.add.text(left + 146, rowY + 15, step.detail, px(13, '#5b2d1f'))
          .setOrigin(0, 0.5)
          .setDepth(7);
      });
      return;
    }

    const gap = 14;
    const cardWidth = (panelWidth - 52 - gap * 2) / 3;
    const cardTop = top + 98;
    const cardHeight = 142;
    steps.forEach((step, index) => {
      const cardLeft = left + 26 + index * (cardWidth + gap);
      const cardX = cardLeft + cardWidth / 2;

      g.fillStyle(0xb56b3b, 0.35);
      g.fillRoundedRect(cardLeft + 4, cardTop + 5, cardWidth, cardHeight, 8);
      g.fillStyle(0xffe7b5);
      g.fillRoundedRect(cardLeft, cardTop, cardWidth, cardHeight, 8);
      g.lineStyle(3, step.accent);
      g.strokeRoundedRect(cardLeft, cardTop, cardWidth, cardHeight, 8);
      g.fillStyle(step.accent);
      g.fillRoundedRect(cardLeft, cardTop, cardWidth, 38, 8);
      g.fillRect(cardLeft, cardTop + 24, cardWidth, 14);

      this.add.circle(cardLeft + 25, cardTop + 19, 16, 0xfff4cf)
        .setStrokeStyle(2, 0x5b2d1f)
        .setDepth(7);
      this.add.text(cardLeft + 25, cardTop + 19, step.number, pxTitle(10, '#5b2d1f'))
        .setOrigin(0.5)
        .setDepth(8);
      this.add.text(cardX + 10, cardTop + 19, step.badge, pxTitle(11, '#fff8d5'))
        .setOrigin(0.5)
        .setDepth(7);
      this.add.text(cardX, cardTop + 57, step.heading, pxTitle(10, '#6b3024'))
        .setOrigin(0.5)
        .setDepth(7);
      this.add.text(cardX, cardTop + 94, step.detail, px(17, '#5b2d1f', {
        align: 'center',
        wordWrap: { width: cardWidth - 28 },
        lineSpacing: 3,
      }))
        .setOrigin(0.5)
        .setDepth(7);
    });

    const controls = [
      ['WASD', 'MOVE'],
      ['E', 'INTERACT'],
      ['SPACE', 'ATTACK'],
      ['B', 'REST'],
    ];
    const controlWidth = 190;
    const controlsWidth = controls.length * controlWidth;
    controls.forEach(([key, action], index) => {
      const controlX = x - controlsWidth / 2 + controlWidth / 2 + index * controlWidth;
      const controlY = top + panelHeight - 29;
      const keyWidth = Math.max(38, key.length * 13 + 18);
      g.fillStyle(0x6b3024);
      g.fillRoundedRect(controlX - 55 - keyWidth / 2, controlY - 15, keyWidth, 30, 5);
      this.add.text(controlX - 55, controlY, key, pxTitle(9, '#fff8d5'))
        .setOrigin(0.5)
        .setDepth(7);
      this.add.text(controlX + 18, controlY, action, px(14, '#5b2d1f'))
        .setOrigin(0, 0.5)
        .setDepth(7);
    });
  }

  private makeWoodButton(
    x: number,
    y: number,
    label: string,
    subtitle: string,
    icon: string,
    accent: number,
    onClick: () => void,
  ) {
    const button = this.add.container(x, y).setDepth(8);
    const shadow = this.add.rectangle(6, 8, 230, 100, 0x3c1d18).setStrokeStyle(3, 0x24100e);
    const outer = this.add.rectangle(0, 0, 230, 100, 0x713b26).setStrokeStyle(3, 0x4b251b);
    const face = this.add.rectangle(0, -2, 216, 84, 0xffd783).setStrokeStyle(2, 0xffedb0);
    const accentBar = this.add.rectangle(-103, -2, 10, 84, accent);
    const badgeShadow = this.add.circle(-69, 3, 28, 0x6b3024);
    const badge = this.add.circle(-69, -1, 25, accent).setStrokeStyle(3, 0xffefbd);
    const iconText = this.add.text(-69, -1, icon, pxTitle(18, '#fff8d5')).setOrigin(0.5);
    const text = this.add.text(26, -15, label, pxTitle(16, '#6b3024')).setOrigin(0.5);
    const subtext = this.add.text(26, 18, subtitle, px(14, '#754a32')).setOrigin(0.5);
    const nails = [
      this.add.circle(-104, -42, 3, 0xd58a48),
      this.add.circle(104, -42, 3, 0xd58a48),
      this.add.circle(104, 42, 3, 0xd58a48),
      this.add.circle(-104, 42, 3, 0xd58a48),
    ];
    button.add([
      shadow,
      outer,
      face,
      accentBar,
      badgeShadow,
      badge,
      iconText,
      text,
      subtext,
      ...nails,
    ]);

    face.setInteractive({ useHandCursor: true });
    face.on('pointerover', () => button.setScale(1.04));
    face.on('pointerout', () => button.setScale(1));
    face.on('pointerdown', () => button.setScale(0.96));
    face.on('pointerup', () => {
      button.setScale(1.04);
      onClick();
    });
    return { container: button, face };
  }

  private setMenuButtonsVisible(visible: boolean) {
    for (const button of this.menuButtons) {
      button.container.setVisible(visible).setActive(visible);
      if (visible) button.face.setInteractive({ useHandCursor: true });
      else button.face.disableInteractive();
    }
    this.statusText.setVisible(visible);
  }

  private showCharacterSetup(mode: 'create' | 'join') {
    this.setupDom?.destroy();
    for (const object of this.setupSky) object.destroy();
    this.setMenuButtonsVisible(false);
    this.setupSky = this.drawSky(this.scale.width, this.scale.height, 90);
    const currentName = this.escapeHtml(getPlayerName());
    const currentGender = getPlayerGender();
    const joinFields = mode === 'join'
      ? `<label>Room code
          <input data-field="code" maxlength="5" autocomplete="off" placeholder="ABCDE" />
        </label>
        <p class="vv-join-help">Ask the host for the 5-character room code shown in their top-right HUD.</p>`
      : '<p class="vv-join-help">Your room code will appear in the top-right HUD. Share it with coworkers.</p>';
    const html = `
      <div class="vv-character-card">
        <button type="button" class="vv-card-close" data-action="cancel">×</button>
        <h2>${mode === 'create' ? 'NEW CHARACTER' : 'JOIN VALLEY'}</h2>
        <div class="vv-character-layout">
          <div class="vv-character-preview">
            <div class="vv-character-sprite" data-gender="${currentGender}" role="img"
              aria-label="${currentGender === 'female' ? 'Female' : 'Male'} character"></div>
          </div>
          <div>
            <label>Character name
              <input data-field="name" maxlength="16" autocomplete="off"
                value="${currentName}" placeholder="Your name" />
            </label>
            <label>Character
              <span class="vv-gender-row">
                <button type="button" data-gender="female" class="${currentGender === 'female' ? 'selected' : ''}">♀ Female</button>
                <button type="button" data-gender="male" class="${currentGender === 'male' ? 'selected' : ''}">♂ Male</button>
              </span>
            </label>
            ${joinFields}
          </div>
        </div>
        <div class="vv-setup-error"></div>
        <div class="vv-character-actions">
          <button type="button" data-action="start">${mode === 'create' ? 'CREATE' : 'JOIN'}</button>
        </div>
      </div>`;

    this.setupDom = this.add.dom(this.scale.width / 2, this.scale.height / 2)
      .createFromHTML(html)
      .setDepth(100);
    const root = this.setupDom.node as HTMLElement;
    let selectedGender: PlayerGender = currentGender;

    root.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedGender = button.dataset.gender as PlayerGender;
        root.querySelectorAll('[data-gender]').forEach((option) => option.classList.remove('selected'));
        button.classList.add('selected');
        const preview = root.querySelector<HTMLElement>('.vv-character-sprite');
        if (preview) {
          preview.dataset.gender = selectedGender;
          preview.setAttribute(
            'aria-label',
            `${selectedGender === 'female' ? 'Female' : 'Male'} character`,
          );
        }
      });
    });
    root.querySelector<HTMLElement>('[data-action="cancel"]')?.addEventListener('click', () => {
      this.setupDom?.destroy();
      this.setupDom = undefined;
      for (const object of this.setupSky) object.destroy();
      this.setupSky = [];
      this.setMenuButtonsVisible(true);
    });
    root.querySelector<HTMLElement>('[data-action="start"]')?.addEventListener('click', () => {
      const name = (root.querySelector<HTMLInputElement>('[data-field="name"]')?.value || '').trim().slice(0, 16);
      const code = (root.querySelector<HTMLInputElement>('[data-field="code"]')?.value || '').trim().toUpperCase();
      const error = root.querySelector<HTMLElement>('.vv-setup-error');
      if (!name) {
        if (error) error.textContent = 'Please enter a character name.';
        return;
      }
      if (mode === 'join' && code.length !== 5) {
        if (error) error.textContent = 'Enter the host’s 5-character room code.';
        return;
      }
      setPlayerName(name);
      setPlayerGender(selectedGender);
      this.setupDom?.destroy();
      this.setupDom = undefined;
      for (const object of this.setupSky) object.destroy();
      this.setupSky = [];
      if (mode === 'create') void this.createRoom();
      else void this.joinRoom(code);
    });
    window.setTimeout(() => root.querySelector<HTMLInputElement>('[data-field="name"]')?.focus(), 0);
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private joinOptions() {
    return { name: getPlayerName(), gender: getPlayerGender() };
  }

  private async createRoom() {
    this.statusText.setText('Creating room…');
    try {
      const client = new Client(colyseusUrl());
      const code = this.randomCode();
      const room = await client.create(ROOM_NAME, {
        roomCode: code,
        ...this.joinOptions(),
      });
      setRoom(room);
      this.statusText.setText(`Room ${room.roomId} — share this code!`);
      this.scene.start('Town');
      this.scene.launch('UI');
    } catch (e) {
      console.error(e);
      this.statusText.setText(`Could not create room. Is the server up (${colyseusUrl()})?`);
    }
  }

  private async joinRoom(code: string) {
    this.statusText.setText(`Joining ${code}…`);
    try {
      const client = new Client(colyseusUrl());
      const room = await client.joinById(code.toUpperCase(), this.joinOptions());
      setRoom(room);
      this.scene.start('Town');
      this.scene.launch('UI');
    } catch (e) {
      console.error(e);
      this.statusText.setText('Join failed. Check the code and that the host is online.');
    }
  }

  private randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
}
