/**
 * A convenience view over the rendered layer. Snapshots store inherited
 * properties only where they change, so this resolves the full value for
 * every element and precomputes subtree facts used by several analyses.
 */

import { INHERITED_KEYS, type PageSnapshot, type RenderedElement, type StyleKey } from '../shared/snapshot';
import { annotateStructure, type ElementRole, type Exclusion, type MergeReason } from './structure';

export interface ElementView {
  el: RenderedElement;
  /** Inherited keys resolved from ancestors plus the element's own recorded styles. */
  styles: Partial<Record<StyleKey, string>>;
  /** Whether the element or a descendant has visible text. */
  subtreeHasText: boolean;
  /** Whether the element or a descendant carries an accessible-name attribute. */
  subtreeHasLabel: boolean;
  /** Whether a descendant is a heading or an image: a link around those is a card, not a text link. */
  subtreeHasBlock: boolean;
  /** The structure pass (structure.ts) fills in the rest. */
  role: ElementRole;
  /** Not part of the product's own rendered interface: left out of foundations and components. */
  excluded: Exclusion | null;
  /** A repeat of something already counted: left out of components. */
  merged: MergeReason | null;
  /** Index of the nearest ancestor that is a control, or -1. */
  control: number;
  /** For a control: the inner element that paints it (same box, own surface), or -1. Its look is the control's look. */
  skin: number;
  /** Inside something aria-hidden (inherited). */
  ariaHidden: boolean;
  /** Inside something disabled or aria-hidden (inherited): exempt from accessibility checks. */
  exempt: boolean;
}

/** Screen-reader-only text (the 1×1 px clip pattern): present in the DOM, invisible on screen. */
export function isVisuallyHidden({ el }: ElementView): boolean {
  // Both sides: a 1px-tall divider is visible, a 1×1 clipped box is not. (jsdom tests have no layout: 0×0.)
  return el.rect.w <= 1 && el.rect.h <= 1 && (el.rect.w > 0 || el.rect.h > 0 || el.classes.some((c) => /sr-only|visually-hidden|screen-reader/i.test(c)));
}

const LABEL_ATTRS = ['aria-label', 'aria-labelledby', 'title', 'alt'];
const BLOCK_CONTENT = /^(h[1-6]|img|picture|video|p|ul|ol|figure)$/;

export function viewElements(snapshot: PageSnapshot): ElementView[] {
  const views: ElementView[] = [];
  for (const el of snapshot.rendered.elements) {
    // Parents always precede children in depth-first order, so they are already resolved.
    const parent = el.parent >= 0 ? views[el.parent] : undefined;
    const styles: Partial<Record<StyleKey, string>> = {};
    for (const key of INHERITED_KEYS) {
      const value = parent?.styles[key];
      if (value !== undefined) styles[key] = value;
    }
    Object.assign(styles, el.styles);
    // Older snapshots recorded text at font-size 0; nobody can read it, so it isn't text.
    const invisibleText = el.text && px(styles.fontSize) === 0;
    views.push({
      el: invisibleText ? { ...el, text: '' } : el,
      styles,
      subtreeHasText: el.text.length > 0,
      subtreeHasLabel: LABEL_ATTRS.some((a) => (el.attrs[a] ?? '').trim().length > 0),
      subtreeHasBlock: false,
      role: 'structural',
      excluded: null,
      merged: null,
      control: -1,
      skin: -1,
      ariaHidden: false,
      exempt: false,
    });
  }

  // Children follow parents, so a reverse pass bubbles subtree facts upwards.
  for (let i = views.length - 1; i >= 0; i -= 1) {
    const view = views[i]!;
    const parent = view.el.parent >= 0 ? views[view.el.parent] : undefined;
    if (!parent) continue;
    parent.subtreeHasText ||= view.subtreeHasText;
    parent.subtreeHasLabel ||= view.subtreeHasLabel;
    parent.subtreeHasBlock ||= view.subtreeHasBlock || BLOCK_CONTENT.test(view.el.tag);
  }
  annotateStructure(views, isVisuallyHidden);
  return views;
}

export function px(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Groups values with counts and up to `maxSelectors` example selectors. */
export class ValueCounter {
  private readonly map = new Map<string, { count: number; selectors: string[]; display: string }>();

  constructor(private readonly maxSelectors = 40) {}

  add(value: string, selector: string, display = value): void {
    const entry = this.map.get(value);
    if (entry) {
      entry.count += 1;
      if (entry.selectors.length < this.maxSelectors) entry.selectors.push(selector);
    } else {
      this.map.set(value, { count: 1, selectors: [selector], display });
    }
  }

  entries(): { value: string; display: string; count: number; selectors: string[] }[] {
    return [...this.map]
      .map(([value, e]) => ({ value, display: e.display, count: e.count, selectors: e.selectors }))
      .sort((a, b) => b.count - a.count);
  }
}
