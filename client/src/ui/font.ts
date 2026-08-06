/** Pixel UI font used across ValuePro Valley. */
export const PIXEL_FONT = '"Pixelify Sans", monospace';
export const PIXEL_TITLE_FONT = '"Press Start 2P", "Pixelify Sans", monospace';

type TextExtras = Record<string, unknown>;

export function px(fontSize: string | number, color: string, extras: TextExtras = {}) {
  return {
    fontFamily: PIXEL_FONT,
    fontSize: typeof fontSize === 'number' ? `${fontSize}px` : fontSize,
    color,
    ...extras,
  };
}

export function pxTitle(fontSize: string | number, color: string, extras: TextExtras = {}) {
  return {
    fontFamily: PIXEL_TITLE_FONT,
    fontSize: typeof fontSize === 'number' ? `${fontSize}px` : fontSize,
    color,
    ...extras,
  };
}
