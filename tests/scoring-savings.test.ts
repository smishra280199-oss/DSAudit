import { describe, expect, it } from 'vitest';
import { runAudit, compareAudits } from '../src/audit';
import { analyse } from '../src/inference';
import { DEFAULT_ASSUMPTIONS, estimateSavings } from '../src/savings';
import { AREA_WEIGHTS, distinctScore, gradeFor, scoreAnalysis } from '../src/scoring';
import { makeSnapshot, times } from './helpers';

describe('scoring', () => {
  it('has weights that sum to one', () => {
    const total = Object.values(AREA_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('rewards staying under the target number of values', () => {
    expect(distinctScore(5, 8)).toBe(100);
    expect(distinctScore(32, 8)).toBe(0);
    expect(distinctScore(14, 8)).toBe(75);
  });

  it('grades on fixed bands', () => {
    expect([90, 75, 60, 45, 10].map(gradeFor)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('leaves out areas with nothing to measure and rescales the rest', () => {
    const score = scoreAnalysis(analyse(makeSnapshot({ elements: [{ text: 'Hello' }] })));
    expect(score.areas.find((a) => a.key === 'motion')!.applicable).toBe(false);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it('scores a messier page lower', () => {
    const tidy = makeSnapshot({ elements: times(20, { text: 'a', styles: { paddingTop: '8px', fontSize: '16px' } }) });
    const messy = makeSnapshot({
      elements: Array.from({ length: 20 }, (_, i) => ({ text: 'a', selector: `.m${i}`, styles: { paddingTop: `${7 + i}px`, fontSize: `${10 + i}px` } })),
    });
    expect(scoreAnalysis(analyse(messy)).overall).toBeLessThan(scoreAnalysis(analyse(tidy)).overall);
  });
});

describe('savings', () => {
  it('prices drag and cleanup from the assumptions', () => {
    const analysis = analyse(
      makeSnapshot({ elements: Array.from({ length: 20 }, (_, i) => ({ selector: `.s${i}`, styles: { paddingTop: `${10 + i * 3}px` } })) }),
    );
    const base = estimateSavings(analysis, DEFAULT_ASSUMPTIONS);
    expect(base.excessValues).toBe(8);
    const doubled = estimateSavings(analysis, { ...DEFAULT_ASSUMPTIONS, contributors: DEFAULT_ASSUMPTIONS.contributors * 2 });
    expect(doubled.annualDragHours).toBeCloseTo(base.annualDragHours * 2, 5);
    expect(base.cleanupCost).toBe(Math.round(base.cleanupHours * DEFAULT_ASSUMPTIONS.hourlyRate));
  });

  it('reports no payback when there is nothing to save', () => {
    const savings = estimateSavings(analyse(makeSnapshot()), DEFAULT_ASSUMPTIONS);
    expect(savings.paybackMonths).toBeNull();
  });
});

describe('comparing audits', () => {
  it('reports per-area deltas', () => {
    const before = runAudit(makeSnapshot({ elements: [{ text: 'Faint', styles: { color: 'rgb(220, 220, 220)' } }] }), DEFAULT_ASSUMPTIONS);
    const after = runAudit(makeSnapshot({ elements: [{ text: 'Dark', styles: { color: 'rgb(20, 20, 20)' } }] }), DEFAULT_ASSUMPTIONS);
    const diff = compareAudits(before, after);
    expect(diff.areas.find((a) => a.key === 'accessibility')!.delta).toBeGreaterThan(0);
  });
});
