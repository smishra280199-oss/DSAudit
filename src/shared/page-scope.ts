/**
 * In a multi-page audit every element selector is prefixed with the index
 * of the page it came from ("2::.btn"), so findings can say which page they
 * were seen on and highlighting only targets the page that is open.
 * Single-page snapshots use plain selectors.
 */

const SEPARATOR = '::';
const SCOPED = /^(\d+)::(.*)$/s;

export function scopeSelector(page: number, selector: string): string {
  return `${page}${SEPARATOR}${selector}`;
}

/** The page index and the plain selector; page is null for unscoped selectors. */
export function parseSelector(selector: string): { page: number | null; selector: string } {
  const m = SCOPED.exec(selector);
  return m ? { page: Number(m[1]), selector: m[2]! } : { page: null, selector };
}

/** Selectors that can be highlighted on the given page (unscoped ones always can). */
export function selectorsForPage(selectors: string[], page: number | null): string[] {
  return selectors
    .map(parseSelector)
    .filter((s) => s.page === null || s.page === page)
    .map((s) => s.selector);
}

/** The distinct pages a set of selectors points at. */
export function pagesOf(selectors: string[]): number[] {
  return [...new Set(selectors.map((s) => parseSelector(s).page).filter((p): p is number => p !== null))].sort((a, b) => a - b);
}
