/**
 * Component recognition: finds buttons, inputs, links, headings, cards,
 * badges and avatars by tag, role and shape, then groups each kind into
 * visual variants by the properties that define its look. All heuristic.
 */

import { deltaE, parseColor } from '../shared/color';
import type { StyleKey } from '../shared/snapshot';
import { px, type ElementView } from './elements';
import type { ComponentAnalysis, ComponentKind, ComponentVariant } from './types';

interface KindDefinition {
  kind: ComponentKind;
  label: string;
  /** A reasonable maximum number of variants for a consistent UI. */
  target: number;
  /** Properties that make two instances look different. */
  signature: StyleKey[];
  /** Whether the rendered height (in 4px buckets) also distinguishes variants, e.g. button sizes. */
  sized: boolean;
  matches: (view: ElementView) => boolean;
}

const BUTTON_INPUT_TYPES = new Set(['submit', 'button', 'reset']);
const NON_TEXT_INPUTS = new Set(['submit', 'button', 'reset', 'checkbox', 'radio', 'hidden', 'range', 'color', 'file', 'image']);

function hasSurface(styles: ElementView['styles']): boolean {
  return Boolean(styles.backgroundColor || styles.boxShadow || styles.borderTopWidth || styles.backgroundImage);
}

function looksLikeButton({ el, styles }: ElementView): boolean {
  if (el.tag === 'button' || el.attrs.role === 'button') return true;
  if (el.tag === 'input' && BUTTON_INPUT_TYPES.has(el.attrs.type ?? '')) return true;
  // Links styled as buttons: a surface, horizontal padding and a button-like height.
  return (
    el.tag === 'a' &&
    hasSurface(el.styles) &&
    (px(styles.paddingLeft) ?? 0) >= 8 &&
    el.rect.h >= 24 &&
    el.rect.h <= 64
  );
}

export const COMPONENT_KINDS: KindDefinition[] = [
  {
    kind: 'button',
    sized: true,
    label: 'Buttons',
    target: 6,
    signature: ['backgroundColor', 'color', 'borderTopColor', 'borderTopLeftRadius', 'fontSize', 'fontWeight', 'paddingLeft'],
    matches: looksLikeButton,
  },
  {
    kind: 'input',
    sized: true,
    label: 'Inputs',
    target: 3,
    signature: ['backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderTopLeftRadius', 'fontSize', 'paddingLeft'],
    matches: ({ el }) =>
      el.tag === 'textarea' || el.tag === 'select' || (el.tag === 'input' && !NON_TEXT_INPUTS.has(el.attrs.type ?? 'text')),
  },
  {
    kind: 'link',
    sized: false,
    label: 'Links',
    target: 4,
    signature: ['color', 'fontWeight'],
    matches: (view) => view.el.tag === 'a' && view.el.attrs.href !== undefined && !looksLikeButton(view) && view.subtreeHasText,
  },
  {
    kind: 'heading',
    sized: false,
    label: 'Headings',
    target: 6,
    signature: ['fontSize', 'fontWeight', 'lineHeight', 'color', 'fontFamily'],
    matches: ({ el }) => /^h[1-6]$/.test(el.tag) || el.attrs.role === 'heading',
  },
  {
    kind: 'card',
    sized: false,
    label: 'Cards',
    target: 4,
    signature: ['backgroundColor', 'borderTopLeftRadius', 'boxShadow', 'borderTopColor', 'paddingTop'],
    matches: ({ el }) =>
      ['div', 'article', 'section', 'li', 'aside'].includes(el.tag) &&
      Boolean(el.styles.borderTopLeftRadius) &&
      Boolean(el.styles.backgroundColor || el.styles.boxShadow || el.styles.borderTopWidth) &&
      el.rect.w >= 160 &&
      el.rect.h >= 80,
  },
  {
    kind: 'badge',
    sized: true,
    label: 'Badges',
    target: 5,
    signature: ['backgroundColor', 'color', 'borderTopLeftRadius', 'fontSize', 'fontWeight'],
    matches: ({ el }) =>
      ['span', 'div', 'small', 'mark', 'em', 'strong'].includes(el.tag) &&
      Boolean(el.styles.backgroundColor && el.styles.borderTopLeftRadius) &&
      el.text.length > 0 &&
      el.text.length <= 24 &&
      el.rect.h > 0 &&
      el.rect.h <= 28 &&
      el.rect.w <= 180,
  },
  {
    kind: 'avatar',
    sized: true,
    label: 'Avatars',
    target: 3,
    signature: ['borderTopLeftRadius'],
    matches: ({ el }) =>
      ['img', 'div', 'span'].includes(el.tag) &&
      el.rect.w >= 16 &&
      el.rect.w <= 96 &&
      Math.abs(el.rect.w - el.rect.h) <= 2 &&
      (el.styles.borderTopLeftRadius === '50%' || (px(el.styles.borderTopLeftRadius) ?? 0) >= el.rect.w / 2 - 1),
  },
];

