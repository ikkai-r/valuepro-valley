import Phaser from 'phaser';
import { BATTLE_BOX, JOBS, MONSTERS, MonsterType } from '@shared/index';
import { ENEMY_VISUALS, createEnemyAnimations, playEnemyAnim } from '../enemies';
import { getRoom, getSessionId, sendInput } from '../net';
import { px, pxTitle } from '../ui/font';

const FEMALE_COLORS = [0xec407a, 0xab47bc, 0x26a69a, 0xffa726];
const MALE_COLORS = [0x42a5f5, 0x66bb6a, 0x8d6e63, 0x5c6bc0];
const STAGE = { w: 960, h: 540 };
/** Single band for enemies so nothing collides with the header or the arena. */
const ENEMY_ROW_Y = 150;

function playerColor(gender: string | undefined, colorIndex: number) {
  const palette = gender === 'male' ? MALE_COLORS : FEMALE_COLORS;
  return palette[colorIndex % palette.length];
}

function drawBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  fill: number,
) {
  g.fillStyle(0x000000, 0.75);
  g.fillRect(x, y, w, h);
  g.fillStyle(fill, 1);
  g.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Phaser.Math.Clamp(ratio, 0, 1)), h - 2);
}

/** Undertale-style FIGHT / dodge arena with animated enemy sprites + VFX. */
export class InspectionScene extends Phaser.Scene {
  private boxGfx!: Phaser.GameObjects.Graphics;
  private soulLocal!: Phaser.GameObjects.Polygon;
  private remotes = new Map<string, Phaser.GameObjects.Container>();
  private monsters = new Map<string, Phaser.GameObjects.Container>();
  private monsterModes = new Map<string, 'idle' | 'hurt' | 'attack'>();
  private bullets = new Map<string, Phaser.GameObjects.Arc>();
  private title!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hpHud!: Phaser.GameObjects.Text;
  private hpBarGfx!: Phaser.GameObjects.Graphics;
  private soulLabel!: Phaser.GameObjects.Text;
  private partyHud!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('Inspection');
  }

  create() {
    createEnemyAnimations(this);
    this.cameras.main.setBackgroundColor('#000000');
    this.updateCameraZoom();
    this.scale.on('resize', this.updateCameraZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.updateCameraZoom, this);
    });

    this.add
      .rectangle(STAGE.w / 2, STAGE.h / 2, STAGE.w - 20, STAGE.h - 20, 0x000000)
      .setStrokeStyle(4, 0xffffff);

    this.title = this.add.text(STAGE.w / 2, 28, 'INSPECTION', pxTitle(14, '#ffffff')).setOrigin(0.5);
    this.phaseText = this.add.text(STAGE.w / 2, 52, '', px(14, '#ffff00')).setOrigin(0.5);

    this.boxGfx = this.add.graphics();
    this.drawBattleBox();

    this.soulLocal = this.add
      .polygon(0, 0, [0, -8, 8, 0, 0, 8, -8, 0], 0xff0000)
      .setStrokeStyle(1, 0xffffff, 0.9)
      .setDepth(20);
    this.soulLabel = this.add
      // Same backing pill as remote players so the name stays readable over the soul.
      .text(0, 0, 'YOU', px(10, '#ffdede', { backgroundColor: '#000000aa', padding: { x: 3, y: 1 } }))
      .setOrigin(0.5)
      .setDepth(21);

    this.hpBarGfx = this.add.graphics().setDepth(30);
    this.hpHud = this.add.text(40, 452, '', px(13, '#ffffff')).setDepth(31);
    this.partyHud = this.add.text(STAGE.w - 40, 452, '', px(12, '#ffe082', { align: 'right' }))
      .setOrigin(1, 0)
      .setDepth(31);
    this.hint = this.add
      .text(STAGE.w / 2, 505, '', px(12, '#cfcfcf', {
        align: 'center',
        wordWrap: { width: 700 },
      }))
      .setOrigin(0.5)
      .setDepth(31);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.input.keyboard!.on('keydown-SPACE', () => sendInput({ type: 'attack' }));
    this.input.keyboard!.on('keydown-C', () => sendInput({ type: 'drinkCoffee' }));
    this.input.keyboard!.on('keydown-E', () => sendInput({ type: 'submitReport' }));
    this.input.keyboard!.on('keydown-L', () => sendInput({ type: 'leaveInspection' }));
    this.input.keyboard!.on('keydown-X', () => sendInput({ type: 'leaveInspection' }));

    const room = getRoom();
    // Drop the listener on shutdown; a stale one would sync into destroyed objects
    // and throw, which aborts the remaining handlers for that state patch.
    const onState = () => this.sync();
    room?.onStateChange(onState);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      room?.onStateChange.remove(onState);
    });
    this.sync();
  }

  private updateCameraZoom() {
    const zoom = Math.min(this.scale.width / STAGE.w, this.scale.height / STAGE.h);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(STAGE.w / 2, STAGE.h / 2);
  }

  private drawBattleBox() {
    const { x, y, w, h } = BATTLE_BOX;
    this.boxGfx.clear();
    this.boxGfx.lineStyle(4, 0xffffff, 1);
    this.boxGfx.strokeRect(x, y, w, h);
    this.boxGfx.fillStyle(0x000000, 1);
    this.boxGfx.fillRect(x + 2, y + 2, w - 4, h - 4);
  }

  private sync() {
    const room = getRoom();
    if (!room?.state) return;
    const state = room.state;
    const job = JOBS.find((j) => j.id === state.activeJobId);
    this.title.setText(job ? job.title.toUpperCase() : 'INSPECTION');

    const phase = state.battlePhase || 'player_turn';
    const remain = Math.max(0, Math.ceil(((state.battlePhaseEndsAt || 0) - Date.now()) / 1000));
    if (state.inspectionCleared || phase === 'cleared') {
      this.phaseText.setText('* YOU WON!');
      this.hint.setText('Press E to submit the report · L to leave');
    } else if (phase === 'player_turn') {
      let ready = 0;
      let total = 0;
      const waiting: string[] = [];
      state.players?.forEach(
        (p: { inInspection: boolean; actedThisTurn?: boolean; name: string; hp: number }) => {
          if (!p.inInspection || p.hp <= 0) return;
          total += 1;
          if (p.actedThisTurn) ready += 1;
          else waiting.push(p.name);
        },
      );
      const me = state.players?.get?.(getSessionId());
      const iActed = !!me?.actedThisTurn;
      if (total > 1) {
        this.phaseText.setText(`* PARTY TURN ${ready}/${total} — ${remain}s`);
        this.hint.setText(
          iActed
            ? `Waiting on: ${waiting.join(', ') || '…'} · then shared dodge`
            : `SPACE = fight OR C = coffee · one each · then dodge together`,
        );
      } else {
        this.phaseText.setText(`* YOUR TURN — FIGHT! (${remain}s)`);
        const cups = room?.state?.inventory?.get?.('coffee')?.qty ?? 0;
        this.hint.setText(`SPACE = fight OR C = coffee (+HP, ×${cups}) · one action · L = flee`);
      }
    } else {
      this.phaseText.setText(`* DODGE! (${remain}s)`);
      this.hint.setText('WASD / arrows move your SOUL · bullets hit everyone');
    }

    const me = state.players?.get?.(getSessionId());
    this.hpBarGfx.clear();
    let partyCount = 0;
    const partyNames: string[] = [];
    state.players?.forEach(
      (p: { inInspection: boolean; name: string; hp: number }) => {
        if (!p.inInspection) return;
        partyCount += 1;
        partyNames.push(p.hp <= 0 ? `${p.name} · KO` : p.name);
      },
    );
    this.partyHud.setText(
      partyCount > 1 ? `PARTY ${partyCount}\n${partyNames.join('\n')}` : '',
    );
    if (me) {
      const ratio = me.maxHp > 0 ? me.hp / me.maxHp : 0;
      drawBar(this.hpBarGfx, 40, 472, 180, 10, ratio, 0xffff00);
      this.hpHud.setText(`HP  ${me.hp} / ${me.maxHp}`);
      if (me.inInspection) {
        this.soulLocal.setPosition(me.x, me.y);
        this.soulLocal.setVisible(true);
        const defeated = me.hp <= 0;
        this.soulLabel
          .setText(defeated ? `${me.name || 'YOU'} · KO` : me.name || 'YOU')
          .setPosition(me.x, me.y - 18)
          .setVisible(true);
        this.soulLocal.setAlpha(defeated ? 0.4 : 1);
        this.soulLabel.setAlpha(defeated ? 0.65 : 1);
        if (defeated) {
          this.soulLocal.setFillStyle(0x555555);
          this.hint.setText('KO · Watching the party — you return together after a win or full wipe');
        } else if (phase === 'enemy_turn') {
          this.soulLocal.setFillStyle(0xff0000);
        } else if (me.actedThisTurn) {
          this.soulLocal.setFillStyle(0x888888);
        } else {
          this.soulLocal.setFillStyle(0xff6666);
        }
      } else {
        this.soulLocal.setVisible(false);
        this.soulLabel.setVisible(false);
      }
    }

    const seenM = new Set<string>();
    const living: Array<{
      id: string;
      m: { hp: number; maxHp: number; monsterType: string; hurtFlash?: number };
    }> = [];
    state.monsters?.forEach(
      (m: { hp: number; maxHp: number; monsterType: string; hurtFlash?: number }, id: string) => {
        living.push({ id, m });
      },
    );

    living.forEach(({ id, m }, i) => {
      seenM.add(id);
      const def = MONSTERS[m.monsterType as MonsterType];
      const visual = ENEMY_VISUALS[m.monsterType as MonsterType] || ENEMY_VISUALS[MonsterType.ScopeCreepBat];
      let c = this.monsters.get(id);
      if (!c) {
        const body = this.add
          .sprite(0, 0, `sheet_${visual.kind}_idle`, 0)
          .setOrigin(0.5)
          .setScale(visual.scale);
        if (visual.tint) body.setTint(visual.tint);
        body.play(visual.idle);
        const label = this.add.text(0, -66, def?.name || '?', px(10, '#ffffff')).setOrigin(0.5);
        const bar = this.add.graphics();
        const hp = this.add.text(0, 52, '', px(9, '#ffaaaa')).setOrigin(0.5);
        c = this.add.container(0, 0, [body, label, bar, hp]);
        this.monsters.set(id, c);
        this.monsterModes.set(id, 'idle');
      }

      // One row only; tighten spacing (and shrink sprites) as the party grows.
      const n = Math.max(1, living.length);
      const spacingX = n <= 2 ? 190 : n === 3 ? 165 : n === 4 ? 145 : 126;
      const x = STAGE.w / 2 - ((n - 1) * spacingX) / 2 + i * spacingX;
      c.setPosition(x, ENEMY_ROW_Y);

      const body = c.getAt(0) as Phaser.GameObjects.Sprite;
      const crowdScale = n >= 5 ? 0.8 : n === 4 ? 0.9 : 1;
      body.setScale(visual.scale * crowdScale);

      (c.getAt(1) as Phaser.GameObjects.Text).setVisible(n <= 3);
      (c.getAt(1) as Phaser.GameObjects.Text).setText(def?.name || '?');
      (c.getAt(3) as Phaser.GameObjects.Text).setText(`${Math.max(0, m.hp)}/${m.maxHp}`);
      const hurtUntil = m.hurtFlash || 0;
      const hurting = Date.now() < hurtUntil && m.hp > 0;
      const mode: 'idle' | 'hurt' | 'attack' = hurting
        ? 'hurt'
        : phase === 'enemy_turn' && m.hp > 0
          ? 'attack'
          : 'idle';

      const previous = this.monsterModes.get(id);
      if (mode === 'hurt' && previous !== 'hurt') {
        playEnemyAnim(body, visual, 'hurt');
        this.monsterModes.set(id, 'hurt');
      } else if (mode === 'attack' && previous !== 'attack' && previous !== 'hurt') {
        playEnemyAnim(body, visual, 'attack');
        this.monsterModes.set(id, 'attack');
      } else if (mode === 'idle' && previous !== 'idle' && previous !== 'hurt') {
        body.play(visual.idle, true);
        this.monsterModes.set(id, 'idle');
      } else if (mode === 'idle' && previous === 'hurt' && !hurting) {
        body.play(visual.idle, true);
        this.monsterModes.set(id, 'idle');
      } else if (mode === 'attack' && previous === 'hurt' && !hurting) {
        playEnemyAnim(body, visual, 'attack');
        this.monsterModes.set(id, 'attack');
      }

      if (hurting) {
        const pulse = Math.sin(Date.now() / 40) > 0;
        body.setTint(pulse ? 0xff2222 : visual.tint ?? 0xffffff);
        c.setScale(1.06);
      } else {
        if (visual.tint) body.setTint(visual.tint);
        else body.clearTint();
        body.setAlpha(m.hp <= 0 ? 0.35 : 1);
        c.setScale(1);
      }

      const bar = c.getAt(2) as Phaser.GameObjects.Graphics;
      bar.clear();
      drawBar(bar, -28, 36, 56, 7, m.maxHp ? Math.max(0, m.hp) / m.maxHp : 0, 0x00ff00);
      (c.getAt(3) as Phaser.GameObjects.Text).setText(`${Math.max(0, m.hp)}/${m.maxHp}`);
      (c.getAt(1) as Phaser.GameObjects.Text).setText(def?.name || '?');
    });

    for (const [id, spr] of this.monsters) {
      if (!seenM.has(id)) {
        spr.destroy();
        this.monsters.delete(id);
        this.monsterModes.delete(id);
      }
    }

    const seenP = new Set<string>();
    state.players?.forEach(
      (
        p: {
          x: number;
          y: number;
          colorIndex: number;
          name: string;
          gender?: string;
          inInspection: boolean;
          hp: number;
          maxHp: number;
        },
        id: string,
      ) => {
        if (!p.inInspection || id === getSessionId()) return;
        seenP.add(id);
        let c = this.remotes.get(id);
        if (!c) {
          const soul = this.add
            .polygon(0, 0, [0, -7, 7, 0, 0, 7, -7, 0], playerColor(p.gender, p.colorIndex))
            .setStrokeStyle(2, 0xffffff, 0.95);
          const label = this.add
            .text(0, -18, p.name, px(10, '#ffffff', { backgroundColor: '#000000aa', padding: { x: 3, y: 1 } }))
            .setOrigin(0.5);
          c = this.add.container(p.x, p.y, [soul, label]).setDepth(15);
          this.remotes.set(id, c);
        }
        c.setPosition(p.x, p.y);
        c.setVisible(true);
        const defeated = p.hp <= 0;
        const acted = !!(p as { actedThisTurn?: boolean }).actedThisTurn;
        const phaseNow = state.battlePhase || 'player_turn';
        const mark = defeated ? ' · KO' : phaseNow === 'player_turn' && acted ? ' ✓' : '';
        (c.getAt(1) as Phaser.GameObjects.Text)
          .setText(`${p.name}${mark}`)
          .setAlpha(defeated ? 0.65 : 1);
        (c.getAt(0) as Phaser.GameObjects.Polygon)
          .setAlpha(defeated ? 0.4 : 1)
          .setFillStyle(
          defeated
            ? 0x555555
            : phaseNow === 'enemy_turn'
            ? playerColor(p.gender, p.colorIndex)
            : acted
              ? 0x888888
              : playerColor(p.gender, p.colorIndex),
        );
      },
    );
    for (const [id, spr] of this.remotes) {
      if (!seenP.has(id)) {
        spr.destroy();
        this.remotes.delete(id);
      }
    }

    const seenB = new Set<string>();
    state.bullets?.forEach(
      (b: { id: string; x: number; y: number; radius: number }, id: string) => {
        seenB.add(id);
        let spr = this.bullets.get(id);
        if (!spr) {
          spr = this.add
            .circle(b.x, b.y, b.radius, 0xffffff)
            .setStrokeStyle(2, 0xff4444, 1)
            .setDepth(10);
          this.bullets.set(id, spr);
        }
        spr.setPosition(b.x, b.y);
        spr.setRadius(b.radius);
      },
    );
    for (const [id, spr] of this.bullets) {
      if (!seenB.has(id)) {
        spr.destroy();
        this.bullets.delete(id);
      }
    }
  }

  update() {
    const room = getRoom();
    const me = room?.state.players?.get(getSessionId());
    const now = Date.now();
    const phase = room?.state.battlePhase || 'player_turn';

    room?.state.monsters?.forEach(
      (m: { hurtFlash?: number; monsterType?: string; hp?: number }, id: string) => {
        const c = this.monsters.get(id);
        if (!c) return;
        const body = c.getAt(0) as Phaser.GameObjects.Sprite;
        const visual =
          ENEMY_VISUALS[(m.monsterType as MonsterType) || MonsterType.ScopeCreepBat] ||
          ENEMY_VISUALS[MonsterType.ScopeCreepBat];
        const hurtUntil = m.hurtFlash || 0;
        if (now < hurtUntil && (m.hp ?? 1) > 0) {
          const pulse = Math.sin(now / 35) > 0;
          body.setTint(pulse ? 0xff1a1a : visual.tint ?? 0xffffff);
          c.setScale(1.08);
        } else {
          if (visual.tint) body.setTint(visual.tint);
          else body.clearTint();
          c.setScale(1);
          if (this.monsterModes.get(id) === 'hurt') {
            const next = phase === 'enemy_turn' ? 'attack' : 'idle';
            playEnemyAnim(body, visual, next);
            this.monsterModes.set(id, next);
          }
        }
      },
    );

    if (!me?.inInspection || me.hp <= 0) return;
    if (room?.state.battlePhase !== 'enemy_turn') return;

    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
    if (dx || dy) sendInput({ type: 'move', dx, dy });
  }
}
