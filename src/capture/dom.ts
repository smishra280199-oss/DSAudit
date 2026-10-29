/**
 * Realm-safe DOM type checks. `instanceof Element` fails when the code runs
 * in one window and the node lives in another (the preview audits an
 * iframe), so we check node types instead.
 */

const ELEMENT_NODE = 1;
const DOCUMENT_FRAGMENT_NODE = 11;

export function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && (value as Node).nodeType === ELEMENT_NODE;
}

export function isShadowRoot(node: Node | null | undefined): node is ShadowRoot {
  return !!node && node.nodeType === DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

/** The element's parent, stepping out of a shadow root to its host. */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}
