/**
 * The business case: the audit retold as hours and money a founder or design
 * lead can act on. It answers four questions, in this order:
 *
 *  1. What would a design system have saved so far?   (avoidable work, by cause)
 *  2. What does carrying on like this cost every year? (inconsistency + slower new screens)
 *  3. What does closing the gaps cost, once?           (one-time fix, break-even)
 *  4. Where do we start?                               (prioritised opportunities, quick wins)
 *
 * Every figure is built from a count in the audit times an editable
 * assumption ("Your team's numbers"), so each one can be traced and defended
 * in a sales conversation. Figures carry a likely range whose width follows
 * how much of the product the capture could actually see.
 *
 * The yearly inconsistency figure is the same one the client report prints
 * (savings.annualDragHours), so the panel, the PDF and any outreach quote
 * one number.
 */

import type { Audit } from '../audit';
import { parseColor, deltaE } from '../shared/color';
import type { AreaKey, ConfidenceLevel, Opportunity, OpportunityKind, Severity } from '../inference/types';
import type { DeclarationCategory } from '../shared/snapshot';
import type { SavingsAssumptions } from '../savings';

// ── Opportunities, enriched for prioritising ────────────────────────────

export type Impact = Severity;
export type EffortSize = 'small' | 'medium' | 'large';

/** How a finding was established, from most to least certain. */
export type Basis = 'Measured' | 'From CSS' | 'Estimated';

export interface RankedOpportunity {
  opportunity: Opportunity;
  impact: Impact;
  effort: EffortSize;
  /** Team hours to close it, from the effort-per-item assumptions. */
  hours: number;
  quickWin: boolean;
  /** How sure the analysis is that this change is right, 0–100. */
  confidence: number;
  basis: Basis;
  /** What the client gets from fixing it, in one sentence. */
  benefit: string;
  /** "Merge look-alike values", "Adopt tokens"… */
  changeType: string;
}

const IMPACT_RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1 };
const EFFORT_RANK: Record<EffortSize, number> = { small: 1, medium: 2, large: 3 };

/** Inference effort (hours of hands-on work) → a size people plan with. */
export function effortSize(effortHours: number): EffortSize {
  return effortHours <= 4 ? 'small' : effortHours <= 16 ? 'medium' : 'large';
}

const KIND_META: Record<OpportunityKind, { basis: Basis; certainty: number; changeType: string }> = {
  'merge-near-duplicate-colors': { basis: 'Measured', certainty: 95, changeType: 'Merge look-alike values' },
  'reduce-palette': { basis: 'Measured', certainty: 75, changeType: 'Trim the palette' },
  'consolidate-type-scale': { basis: 'Measured', certainty: 85, changeType: 'Adopt a type scale' },
  'off-scale-spacing': { basis: 'Measured', certainty: 85, changeType: 'Snap to the spacing grid' },
  'reduce-shape-values': { basis: 'Measured', certainty: 80, changeType: 'Merge look-alike values' },
  'reduce-elevation-values': { basis: 'Measured', certainty: 80, changeType: 'Merge look-alike values' },
  'unify-motion': { basis: 'From CSS', certainty: 70, changeType: 'Unify motion' },
  'tokenize-literals': { basis: 'From CSS', certainty: 85, changeType: 'Introduce tokens' },
  'adopt-existing-tokens': { basis: 'From CSS', certainty: 90, changeType: 'Use the tokens you have' },
  'component-variant-sprawl': { basis: 'Estimated', certainty: 70, changeType: 'Consolidate a component' },
  'merge-near-duplicate-variants': { basis: 'Measured', certainty: 85, changeType: 'Merge look-alike variants' },
  'focus-outline-removed': { basis: 'From CSS', certainty: 95, changeType: 'Restore keyboard focus' },
  'missing-focus-style': { basis: 'From CSS', certainty: 80, changeType: 'Design focus states' },
  'missing-hover-style': { basis: 'From CSS', certainty: 70, changeType: 'Design hover states' },
  'low-contrast': { basis: 'Measured', certainty: 90, changeType: 'Fix text contrast' },
  'missing-accessible-name': { basis: 'Measured', certainty: 90, changeType: 'Name controls' },
  'mixed-naming-conventions': { basis: 'Estimated', certainty: 60, changeType: 'Agree a naming convention' },
};

