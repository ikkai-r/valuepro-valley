import Phaser from 'phaser';
import { SRC } from '../tiles';
import { createEnemyAnimations, preloadEnemySheets } from '../enemies';
import { createCharacterAnimations, preloadCharacterSheets } from '../characters';
import { preloadNpcSheets } from '../npcs';

/** Load cozy tileset + enemy combat sheets + placeholders for characters/UI. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.spritesheet('ground', '/assets/tiles/ground.png', {
      frameWidth: SRC,
      frameHeight: SRC,
    });
    this.load.spritesheet('house', '/assets/tiles/house.png', {
      frameWidth: SRC,
      frameHeight: SRC,
    });
    preloadEnemySheets(this);
    preloadCharacterSheets(this);
    preloadNpcSheets(this);
  }

  async create() {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('16px "Pixelify Sans"'),
          document.fonts.load('24px "Press Start 2P"'),
        ]),
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
    } catch {
      // Fall back to system monospace if fonts fail to load
    }

    createEnemyAnimations(this);
    createCharacterAnimations(this);

    const g = this.make.graphics({ x: 0, y: 0 }, false);

    const makeCircle = (key: string, color: number, r: number) => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillCircle(r, r, r);
      g.lineStyle(2, 0x000000, 0.35);
      g.strokeCircle(r, r, r);
      g.generateTexture(key, r * 2, r * 2);
    };

    const makeRect = (key: string, color: number, w: number, h: number) => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillRoundedRect(0, 0, w, h, 4);
      g.generateTexture(key, w, h);
    };

    makeCircle('player', 0x4caf50, 12);
    makeCircle('npc', 0xffb74d, 12);
    makeRect('tile_tilled', 0x6d4c41, 32, 32);
    makeRect('tile_watered', 0x5d4037, 32, 32);
    makeRect('tile_growing', 0x8bc34a, 32, 32);
    makeRect('tile_ready', 0xffeb3b, 32, 32);
    this.makeBedTexture(g);
    makeRect('heart', 0xe91e63, 10, 10);
    makeRect('swing', 0xffecb3, 28, 8);

    g.destroy();
    this.scene.start('Menu');
  }

  /** Simple procedural bunk — no custom PNG required. */
  private makeBedTexture(g: Phaser.GameObjects.Graphics) {
    g.clear();
    g.fillStyle(0x6d4c41, 1);
    g.fillRoundedRect(0, 4, 32, 20, 3);
    g.fillStyle(0x90caf9, 1);
    g.fillRoundedRect(2, 6, 28, 14, 2);
    g.fillStyle(0xfff3e0, 1);
    g.fillRoundedRect(3, 7, 10, 10, 2);
    g.lineStyle(2, 0x3e2723, 0.85);
    g.strokeRoundedRect(0, 4, 32, 20, 3);
    g.generateTexture('bed', 32, 24);
  }
}
