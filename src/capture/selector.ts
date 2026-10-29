/**
 * Builds short, stable-enough CSS selectors for highlighting elements later.
 * Elements inside open shadow roots are addressed as "host >>> inner", which
 * resolveSelector() understands (querySelector itself cannot pierce shadows).
 */

import { isShadowRoot } from './dom';

export const SHADOW_SEPARATOR = ' >>> ';

const MAX_DEPTH = 5;

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/([^\w-])/g, '\\$1').replace(/^(\d)/, '\\3$1 ');
}

/** Generated class names (hashes) make poor selectors; prefer readable ones. */
function isStableClass(name: string): boolean {
  return name.length <= 40 && !/\d{3,}|[A-Z0-9]{6,}|^(css|sc|jsx|emotion)-/.test(name);
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].filter(isStableClass).slice(0, 2);
  let segment = tag + classes.map((c) => `.${cssEscape(c)}`).join('');
  const parent = el.parentElement;
  if (parent) {
    const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
    if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
  }
  return segment;
}

/** Selector relative to the element's own root (document or shadow root). */
function localSelector(el: Element): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && root.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) {
    return `#${cssEscape(el.id)}`;
  }
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && parts.length < MAX_DEPTH) {
    parts.unshift(segmentFor(current));
    const candidate = parts.join(' > ');
    if (root.querySelectorAll(candidate).length === 1) return candidate;
    current = current.parentElement;
    if (current && current.id && /^[A-Za-z][\w-]*$/.test(current.id)) {
      parts.unshift(`#${cssEscape(current.id)}`);
      return parts.join(' > ');
    }
  }
  return parts.join(' > ');
}

export function shortSelector(el: Element): string {
  const segments = [localSelector(el)];
  let root = el.getRootNode();
  while (isShadowRoot(root)) {
    segments.unshift(localSelector(root.host));
    root = root.host.getRootNode();
  }
  return segments.join(SHADOW_SEPARATOR);
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