const CONFIDENCE_FACTOR: Record<ConfidenceLevel, number> = { high: 1, medium: 0.9, low: 0.75 };

/** Why fixing an area pays off, in the reader's terms. */
export const AREA_BENEFIT: Record<AreaKey, string> = {
  color: 'One palette makes screens feel like one product and turns rebrands and dark mode into token edits.',
  typography: 'A type scale keeps hierarchy obvious and ends the “which size is this?” debate in every review.',
  spacing: 'A spacing grid makes layouts line up without nudging and speeds up every new screen.',
  shape: 'Shared corner and border values make components look like they belong together.',
  elevation: 'A few named shadow levels make depth meaningful instead of decorative.',
  motion: 'Shared timings make the product feel deliberate and are easy to tune in one place.',
  components: 'One build per control means one place to fix bugs, change styling and get accessibility right.',
  tokens: 'Tokens turn a visual change from a hunt through the code into one edit.',
  interaction: 'Designed hover and focus states make the product easier to use and to navigate by keyboard.',
  accessibility: 'Readable, labelled UI reaches more customers and reduces legal and procurement risk.',
};

export function rankOpportunities(audit: Audit, dismissed: string[] = []): RankedOpportunity[] {
  const e = audit.assumptions.effort;
  const factor = CONFIDENCE_FACTOR[audit.analysis.confidence.level];
  return audit.analysis.opportunities
    .filter((o) => !dismissed.includes(o.id))
    .map((o) => {
      const effort = effortSize(o.effortHours);
      const meta = KIND_META[o.kind];
      const impact = o.severity;
      const sizeHours = effort === 'small' ? e.smallFix : effort === 'medium' ? e.mediumFix : e.largeFix;
      return {
        opportunity: o,
        impact,
        effort,
        hours: Math.max(sizeHours, Math.round(o.effortHours)),
        quickWin: impact !== 'low' && effort === 'small',
        confidence: Math.round(meta.certainty * factor),
        basis: meta.basis,
        benefit: AREA_BENEFIT[o.area],
        changeType: meta.changeType,
      };
    })
    .sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact] || EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort] || b.opportunity.affected - a.opportunity.affected);
}

/** Opportunity counts by impact (rows) and effort (columns), for the matrix. */
export function impactEffortMatrix(ranked: RankedOpportunity[]): Record<Impact, Record<EffortSize, number>> {
  const empty = () => ({ small: 0, medium: 0, large: 0 });
  const m: Record<Impact, Record<EffortSize, number>> = { high: empty(), medium: empty(), low: empty() };
  for (const r of ranked) m[r.impact][r.effort] += 1;
  return m;
}

// ── The business case ───────────────────────────────────────────────────

export interface TimeCause {
  key: 'variants' | 'copies' | 'decisions';
  label: string;
  /** How the hours were worked out, for the tooltip and the report. */
  basis: string;
  hours: number;
}

export interface Range {
  low: number;
  likely: number;
  high: number;
}

export interface TypicalChange {
  label: string;
  /** Places to edit today. */
  today: number;
  /** Places to edit with the proposed tokens and components. */
  after: number;
  unit: string;
}

