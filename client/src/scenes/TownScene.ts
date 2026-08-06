import Phaser from 'phaser';
import { COFFEE_COST, JOBS, LOTS, MAP, NPCS, PLAYER_COLORS, TILE, Tool } from '@shared/index';
import { playCharacterAnim } from '../characters';
import { npcTextureKey } from '../npcs';
import { getRoom, getSessionId, sendInput } from '../net';
import { Ground, House, fillGrass, fillPathNetwork, placeBuilding, placeTree, tileAt } from '../tiles';
import { PIXEL_FONT, px } from '../ui/font';

const FEMALE_COLORS = [0xec407a, 0xab47bc, 0x26a69a, 0xffa726];
const MALE_COLORS = [0x42a5f5, 0x66bb6a, 0x8d6e63, 0x5c6bc0];
const CHAR_SCALE = 2;
const NPC_SCALE = 2;

/** Hotbar slots 1-6 come from the room — each valley stocks a random set. */
export function hotbarGifts(): string[] {
  const slots = getRoom()?.state?.giftSlots;
  if (!slots) return [];
  return Array.from(slots as Iterable<string>);
}

function playerColor(gender: string | undefined, colorIndex: number) {
  const palette = gender === 'male' ? MALE_COLORS : FEMALE_COLORS;
  return palette[colorIndex % palette.length] || PLAYER_COLORS[0];
}

export class TownScene extends Phaser.Scene {
  private localSprite!: Phaser.GameObjects.Sprite;
  private localLabel!: Phaser.GameObjects.Text;
  private remoteSprites = new Map<string, Phaser.GameObjects.Container>();
  private lastPos = new Map<string, { x: number; y: number }>();
  private npcSprites = new Map<string, Phaser.GameObjects.Container>();
  private bedSprites = new Map<string, Phaser.GameObjects.Container>();
  private bedsLabel?: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private marker!: Phaser.GameObjects.Rectangle;
  private doorHint!: Phaser.GameObjects.Container;
  private doorHintText!: Phaser.GameObjects.Text;
  private giftItem = '';

  constructor() {
    super('Town');
  }

