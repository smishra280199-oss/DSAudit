/**
 * Savings: a planning estimate, not a measurement. Every figure is built
 * from line items that point at a concrete finding, so a client can trace
 * "$X a year" back to "you use 27 colours where 15 would do".
 *
 *  - Consolidation lines: each redundant foundation value or component
 *    variant costs every UI contributor some time per year (choosing between
 *    near-identical options, reviewing, fixing drift).
 *  - Re-theming: every hard-coded value has to be found and edited on each
 *    re-theme or rebrand; with tokens, only each distinct value is edited once.
 *  - Cleanup: the sum of each opportunity's effort hours.
 *
 * Only a share of the drag is realistically recovered (realisationRate).
 */

import type { AuditAnalysis, FoundationGroup } from '../inference/types';

export interface SavingsAssumptions {
  hourlyRate: number;
  currency: string;
  /** Designers and engineers who regularly build or change UI. */
  contributors: number;
  /** Hours per contributor per year lost to each redundant foundation value. */
  hoursPerExcessValue: number;
  /** Hours per contributor per year lost to each redundant component variant. */
  hoursPerExcessVariant: number;
  /** Minutes to find and edit one hard-coded value during a re-theme or rebrand. */
  minutesPerLiteralEdit: number;
  /** Re-themes, rebrands or palette updates per year. */
  rethemesPerYear: number;
  /** Share of the drag a cleanup actually recovers, 0–1. */
  realisationRate: number;
}

export const DEFAULT_ASSUMPTIONS: SavingsAssumptions = {
  hourlyRate: 85,
  currency: 'USD',
  contributors: 8,
  hoursPerExcessValue: 0.5,
  hoursPerExcessVariant: 2,
  minutesPerLiteralEdit: 3,
  rethemesPerYear: 1,
  realisationRate: 0.6,
};

/** The upper bound on perceptually distinct colours in a systematic palette. */
export const PALETTE_TARGET = 20;

/** One row of "what you have vs what you need". */
export interface ConsolidationLine {
  key: string;
  label: string;
  kind: 'value' | 'variant';
  current: number;
  recommended: number;
  excess: number;
  annualHours: number;
  annualCost: number;
  /** Elements using the redundant values, for highlighting. */
  selectors: string[];
}

export interface RethemeCost {
  /** Hard-coded declarations that each need an edit today. */
  literals: number;
  /** Distinct values: the edits needed once they are tokens. */
  distinctValues: number;
  hoursToday: number;
  hoursWithTokens: number;
}

export interface SavingsEstimate {
  lines: ConsolidationLine[];
  retheme: RethemeCost;
  excessValues: number;
  excessVariants: number;
  cleanupHours: number;
  cleanupCost: number;
  /** What inconsistency costs per year today. */
  annualDragHours: number;
  annualDragCost: number;
  /** The realistic share of that drag a cleanup recovers. */
  annualSavingsHours: number;
  annualSavings: number;
  /** Months until the cleanup pays for itself; null when there is nothing to save. */
  paybackMonths: number | null;
  /** Annual savings per unit of cleanup cost; null when there is no cleanup. */
  returnMultiple: number | null;
}

const FOUNDATION_LINES: { foundation: keyof AuditAnalysis['foundations']; group: string; label: string }[] = [
  { foundation: 'typography', group: 'font-size', label: 'Font sizes' },
  { foundation: 'typography', group: 'font-weight', label: 'Font weights' },
  { foundation: 'typography', group: 'line-height', label: 'Line heights' },
  { foundation: 'typography', group: 'font-family', label: 'Font families' },
  { foundation: 'spacing', group: 'spacing', label: 'Spacing values' },
  { foundation: 'shape', group: 'radius', label: 'Corner radii' },
  { foundation: 'shape', group: 'border-width', label: 'Border widths' },
  { foundation: 'elevation', group: 'shadow', label: 'Shadows' },
  { foundation: 'elevation', group: 'z-index', label: 'Layering (z-index)' },
  { foundation: 'motion', group: 'duration', label: 'Animation timings' },
];

/** Near-duplicates collapse into their twin; the rest are capped at the group's target. */
function recommendedFor(group: FoundationGroup): number {
  const distinct = group.values.length - group.values.filter((v) => v.nearDuplicateOf).length;
  return Math.min(distinct, group.target);
}

