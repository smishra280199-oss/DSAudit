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
import { SelectorBuilder } from './selector';

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
  'id',
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

/**
 * Not rendered at all, and neither is anything inside: display none, the
 * hidden attribute, or content-visibility: hidden (which skips the subtree).
 */
function isRemoved(el: Element, computed: CSSStyleDeclaration): boolean {
  return (
    computed.display === 'none' ||
    (el as HTMLElement).hidden === true ||
    computed.getPropertyValue('content-visibility') === 'hidden'
  );
}

/**
 * Invisible itself, but a child can override it (visibility: visible inside
 * a hidden parent is common for dropdowns and animated reveals), so the walk
 * still descends.
 */
function isInvisible(computed: CSSStyleDeclaration): boolean {
  return computed.visibility === 'hidden' || computed.visibility === 'collapse';
}

export function walkRendered(doc: Document): RenderedWalk {
  const win = doc.defaultView!;
  const elements: RenderedElement[] = [];
  const liveElements: Element[] = [];
  const shadowRoots: ShadowRoot[] = [];
  const selectors = new SelectorBuilder();
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
    if (isRemoved(el, computed)) continue;
    if (isInvisible(computed)) {
      // Not recorded; its children attach to the nearest recorded ancestor.
      pushChildren(el, parent, parentStyles);
      continue;
    }

    const { recorded, resolved } = recordStyles(computed, parentStyles);
    const box = el.getBoundingClientRect();
    const attrs: Record<string, string> = {};
    for (const name of RECORDED_ATTRS) {
      const value = el.getAttribute(name);
      if (value !== null) attrs[name] = value.slice(0, 120);
    }
    if (el.hasAttribute('href')) attrs.href = '';
    // An inline click handler marks a clickable element that may have no role (listeners added from script are invisible here).
    if (el.hasAttribute('onclick')) attrs.onclick = '';
    // Whether a <label> is tied to this field (for= or wrapping): not visible in the attributes themselves.
    if ('labels' in el && (el as HTMLInputElement).labels && (el as HTMLInputElement).labels!.length > 0) attrs['data-labelled'] = '';
    if (el.hasAttribute('style')) attrs.style = '';

    const index = elements.length;
    elements.push({
      index,
      parent,
      tag: el.tagName.toLowerCase(),
      selector: selectors.build(el),
      classes: [...el.classList],
      attrs,
      // font-size: 0 is a layout trick (killing inline-block gaps): its text is invisible.
      text: parseFloat(computed.fontSize) === 0 ? '' : ownText(el),
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
    pushChildren(el, index, resolved);
  }

  function pushChildren(el: Element, parent: number, parentStyles: Partial<Record<StyleKey, string>> | null): void {
    const children: Element[] = [...el.children];
    if (el.shadowRoot) {
      shadowRoots.push(el.shadowRoot);
      children.push(...el.shadowRoot.children);
    }
    // Push in reverse so the first child is visited first.
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push({ el: children[i]!, parent, parentStyles });
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
