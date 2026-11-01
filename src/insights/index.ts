/**
 * The executive summary: the audit retold for someone who has never seen a
 * design audit before. A personal introduction, one thing they probably
 * didn't know, what inconsistency costs them, the pain points (where, why,
 * what to do) and a plain stock-take of their design system.
 *
 * The panel overview and every client report render this one model. It
 * deliberately says nothing about the cost of anyone's services.
 */

import type { Audit } from '../audit';
import type { AreaKey } from '../inference/types';
import { formatMoney } from '../savings';
import { pageName } from './describe';
import { findPainPoints, PROBLEM_LAYERS, type PainPoint, type ProblemLayer } from './findings';
import { AREA_IMPACT, GLOSSARY, METRIC_LABELS, STATUS_LABELS, type HealthStatus } from './narrative';

export { STATUS_LABELS, GLOSSARY, type HealthStatus, type PainPoint, type ProblemLayer };
export type { Evidence } from './findings';

export interface AreaHealth {
  key: AreaKey;
  label: string;
  score: number;
  status: HealthStatus;
  impact: string;
}

/** One row of the stock-take: what we found against what a tidy system has. */
export interface MetricRow {
  key: string;
  label: string;
  explainer: string;
  found: string;
  /** Extra context for the found value, e.g. "8 near-identical copies". */
  foundNote: string;
  healthy: string;
  status: HealthStatus;
  /** Yearly cost of the difference; null when it can't be priced or there is none. */
  annualCost: number | null;
  selectors: string[];
}

/** Problems grouped by where they live: tokens and styles, components, or individual elements. */
export interface LayerSummary {
  layer: ProblemLayer;
  problems: number;
  places: number;
  annualCost: number;
}

/** One fix in part two, linked to the problem it solves. */
export interface Fix {
  /** 1-based number of the problem this fixes. */
  problem: number;
  title: string;
  detail: string;
  /** The realistic yearly saving (cost × realisation rate); null when it can't be priced. */
  annualSaving: number | null;
}

/** A building block's count today and after the suggested cleanup. */
export interface BeforeAfter {
  label: string;
  today: number;
  after: number;
}

/** Something the product already does well. */
export interface Strength {
  title: string;
  detail: string;
}

export interface PageSummary {
  name: string;
  url: string;
  elements: number;
}

export interface ExecutiveSummary {
  clientName: string;
  score: number;
  status: HealthStatus;
  scoreExplainer: string;
  pages: PageSummary[];
  intro: string;
  /** One thing they probably didn't know about their product. */
  hook: string | null;
  headline: string;
  subheadline: string;
  numbers: { pages: number; stylesFound: number; hoursLost: number; yearlyCost: number; recoverable: number };
  painPoints: PainPoint[];
  layers: LayerSummary[];
  fixes: Fix[];
  beforeAfter: BeforeAfter[];
  strengths: Strength[];
  /** Stock-take rows that need attention, biggest gaps first. */
  metrics: MetricRow[];
  /** Everything else we checked that is already in good shape. */
  healthyMetrics: MetricRow[];
  areas: AreaHealth[];
  glossary: typeof GLOSSARY;
}

export function statusFor(score: number): HealthStatus {
  return score >= 75 ? 'strong' : score >= 50 ? 'needs-work' : 'at-risk';
}

const STATUS_RANK: Record<HealthStatus, number> = { 'at-risk': 0, 'needs-work': 1, strong: 2 };

const SCORE_WORDS: Record<HealthStatus, string> = {
  strong: 'a healthy design system',
  'needs-work': 'a good foundation with clear gaps',
  'at-risk': 'a design system that has drifted a long way',
};

function lineStatus(current: number, excess: number): HealthStatus {
  if (excess <= 0) return 'strong';
  return excess / current > 0.3 ? 'at-risk' : 'needs-work';
}

