/**
 * Page side of evidence screenshots. The panel asks for a "frame": we scroll
 * one target to the middle of the window, hide fixed and sticky layers that
 * would cover it (headers, cookie banners, chat bubbles), and report where
 * every requested element now sits on screen, if it is fully visible and not
 * covered. The panel then screenshots the tab and crops those rectangles.
 *
 * Nothing here changes the page for good: hidden layers come back and the
 * scroll position is restored when the panel calls endFrame / finish.
 */

import { resolveSelector } from './selector';

export interface ShotTarget {
  selector: string;
  /** Viewport rectangle in CSS px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The element's text colour, so the panel can tell text pixels from background pixels. */
  textColor: string;
  hasText: boolean;
}

export interface Frame {
  /** Targets fully visible and uncovered in this frame. */
  targets: ShotTarget[];
  /** The focus target couldn't be shown (zero size, covered, off-canvas). */
  focusFailed: boolean;
  dpr: number;
  viewport: { w: number; h: number };
}

const HIDDEN_ATTR = 'data-dslint-hidden';

function nextFrames(win: Window, settleMs: number): Promise<void> {
  return new Promise((resolve) => {
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => win.setTimeout(resolve, settleMs)));
  });
}

function isLayer(win: Window, el: Element): boolean {
  const position = win.getComputedStyle(el).position;
  return position === 'fixed' || position === 'sticky';
}

/** The fixed or sticky layer an element lives in, if any. */
function layerOf(win: Window, el: Element): Element | null {
  for (let node: Element | null = el; node && node !== el.ownerDocument.body; node = node.parentElement) {
    if (isLayer(win, node)) return node;
  }
  return null;
}

/** Whether what's drawn at a point belongs to the element (itself, inside it, or a wrapper around it). */
function owns(el: Element, hit: Element | null): boolean {
  return hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
}

/**
 * What to photograph: a boxed element (a button, badge, field or card: it
 * has a fill or a border) as a whole; plain text (a heading, a paragraph, a
 * link) by the box of its own text, so a short heading in a wide row isn't
 * shrunk to nothing.
 */
function shotRect(win: Window, el: Element): DOMRect {
  const box = el.getBoundingClientRect();
  const style = win.getComputedStyle(el);
  const boxed =
    (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
    parseFloat(style.borderTopWidth) > 0 ||
    parseFloat(style.borderBottomWidth) > 0 ||
    style.boxShadow !== 'none' ||
    ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'IMG'].includes(el.tagName);
  if (boxed) return box;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect();
  if (text.width < 2 || text.height < 2) return box;
  const left = Math.max(box.left, text.left);
  const top = Math.max(box.top, text.top);
  const right = Math.min(box.right, text.right);
  const bottom = Math.min(box.bottom, text.bottom);
  return right - left >= 2 && bottom - top >= 2 ? new DOMRect(left, top, right - left, bottom - top) : box;
}

function uncovered(doc: Document, el: Element, r: DOMRect): boolean {
  const points: [number, number][] = [
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.left + Math.min(4, r.width / 4), r.top + Math.min(4, r.height / 4)],
    [r.right - Math.min(4, r.width / 4), r.bottom - Math.min(4, r.height / 4)],
  ];
  return points.every(([x, y]) => owns(el, doc.elementFromPoint(x, y)));
}

export class ShotSession {
  private readonly startY: number;
  private readonly startX: number;
  private hidden: HTMLElement[] = [];

  constructor(private readonly doc: Document) {
    const win = doc.defaultView!;
    this.startX = win.scrollX;
    this.startY = win.scrollY;
  }

  /** Brings `focus` into view and reports every target that can be cropped from the current screen. */
  async frame(selectors: string[], focus: string, settleMs = 250): Promise<Frame> {
    const win = this.doc.defaultView!;
    this.endFrame();
    const focusEl = resolveSelector(this.doc, focus)[0];
    const viewport = { w: win.innerWidth, h: win.innerHeight };
    if (!focusEl) return { targets: [], focusFailed: true, dpr: win.devicePixelRatio || 1, viewport };

    // Hide floating layers that don't contain the focus element, so they can't cover it.
    const focusLayer = layerOf(win, focusEl);
    for (const el of this.doc.body.querySelectorAll<HTMLElement>('*')) {
      if (el === focusLayer || el.contains(focusEl) || !isLayer(win, el)) continue;
      el.setAttribute(HIDDEN_ATTR, el.style.getPropertyValue('visibility') || '-');
      el.style.setProperty('visibility', 'hidden', 'important');
      this.hidden.push(el);
    }
    if (!focusLayer) focusEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
    await nextFrames(win, settleMs);

    const targets: ShotTarget[] = [];
    let focusFailed = true;
    for (const selector of selectors) {
      const el = resolveSelector(this.doc, selector)[0];
      if (!el || this.hidden.some((h) => h.contains(el))) continue;
      const r = shotRect(win, el);
      const inside = r.width >= 2 && r.height >= 2 && r.left >= 0 && r.top >= 0 && r.right <= viewport.w && r.bottom <= viewport.h;
      if (!inside || !uncovered(this.doc, el, r)) continue;
      const style = win.getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
      targets.push({ selector, x: r.left, y: r.top, w: r.width, h: r.height, textColor: style.color, hasText });
      if (selector === focus) focusFailed = false;
    }
    return { targets, focusFailed, dpr: win.devicePixelRatio || 1, viewport };
  }

  /** Brings back the layers hidden for the last frame. */
  endFrame(): void {
    for (const el of this.hidden) {
      const before = el.getAttribute(HIDDEN_ATTR);
      el.style.removeProperty('visibility');
      if (before && before !== '-') el.style.setProperty('visibility', before);
      el.removeAttribute(HIDDEN_ATTR);
    }
    this.hidden = [];
  }

  /** Restores the page exactly as the user left it. */
  finish(): void {
    this.endFrame();
    this.doc.defaultView!.scrollTo({ left: this.startX, top: this.startY, behavior: 'instant' as ScrollBehavior });
  }
}