export interface BusinessCase {
  confidence: ConfidenceLevel;
  /**
   * How far the product is from a mature system, 0–1. A product that already
   * has one gains nothing more from "having a design system", so the new-screen
   * speed-up is scaled by this gap.
   */
  maturityGap: number;
  /** The speed-up this product would actually see on new screens: speed-up × gap. */
  effectiveSpeedup: number;
  /** Work a design system would have avoided so far, in hours. */
  avoidable: Range;
  avoidableCost: number;
  /** Where that time went, biggest first. */
  causes: TimeCause[];
  /** "2 people for 1 month". */
  teamTime: string;
  /** Screens the estimate covers (captured pages scaled up to the product). */
  screens: number;
  pagesCaptured: number;
  yearly: {
    /** Inconsistency drag: the client report's yearly figure. */
    inconsistencyHours: number;
    /** Extra time every new screen takes without a system. */
    newScreenHours: number;
    hours: number;
    cost: number;
  };
  /** One-time cost of closing every open opportunity. */
  oneTimeFix: { hours: number; cost: number; opportunities: number };
  /** Yearly hours a system gives back: recoverable drag plus faster new screens. */
  yearlyBenefit: { hours: number; cost: number };
  /** Months until the fix pays for itself; null when there is nothing to fix or save. */
  breakEvenMonths: number | null;
  /** Cumulative savings at the end of each year, for the ROI chart. */
  roi: { year: number; savings: number }[];
  /** Parts to maintain today and after shared tokens and components. */
  parts: { today: number; after: number };
  typicalChanges: TypicalChange[];
  ranked: RankedOpportunity[];
  quickWins: RankedOpportunity[];
  /** The few gaps worth closing first, with the time they take together. */
  nextSteps: { items: RankedOpportunity[]; hours: number };
  /** Short facts for "What we found", with accessibility flagged. */
  highlights: { text: string; warning: boolean }[];
}

const RANGE: Record<ConfidenceLevel, [number, number]> = { high: [0.75, 1.3], medium: [0.6, 1.6], low: [0.45, 2] };

/** Productive hours in one person-month of design and engineering. */
const HOURS_PER_MONTH = 140;

/** 320 h → "2 people for 1 month"; 30 h → "about 4 days for one person". */
export function teamTime(hours: number): string {
  if (hours <= 0) return 'no time';
  if (hours < 8) return 'under a day for one person';
  if (hours < 35) return `about ${Math.round(hours / 7)} days for one person`;
  if (hours <= HOURS_PER_MONTH) return `about ${Math.max(1, Math.round(hours / 35))} weeks for one person`;
  for (const months of [1, 2, 3, 6, 12]) {
    const people = Math.round(hours / (HOURS_PER_MONTH * months));
    if (people <= 4) return `${Math.max(1, people)} ${people <= 1 ? 'person' : 'people'} for ${months} ${months === 1 ? 'month' : 'months'}`;
  }
  return `${Math.round(hours / (HOURS_PER_MONTH * 12))} people for a year`;
}

function round(n: number): number {
  return Math.round(n);
}

/** Hard-coded declarations of a category. */
function literalCount(audit: Audit, category: DeclarationCategory): number {
  return applied(audit).filter((d) => d.category === category && d.kind === 'literal').length;
}

/** Declarations that style something on the captured pages; framework rules nobody uses don't count as edits. */
function applied(audit: Audit) {
  return audit.snapshot.authored.declarations.filter((d) => d.matchCount > 0 && d.mediaMatches);
}

function typicalChanges(audit: Audit): TypicalChange[] {
  const { analysis } = audit;
  const changes: TypicalChange[] = [];

  // The brand colour: the most used non-neutral colour, and every hand-typed copy of it.
  const brand = (analysis.foundations.color.palette ?? []).find((c) => !c.neutral);
  const brandRgb = brand ? parseColor(brand.hex) : null;
  if (brandRgb) {
    const today = applied(audit).filter((d) => {
      if (d.category !== 'color' || d.kind !== 'literal') return false;
      const c = parseColor(d.value);
      return c !== null && deltaE(c, brandRgb) < 2.3;
    }).length;
    if (today > 1) changes.push({ label: 'Change the brand colour', today, after: 1, unit: 'edits' });
  }

  // Primary, secondary and danger are deliberate: only styles beyond what a system needs count.
  const buttons = analysis.components.find((c) => c.kind === 'button');
  const buttonLine = audit.savings.lines.find((l) => l.key === 'component-button');
  if (buttons && buttonLine && buttonLine.excess > 0) {
    changes.push({ label: 'Restyle every button', today: buttons.variants.length, after: buttonLine.recommended, unit: 'separate button styles to edit' });
  }

  const spacing = literalCount(audit, 'spacing');
  const spacingValues = analysis.foundations.spacing.groups[0]?.values.length ?? 0;
  if (spacing > 1) changes.push({ label: 'Tighten the spacing', today: spacing, after: Math.max(1, Math.min(spacingValues, 8)), unit: 'edits' });

  const sizes = literalCount(audit, 'font-size');
  if (sizes > 1) changes.push({ label: 'Adjust the text sizes', today: sizes, after: Math.max(1, Math.min(analysis.foundations.typography.groups.find((g) => g.key === 'font-size')?.values.length ?? 1, 8)), unit: 'edits' });

  return changes.filter((c) => c.today > c.after).slice(0, 4);
}

