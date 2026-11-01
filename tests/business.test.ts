import { describe, expect, it } from 'vitest';
import { runAudit, withAssumptions } from '../src/audit';
import { buildBusinessCase, consistencyLevel, effortSize, rankOpportunities, teamTime } from '../src/business';
import { leadFit, outreachKit, sendChecklist } from '../src/business/outreach';
import { summarise } from '../src/insights';
import { EMPTY_BRANDING } from '../src/report/branding';
import { detailedMarkdown, executiveMarkdown, impactFileName, onePagerHtml, opportunityTask } from '../src/report/business';
import { DEFAULT_ASSUMPTIONS, normaliseAssumptions } from '../src/savings';
import { declaration, makeSnapshot, times } from './helpers';

const messy = makeSnapshot({
  elements: [
    { text: 'Faint', styles: { color: 'rgb(210, 210, 210)' } },
    ...times(3, { styles: { backgroundColor: 'rgb(91, 61, 245)' } }, 'a'),
    { styles: { backgroundColor: 'rgb(92, 62, 245)' } },
    ...Array.from({ length: 20 }, (_, i) => ({ selector: `.s${i}`, styles: { paddingTop: `${10 + i * 3}px` } })),
  ],
  declarations: [
    declaration('background-color', '#5b3df5'),
    declaration('color', '#5b3df5'),
    declaration('border-color', '#5c3ef5'),
    ...Array.from({ length: 6 }, (_, i) => declaration('padding', `${10 + i * 3}px`)),
  ],
});
const audit = runAudit(messy, DEFAULT_ASSUMPTIONS);
const options = { branding: { ...EMPTY_BRANDING, agencyName: 'Northbeam', preparedBy: 'Sam' }, clientName: 'Acme' };

describe('team time and effort sizes', () => {
  it('puts hours in terms a founder plans with', () => {
    expect(teamTime(4)).toBe('under a day for one person');
    expect(teamTime(21)).toBe('about 3 days for one person');
    expect(teamTime(70)).toBe('about 2 weeks for one person');
    expect(teamTime(280)).toBe('2 people for 1 month');
    expect(teamTime(1200)).toMatch(/people for \d+ months/);
  });

  it('sizes effort on fixed bands', () => {
    expect([1, 4, 5, 16, 17].map(effortSize)).toEqual(['small', 'small', 'medium', 'medium', 'large']);
  });

  it('names consistency levels on the blueprint’s bands', () => {
    expect([90, 80, 79, 60, 59, 35, 34].map((s) => consistencyLevel(s).level)).toEqual([
      'Highly consistent',
      'Highly consistent',
      'Mostly consistent',
      'Mostly consistent',
      'Partly consistent',
      'Partly consistent',
      'Inconsistent',
    ]);
  });
});

describe('business case', () => {
  const b = buildBusinessCase(audit);

  it('quotes the same yearly inconsistency figure as the client report', () => {
    expect(b.yearly.inconsistencyHours).toBe(Math.round(audit.savings.annualDragHours));
    const a = DEFAULT_ASSUMPTIONS;
    expect(b.yearly.newScreenHours).toBe(Math.round(a.newScreensPerYear * a.hoursPerNewScreen * a.systemSpeedup));
    expect(b.yearly.hours).toBe(b.yearly.inconsistencyHours + b.yearly.newScreenHours);
  });

  it('gives a likely figure inside its range, and causes that add up to it', () => {
    expect(b.avoidable.low).toBeLessThanOrEqual(b.avoidable.likely);
    expect(b.avoidable.likely).toBeLessThanOrEqual(b.avoidable.high);
    expect(b.causes.reduce((n, c) => n + c.hours, 0)).toBe(b.avoidable.likely);
    expect(b.causes.every((c) => c.basis.length > 0)).toBe(true);
  });

  it('breaks even when the yearly benefit covers the one-time fix', () => {
    expect(b.oneTimeFix.hours).toBeGreaterThan(0);
    expect(b.breakEvenMonths).toBe(Math.max(1, Math.round((b.oneTimeFix.hours / b.yearlyBenefit.hours) * 12)));
    expect(b.roi.map((r) => r.year)).toEqual([1, 2, 3]);
  });

  it('never covers fewer screens than were captured', () => {
    const tiny = buildBusinessCase(withAssumptions(audit, { ...DEFAULT_ASSUMPTIONS, screens: 0 }));
    expect(tiny.screens).toBe(1);
  });

  it('counts the brand colour’s hand-typed copies as edits for a typical change', () => {
    expect(b.typicalChanges.find((c) => c.label === 'Change the brand colour')).toMatchObject({ today: 3, after: 1 });
  });

  it('leaves dismissed opportunities out of the plan', () => {
    const first = audit.analysis.opportunities[0]!;
    expect(buildBusinessCase(audit, [first.id]).ranked.some((r) => r.opportunity.id === first.id)).toBe(false);
  });
});

