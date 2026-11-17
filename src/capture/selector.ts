/**
 * Builds short, stable-enough CSS selectors for highlighting elements later.
 * Elements inside open shadow roots are addressed as "host >>> inner", which
 * resolveSelector() understands (querySelector itself cannot pierce shadows).
 */

import { isShadowRoot } from './dom';

export const SHADOW_SEPARATOR = ' >>> ';

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/([^\w-])/g, '\\$1').replace(/^(\d)/, '\\3$1 ');
}

/** Generated class names (hashes) make poor selectors; prefer readable ones. */
function isStableClass(name: string): boolean {
  return name.length <= 40 && !/\d{3,}|[A-Z0-9]{6,}|^(css|sc|jsx|emotion)-/.test(name);
}

const ID_PATTERN = /^[A-Za-z][\w-]*$/;

/** One compound selector of a path: tag, up to two readable classes, and its position among same-tag siblings when it has any. */
interface Segment {
  text: string;
  tag: string;
  classes: string[];
  /** Set only when the element has same-tag siblings, i.e. when the text carries :nth-of-type(). */
  nth: number | null;
}

/**
 * Builds selectors for many elements of one document: the shortest path of
 * `tag.class:nth-of-type(n)` segments, joined by `>`, that matches only that
 * element, anchored on a unique id where one is near.
 *
 * Speed matters on large pages, so nothing is queried twice: sibling
 * positions, segments and id counts are cached, and uniqueness is decided
 * structurally rather than by running querySelectorAll per candidate (which
 * made capture quadratic). Only elements matching the leaf segment can match
 * a path ending in it, so for each of those we count how many levels of the
 * path it shares; the shortest unique path is one level more than the
 * longest shared prefix. The result is exactly what querySelectorAll would
 * decide, because a segment is just a tag, classes and an nth-of-type.
 *
 * There is no depth cap: a selector matching several elements would
 * highlight and photograph the wrong one (repeated card grids need more than
 * five levels), and a full nth-of-type path from the root is unique.
 *
 * Build a new one per capture: it assumes the DOM doesn't change meanwhile.
 */
export class SelectorBuilder {
  private readonly segments = new WeakMap<Element, Segment>();
  private readonly ofType = new WeakMap<Element, { nth: number; total: number }>();
  private readonly idCounts = new Map<Node, Map<string, number>>();
  private readonly leafPools = new Map<Node, Map<string, Element[]>>();

  build(el: Element): string {
    const segments = [this.local(el)];
    let root = el.getRootNode();
    while (isShadowRoot(root)) {
      segments.unshift(this.local(root.host));
      root = root.host.getRootNode();
    }
    return segments.join(SHADOW_SEPARATOR);
  }

  /** Position among same-tag siblings (1-based) and how many there are; one pass indexes all siblings. */
  private position(el: Element): { nth: number; total: number } {
    const known = this.ofType.get(el);
    if (known) return known;
    const parent = el.parentElement;
    if (!parent) return { nth: 1, total: 1 };
    const totals = new Map<string, number>();
    for (const child of parent.children) {
      const n = (totals.get(child.tagName) ?? 0) + 1;
      totals.set(child.tagName, n);
      this.ofType.set(child, { nth: n, total: 0 });
    }
    for (const child of parent.children) this.ofType.get(child)!.total = totals.get(child.tagName)!;
    return this.ofType.get(el) ?? { nth: 1, total: 1 };
  }

  private segment(el: Element): Segment {
    let segment = this.segments.get(el);
    if (segment) return segment;
    const tag = el.tagName;
    const classes = [...el.classList].filter(isStableClass).slice(0, 2);
    const { nth, total } = this.position(el);
    const text = tag.toLowerCase() + classes.map((c) => `.${cssEscape(c)}`).join('') + (total > 1 ? `:nth-of-type(${nth})` : '');
    segment = { text, tag, classes, nth: total > 1 ? nth : null };
    this.segments.set(el, segment);
    return segment;
  }

