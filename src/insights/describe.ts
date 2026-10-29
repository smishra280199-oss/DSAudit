/**
 * Plain-language descriptions of what we captured, so findings can point at
 * things the reader recognises ("the “Upgrade plan” button on /settings")
 * instead of selectors.
 */

import { parseColor, toHex } from '../shared/color';
import { parseSelector } from '../shared/page-scope';
import type { PageRef, PageSnapshot } from '../shared/snapshot';
import type { ElementView } from '../inference/elements';

const MAX_TEXT = 36;

function quote(text: string): string {
  const t = text.trim();
  return `“${t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1).trimEnd()}…` : t}”`;
}

/** "the “Save” button", "the “Plan” heading", "a text field", … */
export function describeElement(view: ElementView): string {
  const { el } = view;
  const label = el.text || el.attrs['aria-label'] || el.attrs.title || el.attrs.placeholder || el.attrs.alt || '';
  const named = (noun: string) => (label ? `the ${quote(label)} ${noun}` : `an unlabelled ${noun}`);
  if (el.tag === 'button' || el.attrs.role === 'button' || (el.tag === 'input' && ['submit', 'button'].includes(el.attrs.type ?? ''))) {
    return named('button');
  }
  if (el.tag === 'a') return named('link');
  if (/^h[1-6]$/.test(el.tag)) return named('heading');
  if (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select') return label ? `the ${quote(label)} field` : 'a form field';
  if (el.tag === 'img') return label ? `the ${quote(label)} image` : 'an image';
  if (el.tag === 'label') return named('label');
  if (label) return `the text ${quote(label)}`;
  return `a ${el.tag} element`;
}

/** A short name for a page: its path ("/settings/billing"), or "the home page". */
export function pageName(page: Pick<PageRef, 'url' | 'title'>): string {
  try {
    const { pathname, protocol } = new URL(page.url);
    if (protocol === 'file:') return page.title || pathname.split('/').pop() || 'the page';
    return pathname === '/' || pathname === '' ? 'the home page' : decodeURIComponent(pathname.replace(/\/$/, ''));
  } catch {
    return page.title || 'the page';
  }
}

/** Whether the element has something a reader would recognise: text, a label, or a clear role. */
function isRecognisable(view: ElementView): boolean {
  const { el } = view;
  return Boolean(el.text || el.attrs['aria-label'] || el.attrs.title || el.attrs.placeholder || el.attrs.alt) || ['button', 'a', 'input', 'img'].includes(el.tag);
}

/** Human-friendly CSS values: hex colours instead of rgb(), "fully rounded" instead of 999px. */
export function friendlyValue(value: string): string {
  const c = parseColor(value);
  if (c && /^(rgb|hsl|#)/.test(value.trim())) return toHex(c);
  if (/^\d{3,}px$/.test(value) || value === '50%') return 'fully rounded';
  return value;
}

export interface Describer {
  /** Up to `limit` distinct, readable element descriptions, with the page when the audit spans several. */
  examples(selectors: string[], limit?: number): string[];
  /** The pages these selectors were seen on, by name. */
  pages(selectors: string[]): string[];
  multiPage: boolean;
}

export function describer(snapshot: PageSnapshot, views: ElementView[]): Describer {
  const bySelector = new Map(views.map((v) => [v.el.selector, v]));
  const pages = snapshot.pages ?? [];
  const multiPage = pages.length > 1;

  const pageOf = (selector: string) => {
    const { page } = parseSelector(selector);
    return page === null ? null : (pages[page] ?? null);
  };

  return {
    multiPage,
    examples(selectors, limit = 3) {
      const out: string[] = [];
      for (const selector of selectors) {
        const view = bySelector.get(selector);
        // Generic elements ("a div element") mean nothing to a reader; skip them.
        if (!view || !isRecognisable(view)) continue;
        const page = multiPage ? pageOf(selector) : null;
        const text = page ? `${describeElement(view)} on ${pageName(page)}` : describeElement(view);
        if (!out.includes(text)) out.push(text);
        if (out.length >= limit) break;
      }
      return out;
    },
    pages(selectors) {
      if (!multiPage) return [];
      return [...new Set(selectors.map(pageOf).filter((p): p is PageRef => p !== null).map(pageName))];
    },
  };
}

/** A rough everyday name for a colour: "purple", "light grey", "near-black". */
export function colourName(hex: string): string {
  const c = parseColor(hex);
  if (!c) return 'colour';
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.12 || max - min < 0.06) {
    if (lightness > 0.97) return 'white';
    if (lightness < 0.12) return 'near-black';
    return lightness > 0.6 ? 'light grey' : 'dark grey';
  }
  // HSL hue in degrees: 0 red, 60 yellow, 120 green, 240 blue.
  const d = max - min;
  const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const names: [number, string][] = [
    [15, 'red'],
    [45, 'orange'],
    [70, 'yellow'],
    [160, 'green'],
    [195, 'teal'],
    [245, 'blue'],
    [290, 'purple'],
    [340, 'pink'],
    [361, 'red'],
  ];
  const name = names.find(([limit]) => h < limit)![1];
  return lightness > 0.85 ? `pale ${name}` : lightness < 0.22 ? `dark ${name}` : name;
}

/** Joins items as prose: "a, b and c". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
