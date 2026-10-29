/**
 * Executive insights: the audit condensed into what a VP of Design or
 * Product needs at a glance. What inconsistency costs, what you have versus
 * what you need, where to start, and a phased plan. Both the panel overview
 * and the client report are rendered from this one model.
 */

import type { Audit } from '../audit';
import type { AreaKey, Opportunity, Severity } from '../inference/types';
import type { ConsolidationLine } from '../savings';
import { AREA_IMPACT, OPPORTUNITY_IMPACT, STATUS_LABELS, type HealthStatus } from './narrative';

export { STATUS_LABELS, type HealthStatus };

/** Focused hours one person delivers per week, for turning effort into timelines. */
export const HOURS_PER_WEEK = 30;

export interface AreaHealth {
  key: AreaKey;
  label: string;
  score: number;
  status: HealthStatus;
  impact: string;
}

export interface Priority {
  id: string;
  title: string;
  why: string;
  fix: string;
  severity: Severity;
  effortHours: number;
  area: AreaKey;
}

export interface Phase {
  name: string;
  outcome: string;
  hours: number;
  weeks: number;
  items: string[];
}

export interface KeyFact {
  value: string;
  label: string;
}

export interface ExecutiveSummary {
  score: number;
  grade: string;
  maturity: string;
  /** The one sentence a decision maker should remember. */
  headline: string;
  subheadline: string;
  /** Rows with something to consolidate, costliest first. */
  consolidation: ConsolidationLine[];
  consolidationTotals: { current: number; recommended: number; reduction: number };
  areas: AreaHealth[];
  /** Areas in the worst state, worst first. */
  weakest: AreaHealth[];
  priorities: Priority[];
  plan: Phase[];
  facts: KeyFact[];
  /** Person-weeks of cleanup at HOURS_PER_WEEK. */
  personWeeks: number;
  /** The cleanup effort in words: "about 16 hours" or "about 3 person-weeks". */
  cleanupDuration: string;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function statusFor(score: number): HealthStatus {
  return score >= 75 ? 'strong' : score >= 50 ? 'needs-work' : 'at-risk';
}

const PHASES: { name: string; outcome: string; areas: AreaKey[] }[] = [
  {
    name: 'Foundations & tokens',
    outcome: 'One palette, type scale and spacing grid, expressed as design tokens.',
    areas: ['color', 'typography', 'spacing', 'shape', 'elevation', 'motion', 'tokens'],
  },
  {
    name: 'Component consolidation',
    outcome: 'Named, reusable component variants that replace one-off styles.',
    areas: ['components'],
  },
  {
    name: 'Accessibility & interaction',
    outcome: 'WCAG AA contrast, labelled controls and consistent hover and focus states.',
    areas: ['accessibility', 'interaction'],
  },
];

function weeks(hours: number): number {
  return Math.max(0.5, Math.round((hours / HOURS_PER_WEEK) * 2) / 2);
}

function priorityFrom(o: Opportunity): Priority {
  return { id: o.id, title: o.title, why: OPPORTUNITY_IMPACT[o.kind], fix: o.fix, severity: o.severity, effortHours: o.effortHours, area: o.area };
}

/** High severity first; among equals, the cheapest to fix (quick wins) first. */
function byPriority(a: Opportunity, b: Opportunity): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.effortHours - b.effortHours;
}

export function summarise(audit: Audit, dismissed: string[] = []): ExecutiveSummary {
  const { analysis, score, savings, assumptions } = audit;
  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: assumptions.currency, maximumFractionDigits: 0 }).format(n);
  const open = analysis.opportunities.filter((o) => !dismissed.includes(o.id));

  const areas: AreaHealth[] = score.areas
    .filter((a) => a.applicable)
    .map((a) => {
      const status = statusFor(a.score);
      return { key: a.key, label: a.label, score: a.score, status, impact: AREA_IMPACT[a.key][status] };
    });
  const weakest = areas.filter((a) => a.status !== 'strong').sort((a, b) => a.score - b.score);

  const consolidation = savings.lines.filter((l) => l.excess > 0).sort((a, b) => b.annualHours - a.annualHours);
  const current = consolidation.reduce((n, l) => n + l.current, 0);
  const recommended = consolidation.reduce((n, l) => n + l.recommended, 0);

  const plan = PHASES.map((phase) => {
    const items = open.filter((o) => phase.areas.includes(o.area));
    const hours = Math.round(items.reduce((n, o) => n + o.effortHours, 0) * 10) / 10;
    return { name: phase.name, outcome: phase.outcome, hours, weeks: weeks(hours), items: items.sort(byPriority).map((o) => o.title) };
  }).filter((p) => p.items.length > 0);

  const personWeeks = weeks(savings.cleanupHours);
  const cleanupDuration =
    savings.cleanupHours < HOURS_PER_WEEK
      ? `about ${Math.max(1, Math.round(savings.cleanupHours))} hours`
      : `about ${personWeeks} person-weeks`;
  const { tokens, accessibility } = analysis;
  const facts: KeyFact[] = [
    { value: `${Math.round((tokens.coverage ?? 0) * 100)}%`, label: 'of styling uses design tokens' },
    { value: savings.retheme.literals.toLocaleString('en-US'), label: 'hard-coded style values' },
    { value: `${(analysis.foundations.color.palette ?? []).flatMap((c) => c.members).length}`, label: 'colours in use' },
    { value: `${accessibility.contrastFailures.length}`, label: 'text elements below WCAG AA contrast' },
  ];

  const headline =
    savings.annualDragCost > 0
      ? `Inconsistency is costing an estimated ${money(savings.annualDragCost)} a year.`
      : 'This product is built consistently. There is little design debt to recover.';
  const subheadline =
    savings.annualDragCost > 0
      ? `That is about ${Math.round(savings.annualDragHours).toLocaleString('en-US')} hours of design and engineering time. ` +
        `A one-time cleanup of ${cleanupDuration} (~${money(savings.cleanupCost)}) recovers ~${money(savings.annualSavings)} a year` +
        (savings.paybackMonths !== null ? ` and pays back in ${savings.paybackMonths} months.` : '.')
      : 'Keep it that way with tokens and a component library as the product grows.';

  return {
    score: score.overall,
    grade: score.grade,
    maturity: score.maturity,
    headline,
    subheadline,
    consolidation,
    consolidationTotals: { current, recommended, reduction: current === 0 ? 0 : Math.round(((current - recommended) / current) * 100) },
    areas,
    weakest,
    priorities: [...open].sort(byPriority).slice(0, 3).map(priorityFrom),
    plan,
    facts,
    personWeeks,
    cleanupDuration,
  };
}