  private matchesSegment(el: Element, segment: Segment): boolean {
    if (el.tagName !== segment.tag) return false;
    for (const c of segment.classes) if (!el.classList.contains(c)) return false;
    return segment.nth === null || this.position(el).nth === segment.nth;
  }

  private uniqueId(el: Element, root: Document | ShadowRoot): boolean {
    if (!el.id || !ID_PATTERN.test(el.id)) return false;
    let counts = this.idCounts.get(root);
    if (!counts) {
      counts = new Map();
      for (const node of root.querySelectorAll('[id]')) counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
      this.idCounts.set(root, counts);
    }
    return counts.get(el.id) === 1;
  }

  private readonly shared = new Map<Element, Map<Element, number>>();

  /**
   * How many consecutive ancestors, starting at `other` and `target`, match
   * target's path segments. It depends only on the pair, and siblings walk the
   * same pairs, so it is memoised across elements.
   */
  private sharedDepth(other: Element, target: Element): number {
    let row = this.shared.get(target);
    if (!row) this.shared.set(target, (row = new Map()));
    let depth = row.get(other);
    if (depth === undefined) {
      depth = 0;
      if (this.matchesSegment(other, this.segment(target))) {
        const [a, b] = [other.parentElement, target.parentElement];
        depth = 1 + (a && b ? this.sharedDepth(a, b) : 0);
      }
      row.set(other, depth);
    }
    return depth;
  }

  /** Elements in the root matching a leaf segment, queried once per distinct leaf. */
  private pool(root: Document | ShadowRoot, leaf: Segment): Element[] {
    let byLeaf = this.leafPools.get(root);
    if (!byLeaf) this.leafPools.set(root, (byLeaf = new Map()));
    let pool = byLeaf.get(leaf.text);
    if (!pool) {
      try {
        pool = [...root.querySelectorAll(leaf.text)];
      } catch {
        pool = [];
      }
      byLeaf.set(leaf.text, pool);
    }
    return pool;
  }

  /** Selector relative to the element's own root (document or shadow root). */
  private local(el: Element): string {
    const root = el.getRootNode() as Document | ShadowRoot;
    if (this.uniqueId(el, root)) return `#${cssEscape(el.id)}`;

    // The path from the element up to its root's top.
    const chain: Element[] = [];
    for (let current: Element | null = el; current; current = current.parentElement) chain.push(current);
    const path = chain.map((c) => this.segment(c));

    // How many levels of the path the most similar other element shares.
    let shared = 0;
    const parent = chain[1];
    for (const other of this.pool(root, path[0]!)) {
      if (other === el) continue;
      const depth = 1 + (parent && other.parentElement ? this.sharedDepth(other.parentElement, parent) : 0);
      if (depth > shared) shared = depth;
      if (shared === path.length) break;
    }

    const parts: string[] = [];
    for (let depth = 1; depth <= path.length; depth += 1) {
      parts.unshift(path[depth - 1]!.text);
      if (depth > shared) return parts.join(' > ');
      const next = chain[depth];
      if (next && this.uniqueId(next, root)) return `#${cssEscape(next.id)} > ${parts.join(' > ')}`;
    }
    return parts.join(' > ');
  }
}

/** One-off selector for a single element (Inspect). Captures use a shared SelectorBuilder. */
export function shortSelector(el: Element): string {
  return new SelectorBuilder().build(el);
}

export function resolveSelector(doc: Document, selector: string): Element[] {
  const [first, ...rest] = selector.split(SHADOW_SEPARATOR);
  let scopes: (Document | ShadowRoot)[] = [doc];
  let matches: Element[] = [];
  for (const part of [first!, ...rest]) {
    matches = scopes.flatMap((scope) => {
      try {
        return [...scope.querySelectorAll(part)];
      } catch {
        return [];
      }
    });
    scopes = matches.map((m) => m.shadowRoot).filter((r): r is ShadowRoot => r !== null);
  }
  return matches;
}
