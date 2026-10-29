/** Elevation foundation: box shadows and z-index layers. */

import type { PageSnapshot } from '../../shared/snapshot';
import { ValueCounter, type ElementView } from '../elements';
import type { FoundationAnalysis } from '../types';
import { tokenCoverage } from './shared';

export function analyseElevation(snapshot: PageSnapshot, views: ElementView[]): FoundationAnalysis {
  const shadows = new ValueCounter();
  const layers = new ValueCounter();
  for (const { el } of views) {
    if (el.styles.boxShadow) shadows.add(el.styles.boxShadow, el.selector);
    if (el.styles.zIndex) layers.add(el.styles.zIndex, el.selector);
  }
  const zValues = layers.entries().sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  return {
    key: 'elevation',
    label: 'Elevation',
    groups: [
      { key: 'shadow', label: 'Shadow', values: shadows.entries(), target: 5 },
      { key: 'z-index', label: 'Z-index', values: zValues, target: 6 },
    ],
    tokenCoverage: tokenCoverage(snapshot, ['shadow', 'z-index']),
    applicable: shadows.entries().length + zValues.length > 0,
  };
}
