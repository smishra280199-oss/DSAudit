/**
 * Panel side of evidence screenshots: drives the page through frames (see
 * capture/shots.ts), screenshots each one and crops every element it shows.
 * For text, it also reads the background colour actually behind the letters
 * from the pixels, so contrast is judged on what people see.
 *
 * Browser APIs only (createImageBitmap, canvas). Bridge-agnostic: the Chrome
 * bridge and the test harness plug in their own way of taking screenshots.
 */

import type { Frame, ShotTarget } from '../../capture/shots';
import { parseColor, toHex } from '../../shared/color';
import type { EvidenceShot } from '../../shared/snapshot';

export interface ShotDriver {
  frame(selectors: string[], focus: string): Promise<Frame>;
  endFrame(): Promise<void>;
  finish(): Promise<void>;
  /** A screenshot of the visible area as a data URL, or null when it can't be taken. */
  screenshot(): Promise<string | null>;
}

/** Keeps a capture to a sensible length: each frame is one screenshot. */
const MAX_FRAMES = 70;
const MARGIN = 4;
const MAX_CROP_WIDTH = 560;

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function canvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function context(c: Canvas) {
  return c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

async function toDataUrl(c: Canvas): Promise<string> {
  if ('convertToBlob' in c) {
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return c.toDataURL('image/jpeg', 0.88);
}

/**
 * The most common colour inside the element that isn't its text colour:
 * the background the letters really sit on (a photo, a gradient, a panel).
 */
export function dominantBackdrop(data: Uint8ClampedArray, textColor: string): string | undefined {
  const text = parseColor(textColor);
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Text pixels and their anti-aliased edges sit close to the text colour.
    if (text && Math.hypot(r - text.r, g - text.g, b - text.b) < 70) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
  if (!best || best.n < 6) return undefined;
  return toHex({ r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n), a: 1 });
}

/** Crops every target of a frame out of its screenshot. */
export async function cropFrame(screenshot: string, frame: Frame): Promise<Record<string, EvidenceShot>> {
  const bitmap = await createImageBitmap(await (await fetch(screenshot)).blob());
  const scale = bitmap.width / frame.viewport.w;
  const out: Record<string, EvidenceShot> = {};
  for (const t of frame.targets) out[t.selector] = await cropTarget(bitmap, scale, t, frame.viewport);
  bitmap.close?.();
  return out;
}

async function cropTarget(bitmap: ImageBitmap, scale: number, t: ShotTarget, viewport: Frame['viewport']): Promise<EvidenceShot> {
  const x0 = Math.max(0, t.x - MARGIN);
  const y0 = Math.max(0, t.y - MARGIN);
  const x1 = Math.min(viewport.w, t.x + t.w + MARGIN);
  const y1 = Math.min(viewport.h, t.y + t.h + MARGIN);
  const sw = Math.max(1, Math.round((x1 - x0) * scale));
  const sh = Math.max(1, Math.round((y1 - y0) * scale));
  const shrink = Math.min(1, MAX_CROP_WIDTH / sw);
  const c = canvas(Math.max(1, Math.round(sw * shrink)), Math.max(1, Math.round(sh * shrink)));
  context(c).drawImage(bitmap, Math.round(x0 * scale), Math.round(y0 * scale), sw, sh, 0, 0, c.width, c.height);
  const shot: EvidenceShot = { src: await toDataUrl(c), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };

  if (t.hasText) {
    // Sample only the element's own box, at most ~40k pixels.
    const bw = Math.max(1, Math.round(t.w * scale));
    const bh = Math.max(1, Math.round(t.h * scale));
    const step = Math.max(1, Math.ceil(Math.sqrt((bw * bh) / 40_000)));
    const sample = canvas(Math.max(1, Math.floor(bw / step)), Math.max(1, Math.floor(bh / step)));
    const ctx = context(sample);
    ctx.drawImage(bitmap, Math.round(t.x * scale), Math.round(t.y * scale), bw, bh, 0, 0, sample.width, sample.height);
    shot.backdrop = dominantBackdrop(ctx.getImageData(0, 0, sample.width, sample.height).data, t.textColor);
  }
  return shot;
}

/**
 * Screenshots the given elements, a few per frame, in the order given (put
 * them in page order to keep scrolling short). Elements that can't be shown
 * (hidden, covered, inside a closed menu) are skipped.
 */
export async function collectEvidence(
  driver: ShotDriver,
  selectors: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, EvidenceShot>> {
  const shots: Record<string, EvidenceShot> = {};
  let remaining = [...new Set(selectors)];
  const total = remaining.length;
  let failures = 0;
  try {
    for (let frames = 0; remaining.length > 0 && frames < MAX_FRAMES; frames += 1) {
      const focus = remaining[0]!;
      const frame = await driver.frame(remaining, focus);
      if (!frame || !Array.isArray(frame.targets)) throw new Error('The page did not answer the screenshot request. Reload the page and capture again.');
      if (frame.targets.length === 0) {
        await driver.endFrame();
        remaining = remaining.slice(1);
        continue;
      }
      const image = await driver.screenshot();
      await driver.endFrame();
      if (!image) {
        // Skip this element rather than giving up on every other one.
        failures += 1;
        if (failures >= 4) break;
        remaining = remaining.slice(1);
        continue;
      }
      Object.assign(shots, await cropFrame(image, frame).catch(() => ({})));
      remaining = remaining.filter((s) => !(s in shots) && s !== focus);
      onProgress?.(total - remaining.length, total);
    }
  } finally {
    await driver.finish();
  }
  return shots;
}
