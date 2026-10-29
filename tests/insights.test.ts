import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit';
import { statusFor, summarise } from '../src/insights';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { declaration, makeSnapshot, times } from './helpers';

const snapshot = makeSnapshot({
  elements: [
    { text: 'Faint', styles: { color: 'rgb(210, 210, 210)' } },
    ...times(3, { styles: { backgroundColor: 'rgb(91, 61, 245)' } }, 'a'),
    { styles: { backgroundColor: 'rgb(92, 62, 245)' } },
    ...Array.from({ length: 20 }, (_, i) => ({ selector: `.s${i}`, styles: { paddingTop: `${10 + i * 3}px` } })),
  ],
  declarations: [declaration('color', '#333'), declaration('margin', '13px'), declaration('padding', '13px')],
});

describe('consolidation lines', () => {
  const { savings } = runAudit(snapshot, DEFAULT_ASSUMPTIONS);

  it('merges near-duplicate colours into one', () => {
    const colours = savings.lines.find((l) => l.key === 'colors')!;
    // Faint text grey, brand purple and its one-step twin: three values, two real colours.
    expect(colours).toMatchObject({ current: 3, recommended: 2, excess: 1 });
  });

  it('prices each redundant value per contributor', () => {
    const spacing = savings.lines.find((l) => l.key === 'spacing')!;
    const a = DEFAULT_ASSUMPTIONS;
    expect(spacing.excess).toBe(8);
    expect(spacing.annualHours).toBe(8 * a.contributors * a.hoursPerExcessValue);
    expect(spacing.annualCost).toBe(Math.round(spacing.annualHours * a.hourlyRate));
  });

  it('compares re-theme effort with and without tokens', () => {
    expect(savings.retheme).toMatchObject({ literals: 3, distinctValues: 2 });
    expect(savings.retheme.hoursWithTokens).toBeLessThan(savings.retheme.hoursToday);
  });

  it('adds lines and re-theming up to the yearly cost', () => {
    const lineCost = savings.lines.reduce((n, l) => n + l.annualHours, 0);
    const rethemeHours = (savings.retheme.hoursToday - savings.retheme.hoursWithTokens) * DEFAULT_ASSUMPTIONS.rethemesPerYear;
    expect(savings.annualDragHours).toBeCloseTo(lineCost + rethemeHours, 0);
    expect(savings.returnMultiple).toBeGreaterThan(0);
  });
});

describe('executive summary', () => {
  const audit = runAudit(snapshot, DEFAULT_ASSUMPTIONS);
  const summary = summarise(audit);

  it('leads with the yearly cost', () => {
    expect(summary.headline).toMatch(/^Inconsistency is costing an estimated \$[\d,]+ a year\.$/);
    expect(summary.subheadline).toContain('pays back in');
  });

  it('lists only what needs consolidating, costliest first', () => {
    expect(summary.consolidation.every((l) => l.excess > 0)).toBe(true);
    expect(summary.consolidation.map((l) => l.annualCost)).toEqual([...summary.consolidation.map((l) => l.annualCost)].sort((a, b) => b - a));
  });

  it('puts high-severity, cheap fixes first and leaves out dismissed ones', () => {
    expect(summary.priorities[0]!.severity).toBe('high');
    const without = summarise(audit, [summary.priorities[0]!.id]);
    expect(without.priorities.map((p) => p.id)).not.toContain(summary.priorities[0]!.id);
  });

  it('groups findings into a phased plan with timelines', () => {
    expect(summary.plan.map((p) => p.name)).toContain('Foundations & tokens');
    expect(summary.plan.every((p) => p.weeks >= 0.5 && p.items.length > 0)).toBe(true);
  });

  it('labels area health in plain language', () => {
    expect([statusFor(90), statusFor(60), statusFor(20)]).toEqual(['strong', 'needs-work', 'at-risk']);
    expect(summary.areas.every((a) => a.impact.length > 20)).toBe(true);
  });

  it('says so when there is nothing to recover', () => {
    const tidy = summarise(runAudit(makeSnapshot({ elements: [{ text: 'Hi' }] }), DEFAULT_ASSUMPTIONS));
    expect(tidy.headline).toMatch(/built consistently/);
  });
});