function metricRows(audit: Audit, painPoints: PainPoint[]): MetricRow[] {
  const { savings, analysis } = audit;
  const rows: MetricRow[] = [];
  const colourCopies = (analysis.foundations.color.palette ?? []).reduce((n, c) => n + c.members.length - 1, 0);

  for (const line of savings.lines) {
    if (line.current === 0) continue;
    const meta =
      METRIC_LABELS[line.key] ??
      (line.kind === 'variant'
        ? { label: line.label.replace(' variants', ' styles'), explainer: `Visually different versions of your ${line.label.replace(' variants', '').toLowerCase()}s` }
        : { label: line.label, explainer: '' });
    const twins =
      line.key === 'colors'
        ? colourCopies
        : (Object.values(analysis.foundations)
            .flatMap((f) => f.groups)
            .find((g) => g.key === line.key)
            ?.values.filter((v) => v.nearDuplicateOf).length ?? 0);
    rows.push({
      key: line.key,
      label: meta.label,
      explainer: meta.explainer,
      found: String(line.current),
      foundNote: twins > 0 ? `${twins} near-identical ${twins === 1 ? 'copy' : 'copies'}` : '',
      healthy: line.excess > 0 ? `about ${line.recommended}` : `${line.current} is fine`,
      status: lineStatus(line.current, line.excess),
      annualCost: line.excess > 0 ? line.annualCost : null,
      selectors: line.selectors,
    });
  }

  const coverage = analysis.tokens.coverage;
  if (coverage !== null) {
    const tokenPoint = painPoints.find((p) => p.id === 'tokens');
    rows.push({
      key: 'tokens',
      label: 'Styling that uses tokens',
      explainer: 'Values that come from named design tokens instead of being typed in',
      found: `${Math.round(coverage * 100)}%`,
      foundNote: `${savings.retheme.literals.toLocaleString('en-US')} values typed by hand`,
      healthy: '70% or more',
      status: coverage >= 0.7 ? 'strong' : coverage >= 0.4 ? 'needs-work' : 'at-risk',
      annualCost: tokenPoint?.annualCost ?? null,
      selectors: [],
    });
  }

  const { textChecked, contrastFailures } = analysis.accessibility;
  if (textChecked > 0) {
    const share = contrastFailures.length / textChecked;
    rows.push({
      key: 'contrast',
      label: 'Readable text',
      explainer: 'Text with enough contrast to meet the WCAG accessibility standard',
      found: `${textChecked - contrastFailures.length} of ${textChecked}`,
      foundNote: contrastFailures.length ? `${contrastFailures.length} too faint` : '',
      healthy: `all ${textChecked}`,
      status: share === 0 ? 'strong' : share < 0.1 ? 'needs-work' : 'at-risk',
      annualCost: null,
      selectors: contrastFailures.map((f) => f.selector),
    });
  }

  const { interactiveCount, withFocus, outlineRemovedWithoutReplacement } = analysis.interaction;
  if (interactiveCount > 0) {
    rows.push({
      key: 'focus',
      label: 'Visible keyboard focus',
      explainer: 'Controls that show where you are when using the Tab key',
      found: `${withFocus} of ${interactiveCount}`,
      foundNote: outlineRemovedWithoutReplacement.length ? 'focus outline switched off in places' : '',
      healthy: `all ${interactiveCount}`,
      status: outlineRemovedWithoutReplacement.length ? 'at-risk' : withFocus / interactiveCount >= 0.6 ? 'strong' : 'needs-work',
      annualCost: null,
      selectors: [],
    });
  }

  return rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.annualCost ?? 0) - (a.annualCost ?? 0));
}

function pagesOf(audit: Audit): PageSummary[] {
  const { snapshot } = audit;
  const refs = snapshot.pages ?? [{ url: snapshot.url, title: snapshot.title, elementCount: snapshot.rendered.elements.length }];
  return refs.map((p) => ({ name: pageName(p), url: p.url, elements: p.elementCount }));
}

function hookFor(audit: Audit, painPoints: PainPoint[]): string | null {
  const palette = audit.analysis.foundations.color.palette ?? [];
  const copies = palette.reduce((n, c) => n + c.members.length - 1, 0);
  const total = palette.reduce((n, c) => n + c.members.length, 0);
  if (copies >= 2) {
    return `Your product uses ${total} different colours, and ${copies} of them are near-identical copies of another colour that nobody could tell apart by eye.`;
  }
  const lookalikes = painPoints.find((p) => p.id.startsWith('component-') && p.title.includes('built differently'));
  if (lookalikes) return `${lookalikes.title}. To a customer they’re the same thing; to your team they’re separate pieces to maintain.`;
  const contrast = painPoints.find((p) => p.id === 'contrast');
  if (contrast) return `${contrast.title}, below the accessibility standard many companies are now required to meet.`;
  // Only a finding worth acting on makes the opening line; minor polish never does.
  return painPoints.find((p) => p.severity !== 'low')?.title ?? null;
}

