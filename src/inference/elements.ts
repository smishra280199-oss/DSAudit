/**
 * A convenience view over the rendered layer. Snapshots store inherited
 * properties only where they change, so this resolves the full value for
 * every element and precomputes subtree facts used by several analyses.
 */

import { INHERITED_KEYS, type PageSnapshot, type RenderedElement, type StyleKey } from '../shared/snapshot';

export interface ElementView {
  el: RenderedElement;
  /** Inherited keys resolved from ancestors plus the element's own recorded styles. */
  styles: Partial<Record<StyleKey, string>>;
  /** Whether the element or a descendant has visible text. */
  subtreeHasText: boolean;
  /** Whether the element or a descendant carries an accessible-name attribute. */
  subtreeHasLabel: boolean;
}

const LABEL_ATTRS = ['aria-label', 'aria-labelledby', 'title', 'alt'];

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
    views.push({
      el,
      styles,
      subtreeHasText: el.text.length > 0,
      subtreeHasLabel: LABEL_ATTRS.some((a) => (el.attrs[a] ?? '').trim().length > 0),
    });
  }

  // Children follow parents, so a reverse pass bubbles subtree facts upwards.
  for (let i = views.length - 1; i >= 0; i -= 1) {
    const view = views[i]!;
    const parent = view.el.parent >= 0 ? views[view.el.parent] : undefined;
    if (!parent) continue;
    parent.subtreeHasText ||= view.subtreeHasText;
    parent.subtreeHasLabel ||= view.subtreeHasLabel;
  }
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
