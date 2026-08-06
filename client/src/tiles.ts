import type Phaser from 'phaser';
import { TILE } from '@shared/index';

/** Source tile size in the Lakiiah cozy pack. */
export const SRC = 16;

/**
 * Ground sheet is 16 columns.
 * Grass block (textured tufts): 17–19 / 33–34 / 49–51
 * 12–14 / 28–30 / 44–46 = grass-edged sand path (3×3)
 */
export const Ground = {
  cols: 16,
  /** Interior grass tiles with tuft detail (skip edge tiles 20/36/52 and blank 35). */
  grassVariants: [17, 18, 19, 33, 34, 49, 50, 51] as const,
  grass: 34,
  path: 29,
  pathTiles: {
    topLeft: 12,
    top: 13,
    topRight: 14,
    left: 28,
    centre: 29,
    right: 30,
    bottomLeft: 44,
    bottom: 45,
    bottomRight: 46,
  },
  bush: 74,
  bushBerry: 75,
  bushSmall: 76,
  rock: 91,
  rockSmall: 92,
  pebbles: 90,
  flowerBlue: 106,
  flowerPink: 107,
  flowerWhite: 108,
  stump: 111,
  /** Full tree is 2×3 tiles; the previous 2×2 crop omitted its canopy. */
  tree: [
    [77, 78],
    [93, 94],
    [109, 110],
  ] as const,
} as const;

/** House sheet: 28 columns. */
export const House = {
  cols: 28,
  sign: 36,
  crate: 37,
  barrel: 38,
  /** Large teal-roof house — 4×6, top-left = 31 */
  large: {
    w: 4,
    h: 6,
    frames: [
      [31, 32, 33, 34],
      [59, 60, 61, 62],
      [87, 88, 89, 90],
      [115, 116, 117, 118],
      [143, 144, 145, 146],
      [171, 172, 173, 174],
    ],
  },
  /** Small red-roof house — 4×4, top-left = 92 */
  small: {
    w: 4,
    h: 4,
    frames: [
      [92, 93, 94, 95],
      [120, 121, 122, 123],
      [148, 149, 150, 151],
      [176, 177, 178, 179],
    ],
  },
} as const;

export function tileAt(
  scene: Phaser.Scene,
  sheet: 'ground' | 'house',
  frame: number,
  worldX: number,
  worldY: number,
  depth = 0,
): Phaser.GameObjects.Image {
  const img = scene.add.image(worldX, worldY, sheet, frame);
  img.setDisplaySize(TILE, TILE);
  img.setOrigin(0, 0);
  img.setDepth(depth);
  return img;
}

/** Place a multi-tile building; depth sorts by foot of building. */
export function placeBuilding(
  scene: Phaser.Scene,
  frames: readonly (readonly number[])[],
  tileX: number,
  tileY: number,
) {
  const foot = (tileY + frames.length) * TILE;
  for (let r = 0; r < frames.length; r++) {
    for (let c = 0; c < frames[r].length; c++) {
      tileAt(scene, 'house', frames[r][c], (tileX + c) * TILE, (tileY + r) * TILE, foot);
    }
  }
  return { x: tileX * TILE, y: tileY * TILE, w: frames[0].length * TILE, h: frames.length * TILE, foot };
}

/** Paint a solid rectangle of the same frame (seamless fill). */
export function fillRect(
  scene: Phaser.Scene,
  sheet: 'ground' | 'house',
  frame: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  depth = 0,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      tileAt(scene, sheet, frame, x * TILE, y * TILE, depth);
    }
  }
}

/** Fill with textured grass variants from the tileset (continuous, not flat). */
export function fillGrass(
  scene: Phaser.Scene,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  depth = 0,
) {
  const variants = Ground.grassVariants;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const frame = variants[(x * 7 + y * 13) % variants.length];
      tileAt(scene, 'ground', frame, x * TILE, y * TILE, depth);
    }
  }
}

/** Draw connected paths with grass edges, corners, intersections, and sparse stone detail. */
export function fillPathNetwork(
  scene: Phaser.Scene,
  coordinates: ReadonlyArray<readonly [number, number]>,
  depth = 1,
) {
  const cells = new Set(coordinates.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  const p = Ground.pathTiles;

  for (const [x, y] of coordinates) {
    const up = has(x, y - 1);
    const down = has(x, y + 1);
    const left = has(x - 1, y);
    const right = has(x + 1, y);
    let frame: number = p.centre;

    if (!up && !left) frame = p.topLeft;
    else if (!up && !right) frame = p.topRight;
    else if (!down && !left) frame = p.bottomLeft;
    else if (!down && !right) frame = p.bottomRight;
    else if (!up) frame = p.top;
    else if (!down) frame = p.bottom;
    else if (!left) frame = p.left;
    else if (!right) frame = p.right;

    tileAt(scene, 'ground', frame, x * TILE, y * TILE, depth);

    // The source centre tile is intentionally quiet; add sparse transparent pebbles.
    if (frame === p.centre && (x * 11 + y * 17) % 9 === 0) {
      tileAt(scene, 'ground', Ground.pebbles, x * TILE, y * TILE, depth + 1);
    }
  }
}

/** Place the complete 2×3 tree and depth-sort it by the base of its trunk. */
export function placeTree(scene: Phaser.Scene, tileX: number, tileY: number) {
  const foot = (tileY + Ground.tree.length) * TILE;
  for (let row = 0; row < Ground.tree.length; row++) {
    for (let col = 0; col < Ground.tree[row].length; col++) {
      tileAt(
        scene,
        'ground',
        Ground.tree[row][col],
        (tileX + col) * TILE,
        (tileY + row) * TILE,
        foot,
      );
    }
  }
}