export function summarise(audit: Audit, options: { clientName?: string; dismissed?: string[] } = {}): ExecutiveSummary {
  const { savings, score, assumptions } = audit;
  const money = (n: number) => formatMoney(n, assumptions.currency);
  const clientName = options.clientName || 'your product';
  const painPoints = findPainPoints(audit, options.dismissed);
  const pages = pagesOf(audit);
  const status = statusFor(score.overall);

  const pagesPhrase =
    pages.length === 1
      ? `${pages[0]!.name === 'the home page' ? 'the home page' : `the ${pages[0]!.name} page`}`
      : `${pages.length} pages (${pages.slice(0, 4).map((p) => p.name).join(', ')}${pages.length > 4 ? '…' : ''})`;

  const stylesFound = savings.lines.reduce((n, l) => n + l.current, 0);
  const metrics = metricRows(audit, painPoints);
  const areas: AreaHealth[] = score.areas
    .filter((a) => a.applicable)
    .map((a) => {
      const s = statusFor(a.score);
      return { key: a.key, label: a.label, score: a.score, status: s, impact: AREA_IMPACT[a.key][s] };
    });
  const realised = (n: number | null) => (n ? Math.round(n * assumptions.realisationRate) : null);
  const headline =
    savings.annualDragCost > 0
      ? `We estimate inconsistency is costing your team about ${money(savings.annualDragCost)} a year.`
      : `${clientName} is built consistently. There is very little design debt here.`;
  const subheadline =
    savings.annualDragCost > 0
      ? `That is roughly ${Math.round(savings.annualDragHours)} hours of design and development time spent choosing between near-identical options, fixing small inconsistencies and editing values by hand. Tidying the design system up could give back around ${money(savings.annualSavings)} of that every year.`
      : 'The findings below are small refinements rather than problems.';

  return {
    clientName,
    score: score.overall,
    status,
    scoreExplainer: `We score consistency from 0 to 100, where 75 and above is a healthy design system. ${clientName} scores ${score.overall}, which we’d describe as ${SCORE_WORDS[status]}.`,
    pages,
    intro:
      `We looked at ${pagesPhrase} of ${clientName} the way your customers see it, and took stock of how it is built: every colour, text size, gap and component. ` +
      `Below, we walk you through what we found, where it shows up and what it is likely costing your team, in plain language and with suggestions you can act on.`,
    hook: hookFor(audit, painPoints),
    headline,
    subheadline,
    numbers: {
      pages: pages.length,
      stylesFound,
      hoursLost: Math.round(savings.annualDragHours),
      yearlyCost: savings.annualDragCost,
      recoverable: savings.annualSavings,
    },
    painPoints,
    metrics: metrics.filter((m) => m.status !== 'strong'),
    healthyMetrics: metrics.filter((m) => m.status === 'strong'),
    layers: PROBLEM_LAYERS.map((layer) => {
      const inLayer = painPoints.filter((p) => p.layer === layer);
      return {
        layer,
        problems: inLayer.length,
        places: inLayer.reduce((n, p) => n + p.count, 0),
        annualCost: inLayer.reduce((n, p) => n + (p.annualCost ?? 0), 0),
      };
    }),
    fixes: painPoints.map((p, i) => ({ problem: i + 1, title: p.fixTitle, detail: p.suggestion, annualSaving: realised(p.annualCost) })),
    beforeAfter: savings.lines
      .filter((l) => l.excess > 0)
      .sort((a, b) => b.excess / b.current - a.excess / a.current)
      .map((l) => ({ label: METRIC_LABELS[l.key]?.label ?? l.label.replace(' variants', ' styles'), today: l.current, after: l.recommended })),
    strengths: areas
      .filter((a) => a.status === 'strong')
      .sort((a, b) => b.score - a.score)
      .map((a) => ({ title: a.label, detail: a.impact })),
    areas,
    glossary: GLOSSARY,
  };
}