function highlights(audit: Audit, ranked: RankedOpportunity[]): BusinessCase['highlights'] {
  const out: BusinessCase['highlights'] = [];
  const { analysis } = audit;
  const palette = analysis.foundations.color.palette ?? [];
  const copies = palette.reduce((n, c) => n + c.members.length - 1, 0);
  if (copies > 0) out.push({ text: `${copies} colours are near-identical copies of another colour.`, warning: false });
  const sprawl = analysis.components.filter((c) => c.variants.length > c.target).sort((a, b) => b.variants.length - a.variants.length)[0];
  if (sprawl) out.push({ text: `${sprawl.label} come in ${sprawl.variants.length} different styles; about ${sprawl.target} would do.`, warning: false });
  const coverage = analysis.tokens.coverage;
  if (coverage !== null && coverage < 0.5) out.push({ text: `Only ${Math.round(coverage * 100)}% of styling goes through design tokens.`, warning: false });
  const contrast = analysis.accessibility.contrastFailures.length;
  if (contrast > 0) out.push({ text: `${contrast} ${contrast === 1 ? 'piece of text fails' : 'pieces of text fail'} the WCAG AA contrast standard.`, warning: true });
  const removed = analysis.interaction.outlineRemovedWithoutReplacement.length;
  if (removed > 0) out.push({ text: `Keyboard focus is switched off in ${removed} ${removed === 1 ? 'place' : 'places'}, which locks out keyboard users.`, warning: true });
  if (out.length === 0 && ranked[0]) out.push({ text: ranked[0].opportunity.title, warning: ranked[0].opportunity.area === 'accessibility' });
  // Accessibility first: it is the strongest reason to act now.
  return out.sort((a, b) => Number(b.warning) - Number(a.warning)).slice(0, 4);
}

