import type { CardDef, Printing } from './types.ts';

/**
 * Where each card template prints its rules text, as % of the image. Only standard-frame
 * printings use these; full-art printings put the text over the artwork instead.
 */
export const TEXT_BOX: Partial<Record<CardDef['kind'], { left: number; top: number; width: number; height: number }>> = {
  Pal: { left: 4.5, top: 68.5, width: 91, height: 19 },
  Gear: { left: 4.5, top: 68.5, width: 91, height: 16 },
  Event: { left: 4.5, top: 68.5, width: 91, height: 16 },
  Structure: { left: 51, top: 3.5, width: 46, height: 72 },
};

/** True if the printing uses the standard frame, so its text box is at TEXT_BOX. */
export const hasStandardFrame = (p: Printing) => p.frame !== 'fullArt';

/**
 * Fraction of parchment-coloured pixels in the text box. Standard frames score 0.45+,
 * full-art printings near 0 (measured over every printing, Oct 2026).
 */
export function parchmentFraction(
  rgba: Uint8Array | Buffer,
  width: number,
  height: number,
  box: { left: number; top: number; width: number; height: number },
): number {
  const x0 = Math.floor((width * box.left) / 100);
  const y0 = Math.floor((height * box.top) / 100);
  const x1 = Math.floor((width * (box.left + box.width)) / 100);
  const y1 = Math.floor((height * (box.top + box.height)) / 100);
  let beige = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      if (r >= 200 && r <= 250 && g >= 190 && g <= 245 && b >= 165 && b <= 230 && r - b < 45) beige++;
      total++;
    }
  }
  return total ? beige / total : 0;
}

export const FULL_ART_THRESHOLD = 0.4;