describe('ranked opportunities', () => {
  const ranked = rankOpportunities(audit);

  it('orders by impact, then by effort', () => {
    const rank = { high: 3, medium: 2, low: 1 };
    for (let i = 1; i < ranked.length; i++) expect(rank[ranked[i - 1]!.impact]).toBeGreaterThanOrEqual(rank[ranked[i]!.impact]);
  });

  it('marks quick wins as high or medium impact for small effort', () => {
    for (const r of ranked) expect(r.quickWin).toBe(r.impact !== 'low' && r.effort === 'small');
  });

  it('copies an opportunity as a self-contained task', () => {
    const task = opportunityTask(ranked[0]!, audit);
    expect(task).toContain(`## ${ranked[0]!.opportunity.title}`);
    expect(task).toMatch(/\*\*Impact:\*\* (High|Medium|Low)/);
    expect(task).toContain('**Done when:**');
  });
});

describe('report versions', () => {
  it('leads the executive summary with what a system would have saved', () => {
    const md = executiveMarkdown(audit, options);
    expect(md).toMatch(/A design system would have saved Acme about \d+ h/);
    expect(md).toContain('## Recommended next steps');
    expect(md).toContain('Prepared by Sam, Northbeam');
  });

  it('lists every open opportunity in the detailed report', () => {
    const md = detailedMarkdown(audit, options);
    for (const o of audit.analysis.opportunities) expect(md).toContain(o.title);
    expect(md).toContain('## Limits of this audit');
  });

  it('escapes the client name in the one-pager', () => {
    const html = onePagerHtml(audit, { ...options, clientName: '<b>Acme</b>' });
    expect(html).not.toContain('<b>Acme</b>');
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(impactFileName('Acme Billing', 'html')).toBe('acme-billing-design-system-impact.html');
  });
});

describe('outreach', () => {
  const b = buildBusinessCase(audit);
  const summary = summarise(audit, { clientName: 'Acme' });

  it('scores lead fit from 0 to 100 with reasons', () => {
    const fit = leadFit(audit, b, summary);
    expect(fit.score).toBeGreaterThanOrEqual(0);
    expect(fit.score).toBeLessThanOrEqual(100);
    expect(fit.reasons.length).toBeGreaterThan(0);
    expect(fit.angle).toMatch(/^Lead with/);
  });

  it('drafts messages from their own product and never quotes a price', () => {
    for (const audience of ['founder', 'design', 'engineering'] as const) {
      const kit = outreachKit({ audit, summary, business: b, branding: options.branding, audience, recipient: 'Priya' });
      expect(kit.email.startsWith('Hi Priya,')).toBe(true);
      expect(kit.email).toContain('Acme');
      expect(kit.email).toContain('Sam, Northbeam');
      expect(kit.linkedin.length).toBeLessThanOrEqual(400);
      expect(`${kit.email} ${kit.followUp} ${kit.linkedin}`).not.toMatch(/our (price|fee|rate)|we charge|per project/i);
      expect(kit.subjects).toHaveLength(3);
    }
  });

  it('checks the audit is ready to send', () => {
    const items = sendChecklist(audit, options.branding, false, 0);
    expect(items.find((i) => i.label.startsWith('Your name and agency'))!.done).toBe(true);
    expect(items.find((i) => i.label.startsWith('Three or more pages'))!.done).toBe(false);
  });
});

describe('assumptions', () => {
  it('fills in team numbers missing from older saved settings', () => {
    const old = normaliseAssumptions({ hourlyRate: 120, effort: { smallFix: 3 } as never });
    expect(old.hourlyRate).toBe(120);
    expect(old.screens).toBe(DEFAULT_ASSUMPTIONS.screens);
    expect(old.effort.smallFix).toBe(3);
    expect(old.effort.largeFix).toBe(DEFAULT_ASSUMPTIONS.effort.largeFix);
  });
});
