/** Motion foundation: transition durations on rendered elements. */

import { toMs } from '../../shared/css-values';
import type { PageSnapshot } from '../../shared/snapshot';
import { ValueCounter, type ElementView } from '../elements';
import type { FoundationAnalysis } from '../types';
import { markNumericNearDuplicates, tokenCoverage } from './shared';

export function analyseMotion(snapshot: PageSnapshot, views: ElementView[]): FoundationAnalysis {
  const durations = new ValueCounter();
  for (const { el } of views) {
    const ms = el.styles.transitionDuration ? toMs(el.styles.transitionDuration) : null;
    if (ms !== null && ms > 0) durations.add(`${ms}`, el.selector, `${ms}ms`);
  }
  const values = markNumericNearDuplicates(durations.entries(), 25);
  return {
    key: 'motion',
    label: 'Motion',
    groups: [{ key: 'duration', label: 'Transition duration', values, target: 4 }],
    tokenCoverage: tokenCoverage(snapshot, ['motion']),
    applicable: values.length > 0,
  };
}
