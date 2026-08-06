import Phaser from 'phaser';
import { MonsterType } from '@shared/index';

/** 64×64 free enemy packs: Dark Fantasy Bat (VFX) + Flying Forest Enemy3 (VFX hit). */
export const ENEMY_FRAME = 64;

export type EnemyKind = 'bat' | 'forest';

export interface EnemyVisual {
  kind: EnemyKind;
  scale: number;
  tint?: number;
  idle: string;
  hurt: string;
  attack: string;
  /** Optional follow-up loop after attack start. */
  attackLoop?: string;
}

export const ENEMY_VISUALS: Record<MonsterType, EnemyVisual> = {
  [MonsterType.ScopeCreepBat]: {
    kind: 'bat',
    scale: 1.6,
    idle: 'bat_idle',
    hurt: 'bat_hurt',
    attack: 'bat_attack',
  },
  [MonsterType.SpreadsheetSlime]: {
    kind: 'forest',
    scale: 1.45,
    tint: 0x8bc34a,
    idle: 'forest_idle',
    hurt: 'forest_hurt',
    attack: 'forest_attack',
    attackLoop: 'forest_attack_loop',
  },
  [MonsterType.LegacyBugBeetle]: {
    kind: 'forest',
    scale: 1.55,
    tint: 0xd7ccc8,
    idle: 'forest_idle',
    hurt: 'forest_hurt',
    attack: 'forest_attack',
    attackLoop: 'forest_attack_loop',
  },
  [MonsterType.AtticBoss]: {
    kind: 'forest',
    scale: 2.35,
    tint: 0xff8a80,
    idle: 'forest_idle',
    hurt: 'forest_hurt',
    attack: 'forest_attack',
    attackLoop: 'forest_attack_loop',
  },
};

export function preloadEnemySheets(scene: Phaser.Scene) {
  const fw = ENEMY_FRAME;
  const fh = ENEMY_FRAME;
  scene.load.spritesheet('sheet_bat_idle', '/assets/enemies/bat/Bat-IdleFly.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_bat_hurt', '/assets/enemies/bat/Bat-Hurt.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_bat_attack', '/assets/enemies/bat/Bat-Attack2.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_forest_idle', '/assets/enemies/forest/Enemy3-Idle.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_forest_hurt', '/assets/enemies/forest/Enemy3-Hit.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_forest_attack', '/assets/enemies/forest/Enemy3-AttackSmashStart.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet(
    'sheet_forest_attack_loop',
    '/assets/enemies/forest/Enemy3-AttackSmashLoop.png',
    { frameWidth: fw, frameHeight: fh },
  );
}

function ensureAnim(
  scene: Phaser.Scene,
  key: string,
  sheet: string,
  frameCount: number,
  frameRate: number,
  repeat: number,
) {
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers(sheet, { start: 0, end: frameCount - 1 }),
    frameRate,
    repeat,
  });
}

export function createEnemyAnimations(scene: Phaser.Scene) {
  // Bat IdleFly 576/64=9, Hurt 320/64=5, Attack2 704/64=11
  ensureAnim(scene, 'bat_idle', 'sheet_bat_idle', 9, 10, -1);
  ensureAnim(scene, 'bat_hurt', 'sheet_bat_hurt', 5, 14, 0);
  ensureAnim(scene, 'bat_attack', 'sheet_bat_attack', 11, 14, 0);

  // Forest Idle 8, Hit 4, SmashStart 12, SmashLoop 3
  ensureAnim(scene, 'forest_idle', 'sheet_forest_idle', 8, 10, -1);
  ensureAnim(scene, 'forest_hurt', 'sheet_forest_hurt', 4, 14, 0);
  ensureAnim(scene, 'forest_attack', 'sheet_forest_attack', 12, 14, 0);
  ensureAnim(scene, 'forest_attack_loop', 'sheet_forest_attack_loop', 3, 12, -1);
}

export function playEnemyAnim(
  sprite: Phaser.GameObjects.Sprite,
  visual: EnemyVisual,
  mode: 'idle' | 'hurt' | 'attack',
) {
  const current = sprite.anims.currentAnim?.key;

  if (mode === 'hurt') {
    if (current === visual.hurt) return;
    sprite.play(visual.hurt, true);
    return;
  }

  if (mode === 'attack') {
    if (current === visual.attack || current === visual.attackLoop) return;
    sprite.play(visual.attack, true);
    if (visual.attackLoop) {
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + visual.attack, () => {
        if (sprite.active) sprite.play(visual.attackLoop!, true);
      });
    }
    return;
  }

  // idle
  if (current === visual.idle) return;
  sprite.play(visual.idle, true);
}
