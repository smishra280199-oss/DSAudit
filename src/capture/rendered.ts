/**
 * The rendered layer: a depth-first walk of the DOM from <body>, recording
 * what the user actually sees (computed styles), including open shadow roots.
 */

import {
  INHERITED_KEYS,
  MAX_ELEMENTS,
  STYLE_KEYS,
  type RenderedElement,
  type RenderedLayer,
  type StyleKey,
} from '../shared/snapshot';
import { shortSelector } from './selector';

const SKIPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'NOSCRIPT',
  'TEMPLATE',
  'HEAD',
  'TITLE',
  'BASE',
]);

/** SVG internals add hundreds of elements and no design-system signal. */
const LEAF_TAGS = new Set(['svg', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'PICTURE', 'SELECT']);

const RECORDED_ATTRS = [
  'role',
  'type',
  'aria-label',
  'aria-labelledby',
  'aria-hidden',
  'aria-current',
  'aria-selected',
  'aria-expanded',
  'alt',
  'title',
  'placeholder',
  'disabled',
  'aria-disabled',
  'tabindex',
  'data-theme',
];

/** Values that mean "not set" for the non-inherited keys. */
const DEFAULTS: Partial<Record<StyleKey, string[]>> = {
  backgroundColor: ['rgba(0, 0, 0, 0)', 'transparent'],
  backgroundImage: ['none'],
  borderTopWidth: ['0px'],
  borderTopLeftRadius: ['0px'],
  boxShadow: ['none'],
  paddingTop: ['0px'],
  paddingRight: ['0px'],
  paddingBottom: ['0px'],
  paddingLeft: ['0px'],
  marginTop: ['0px'],
  marginRight: ['0px'],
  marginBottom: ['0px'],
  marginLeft: ['0px'],
  rowGap: ['normal', '0px'],
  columnGap: ['normal', '0px'],
  cursor: ['auto'],
  zIndex: ['auto'],
  transitionDuration: ['0s'],
  outlineStyle: ['none'],
  letterSpacing: ['normal'],
};

export interface RenderedWalk {
  layer: RenderedLayer;
  /** Live element references in snapshot order, for the authored layer. */
  liveElements: Element[];
  shadowRoots: ShadowRoot[];
}

function ownText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function recordStyles(
  computed: CSSStyleDeclaration,
  parentStyles: Partial<Record<StyleKey, string>> | null,
): { recorded: Partial<Record<StyleKey, string>>; resolved: Partial<Record<StyleKey, string>> } {
  const recorded: Partial<Record<StyleKey, string>> = {};
  const resolved: Partial<Record<StyleKey, string>> = {};
  for (const key of STYLE_KEYS) {
    const value = computed[key as keyof CSSStyleDeclaration] as string | undefined;
    if (value === undefined || value === '') continue;
    resolved[key] = value;
    if (INHERITED_KEYS.includes(key)) {
      if (!parentStyles || parentStyles[key] !== value) recorded[key] = value;
    } else if (key === 'display') {
      recorded[key] = value;
    } else if (!DEFAULTS[key]?.includes(value)) {
      recorded[key] = value;
    }
  }
  // A border colour without a border is noise.
  if (!recorded.borderTopWidth) delete recorded.borderTopColor;
  return { recorded, resolved };
}

function isHidden(el: Element, computed: CSSStyleDeclaration): boolean {
  return (
    computed.display === 'none' ||
    computed.visibility === 'hidden' ||
    computed.visibility === 'collapse' ||
    (el as HTMLElement).hidden === true
  );
}

export function walkRendered(doc: Document): RenderedWalk {
  const win = doc.defaultView!;
  const elements: RenderedElement[] = [];
  const liveElements: Element[] = [];
  const shadowRoots: ShadowRoot[] = [];
  let truncated = false;

  // Explicit stack keeps the walk depth-first without recursion limits.
  type Frame = { el: Element; parent: number; parentStyles: Partial<Record<StyleKey, string>> | null };
  const start = doc.body ?? doc.documentElement;
  const stack: Frame[] = [{ el: start, parent: -1, parentStyles: null }];

  while (stack.length > 0) {
    if (elements.length >= MAX_ELEMENTS) {
      truncated = true;
      break;
    }
    const { el, parent, parentStyles } = stack.pop()!;
    if (SKIPPED_TAGS.has(el.tagName)) continue;
    const computed = win.getComputedStyle(el);
    if (isHidden(el, computed)) continue;

    const { recorded, resolved } = recordStyles(computed, parentStyles);
    const box = el.getBoundingClientRect();
    const attrs: Record<string, string> = {};
    for (const name of RECORDED_ATTRS) {
      const value = el.getAttribute(name);
      if (value !== null) attrs[name] = value.slice(0, 120);
    }
    if (el.hasAttribute('href')) attrs.href = '';
    // Whether a <label> is tied to this field (for= or wrapping): not visible in the attributes themselves.
    if ('labels' in el && (el as HTMLInputElement).labels && (el as HTMLInputElement).labels!.length > 0) attrs['data-labelled'] = '';
    if (el.hasAttribute('style')) attrs.style = '';

    const index = elements.length;
    elements.push({
      index,
      parent,
      tag: el.tagName.toLowerCase(),
      selector: shortSelector(el),
      classes: [...el.classList],
      attrs,
      text: ownText(el),
      rect: {
        x: Math.round(box.left + win.scrollX),
        y: Math.round(box.top + win.scrollY),
        w: Math.round(box.width),
        h: Math.round(box.height),
      },
      styles: recorded,
    });
    liveElements.push(el);

    if (LEAF_TAGS.has(el.tagName)) continue;
    const children: Element[] = [...el.children];
    if (el.shadowRoot) {
      shadowRoots.push(el.shadowRoot);
      children.push(...el.shadowRoot.children);
    }
    // Push in reverse so the first child is visited first.
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ el: children[i]!, parent: index, parentStyles: resolved });
    }
  }

  return {
    layer: { elements, truncated, rootCustomProperties: readRootCustomProperties(doc) },
    liveElements,
    shadowRoots,
  };
}

function readRootCustomProperties(doc: Document): Record<string, string> {
  const computed = doc.defaultView!.getComputedStyle(doc.documentElement);
  const props: Record<string, string> = {};
  for (let i = 0; i < computed.length; i += 1) {
    const name = computed.item(i);
    if (name.startsWith('--')) props[name] = computed.getPropertyValue(name).trim();
  }
  return props;
}
