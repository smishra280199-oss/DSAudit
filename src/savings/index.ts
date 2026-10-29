/**
 * Savings: a planning estimate, not a measurement. It prices two things
 * under editable assumptions:
 *
 *  - the one-time cleanup: the sum of each opportunity's effort hours;
 *  - the yearly drag of inconsistency: every redundant value or variant
 *    costs each UI contributor a little time per year (choosing between
 *    near-identical options, reviewing, fixing drift), and every literal
 *    costs a few minutes each time the product is re-themed.
 *
 * Only a share of the drag is realistically recovered (realisationRate).
 */

import type { AuditAnalysis } from '../inference/types';

export interface SavingsAssumptions {
  hourlyRate: number;
  currency: string;
  /** Designers and engineers who regularly build or change UI. */
  contributors: number;
  /** Hours per contributor per year lost to each redundant foundation value. */
  hoursPerExcessValue: number;
  /** Hours per contributor per year lost to each redundant component variant. */
  hoursPerExcessVariant: number;
  /** Minutes to edit one literal value during a re-theme or rebrand. */
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

export interface SavingsEstimate {
  excessValues: number;
  excessVariants: number;
  literalDeclarations: number;
  cleanupHours: number;
  cleanupCost: number;
  annualDragHours: number;
  annualSavingsHours: number;
  annualSavings: number;
  /** Months until the cleanup pays for itself; null when there is nothing to save. */
  paybackMonths: number | null;
}

export function estimateSavings(analysis: AuditAnalysis, a: SavingsAssumptions = DEFAULT_ASSUMPTIONS): SavingsEstimate {
  const foundationGroups = Object.values(analysis.foundations).flatMap((f) => f.groups);
  const excessValues =
    foundationGroups.reduce((n, g) => n + Math.max(0, g.values.length - g.target), 0) +
    Math.max(0, (analysis.foundations.color.palette?.length ?? 0) - 20);
  const excessVariants = analysis.components.reduce((n, c) => n + Math.max(0, c.variants.length - c.target), 0);
  const literalDeclarations = Object.values(analysis.tokens.coverageByCategory).reduce((n, c) => n + c.literal, 0);

  const cleanupHours = analysis.opportunities.reduce((n, o) => n + o.effortHours, 0);
  const annualDragHours =
    a.contributors * (excessValues * a.hoursPerExcessValue + excessVariants * a.hoursPerExcessVariant) +
    (literalDeclarations * a.minutesPerLiteralEdit * a.rethemesPerYear) / 60;
  const annualSavingsHours = annualDragHours * a.realisationRate;
  const annualSavings = annualSavingsHours * a.hourlyRate;
  const cleanupCost = cleanupHours * a.hourlyRate;

  return {
    excessValues,
    excessVariants,
    literalDeclarations,
    cleanupHours: round(cleanupHours),
    cleanupCost: Math.round(cleanupCost),
    annualDragHours: round(annualDragHours),
    annualSavingsHours: round(annualSavingsHours),
    annualSavings: Math.round(annualSavings),
    paybackMonths: annualSavings > 0 ? round((cleanupCost / annualSavings) * 12) : null,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
