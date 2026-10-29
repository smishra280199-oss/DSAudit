/**
 * Small colour toolkit: parsing CSS colour strings, perceptual distance and
 * WCAG contrast. Kept dependency-free because it also ships inside capture.js.
 */

export interface Rgba {
  r: number; // 0–255
  g: number;
  b: number;
  a: number; // 0–1
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  orange: '#ffa500',
  yellow: '#ffff00',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
};

export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED[value];
  if (named) return parseHex(named);
  if (value.startsWith('#')) return parseHex(value);

  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(value);
  if (!fn) return null;
  const [, name = '', body = ''] = fn;
  const parts = body
    .replace(/\s*\/\s*/, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] === undefined ? 1 : parseAlpha(parts[3]);

  if (name.startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map(parseChannel);
    if ([r, g, b].some((n) => n === undefined || Number.isNaN(n))) return null;
    return { r: r!, g: g!, b: b!, a: alpha };
  }
  const h = parseFloat(parts[0]!);
  const s = parseFloat(parts[1]!) / 100;
  const l = parseFloat(parts[2]!) / 100;
  if ([h, s, l].some(Number.isNaN)) return null;
  return { ...hslToRgb(h, s, l), a: alpha };
}

function parseHex(hex: string): Rgba | null {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

function parseChannel(part: string): number {
  return part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part);
}

function parseAlpha(part: string): number {
  const n = part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part);
  return Number.isNaN(n) ? 1 : Math.min(1, Math.max(0, n));
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, 'a'> {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

export function toHex({ r, g, b, a }: Rgba): string {
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(a * 255) : ''}`;
}

/** Composite a translucent colour over an opaque backdrop. */
export function blend(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio between two opaque colours (1–21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE L*a*b* (D65). */
export function toLab(c: Rgba): [number, number, number] {
  const [r, g, b] = [linear(c.r), linear(c.g), linear(c.b)];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * Perceptual distance (CIE76) including an alpha term. A ΔE below ~2.3 is a
 * "just noticeable difference": two such colours are near-duplicates.
 */
export function deltaE(a: Rgba, b: Rgba): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  const alpha = (a.a - b.a) * 100;
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2, alpha);
}

/** Chroma in Lab space; low values are neutrals (greys). */
export function chroma(c: Rgba): number {
  const [, a, b] = toLab(c);
  return Math.hypot(a, b);
}

export function hue(c: Rgba): number {
  const [, a, b] = toLab(c);
  return (Math.atan2(b, a) * 180) / Math.PI + 180;
}

export const NEAR_DUPLICATE_DELTA_E = 2.3;
