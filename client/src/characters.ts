import Phaser from 'phaser';

export const CHAR_FRAME = 32;
export const CHAR_PALETTE_COUNT = 4;
export type CharGender = 'male' | 'female';
export type CharFacing = 'up' | 'down' | 'left' | 'right';

const FACINGS: CharFacing[] = ['down', 'up', 'left', 'right'];
const GENDERS: CharGender[] = ['male', 'female'];

/** colorIndex 0 keeps the original sheet; 1–3 are shirt remaps. */
const SHIRT_PALETTES: Array<{
  mid: [number, number, number];
  dark: [number, number, number];
  light: [number, number, number];
  accent: [number, number, number];
} | null> = [
  null,
  { mid: [25, 118, 210], dark: [13, 71, 161], light: [66, 165, 245], accent: [187, 222, 251] },
  { mid: [123, 31, 162], dark: [74, 20, 140], light: [171, 71, 188], accent: [225, 190, 231] },
  { mid: [239, 108, 0], dark: [191, 54, 12], light: [255, 167, 38], accent: [255, 224, 178] },
];

export function sheetKey(gender: CharGender, facing: CharFacing, colorIndex = 0) {
  const c = ((colorIndex % CHAR_PALETTE_COUNT) + CHAR_PALETTE_COUNT) % CHAR_PALETTE_COUNT;
  return c === 0 ? `char_${gender}_${facing}` : `char_${gender}_${facing}_c${c}`;
}

export function animKey(
  gender: CharGender,
  facing: CharFacing,
  moving: boolean,
  colorIndex = 0,
) {
  const c = ((colorIndex % CHAR_PALETTE_COUNT) + CHAR_PALETTE_COUNT) % CHAR_PALETTE_COUNT;
  const base = `char_${gender}_${facing}_${moving ? 'walk' : 'idle'}`;
  return c === 0 ? base : `${base}_c${c}`;
}

export function preloadCharacterSheets(scene: Phaser.Scene) {
  for (const gender of GENDERS) {
    for (const facing of FACINGS) {
      scene.load.spritesheet(
        sheetKey(gender, facing, 0),
        `/assets/characters/${gender}-nohat-walk-${facing}.png`,
        { frameWidth: CHAR_FRAME, frameHeight: CHAR_FRAME },
      );
    }
  }
}

function isSkin(r: number, g: number, b: number) {
  return r > 200 && g > 140 && g < 220 && b > 100 && b < 200;
}

function isOutline(r: number, g: number, b: number) {
  return r + g + b < 40;
}

function isBag(r: number, g: number, b: number) {
  return (
    (b > r + 15 && b > g) ||
    (r > 200 && g > 200 && b > 200) ||
    (Math.abs(r - g) < 20 && Math.abs(g - b) < 30 && r > 150 && b > 150)
  );
}

function maleShirtRole(r: number, g: number, b: number) {
  if (isSkin(r, g, b) || isOutline(r, g, b) || isBag(r, g, b)) return null;
  if (g > r + 40 && g > b + 40) return 'accent' as const;
  if (Math.abs(r - g) <= 30 && Math.abs(g - b) <= 35 && r >= 25 && r <= 100 && g >= 30 && g <= 110) {
    const v = r + g + b;
    if (v < 130) return 'dark' as const;
    if (v < 200) return 'mid' as const;
    return 'light' as const;
  }
  if (r > g + 20 && r > b && r > 80 && r < 160 && g < 100) return 'dark' as const;
  return null;
}

function femaleShirtRole(r: number, g: number, b: number) {
  if (isSkin(r, g, b) || isOutline(r, g, b) || isBag(r, g, b)) return null;
  if (!(r > g + 10 && r > b)) return null;
  const v = r + g + b;
  if (v < 160) return 'dark' as const;
  if (r > 160 && g < 60) return 'accent' as const;
  if (v > 320) return 'light' as const;
  return 'mid' as const;
}

