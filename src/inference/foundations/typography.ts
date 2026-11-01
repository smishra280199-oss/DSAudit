/**
 * Typography foundation: sizes (with a modular-scale fit), weights, line
 * heights, families and letter spacing, measured on elements with text.
 */

import { roundPx } from '../../shared/css-values';
import type { PageSnapshot } from '../../shared/snapshot';
import { px, ValueCounter, type ElementView } from '../elements';
import type { FoundationAnalysis, ScaleFit, ValueStat } from '../types';
import { markNumericNearDuplicates, tokenCoverage, weightedShare, browserDefaultTest } from './shared';

/** Common modular ratios. Denser ones (e.g. 1.067) are left out: they "fit" almost any set of sizes. */
const RATIOS = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618];

/** Fits within this margin count as ties, and ties go to the coarser (more opinionated) ratio. */
const FIT_TIE = 0.02;

function firstFamily(value: string): string {
  return (value.split(',')[0] ?? value).replace(/["']/g, '').trim();
}

export function analyseTypography(snapshot: PageSnapshot, views: ElementView[]): FoundationAnalysis {
  const sizes = new ValueCounter();
  const weights = new ValueCounter();
  const lineHeights = new ValueCounter();
  const families = new ValueCounter();
  const tracking = new ValueCounter();

  const isBrowserDefault = browserDefaultTest(snapshot, 'font-size');
  for (const { el, styles } of views) {
    if (!el.text) continue;
    const size = px(styles.fontSize);
    if (size !== null && isBrowserDefault(el.tag, size)) continue;
    if (size !== null) sizes.add(roundPx(size), el.selector, `${roundPx(size)}px`);
    if (styles.fontWeight) weights.add(styles.fontWeight, el.selector);
    if (styles.lineHeight) {
      const lh = px(styles.lineHeight);
      lineHeights.add(lh === null ? styles.lineHeight : roundPx(lh), el.selector, lh === null ? styles.lineHeight : `${roundPx(lh)}px`);
    }
    if (styles.fontFamily) families.add(firstFamily(styles.fontFamily), el.selector);
    if (el.styles.letterSpacing) tracking.add(el.styles.letterSpacing, el.selector);
  }

  const sizeValues = markNumericNearDuplicates(sizes.entries(), 1);
  const scale = fitModularScale(sizeValues);
  const base = parseFloat(sizeValues[0]?.value ?? '16');
  const steps = scaleSteps(base, scale.value);

  return {
    key: 'typography',
    label: 'Typography',
    groups: [
      {
        key: 'font-size',
        label: 'Font size',
        values: sizeValues.map((v) => ({ ...v, onScale: onScale(parseFloat(v.value), steps) })),
        target: 8,
        scale,
      },
      { key: 'font-weight', label: 'Font weight', values: weights.entries(), target: 4 },
      { key: 'line-height', label: 'Line height', values: lineHeights.entries(), target: 6 },
      { key: 'font-family', label: 'Font family', values: families.entries(), target: 3 },
      { key: 'letter-spacing', label: 'Letter spacing', values: tracking.entries(), target: 4 },
    ],
    tokenCoverage: tokenCoverage(snapshot, ['font-size', 'font-weight', 'line-height', 'font-family', 'letter-spacing']),
    applicable: sizeValues.length > 0,
  };
}

function scaleSteps(base: number, ratio: number): number[] {
  const steps: number[] = [];
  for (let k = -3; k <= 8; k += 1) steps.push(base * ratio ** k);
  return steps;
}

function onScale(size: number, steps: number[]): boolean {
  return steps.some((step) => Math.abs(step - size) <= Math.max(0.75, step * 0.04));
}

/** The modular ratio (anchored on the most used size) that covers the most usage. */
export function fitModularScale(values: ValueStat[]): ScaleFit {
  const base = parseFloat(values[0]?.value ?? '16');
  const fits = RATIOS.map((ratio) => ({
    ratio,
    fit: weightedShare(values, (v) => onScale(parseFloat(v.value), scaleSteps(base, ratio))),
  }));
  const bestFit = Math.max(...fits.map((f) => f.fit));
  const chosen = fits.filter((f) => f.fit >= bestFit - FIT_TIE).at(-1)!;
  return { kind: 'ratio', value: chosen.ratio, fit: chosen.fit };
}