  create() {
    const room = getRoom();
    if (!room) {
      this.scene.start('Menu');
      return;
    }

    this.cameras.main.setBounds(0, 0, MAP.widthTiles * TILE, MAP.heightTiles * TILE);
    this.updateCameraZoom();
    this.scale.on('resize', this.updateCameraZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.updateCameraZoom, this);
    });
    this.drawWorld();
    this.drawNpcs();

    this.localSprite = this.add
      .sprite(10 * TILE, 12.5 * TILE, 'char_female_down', 1)
      .setScale(CHAR_SCALE)
      .setOrigin(0.5, 0.75)
      .setDepth(200);
    this.localLabel = this.add
      .text(10 * TILE, 12.5 * TILE - 28, '', px(11, '#e3f2fd'))
      .setOrigin(0.5)
      .setDepth(201);
    playCharacterAnim(this.localSprite, 'female', 'down', false, 0);
    this.cameras.main.startFollow(this.localSprite, true, 0.12, 0.12);

    this.marker = this.add
      .rectangle(0, 0, TILE, TILE)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setFillStyle(0xffffff, 0.04)
      .setDepth(20);

    // Small pulsing doorstep marker; the E prompt appears only when close.
    const outerGlow = this.add
      .ellipse(0, 0, 42, 18, 0xffd54f, 0.28)
      .setStrokeStyle(2, 0xfff3b0, 0.8);
    const doorstep = this.add.rectangle(0, 0, 28, 9, 0xffc107, 0.8);
    this.doorHintText = this.add
      .text(0, -20, 'E ENTER', {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: '#fff8d5',
        backgroundColor: '#3c1d18cc',
        padding: { x: 4, y: 2 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.doorHint = this.add
      .container(0, 0, [outerGlow, doorstep, this.doorHintText])
      .setVisible(false)
      .setDepth(50);
    this.tweens.add({
      targets: outerGlow,
      alpha: { from: 0.25, to: 0.75 },
      scaleX: { from: 0.85, to: 1.15 },
      scaleY: { from: 0.85, to: 1.15 },
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    const selectSlot = (index: number) => {
      const id = hotbarGifts()[index];
      if (id) this.selectGift(id);
    };
    this.input.keyboard!.on('keydown-ONE', () => selectSlot(0));
    this.input.keyboard!.on('keydown-TWO', () => selectSlot(1));
    this.input.keyboard!.on('keydown-THREE', () => selectSlot(2));
    this.input.keyboard!.on('keydown-FOUR', () => selectSlot(3));
    this.input.keyboard!.on('keydown-FIVE', () => selectSlot(4));
    this.input.keyboard!.on('keydown-SIX', () => selectSlot(5));
    this.input.keyboard!.on('keydown-E', () => sendInput({ type: 'interact' }));
    this.input.keyboard!.on('keydown-SPACE', () => sendInput({ type: 'attack' }));
    this.input.keyboard!.on('keydown-B', () => sendInput({ type: 'sleep' }));
    this.input.keyboard!.on('keydown-G', () => this.giftNearest());
    this.input.keyboard!.on('keydown-H', () => {
      const slots = hotbarGifts();
      if (!slots.length) return;
      const i = (slots.indexOf(this.giftItem) + 1) % slots.length;
      this.selectGift(slots[i]);
    });

    room.onStateChange(() => {
      this.syncFromState();
      const me = room.state.players?.get(getSessionId());
      if (me?.inInspection && !this.scene.isActive('Inspection')) {
        this.scene.sleep('Town');
        this.scene.launch('Inspection');
      } else if (me && !me.inInspection && this.scene.isActive('Inspection')) {
        this.scene.stop('Inspection');
        this.scene.wake('Town');
      }
    });
    room.onMessage('festival', () => this.game.events.emit('festival'));

    this.syncFromState();
    const firstSlot = hotbarGifts()[0];
    if (firstSlot) this.selectGift(firstSlot);
  }

  /** The highlighted slot is what G sends — nothing else to switch. */
  private selectGift(itemId: string) {
    this.giftItem = itemId;
    sendInput({ type: 'setTool', tool: Tool.Gift });
    this.game.events.emit('hud', { giftItem: itemId });
  }

  private updateCameraZoom() {
    const rawZoom = Math.min(this.scale.width / 800, this.scale.height / 560);
    const zoom = Phaser.Math.Clamp(Math.round(rawZoom * 4) / 4, 1.25, 2);
    this.cameras.main.setZoom(zoom);
  }

  private drawWorld() {
    // Textured grass from the tileset
    fillGrass(this, 0, 0, MAP.widthTiles - 1, MAP.heightTiles - 1, 0);

    // Connected grass-edged dirt road: main street, Big House spur, and plaza.
    const pathCells = new Map<string, [number, number]>();
    const addPath = (x: number, y: number) => pathCells.set(`${x},${y}`, [x, y]);
    for (let y = 12; y <= 13; y++) {
      for (let x = 2; x <= 37; x++) addPath(x, y);
    }
    for (let y = 2; y <= 13; y++) {
      for (let x = 19; x <= 21; x++) addPath(x, y);
    }
    for (let x = 14; x <= 28; x++) addPath(x, 11);
    fillPathNetwork(this, [...pathCells.values()], 1);

    // Complete 2×3 trees from the tileset, spread around map edges and clearings.
    for (const tree of MAP.trees) {
      placeTree(this, tree.x, tree.y);
    }

    // Smaller decor fills remaining clearings.
    const decor: Array<[number, number, number]> = [
      [3, 8, Ground.bush],
      [5, 9, Ground.bushBerry],
      [7, 15, Ground.flowerBlue],
      [9, 8, Ground.bushSmall],
      [13, 15, Ground.flowerPink],
      [15, 16, Ground.rock],
      [22, 15, Ground.bush],
      [27, 9, Ground.bushBerry],
      [29, 8, Ground.flowerWhite],
      [33, 12, Ground.rockSmall],
      [35, 14, Ground.pebbles],
      [36, 18, Ground.bush],
      [2, 18, Ground.stump],
      [11, 17, Ground.flowerWhite],
    ];
    for (const [tx, ty, frame] of decor) {
      tileAt(this, 'ground', frame, tx * TILE, ty * TILE, 3);
    }

    // Buildings — tile-aligned, clear of the road, and solid server-side
    for (const building of MAP.buildings) {
      const frames = building.large ? House.large.frames : House.small.frames;
      placeBuilding(this, frames, building.tileX, building.tileY);
      this.label(
        (building.tileX + building.tilesW / 2) * TILE,
        (building.tileY - 0.4) * TILE,
        building.name,
      );
      if (building.id === 'standup_cafe') {
        const counter = MAP.cafeCounter;
        this.add
          .ellipse(counter.x, counter.y, 46, 24, 0xffe082, 0.22)
          .setDepth(3);
        this.add
          .text(counter.x, counter.y - 20, `E · COFFEE $${COFFEE_COST}`, {
            fontFamily: PIXEL_FONT,
            fontSize: '9px',
            color: '#ffe082',
            backgroundColor: '#00000099',
            padding: { x: 3, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(40);
      }
    }

    // Help Wanted board — sign post with labels sitting directly on top of it.
    tileAt(this, 'house', House.sign, MAP.jobBoard.x - 16, MAP.jobBoard.y - 16, 8);
    this.add
      .text(MAP.jobBoard.x, MAP.jobBoard.y - 26, 'HELP WANTED', {
        fontFamily: PIXEL_FONT,
        fontSize: '10px',
        color: '#fff8e1',
        backgroundColor: '#4e8d43dd',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.add
      .text(MAP.jobBoard.x, MAP.jobBoard.y + 16, 'E', {
        fontFamily: PIXEL_FONT,
        fontSize: '9px',
        color: '#ffe082',
        backgroundColor: '#00000099',
        padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(40);

    // Bunk area label — beds themselves spawn per joined player in syncFromState.
    this.bedsLabel = this.add
      .text(3 * TILE, 9.4 * TILE, 'Bunks', {
        fontFamily: PIXEL_FONT,
        fontSize: '11px',
        color: '#fff8e1',
        backgroundColor: '#00000066',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);

    for (const lot of LOTS) {
      const tileX = Math.round(lot.x / TILE);
      const tileY = Math.round(lot.y / TILE);
      if (lot.id === 'big_house') {
        placeBuilding(this, House.large.frames, tileX, tileY);
      } else {
        placeBuilding(this, House.small.frames, tileX, tileY);
      }
      this.label(lot.x + lot.w / 2, lot.y - 8, lot.name);
      this.add.rectangle(lot.x + lot.w / 2, lot.y + lot.h + 6, 18, 8, 0xffcc80).setDepth(9);
    }

    this.add
      .text(8, MAP.heightTiles * TILE - 14, 'Tiles: Lakiiah (itch.io)', px(10, '#a5d6a7'))
      .setDepth(30);
  }

  private label(x: number, y: number, text: string) {
    this.add
      .text(x, y, text, {
        fontFamily: PIXEL_FONT,
        fontSize: '11px',
        color: '#fff8e1',
        backgroundColor: '#00000066',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(40);
  }

  private drawNpcs() {
    for (const npc of NPCS) {
      const key = npcTextureKey(npc.id);
      const body = this.textures.exists(key)
        ? this.add.image(0, 0, key).setScale(NPC_SCALE).setOrigin(0.5, 0.85)
        : this.add.circle(0, 0, 12, npc.color);
      const label = this.add
        .text(0, -28, npc.name, {
          fontFamily: PIXEL_FONT,
          fontSize: '10px',
          color: '#fff',
          align: 'center',
        })
        .setOrigin(0.5);
      const c = this.add.container(npc.x, npc.y, [body, label]).setDepth(100 + npc.y);
      this.npcSprites.set(npc.id, c);
    }
  }

  private giftNearest() {
    const room = getRoom();
    if (!room) return;
    const me = room.state.players?.get(getSessionId());
    if (!me) return;
    let best: string | null = null;
    let bestD = 48;
    for (const npc of NPCS) {
      const d = Phaser.Math.Distance.Between(me.x, me.y, npc.x, npc.y);
      if (d < bestD) {
        bestD = d;
        best = npc.id;
      }
    }
    if (best) sendInput({ type: 'gift', npcId: best, itemId: this.giftItem });
  }

  private syncFromState() {
    const room = getRoom();
    if (!room?.state) return;
    const state = room.state;

    if (!this.giftItem) {
      const firstSlot = hotbarGifts()[0];
      if (firstSlot) this.selectGift(firstSlot);
    }

    const seen = new Set<string>();
    const seenBeds = new Set<string>();
    state.players?.forEach(
      (
        p: {
          x: number;
          y: number;
          colorIndex: number;
          name: string;
          gender?: string;
          facing?: string;
          inInspection: boolean;
          sleeping: boolean;
          bedSlot?: number;
        },
        id: string,
      ) => {
        seen.add(id);
        const tint = playerColor(p.gender, p.colorIndex);
        this.syncBed(id, p.name, p.bedSlot ?? -1, tint, !!p.sleeping);
        if ((p.bedSlot ?? -1) >= 0) seenBeds.add(id);

        const prev = this.lastPos.get(id);
        const moving = !!prev && (Math.abs(prev.x - p.x) > 0.4 || Math.abs(prev.y - p.y) > 0.4);
        this.lastPos.set(id, { x: p.x, y: p.y });

        if (id === getSessionId()) {
          if (!p.inInspection) {
            this.localSprite.setPosition(p.x, p.y);
            this.localSprite.setDepth(100 + p.y);
            this.localSprite.setVisible(!p.sleeping);
            this.localLabel.setPosition(p.x, p.y - 28).setText(p.name).setDepth(101 + p.y);
            this.localLabel.setVisible(!p.sleeping);
            playCharacterAnim(
              this.localSprite,
              p.gender,
              p.facing,
              moving && !p.sleeping,
              p.colorIndex,
            );
          } else {
            this.localSprite.setVisible(false);
            this.localLabel.setVisible(false);
          }
          return;
        }
        let c = this.remoteSprites.get(id);
        if (!c) {
          const body = this.add
            .sprite(0, 0, 'char_female_down', 1)
            .setScale(CHAR_SCALE)
            .setOrigin(0.5, 0.75);
          const label = this.add.text(0, -28, p.name, px(11, '#e3f2fd')).setOrigin(0.5);
          c = this.add.container(p.x, p.y, [body, label]);
          this.remoteSprites.set(id, c);
        }
        const body = c.getAt(0) as Phaser.GameObjects.Sprite;
        playCharacterAnim(body, p.gender, p.facing, moving && !p.sleeping, p.colorIndex);
        c.setPosition(p.x, p.y);
        c.setDepth(100 + p.y);
        c.setVisible(!p.inInspection && !p.sleeping);
        (c.getAt(1) as Phaser.GameObjects.Text).setText(p.name);
      },
    );
    for (const [id, spr] of this.remoteSprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.remoteSprites.delete(id);
        this.lastPos.delete(id);
      }
    }
    for (const [id, spr] of this.bedSprites) {
      if (!seenBeds.has(id)) {
        spr.destroy();
        this.bedSprites.delete(id);
      }
    }
    this.bedsLabel?.setVisible(this.bedSprites.size > 0);

    this.game.events.emit('state', state);

    const job = JOBS.find((j) => j.id === state.activeJobId);
    const lot = LOTS.find((l) => l.id === job?.lotId);
    if (lot && state.activeJobId && !state.inspectionActive) {
      const dx = lot.x + lot.w / 2;
      const dy = lot.y + lot.h + 10;
      const me = state.players?.get?.(getSessionId());
      const nearDoor = !!me && Phaser.Math.Distance.Between(me.x, me.y, dx, dy) <= 44;
      this.doorHintText.setVisible(nearDoor);
      this.doorHint.setPosition(dx, dy).setVisible(true);
    } else {
      this.doorHint.setVisible(false);
    }
  }

  private syncBed(playerId: string, name: string, bedSlot: number, tint: number, sleeping: boolean) {
    if (bedSlot < 0 || bedSlot >= MAP.bedSlots.length) {
      const old = this.bedSprites.get(playerId);
      if (old) {
        old.destroy();
        this.bedSprites.delete(playerId);
      }
      return;
    }
    const bunk = MAP.bedSlots[bedSlot];
    let c = this.bedSprites.get(playerId);
    if (!c) {
      const mattress = this.add.image(0, 0, 'bed');
      const pillowTint = this.add.circle(-8, -2, 4, tint).setAlpha(0.85);
      const label = this.add.text(0, -18, name, px(10, '#fffde7')).setOrigin(0.5);
      const hint = this.add.text(0, 16, 'E rest', px(9, '#ffe082')).setOrigin(0.5);
      c = this.add.container(bunk.x, bunk.y, [mattress, pillowTint, label, hint]).setDepth(8);
      this.bedSprites.set(playerId, c);
    }
    c.setPosition(bunk.x, bunk.y);
    (c.getAt(1) as Phaser.GameObjects.Arc).setFillStyle(tint);
    (c.getAt(2) as Phaser.GameObjects.Text).setText(sleeping ? `${name} (zzz)` : name);
    (c.getAt(3) as Phaser.GameObjects.Text).setVisible(playerId === getSessionId() && !sleeping);
  }

  update() {
    const room = getRoom();
    if (!room) return;
    const me = room.state.players?.get(getSessionId());
    if (me?.inInspection || me?.sleeping) return;

    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
    if (dx || dy) sendInput({ type: 'move', dx, dy });

    if (me) {
      this.marker.setPosition(Math.floor(me.x / TILE) * TILE + 16, Math.floor(me.y / TILE) * TILE + 16);
    }
  }
}