export function buildBusinessCase(audit: Audit, dismissed: string[] = []): BusinessCase {
  const { analysis, savings, snapshot } = audit;
  const a: SavingsAssumptions = audit.assumptions;
  const e = a.effort;
  const pagesCaptured = snapshot.pages?.length ?? 1;
  const screens = Math.max(pagesCaptured, a.screens);
  // Per-instance work grows with the product; per-decision work (a colour, a variant) mostly doesn't.
  const scale = screens / pagesCaptured;

  let rareInstances = 0;
  for (const component of analysis.components) {
    const lineKey = `component-${component.kind}`;
    const recommended = savings.lines.find((l) => l.key === lineKey)?.recommended ?? component.variants.length;
    rareInstances += component.variants.slice(recommended).reduce((n, v) => n + v.count, 0);
  }

  const causes: TimeCause[] = [
    {
      key: 'variants',
      label: 'Extra component styles',
      basis: `${savings.excessVariants} extra variants × ${e.extraVariant} h to design, build and review each`,
      hours: savings.excessVariants * e.extraVariant,
    },
    {
      key: 'copies',
      label: 'Hand-built copies',
      basis: `${Math.round(rareInstances * scale)} one-off copies across ${screens} screens × ${e.handBuiltCopy} h each`,
      hours: rareInstances * scale * e.handBuiltCopy,
    },
    {
      key: 'decisions',
      label: 'One-off style decisions',
      basis: `${savings.excessValues} unnecessary colours, sizes and gaps × ${e.oneOffDecision} h each, per contributor`,
      hours: savings.excessValues * e.oneOffDecision * Math.max(1, a.contributors / 2),
    },
  ]
    .map((c) => ({ ...c, hours: round(c.hours) }))
    .filter((c) => c.hours > 0)
    .sort((x, y) => y.hours - x.hours) as TimeCause[];

  const confidence = analysis.confidence.level;
  const [lo, hi] = RANGE[confidence];
  const likely = causes.reduce((n, c) => n + c.hours, 0);

  const ranked = rankOpportunities(audit, dismissed);
  const fixHours = ranked.reduce((n, r) => n + r.hours, 0);

  const gap = maturityGap(audit.score.overall);
  const newScreenHours = round(a.newScreensPerYear * a.hoursPerNewScreen * a.systemSpeedup * gap);
  const inconsistencyHours = round(savings.annualDragHours);
  const yearlyHours = inconsistencyHours + newScreenHours;
  const benefitHours = round(savings.annualDragHours * a.realisationRate + newScreenHours);
  const benefitCost = benefitHours * a.hourlyRate;
  const fixCost = fixHours * a.hourlyRate;

  const quickWins = ranked.filter((r) => r.quickWin);
  const priority = ranked.filter((r) => r.impact === 'high' || r.quickWin).slice(0, 5);
  const steps = priority.length ? priority : ranked.slice(0, 3);

  const partsToday = savings.lines.reduce((n, l) => n + l.current, 0);
  const partsAfter = savings.lines.reduce((n, l) => n + l.recommended, 0);

  return {
    confidence,
    maturityGap: gap,
    effectiveSpeedup: a.systemSpeedup * gap,
    avoidable: { low: round(likely * lo), likely, high: round(likely * hi) },
    avoidableCost: likely * a.hourlyRate,
    causes,
    teamTime: teamTime(likely),
    screens,
    pagesCaptured,
    yearly: { inconsistencyHours, newScreenHours, hours: yearlyHours, cost: yearlyHours * a.hourlyRate },
    oneTimeFix: { hours: fixHours, cost: fixCost, opportunities: ranked.length },
    yearlyBenefit: { hours: benefitHours, cost: benefitCost },
    breakEvenMonths: fixHours > 0 && benefitHours > 0 ? Math.max(1, Math.round((fixHours / benefitHours) * 12)) : null,
    roi: [1, 2, 3].map((year) => ({ year, savings: round(benefitCost * year) })),
    parts: { today: partsToday, after: partsAfter },
    typicalChanges: typicalChanges(audit),
    ranked,
    quickWins,
    nextSteps: { items: steps, hours: steps.reduce((n, r) => n + r.hours, 0) },
    highlights: highlights(audit, ranked),
  };
}

/** 0 at a score of 85 or more (already systematic), 1 at 25 or less. */
export function maturityGap(score: number): number {
  return Math.max(0, Math.min(1, (85 - score) / 60));
}

/** "$95/h · 12 screens · 6 new a year · 35% faster with a system". */
export function assumptionsLine(a: SavingsAssumptions, money: (n: number) => string): string {
  return `${money(a.hourlyRate)}/h · ${a.screens} screens · ${a.newScreensPerYear} new a year · ${Math.round(a.systemSpeedup * 100)}% faster with a system`;
}

// ── Consistency level (the verdict) ─────────────────────────────────────

export type ConsistencyLevel = 'Highly consistent' | 'Mostly consistent' | 'Partly consistent' | 'Inconsistent';

export const LEVELS: { level: ConsistencyLevel; min: number; meaning: string }[] = [
  { level: 'Highly consistent', min: 80, meaning: 'A mature design system: shared styles and components almost everywhere.' },
  { level: 'Mostly consistent', min: 60, meaning: 'Typical of a design system in active use: most screens reuse shared styles and components, and a few areas still drift.' },
  { level: 'Partly consistent', min: 35, meaning: 'Some shared foundations, but many screens are styled one at a time.' },
  { level: 'Inconsistent', min: 0, meaning: 'Little is shared: most screens are built and styled on their own.' },
];

export function consistencyLevel(score: number): (typeof LEVELS)[number] {
  return LEVELS.find((l) => score >= l.min)!;
}
