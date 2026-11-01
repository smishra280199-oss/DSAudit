/**
 * The component gallery: every visual style of each kind of element, side
 * by side, drawn from the styles we captured. One picture of nine slightly
 * different buttons says more than any score.
 *
 * Kinds with problems come first: more styles than a system needs, or styles
 * that are near-copies of each other.
 */

import type { Audit } from '../audit';
import type { ComponentKind } from '../inference/types';
import type { StyleKey } from '../shared/snapshot';

export interface GalleryItem {
  /** 1-based number, as shown under the replica. */
  n: number;
  label: string;
  count: number;
  styles: Partial<Record<StyleKey, string>>;
  size: { w: number; h: number };
  /** The number of the style this one nearly copies. */
  copyOf: number | null;
  /** Used only once or twice: likely a one-off. */
  rare: boolean;
  selectors: string[];
}

export interface GalleryGroup {
  kind: ComponentKind;
  label: string;
  /** Lower-case singular, e.g. "button". */
  noun: string;
  styles: number;
  /** About how many styles a tidy system needs for this kind. */
  needed: number;
  items: GalleryItem[];
  headline: string;
  hasProblem: boolean;
}

/** Kinds that read well as replicas: they have a label and a recognisable look. */
const SHOWN: ComponentKind[] = ['button', 'input', 'badge', 'link', 'heading'];
const NOUNS: Partial<Record<ComponentKind, string>> = { button: 'button', input: 'input', badge: 'badge', link: 'link', heading: 'heading' };
const MAX_ITEMS = 12;

export function componentGallery(audit: Audit): GalleryGroup[] {
  const groups: GalleryGroup[] = [];
  for (const component of audit.analysis.components) {
    if (!SHOWN.includes(component.kind) || component.variants.length < 2) continue;
    const noun = NOUNS[component.kind]!;
    const line = audit.savings.lines.find((l) => l.key === `component-${component.kind}`);
    const needed = line?.recommended ?? Math.min(component.variants.length, component.target);
    const twin = new Map<number, number>();
    for (const [i, j] of component.nearDuplicatePairs) if (!twin.has(j)) twin.set(j, i);
    const items: GalleryItem[] = component.variants.slice(0, MAX_ITEMS).map((v, i) => ({
      n: i + 1,
      label: (v.sampleText || (component.kind === 'input' ? 'Text field' : 'Aa')).slice(0, 22),
      count: v.count,
      styles: v.preview ?? v.styles,
      size: v.size ?? { w: 0, h: 0 },
      copyOf: twin.has(i) ? twin.get(i)! + 1 : null,
      rare: v.count === 1 && i >= needed,
      selectors: v.selectors,
    }));
    const copies = items.filter((x) => x.copyOf !== null).length;
    const styles = component.variants.length;
    const over = styles > needed;
    const plural = `${noun}${noun.endsWith('s') ? 'es' : 's'}`;
    const headline = over
      ? `${styles} different ${plural}, where about ${needed} would do.`
      : copies
        ? `${styles} ${noun} styles, ${copies} of them ${copies === 1 ? 'a near-copy' : 'near-copies'} of another.`
        : `${styles} ${noun} styles, each clearly different.`;
    groups.push({ kind: component.kind, label: component.label, noun, styles, needed, items, headline, hasProblem: over || copies > 0 });
  }
  return groups.sort((a, b) => Number(b.hasProblem) - Number(a.hasProblem) || b.styles - b.needed - (a.styles - a.needed));
}

const cap = (value: string | undefined, max: number): string | undefined => {
  const n = value ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? `${Math.min(n, max)}px` : undefined;
};

/**
 * CSS (kebab-case) that redraws a captured element: its fill, text colour,
 * corners, border, shadow, type and padding, with sizes capped so a hero
 * heading or a huge button still fits in a gallery tile.
 */
export function replicaCss(kind: ComponentKind, s: Partial<Record<StyleKey, string>>): Record<string, string> {
  const css: Record<string, string> = {};
  const set = (key: string, value: string | undefined) => {
    if (value) css[key] = value;
  };
  set('color', s.color);
  set('background-color', s.backgroundColor);
  set('border-radius', s.borderTopLeftRadius);
  set('box-shadow', s.boxShadow);
  set('font-weight', s.fontWeight);
  set('font-family', s.fontFamily);
  set('font-size', cap(s.fontSize, kind === 'heading' ? 22 : 16));
  if (s.borderTopWidth && parseFloat(s.borderTopWidth) > 0) set('border', `${cap(s.borderTopWidth, 3)} solid ${s.borderTopColor ?? 'currentColor'}`);
  if (kind === 'button' || kind === 'badge' || kind === 'input') {
    set('padding', `${cap(s.paddingTop, 12) ?? '4px'} ${cap(s.paddingLeft, 24) ?? '8px'}`);
  }
  if (kind === 'input') css['min-width'] = '120px';
  css['line-height'] = '1.25';
  css['white-space'] = 'nowrap';
  return css;
}
