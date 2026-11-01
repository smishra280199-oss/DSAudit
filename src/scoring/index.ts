/**
 * Scoring: one 0–100 score per area and a weighted overall score.
 *
 * To add a score, add an AreaKey (inference/types.ts), a scorer to AREAS
 * below and its weight to AREA_WEIGHTS. Areas that don't apply to a page
 * (e.g. no motion at all) are left out and the remaining weights rescale.
 *
 * Scores are heuristics built from three ingredients: how many distinct
 * values exist versus a target, how many sit on an inferred scale, and how
 * much of the authored CSS goes through tokens.
 */

import type { AreaKey, AuditAnalysis, FoundationAnalysis, FoundationGroup } from '../inference/types';

export const AREA_WEIGHTS: Record<AreaKey, number> = {
  color: 0.15,
  typography: 0.13,
  spacing: 0.13,
  shape: 0.06,
  elevation: 0.05,
  motion: 0.03,
  components: 0.15,
  tokens: 0.12,
  interaction: 0.09,
  accessibility: 0.09,
};

export interface AreaScore {
  key: AreaKey;
  label: string;
  score: number;
  weight: number;
  applicable: boolean;
  /** Short plain-language reasons behind the score. */
  notes: string[];
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface AuditScore {
  overall: number;
  grade: Grade;
  maturity: string;
  areas: AreaScore[];
}

type ScorerResult = Omit<AreaScore, 'key' | 'label' | 'weight'>;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** 100 at or under target, falling to 0 at four times the target. */
export function distinctScore(distinct: number, target: number): number {
  if (distinct <= target) return 100;
  return clamp(100 - ((distinct - target) / (target * 3)) * 100);
}

function groupScore(group: FoundationGroup): number {
  const distinct = distinctScore(group.values.length, group.target);
  const scale = group.scale ? group.scale.fit * 100 : distinct;
  const nearDuplicates = group.values.filter((v) => v.nearDuplicateOf).length;
  const duplicatePenalty = Math.min(30, nearDuplicates * 5);
  return clamp(distinct * 0.5 + scale * 0.5 - duplicatePenalty);
}

/** Groups are weighted by usage, so rarely used properties don't dominate. */
function foundationScore(foundation: FoundationAnalysis): ScorerResult {
  const used = foundation.groups.filter((g) => g.values.length > 0);
  if (!foundation.applicable || used.length === 0) return { score: 100, applicable: false, notes: ['Nothing to measure on this page.'] };
  const usage = used.map((g) => g.values.reduce((n, v) => n + v.count, 0));
  const total = usage.reduce((a, b) => a + b, 0);
  const consistency = used.reduce((sum, g, i) => sum + groupScore(g) * (usage[i]! / total), 0);
  const tokens = foundation.tokenCoverage;
  const score = tokens === null ? consistency : consistency * 0.75 + tokens * 100 * 0.25;
  const notes = used.map((g) => {
    const scale = g.scale ? `, ${Math.round(g.scale.fit * 100)}% on scale` : '';
    return `${g.label}: ${g.values.length} distinct (target ${g.target})${scale}`;
  });
  if (tokens !== null) notes.push(`${Math.round(tokens * 100)}% written with tokens`);
  return { score: clamp(score), applicable: true, notes };
}

function scoreColor(a: AuditAnalysis): ScorerResult {
  const base = foundationScore(a.foundations.color);
  const palette = a.foundations.color.palette ?? [];
  const paletteScore = distinctScore(palette.length, 20);
  return { ...base, score: clamp(base.score * 0.7 + paletteScore * 0.3), notes: [`${palette.length} perceptual colours`, ...base.notes] };
}

function scoreComponents(a: AuditAnalysis): ScorerResult {
  const present = a.components.filter((c) => c.instances > 0);
  if (present.length === 0) return { score: 100, applicable: false, notes: ['No recognisable components.'] };
  const total = present.reduce((n, c) => n + c.instances, 0);
  const score = present.reduce((sum, c) => {
    const penalty = Math.min(30, c.nearDuplicatePairs.length * 6);
    return sum + clamp(distinctScore(c.variants.length, c.target) - penalty) * (c.instances / total);
  }, 0);
  return { score: clamp(score), applicable: true, notes: present.map((c) => `${c.label}: ${count(c.variants.length, 'variant')} (target ${c.target})`) };
}

function scoreTokens(a: AuditAnalysis): ScorerResult {
  const { coverage, definedCount, themeScopes } = a.tokens;
  if (coverage === null) return { score: 0, applicable: false, notes: ['No readable authored CSS.'] };
  const themeBonus = themeScopes.length > 0 ? 10 : 0;
  const notes = [`${Math.round(coverage * 100)}% of design declarations use tokens`, `${definedCount} custom properties defined`];
  if (themeScopes.length > 0) notes.push(`${themeScopes.length} theme scope${themeScopes.length === 1 ? '' : 's'}`);
  return { score: clamp(coverage * 90 + themeBonus), applicable: true, notes };
}

function scoreInteraction(a: AuditAnalysis): ScorerResult {
  const { hoverCoverage, focusCoverage, outlineRemovedWithoutReplacement: removed } = a.interaction;
  if (hoverCoverage === null || focusCoverage === null) return { score: 100, applicable: false, notes: ['No interactive elements.'] };
  const penalty = Math.min(40, removed.length * 10);
  const notes = [`${Math.round(hoverCoverage * 100)}% have hover styles`, `${Math.round(focusCoverage * 100)}% have focus styles`];
  if (removed.length > 0) notes.push(`${count(removed.length, 'focus outline')} removed`);
  return { score: clamp(focusCoverage * 60 + hoverCoverage * 40 - penalty), applicable: true, notes };
}

function scoreAccessibility(a: AuditAnalysis): ScorerResult {
  const { textChecked, contrastFailures, unnamedControls, controlsChecked } = a.accessibility;
  if (textChecked === 0 && controlsChecked === 0) return { score: 100, applicable: false, notes: ['No text or controls.'] };
  const share = (failed: number, checked: number) => (checked ? 1 - failed / checked : 1);
  const contrast = share(contrastFailures.length, textChecked);
  const naming = share(unnamedControls.length, controlsChecked);
  const labels = share(a.accessibility.unlabelledFields?.length ?? 0, a.accessibility.fieldsChecked ?? 0);
  const targets = share(a.accessibility.smallTargets?.length ?? 0, a.accessibility.targetsChecked ?? 0);
  const alt = share(a.accessibility.imagesWithoutAlt?.length ?? 0, a.accessibility.imagesChecked ?? 0);
  return {
    score: clamp(contrast * 50 + naming * 15 + labels * 15 + targets * 10 + alt * 10),
    applicable: true,
    notes: [
      `${contrastFailures.length} of ${textChecked} text elements below AA`,
      count(unnamedControls.length, 'unnamed control'),
      count(a.accessibility.unlabelledFields?.length ?? 0, 'unlabelled field'),
      count(a.accessibility.smallTargets?.length ?? 0, 'small tap target'),
      count(a.accessibility.imagesWithoutAlt?.length ?? 0, 'image without alt text'),
    ],
  };
}

const AREAS: { key: AreaKey; label: string; score: (analysis: AuditAnalysis) => ScorerResult }[] = [
  { key: 'color', label: 'Color', score: scoreColor },
  { key: 'typography', label: 'Typography', score: (a) => foundationScore(a.foundations.typography) },
  { key: 'spacing', label: 'Spacing', score: (a) => foundationScore(a.foundations.spacing) },
  { key: 'shape', label: 'Shape', score: (a) => foundationScore(a.foundations.shape) },
  { key: 'elevation', label: 'Elevation', score: (a) => foundationScore(a.foundations.elevation) },
  { key: 'motion', label: 'Motion', score: (a) => foundationScore(a.foundations.motion) },
  { key: 'components', label: 'Components', score: scoreComponents },
  { key: 'tokens', label: 'Tokens & theming', score: scoreTokens },
  { key: 'interaction', label: 'Interaction states', score: scoreInteraction },
  { key: 'accessibility', label: 'Accessibility', score: scoreAccessibility },
];

export function gradeFor(score: number): Grade {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'E';
}

const MATURITY: Record<Grade, string> = {
  A: 'Systematic',
  B: 'Structured',
  C: 'Emerging',
  D: 'Fragmented',
  E: 'Ad hoc',
};

export function scoreAnalysis(analysis: AuditAnalysis): AuditScore {
  const areas: AreaScore[] = AREAS.map(({ key, label, score }) => ({ key, label, weight: AREA_WEIGHTS[key], ...score(analysis) }));
  const applicable = areas.filter((a) => a.applicable);
  const weight = applicable.reduce((n, a) => n + a.weight, 0);
  const overall = weight === 0 ? 0 : clamp(applicable.reduce((n, a) => n + a.score * a.weight, 0) / weight);
  const grade = gradeFor(overall);
  return { overall, grade, maturity: MATURITY[grade], areas };
}
