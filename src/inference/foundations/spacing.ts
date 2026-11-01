/**
 * Spacing foundation: padding, margin and gap values, with the base unit
 * (4/5/6/8px) that best explains them. A 2px unit is not offered: nearly
 * every value fits it, so it says nothing about the system.
 */

import { roundPx } from '../../shared/css-values';
import type { PageSnapshot, StyleKey } from '../../shared/snapshot';
import { px, ValueCounter, type ElementView } from '../elements';
import type { FoundationAnalysis } from '../types';
import { browserDefaultTest, fitBaseUnit, isOnBase, markNumericNearDuplicates, tokenCoverage } from './shared';

/** Above this, a value is a layout dimension (a sidebar offset, a hero gap) rather than a spacing step. */
export const MAX_SCALE_SPACING = 64;

const SPACING_KEYS: StyleKey[] = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'rowGap',
  'columnGap',
];

export function analyseSpacing(snapshot: PageSnapshot, views: ElementView[]): FoundationAnalysis {
  const counter = new ValueCounter();
  const isBrowserDefault = browserDefaultTest(snapshot, 'spacing');
  for (const { el } of views) {
    for (const key of SPACING_KEYS) {
      const n = px(el.styles[key]);
      // Negative margins are layout tricks rather than scale steps; auto margins don't parse.
      if (n === null || n <= 0 || isBrowserDefault(el.tag, n)) continue;
      counter.add(roundPx(n), el.selector, `${roundPx(n)}px`);
    }
  }

  const values = markNumericNearDuplicates(counter.entries(), 1);
  const scale = fitBaseUnit(values, [8, 6, 5, 4]);
  return {
    key: 'spacing',
    label: 'Spacing',
    groups: [
      {
        key: 'spacing',
        label: 'Padding, margin & gap',
        values: values.map((v) => ({ ...v, onScale: parseFloat(v.value) > MAX_SCALE_SPACING || isOnBase(parseFloat(v.value), scale.value) })),
        target: 12,
        scale,
      },
    ],
    tokenCoverage: tokenCoverage(snapshot, ['spacing']),
    applicable: values.length > 0,
  };
}
