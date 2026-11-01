/** Helpers shared by the foundation analysers. */

import type { AuthoredDeclaration, DeclarationCategory, PageSnapshot } from '../../shared/snapshot';
import type { ScaleFit, ValueStat } from '../types';

const FORM_TAGS = new Set(['button', 'input', 'select', 'textarea']);

/** Chrome's own defaults for form controls (button padding 1px 6px, 13.33px text…), in px. */
const BROWSER_DEFAULT_PX: Partial<Record<DeclarationCategory, number[]>> = {
  spacing: [1, 2, 3, 6],
  'font-size': [13.33],
};

/**
 * Returns a test for "this value came from the browser, not the team": a
 * form control showing one of Chrome's default values that the page's CSS
 * never writes. Such values are left out, so findings only ever describe
 * decisions the team made. When the CSS sizes things in em, we can't tell,
 * and keep everything.
 */
export function browserDefaultTest(snapshot: PageSnapshot, category: DeclarationCategory): (tag: string, n: number) => boolean {
  const defaults = BROWSER_DEFAULT_PX[category] ?? [];
  const values = [
    ...snapshot.authored.declarations.filter((d) => d.category === category).map((d) => d.value),
    ...snapshot.authored.customProperties.map((c) => c.value),
  ];
  if (defaults.length === 0 || snapshot.authored.sheets.length === 0 || values.some((v) => /\d(em)\b/.test(v))) return () => false;
  const written = new Set<number>();
  for (const v of values) {
    for (const m of v.matchAll(/(-?\d*\.?\d+)(px|rem)?/g)) {
      const n = parseFloat(m[1]!) * (m[2] === 'rem' ? 16 : 1);
      if (m[2] || n === 0) written.add(Math.round(n * 100) / 100);
    }
  }
  return (tag, n) => FORM_TAGS.has(tag) && defaults.includes(Math.round(n * 100) / 100) && !written.has(Math.round(n * 100) / 100);
}

/** Declarations that apply to something on the page (or to a state of something on it). */
export function liveDeclarations(snapshot: PageSnapshot): AuthoredDeclaration[] {
  const all = snapshot.authored.declarations;
  const live = all.filter((d) => d.matchCount > 0);
  return live.length > 0 ? live : all;
}

/** Share of non-keyword declarations in the categories that use a token; null when there are none. */
export function tokenCoverage(snapshot: PageSnapshot, categories: DeclarationCategory[]): number | null {
  let token = 0;
  let literal = 0;
  for (const d of liveDeclarations(snapshot)) {
    if (!categories.includes(d.category)) continue;
    if (d.kind === 'token') token += 1;
    else if (d.kind === 'literal') literal += 1;
  }
  return token + literal === 0 ? null : token / (token + literal);
}

/**
 * Marks numeric values within `tolerance` of a more common value as near
 * duplicates (e.g. 15px next to 16px). Values must be sorted by count, desc.
 */
export function markNumericNearDuplicates(values: ValueStat[], tolerance: number): ValueStat[] {
  const kept: { n: number; value: string }[] = [];
  return values.map((stat) => {
    const n = parseFloat(stat.value);
    if (!Number.isFinite(n)) return stat;
    const twin = kept.find((k) => k.n !== n && Math.abs(k.n - n) <= tolerance);
    kept.push({ n, value: stat.value });
    return twin ? { ...stat, nearDuplicateOf: twin.value } : stat;
  });
}

export function weightedShare(values: ValueStat[], predicate: (v: ValueStat) => boolean): number {
  const total = values.reduce((sum, v) => sum + v.count, 0);
  if (total === 0) return 1;
  return values.filter(predicate).reduce((sum, v) => sum + v.count, 0) / total;
}

/** Picks the largest base unit that fits at least 85% of usage, falling back to the best fit. */
export function fitBaseUnit(values: ValueStat[], candidates: number[]): ScaleFit {
  const fits = candidates.map((base) => ({
    base,
    fit: weightedShare(values, (v) => {
      const n = Math.abs(parseFloat(v.value));
      return n <= 2 || Math.abs(n / base - Math.round(n / base)) * base <= 0.5;
    }),
  }));
  const chosen = fits.find((f) => f.fit >= 0.85) ?? fits.reduce((a, b) => (b.fit > a.fit ? b : a));
  return { kind: 'base-unit', value: chosen.base, fit: chosen.fit };
}

export function isOnBase(value: number, base: number): boolean {
  const n = Math.abs(value);
  // Half a step (4px on an 8px grid) is a standard part of most spacing scales.
  if (base >= 8 && Math.abs(n - base / 2) <= 0.5) return true;
  return n <= 2 || Math.abs(n / base - Math.round(n / base)) * base <= 0.5;
}
