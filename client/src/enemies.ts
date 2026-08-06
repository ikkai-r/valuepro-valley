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

/**
 * FREE packs only include two creatures (Bat + Forest Enemy3).
 * We stretch those into four looks with different sheets / tints / scales.
 * Premium packs (Ghost Warrior, Evil Creature, Forest Enemy1/2) can slot in later.
 */
export const ENEMY_VISUALS: Record<MonsterType, EnemyVisual> = {
  // Forest Enemy3 — hover-fly loop, teal pest
  [MonsterType.TicketTick]: {
    kind: 'forest',
    scale: 1.25,
    tint: 0x4dd0e1,
    idle: 'forest_fly',
    hurt: 'forest_hurt',
    attack: 'forest_attack',
    attackLoop: 'forest_attack_loop',
  },
  // Dark Fantasy Bat — bite start, then looping dive attack
  [MonsterType.ScopeCreepBat]: {
    kind: 'bat',
    scale: 1.7,
    idle: 'bat_idle',
    hurt: 'bat_hurt',
    attack: 'bat_attack_bite',
    attackLoop: 'bat_attack',
  },
  // Forest Enemy3 — grounded idle, brown “beetle”
  [MonsterType.LegacyBugBeetle]: {
    kind: 'forest',
    scale: 1.55,
    tint: 0xd7ccc8,
    idle: 'forest_idle',
    hurt: 'forest_hurt',
    attack: 'forest_attack',
    attackLoop: 'forest_attack_loop',
  },
  // Forest Enemy3 — big red boss, alternate bat-style dive for variety
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
  scene.load.spritesheet('sheet_bat_attack1', '/assets/enemies/bat/Bat-Attack1.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_bat_attack2', '/assets/enemies/bat/Bat-Attack2.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_forest_idle', '/assets/enemies/forest/Enemy3-Idle.png', {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.load.spritesheet('sheet_forest_fly', '/assets/enemies/forest/Enemy3-Fly.png', {
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
  // Bat: IdleFly 9, Hurt 5, Attack1 8, Attack2 11
  ensureAnim(scene, 'bat_idle', 'sheet_bat_idle', 9, 10, -1);
  ensureAnim(scene, 'bat_hurt', 'sheet_bat_hurt', 5, 14, 0);
  ensureAnim(scene, 'bat_attack_bite', 'sheet_bat_attack1', 8, 14, 0);
  ensureAnim(scene, 'bat_attack', 'sheet_bat_attack2', 11, 14, -1);

  // Forest: Idle 8, Fly 8, Hit 4, SmashStart 12, SmashLoop 3
  ensureAnim(scene, 'forest_idle', 'sheet_forest_idle', 8, 10, -1);
  ensureAnim(scene, 'forest_fly', 'sheet_forest_fly', 8, 12, -1);
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
