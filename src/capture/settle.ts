/**
 * Lets a modern page finish rendering before it is read. Client-rendered
 * apps hydrate after `load`, lazy sections and scroll-reveal animations
 * (common on Framer and Webflow sites) only render once scrolled into view,
 * and web fonts change text metrics when they arrive.
 *
 * settle() waits for the document and its fonts, optionally scrolls once
 * through a tall page to wake lazy content and puts the scroll back, then
 * waits until the DOM has been quiet for a moment. Every wait is capped, so
 * a page that never stops changing (a ticker, a live feed) costs a few
 * seconds at most and is reported as still changing.
 */

import type { CaptureSettle } from '../shared/snapshot';

export interface SettleOptions {
  /** How long the DOM must go without mutations to count as settled. */
  quietMs?: number;
  /** Upper bound on the quiet-period wait. */
  maxQuietWaitMs?: number;
  /** Upper bound on waiting for `load` and web fonts. */
  maxLoadWaitMs?: number;
  /** Scroll through pages taller than 1.5 viewports to trigger lazy content. */
  scroll?: boolean;
  /** Pause at each scroll step for observers and lazy loaders to react. */
  scrollStepMs?: number;
  maxScrollSteps?: number;
}

const DEFAULTS: Required<SettleOptions> = {
  quietMs: 400,
  maxQuietWaitMs: 2_500,
  maxLoadWaitMs: 3_000,
  scroll: true,
  scrollStepMs: 80,
  maxScrollSteps: 20,
};

const sleep = (win: Window, ms: number) => new Promise<void>((resolve) => win.setTimeout(resolve, ms));

function withTimeout(win: Window, promise: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([promise.then(() => undefined, () => undefined), sleep(win, ms)]);
}

function loaded(doc: Document): Promise<void> {
  if (doc.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => doc.defaultView!.addEventListener('load', () => resolve(), { once: true }));
}

/** Resolves once no mutation has happened for `quietMs`, or after `maxMs`. Reports how many mutations it saw. */
function quiet(doc: Document, quietMs: number, maxMs: number): Promise<{ mutations: number; settled: boolean }> {
  const win = doc.defaultView!;
  const Observer = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
  if (!Observer) return Promise.resolve({ mutations: 0, settled: true });
  return new Promise((resolve) => {
    let mutations = 0;
    let quietTimer = 0;
    const finish = (settled: boolean) => {
      observer.disconnect();
      win.clearTimeout(quietTimer);
      win.clearTimeout(cap);
      resolve({ mutations, settled });
    };
    const observer = new Observer((records) => {
      // Attribute churn from our own overlay or a caret blink is noise; count structure and text changes.
      mutations += records.filter((r) => r.type !== 'attributes').length;
      win.clearTimeout(quietTimer);
      quietTimer = win.setTimeout(() => finish(true), quietMs);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
    quietTimer = win.setTimeout(() => finish(true), quietMs);
    const cap = win.setTimeout(() => finish(false), maxMs);
  });
}

export async function settle(doc: Document, options: SettleOptions = {}): Promise<CaptureSettle> {
  const o = { ...DEFAULTS, ...options };
  const win = doc.defaultView!;
  const started = Date.now();

  await withTimeout(win, loaded(doc), o.maxLoadWaitMs);
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts) await withTimeout(win, fonts.ready, o.maxLoadWaitMs);

  let scrolled = false;
  const height = doc.documentElement.scrollHeight;
  const viewport = win.innerHeight;
  if (o.scroll && viewport > 0 && height > viewport * 1.5) {
    const startX = win.scrollX;
    const startY = win.scrollY;
    // Fixed from the starting height, so an infinite feed can't keep the pass going.
    const steps = Math.min(o.maxScrollSteps, Math.ceil(height / viewport));
    for (let i = 1; i <= steps; i += 1) {
      win.scrollTo({ left: startX, top: Math.min(i * viewport, height), behavior: 'instant' as ScrollBehavior });
      await sleep(win, o.scrollStepMs);
    }
    win.scrollTo({ left: startX, top: startY, behavior: 'instant' as ScrollBehavior });
    scrolled = true;
  }

  const { mutations, settled } = await quiet(doc, o.quietMs, o.maxQuietWaitMs);
  return { waitedMs: Date.now() - started, scrolled, settled, mutations };
}
