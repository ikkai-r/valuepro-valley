import Phaser from 'phaser';

export const CHAR_FRAME = 32;
export type CharGender = 'male' | 'female';
export type CharFacing = 'up' | 'down' | 'left' | 'right';

const FACINGS: CharFacing[] = ['down', 'up', 'left', 'right'];
const GENDERS: CharGender[] = ['male', 'female'];

export function sheetKey(gender: CharGender, facing: CharFacing) {
  return `char_${gender}_${facing}`;
}

export function animKey(gender: CharGender, facing: CharFacing, moving: boolean) {
  return `char_${gender}_${facing}_${moving ? 'walk' : 'idle'}`;
}

export function preloadCharacterSheets(scene: Phaser.Scene) {
  for (const gender of GENDERS) {
    for (const facing of FACINGS) {
      scene.load.spritesheet(
        sheetKey(gender, facing),
        `/assets/characters/${gender}-nohat-walk-${facing}.png`,
        { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME },
      );
    }
  }
}

export function createCharacterAnimations(scene: Phaser.Scene) {
  for (const gender of GENDERS) {
    for (const facing of FACINGS) {
      const sheet = sheetKey(gender, facing);
      const walk = animKey(gender, facing, true);
      const idle = animKey(gender, facing, false);
      if (!scene.anims.exists(walk)) {
        scene.anims.create({
          key: walk,
          frames: scene.anims.generateFrameNumbers(sheet, { start: 0, end: 3 }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (!scene.anims.exists(idle)) {
        // Stand frame is index 1 on every extracted sheet.
        scene.anims.create({
          key: idle,
          frames: [{ key: sheet, frame: 1 }],
          frameRate: 1,
          repeat: 0,
        });
      }
    }
  }
}

export function playCharacterAnim(
  sprite: Phaser.GameObjects.Sprite,
  gender: string | undefined,
  facing: string | undefined,
  moving: boolean,
) {
  const g: CharGender = gender === 'male' ? 'male' : 'female';
  const f: CharFacing =
    facing === 'up' || facing === 'left' || facing === 'right' ? facing : 'down';
  const key = animKey(g, f, moving);
  if (sprite.anims.currentAnim?.key === key) return;
  sprite.play(key, true);
}