function signatureOf(view: ElementView, def: KindDefinition): { signature: string; styles: Partial<Record<StyleKey, string>> } {
  const styles: Partial<Record<StyleKey, string>> = {};
  for (const key of def.signature) {
    const value = view.styles[key];
    if (value !== undefined) styles[key] = value;
  }
  const parts = def.signature.map((k) => styles[k] ?? '-');
  if (def.sized) parts.push(`h${Math.round(view.el.rect.h / 4) * 4}`);
  return { signature: parts.join('|'), styles };
}

const MAX_DRIFTED_PROPERTIES = 3;

/** The rounded height a sized kind (buttons, inputs) carries at the end of its signature. */
function heightOf(v: ComponentVariant): number | null {
  const m = /\|h(\d+)$/.exec(v.signature);
  return m ? Number(m[1]) : null;
}

/**
 * Two variants are near-duplicates when they differ in at most three
 * properties and every difference is barely visible (ΔE < 5 or ≤ 2px):
 * the signature of a value that drifted rather than a deliberate variant.
 */
function nearlyEqual(a: ComponentVariant, b: ComponentVariant, keys: StyleKey[]): boolean {
  // Same styles, a few pixels taller or shorter: the same control rebuilt with different padding.
  let differences = heightOf(a) !== null && heightOf(b) !== null && heightOf(a) !== heightOf(b) ? (Math.abs(heightOf(a)! - heightOf(b)!) <= 4 ? 1 : 99) : 0;
  if (differences > MAX_DRIFTED_PROPERTIES) return false;
  for (const key of keys) {
    const x = a.styles[key];
    const y = b.styles[key];
    if (x === y) continue;
    differences += 1;
    if (differences > MAX_DRIFTED_PROPERTIES || x === undefined || y === undefined) return false;
    const cx = parseColor(x);
    const cy = parseColor(y);
    const close = cx && cy ? deltaE(cx, cy) < 5 : Math.abs((px(x) ?? NaN) - (px(y) ?? NaN)) <= 2;
    if (!close) return false;
  }
  return differences > 0;
}

const PREVIEW_KEYS: StyleKey[] = [
  'backgroundColor',
  'color',
  'borderTopWidth',
  'borderTopColor',
  'borderTopLeftRadius',
  'boxShadow',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'lineHeight',
  'paddingTop',
  'paddingLeft',
];

function previewOf(view: ElementView): Partial<Record<StyleKey, string>> {
  const out: Partial<Record<StyleKey, string>> = {};
  for (const key of PREVIEW_KEYS) {
    const value = view.styles[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function analyseComponents(views: ElementView[]): ComponentAnalysis[] {
  return COMPONENT_KINDS.map((def) => {
    const variants = new Map<string, ComponentVariant>();
    let instances = 0;
    for (const view of views) {
      if (!def.matches(view)) continue;
      instances += 1;
      const { signature, styles } = signatureOf(view, def);
      const variant = variants.get(signature);
      if (variant) {
        variant.count += 1;
        if (variant.selectors.length < 40) variant.selectors.push(view.el.selector);
        if (!variant.sampleText && view.el.text) variant.sampleText = view.el.text;
      } else {
        variants.set(signature, {
          signature,
          styles,
          count: 1,
          selectors: [view.el.selector],
          sampleText: view.el.text,
          tag: view.el.tag,
          preview: previewOf(view),
          size: { w: view.el.rect.w, h: view.el.rect.h },
        });
      }
    }
    const sorted = [...variants.values()].sort((a, b) => b.count - a.count);
    const pairs: [number, number][] = [];
    if (sorted.length <= 60) {
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          if (nearlyEqual(sorted[i]!, sorted[j]!, def.signature)) pairs.push([i, j]);
        }
      }
    }
    return { kind: def.kind, label: def.label, instances, variants: sorted, target: def.target, nearDuplicatePairs: pairs };
  });
}