function line(
  key: string,
  label: string,
  kind: ConsolidationLine['kind'],
  current: number,
  recommended: number,
  selectors: string[],
  a: SavingsAssumptions,
): ConsolidationLine {
  const excess = Math.max(0, current - recommended);
  const annualHours = excess * a.contributors * (kind === 'value' ? a.hoursPerExcessValue : a.hoursPerExcessVariant);
  return {
    key,
    label,
    kind,
    current,
    recommended: Math.min(current, recommended),
    excess,
    annualHours: round(annualHours),
    annualCost: Math.round(annualHours * a.hourlyRate),
    selectors,
  };
}

export function consolidationLines(analysis: AuditAnalysis, a: SavingsAssumptions): ConsolidationLine[] {
  const lines: ConsolidationLine[] = [];

  // Colours: near-duplicates merge into their cluster; clusters beyond the palette target are redundant too.
  const palette = analysis.foundations.color.palette ?? [];
  const colourValues = palette.flatMap((c) => c.members);
  const redundantColours = [...palette.flatMap((c) => c.members.slice(1)), ...palette.slice(PALETTE_TARGET).map((c) => c.members[0]!)];
  const colourSelectors = redundantColours.flatMap((m) => m.selectors).slice(0, 60);
  lines.push(line('colors', 'Colours', 'value', colourValues.length, Math.min(palette.length, PALETTE_TARGET), colourSelectors, a));

  for (const spec of FOUNDATION_LINES) {
    const group = analysis.foundations[spec.foundation].groups.find((g) => g.key === spec.group);
    if (!group || group.values.length === 0) continue;
    const redundant = group.values.filter((v, i) => v.nearDuplicateOf || i >= group.target);
    lines.push(line(spec.group, spec.label, 'value', group.values.length, recommendedFor(group), redundant.flatMap((v) => v.selectors).slice(0, 60), a));
  }

  for (const component of analysis.components) {
    if (component.variants.length === 0) continue;
    const merged = new Set(component.nearDuplicatePairs.map(([, j]) => j)).size;
    const recommended = Math.min(component.variants.length - merged, component.target);
    const rare = component.variants.slice(recommended).flatMap((v) => v.selectors).slice(0, 60);
    lines.push(line(`component-${component.kind}`, `${component.label.slice(0, -1)} variants`, 'variant', component.variants.length, recommended, rare, a));
  }
  return lines;
}

export function estimateSavings(analysis: AuditAnalysis, a: SavingsAssumptions = DEFAULT_ASSUMPTIONS): SavingsEstimate {
  const lines = consolidationLines(analysis, a);
  const { literalDeclarations, distinctLiteralValues } = analysis.tokens;
  const retheme: RethemeCost = {
    literals: literalDeclarations,
    distinctValues: distinctLiteralValues,
    hoursToday: round((literalDeclarations * a.minutesPerLiteralEdit) / 60),
    hoursWithTokens: round((distinctLiteralValues * a.minutesPerLiteralEdit) / 60),
  };

  const consolidationHours = lines.reduce((n, l) => n + l.annualHours, 0);
  const rethemeHours = Math.max(0, retheme.hoursToday - retheme.hoursWithTokens) * a.rethemesPerYear;
  const annualDragHours = consolidationHours + rethemeHours;
  const annualSavingsHours = annualDragHours * a.realisationRate;
  const annualSavings = annualSavingsHours * a.hourlyRate;
  const cleanupHours = analysis.opportunities.reduce((n, o) => n + o.effortHours, 0);
  const cleanupCost = cleanupHours * a.hourlyRate;

  return {
    lines,
    retheme,
    excessValues: lines.filter((l) => l.kind === 'value').reduce((n, l) => n + l.excess, 0),
    excessVariants: lines.filter((l) => l.kind === 'variant').reduce((n, l) => n + l.excess, 0),
    cleanupHours: round(cleanupHours),
    cleanupCost: Math.round(cleanupCost),
    annualDragHours: round(annualDragHours),
    annualDragCost: Math.round(annualDragHours * a.hourlyRate),
    annualSavingsHours: round(annualSavingsHours),
    annualSavings: Math.round(annualSavings),
    paybackMonths: annualSavings > 0 ? round((cleanupCost / annualSavings) * 12) : null,
    returnMultiple: cleanupCost > 0 ? round(annualSavings / cleanupCost) : null,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

/** $12,400 → "$12.4k" for tight spaces such as KPI tiles. */
export function formatMoneyShort(amount: number, currency: string): string {
  if (Math.abs(amount) < 10_000) return formatMoney(amount, currency);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount);
}
