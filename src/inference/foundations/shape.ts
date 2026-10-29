/** Shape foundation: corner radii and border widths. */

import { roundPx } from '../../shared/css-values';
import type { PageSnapshot } from '../../shared/snapshot';
import { px, ValueCounter, type ElementView } from '../elements';
import type { FoundationAnalysis } from '../types';
import { markNumericNearDuplicates, tokenCoverage } from './shared';

/** Radii at least half the element's shorter side render as a full pill or circle. */
function radiusValue(raw: string, w: number, h: number): { value: string; display: string } | null {
  if (raw.endsWith('%')) return parseFloat(raw) >= 50 ? { value: 'full', display: 'Full (pill)' } : { value: raw, display: raw };
  const n = px(raw);
  if (n === null || n <= 0) return null;
  if (n >= 999 || (w > 0 && h > 0 && n >= Math.min(w, h) / 2)) return { value: 'full', display: 'Full (pill)' };
  return { value: roundPx(n), display: `${roundPx(n)}px` };
}

export function analyseShape(snapshot: PageSnapshot, views: ElementView[]): FoundationAnalysis {
  const radii = new ValueCounter();
  const borders = new ValueCounter();
  for (const { el } of views) {
    const radius = el.styles.borderTopLeftRadius;
    const r = radius ? radiusValue(radius, el.rect.w, el.rect.h) : null;
    if (r) radii.add(r.value, el.selector, r.display);
    const width = px(el.styles.borderTopWidth);
    if (width !== null && width > 0) borders.add(roundPx(width), el.selector, `${roundPx(width)}px`);
  }
  const radiusValues = markNumericNearDuplicates(radii.entries(), 1);
  return {
    key: 'shape',
    label: 'Shape',
    groups: [
      { key: 'radius', label: 'Corner radius', values: radiusValues, target: 5 },
      { key: 'border-width', label: 'Border width', values: borders.entries(), target: 3 },
    ],
    tokenCoverage: tokenCoverage(snapshot, ['radius', 'border-width']),
    applicable: radiusValues.length + borders.entries().length > 0,
  };
}
