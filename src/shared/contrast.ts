/**
 * Text contrast against the effective backdrop. The backdrop is found by
 * compositing ancestor background colours over a white canvas; background
 * images can't be sampled, so their presence marks the result approximate.
 */

import { blend, contrastRatio, parseColor, toHex, type Rgba } from './color';

export interface BackdropLayer {
  color?: string;
  hasImage?: boolean;
}

export interface ContrastResult {
  ratio: number;
  foreground: string;
  background: string;
  /** Large text needs only 3:1 under WCAG AA. */
  largeText: boolean;
  passesAA: boolean;
  /** True when a background image sits behind the text, so the backdrop colour is a guess. */
  approximate: boolean;
}

const CANVAS: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

/**
 * @param layers backdrop layers from the element itself outwards to the root.
 */
export function evaluateContrast(
  foreground: string,
  layers: BackdropLayer[],
  fontSizePx: number,
  fontWeight: number,
): ContrastResult | null {
  const fg = parseColor(foreground);
  if (!fg || fg.a === 0) return null;

  let approximate = false;
  // Only layers up to (and including) the first opaque one are visible.
  const visible: Rgba[] = [];
  for (const layer of layers) {
    if (layer.hasImage) approximate = true;
    const color = layer.color ? parseColor(layer.color) : null;
    if (!color || color.a === 0) continue;
    visible.push(color);
    if (color.a >= 1) break;
  }
  const backdrop = visible.reduceRight<Rgba>((under, over) => blend(over, under), CANVAS);
  const text = fg.a < 1 ? blend(fg, backdrop) : fg;
  const ratio = Math.round(contrastRatio(text, backdrop) * 100) / 100;
  const largeText = isLargeText(fontSizePx, fontWeight);
  return {
    ratio,
    foreground: toHex(text),
    background: toHex(backdrop),
    largeText,
    passesAA: ratio >= (largeText ? 3 : 4.5),
    approximate,
  };
}
