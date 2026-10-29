/**
 * Heuristic classification of class names into naming conventions. A page
 * that mixes many conventions usually has several styling systems layered on
 * top of each other, which is itself a design-system signal.
 */

import type { ClassConvention, ClassNamingStats } from './snapshot';

const UTILITY =
  /^(?:[a-z]+:)*-?(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|w|h|min-w|max-w|min-h|max-h|text|bg|border(?:-[trblxy])?|rounded(?:-[trbl]{1,2})?|shadow|font|leading|tracking|z|opacity|flex|grid|cols|col-span|row-span|items|justify|self|place|inset|top|left|right|bottom|order|ring|fill|stroke|duration|ease|transition|overflow|cursor|select|sr)(?:-[\w./[\]%#-]+)?$/;
const UTILITY_BARE = new Set([
  'flex',
  'grid',
  'block',
  'inline',
  'inline-block',
  'inline-flex',
  'hidden',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'truncate',
  'underline',
  'italic',
  'uppercase',
  'lowercase',
  'capitalize',
  'container',
]);
/** Library prefixes followed by a hash, e.g. css-1x2y3z, sc-bdVaJa, jsx-3127, or a bare _a1b2c3 hash. */
const CSS_IN_JS = /^(?:css|sc|jsx|emotion|styled|tw|e)-(?=[a-zA-Z0-9]*[\dA-Z])[a-zA-Z0-9]{4,}$|^_(?=[a-z0-9]*\d)[a-z0-9]{5,}$/;
const CSS_MODULES = /^[A-Za-z][\w-]*_[\w-]+__[A-Za-z0-9_-]{5}$|^[A-Za-z][\w-]*-module__[\w-]+__[\w-]+$/;
const BEM = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const PREFIX = /^([a-z]{2,6}-|[A-Z][a-z]+(?=[A-Z]))/;

export function classifyClass(name: string): Exclude<ClassConvention, 'namespaced'> {
  if (UTILITY_BARE.has(name) || UTILITY.test(name)) return 'utility';
  if (CSS_MODULES.test(name)) return 'css-modules';
  if (CSS_IN_JS.test(name)) return 'css-in-js';
  if (BEM.test(name) && (name.includes('__') || name.includes('--'))) return 'bem';
  return 'other';
}

/**
 * Counts each distinct class once. Namespaced prefixes (shared by at least
 * ten distinct classes) are reported separately and reclassify "other".
 */
export function summariseClassNames(classNames: Iterable<string>): ClassNamingStats {
  const distinct = new Set(classNames);
  const counts: Record<ClassConvention, number> = {
    utility: 0,
    'css-in-js': 0,
    'css-modules': 0,
    bem: 0,
    namespaced: 0,
    other: 0,
  };
  const prefixCounts = new Map<string, number>();
  const others: string[] = [];

  for (const name of distinct) {
    const convention = classifyClass(name);
    counts[convention] += 1;
    if (convention === 'other') others.push(name);
    const prefix = PREFIX.exec(name)?.[1];
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const prefixes = [...prefixCounts]
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([prefix, count]) => ({ prefix, count }));

  for (const name of others) {
    if (prefixes.some((p) => name.startsWith(p.prefix))) {
      counts.other -= 1;
      counts.namespaced += 1;
    }
  }

  return { totalClasses: distinct.size, counts, prefixes };
}
