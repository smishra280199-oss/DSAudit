/**
 * Approximate selector specificity as [ids, classes, types]. Handles the
 * common cases (:where is zero, :is/:not/:has take their argument) without a
 * full selector parser; ties are then broken by source order.
 */

export type Specificity = [number, number, number];

export function specificity(selector: string): Specificity {
  let s = selector.replace(/:where\([^)]*\)/g, '');
  s = s.replace(/:(is|not|has|matches)\(([^)]*)\)/g, (_, __, inner: string) => ` ${inner.split(',')[0]} `);
  s = s.replace(/"[^"]*"|'[^']*'/g, '');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const attrs = (s.match(/\[[^\]]+\]/g) ?? []).length;
  s = s.replace(/\[[^\]]+\]/g, '');
  const pseudoElements = (s.match(/::[\w-]+/g) ?? []).length;
  s = s.replace(/::[\w-]+/g, '');
  const classes = (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/:[\w-]+/g) ?? []).length;
  const types = (s.replace(/[#.:][\w-]+/g, '').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return [ids, classes + attrs, types + pseudoElements];
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The specificity of the most specific comma-separated part that matches the element. */
export function matchingSpecificity(el: Element, selectorList: string): Specificity | null {
  let best: Specificity | null = null;
  for (const part of splitSelectorList(selectorList)) {
    let matches = false;
    try {
      matches = el.matches(part);
    } catch {
      matches = false;
    }
    if (!matches) continue;
    const spec = specificity(part);
    if (!best || compareSpecificity(spec, best) > 0) best = spec;
  }
  return best;
}

export function splitSelectorList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
