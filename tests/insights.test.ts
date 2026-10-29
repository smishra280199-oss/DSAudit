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
  const summary = summarise(audit, { clientName: 'Acme' });

  it('leads with the yearly cost in plain words, and never prices a service', () => {
    expect(summary.headline).toMatch(/^Inconsistency is quietly costing your team about \$[\d,]+ a year\.$/);
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/cleanup|payback|invoice us|our fee/i);
  });

  it('speaks to the client personally', () => {
    expect(summary.intro).toContain('of Acme the way your customers see it');
    // One colour copy is too little to lead with, so the hook falls back to the contrast finding.
    expect(summary.hook).toMatch(/hard to read/);
  });

  it('turns findings into pain points with their own examples', () => {
    const colours = summary.painPoints.find((p) => p.id === 'colours')!;
    expect(colours.title).toMatch(/exists in 2 slightly different shades/);
    expect(colours.story).toContain('#5b3df5');
    expect(colours.evidence.kind).toBe('colours');
    expect(colours.annualCost).toBeGreaterThan(0);
    const contrast = summary.painPoints.find((p) => p.id === 'contrast')!;
    expect(contrast.story).toContain('“Faint”');
  });

  it('orders pain points by priority and leaves out the ones you exclude', () => {
    const rank = { high: 3, medium: 2, low: 1 };
    const points = summary.painPoints;
    expect(points.every((p, i) => i === 0 || rank[points[i - 1]!.severity] >= rank[p.severity])).toBe(true);
    const without = summarise(audit, { dismissed: [points[0]!.id] });
    expect(without.painPoints.map((p) => p.id)).not.toContain(points[0]!.id);
  });

  it('splits the stock-take into gaps (worst first) and things already fine', () => {
    expect(summary.metrics.every((m) => m.status !== 'strong')).toBe(true);
    expect(summary.healthyMetrics.every((m) => m.status === 'strong')).toBe(true);
    const order = { 'at-risk': 0, 'needs-work': 1, strong: 2 };
    expect(summary.metrics.every((m, i) => i === 0 || order[summary.metrics[i - 1]!.status] <= order[m.status])).toBe(true);
    const spacing = summary.metrics.find((m) => m.key === 'spacing')!;
    expect(spacing).toMatchObject({ found: '20', healthy: 'about 12' });
  });

  it('gives every problem a layer, a count of places, a one-line summary and a fix', () => {
    for (const p of summary.painPoints) {
      expect(['Tokens & styles', 'Components', 'Elements']).toContain(p.layer);
      expect(p.count).toBeGreaterThan(0);
      expect(p.summary.length).toBeLessThan(160);
      expect(p.fixTitle).toBeTruthy();
    }
    const spacing = summary.painPoints.find((p) => p.id === 'spacing')!;
    // 20 distinct paddings, of which 15 uses are off the 4px grid.
    expect(spacing.count).toBe(15);
  });

  it('maps problems by layer, prices each fix and lists strengths', () => {
    expect(summary.layers.map((l) => l.layer)).toEqual(['Tokens & styles', 'Components', 'Elements']);
    expect(summary.layers.reduce((n, l) => n + l.problems, 0)).toBe(summary.painPoints.length);
    summary.fixes.forEach((f, i) => {
      const p = summary.painPoints[i]!;
      expect(f.problem).toBe(i + 1);
      expect(f.annualSaving).toBe(p.annualCost ? Math.round(p.annualCost * DEFAULT_ASSUMPTIONS.realisationRate) : null);
    });
    expect(summary.beforeAfter.every((b) => b.after < b.today)).toBe(true);
    const strongAreas = summary.areas.filter((a) => a.status === 'strong').map((a) => a.label);
    expect(summary.strengths.map((s) => s.title).sort()).toEqual(strongAreas.sort());
  });

  it('labels area health and explains its terms', () => {
    expect([statusFor(90), statusFor(60), statusFor(20)]).toEqual(['strong', 'needs-work', 'at-risk']);
    expect(summary.glossary.map((g) => g.term)).toContain('Design token');
  });

  it('says so when there is nothing to recover', () => {
    const tidy = summarise(runAudit(makeSnapshot({ elements: [{ text: 'Hi' }] }), DEFAULT_ASSUMPTIONS), { clientName: 'Tidy' });
    expect(tidy.headline).toMatch(/built consistently/);
  });
});