function remapShirtPixels(
  src: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  width: number,
  height: number,
  gender: CharGender,
  palette: NonNullable<(typeof SHIRT_PALETTES)[number]>,
) {
  // Find opaque vertical span so head protection tracks each frame.
  let y0 = height;
  let y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (src[(y * width + x) * 4 + 3] >= 200) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (y0 > y1) {
    dest.set(src);
    return;
  }
  const headCut = y0 + Math.floor((y1 - y0 + 1) * 0.3);
  const roleFn = gender === 'male' ? maleShirtRole : femaleShirtRole;

  dest.set(src);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = src[i + 3];
      if (a < 200) continue;
      if (y < headCut) continue;
      // Keep female pigtail tips out of the shirt remap.
      if (gender === 'female' && y < headCut + 4 && (x < width * 0.28 || x > width * 0.72)) {
        continue;
      }
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const role = roleFn(r, g, b);
      if (!role) continue;
      const [nr, ng, nb] = palette[role];
      dest[i] = nr;
      dest[i + 1] = ng;
      dest[i + 2] = nb;
    }
  }
}

/** Build colorIndex 1–3 sheets from the original textures (call after preload). */
export function createShirtVariants(scene: Phaser.Scene) {
  for (const gender of GENDERS) {
    for (const facing of FACINGS) {
      const baseKey = sheetKey(gender, facing, 0);
      const base = scene.textures.get(baseKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const width = base.width;
      const height = base.height;

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = width;
      srcCanvas.height = height;
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.drawImage(base, 0, 0);
      const srcData = srcCtx.getImageData(0, 0, width, height);

      for (let colorIndex = 1; colorIndex < CHAR_PALETTE_COUNT; colorIndex++) {
        const palette = SHIRT_PALETTES[colorIndex];
        if (!palette) continue;
        const key = sheetKey(gender, facing, colorIndex);
        if (scene.textures.exists(key)) continue;

        const canvasTex = scene.textures.createCanvas(key, width, height);
        if (!canvasTex) continue;
        const ctx = canvasTex.getContext();
        const imageData = ctx.createImageData(width, height);
        remapShirtPixels(srcData.data, imageData.data, width, height, gender, palette);
        ctx.putImageData(imageData, 0, 0);
        canvasTex.refresh();

        // Slice into the same 32×32 frames as the source spritesheet.
        const cols = Math.floor(width / CHAR_FRAME);
        const rows = Math.floor(height / CHAR_FRAME);
        let frame = 0;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            canvasTex.add(
              frame,
              0,
              col * CHAR_FRAME,
              row * CHAR_FRAME,
              CHAR_FRAME,
              CHAR_FRAME,
            );
            frame += 1;
          }
        }
      }
    }
  }
}

export function createCharacterAnimations(scene: Phaser.Scene) {
  createShirtVariants(scene);

  for (const gender of GENDERS) {
    for (const facing of FACINGS) {
      for (let colorIndex = 0; colorIndex < CHAR_PALETTE_COUNT; colorIndex++) {
        const sheet = sheetKey(gender, facing, colorIndex);
        const walk = animKey(gender, facing, true, colorIndex);
        const idle = animKey(gender, facing, false, colorIndex);
        if (!scene.anims.exists(walk)) {
          scene.anims.create({
            key: walk,
            frames: scene.anims.generateFrameNumbers(sheet, { start: 0, end: 3 }),
            frameRate: 8,
            repeat: -1,
          });
        }
        if (!scene.anims.exists(idle)) {
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
}

export function playCharacterAnim(
  sprite: Phaser.GameObjects.Sprite,
  gender: string | undefined,
  facing: string | undefined,
  moving: boolean,
  colorIndex = 0,
) {
  const g: CharGender = gender === 'male' ? 'male' : 'female';
  const f: CharFacing =
    facing === 'up' || facing === 'left' || facing === 'right' ? facing : 'down';
  const key = animKey(g, f, moving, colorIndex);
  if (sprite.anims.currentAnim?.key === key) return;
  sprite.play(key, true);
}
