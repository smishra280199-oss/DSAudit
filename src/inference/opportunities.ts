/**
 * Turns analyses into a ranked list of concrete improvements. Each rule
 * below looks at one analysis and emits at most one opportunity; effort
 * figures are rough per-item hours used by the savings estimate.
 */

import { CATEGORY_LABELS } from '../shared/css-values';
import type { ClassConvention, ClassNamingStats } from '../shared/snapshot';
import type {
  AccessibilityAnalysis,
  ComponentAnalysis,
  FoundationAnalysis,
  FoundationKey,
  InteractionAnalysis,
  Opportunity,
  Severity,
  TokenAnalysis,
  ValueStat,
} from './types';

/** Hours of one-time work per item, by opportunity. */
export const EFFORT_HOURS = {
  mergeColor: 0.25,
  excessColor: 0.5,
  excessTypeValue: 0.5,
  offScaleSpacing: 0.25,
  excessShapeValue: 0.25,
  excessShadow: 0.5,
  excessMotion: 0.25,
  literalToToken: 0.05,
  adoptToken: 0.03,
  excessVariant: 2,
  mergeVariant: 1,
  removedOutline: 0.5,
  focusStylePerControl: 0.1,
  hoverStylePerControl: 0.05,
  contrastPair: 0.25,
  accessibleName: 0.1,
  namingConvention: 8,
} as const;

export interface OpportunityInput {
  foundations: Record<FoundationKey, FoundationAnalysis>;
  components: ComponentAnalysis[];
  tokens: TokenAnalysis;
  interaction: InteractionAnalysis;
  accessibility: AccessibilityAnalysis;
  naming: ClassNamingStats;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function bySeverity(ratio: number, high: number, medium: number): Severity {
  return ratio >= high ? 'high' : ratio >= medium ? 'medium' : 'low';
}

function selectorsOf(values: ValueStat[], limit = 60): string[] {
  return [...new Set(values.flatMap((v) => v.selectors))].slice(0, limit);
}

function hours(n: number): number {
  return Math.round(n * 10) / 10;
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : many}`;
}

/** Picks the verb form that agrees with n: verb(1, 'has', 'have') → 'has'. */
function verb(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

function colorOpportunities({ foundations }: OpportunityInput): Opportunity[] {
  const color = foundations.color;
  const palette = color.palette ?? [];
  const out: Opportunity[] = [];
  const duplicates = palette.flatMap((c) => c.members.slice(1));
  if (duplicates.length > 0) {
    out.push({
      id: 'color-near-duplicates',
      kind: 'merge-near-duplicate-colors',
      area: 'color',
      severity: bySeverity(duplicates.length, 8, 3),
      title: `Merge ${plural(duplicates.length, 'near-duplicate colour')}`,
      detail: `${plural(duplicates.length, 'colour')} ${verb(duplicates.length, 'is', 'are')} visually indistinguishable (ΔE < 2.3) from a more common one.`,
      fix: 'Replace each with the colour it nearly duplicates, ideally through a token.',
      affected: duplicates.length,
      effortHours: hours(duplicates.length * EFFORT_HOURS.mergeColor),
      selectors: selectorsOf(duplicates),
      values: duplicates.map((d) => d.value),
    });
  }
  const target = 20;
  if (palette.length > target) {
    const excess = palette.length - target;
    out.push({
      id: 'color-palette-size',
      kind: 'reduce-palette',
      area: 'color',
      severity: bySeverity(excess / target, 1, 0.4),
      title: `Reduce the palette from ${palette.length} to about ${target} colours`,
      detail: `${palette.length} perceptually distinct colours are in use. Rarely used ones are the usual candidates.`,
      fix: 'Map one-off colours to the nearest palette step and define the palette as tokens.',
      affected: excess,
      effortHours: hours(excess * EFFORT_HOURS.excessColor),
      selectors: selectorsOf(palette.slice(target).flatMap((c) => c.members)),
      values: palette.slice(target).map((c) => c.hex),
    });
  }
  return out;
}

function foundationOpportunities({ foundations }: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];

  const sizes = foundations.typography.groups.find((g) => g.key === 'font-size');
  if (sizes) {
    const offScale = sizes.values.filter((v) => v.onScale === false || v.nearDuplicateOf);
    const excess = Math.max(0, sizes.values.length - sizes.target);
    if (offScale.length > 0 || excess > 0) {
      const affected = Math.max(offScale.length, excess);
      const ratio = sizes.scale ? sizes.scale.value.toFixed(3).replace(/0+$/, '') : '';
      out.push({
        id: 'type-scale',
        kind: 'consolidate-type-scale',
        area: 'typography',
        severity: bySeverity(affected / sizes.target, 0.75, 0.25),
        title: `Consolidate ${plural(sizes.values.length, 'font size')} into a type scale`,
        detail: `${plural(offScale.length, 'size')} ${verb(offScale.length, 'sits', 'sit')} off the closest modular scale (ratio ${ratio}) or nearly duplicate another size.`,
        fix: `Adopt a ${sizes.target}-step type scale and map each off-scale size to its nearest step.`,
        affected,
        effortHours: hours(affected * EFFORT_HOURS.excessTypeValue),
        selectors: selectorsOf(offScale),
        values: offScale.map((v) => v.display),
      });
    }
  }

  const spacing = foundations.spacing.groups[0];
  if (spacing?.scale) {
    const off = spacing.values.filter((v) => v.onScale === false);
    if (off.length > 0) {
      const usage = off.reduce((n, v) => n + v.count, 0);
      out.push({
        id: 'spacing-off-scale',
        kind: 'off-scale-spacing',
        area: 'spacing',
        // Off-grid spacing is polish, not a defect: it never ranks as high.
        severity: 1 - spacing.scale.fit >= 0.1 ? 'medium' : 'low',
        title: `Move ${plural(off.length, 'spacing value')} onto the ${spacing.scale.value}px grid`,
        detail: `${plural(usage, 'use')} of spacing ${verb(usage, 'doesn’t', 'don’t')} fit the ${spacing.scale.value}px base unit that explains ${Math.round(spacing.scale.fit * 100)}% of the page.`,
        fix: `Round each to the nearest multiple of ${spacing.scale.value}px, using spacing tokens.`,
        affected: off.length,
        effortHours: hours(off.length * EFFORT_HOURS.offScaleSpacing),
        selectors: selectorsOf(off),
        values: off.map((v) => v.display),
      });
    }
  }

  for (const [key, effort, kind, label] of [
    ['shape', EFFORT_HOURS.excessShapeValue, 'reduce-shape-values', 'shape'],
    ['elevation', EFFORT_HOURS.excessShadow, 'reduce-elevation-values', 'elevation'],
    ['motion', EFFORT_HOURS.excessMotion, 'unify-motion', 'motion'],
  ] as const) {
    const foundation = foundations[key];
    for (const group of foundation.groups) {
      const excess = group.values.length - group.target;
      if (excess <= 0) continue;
      const rare = group.values.slice(group.target);
      out.push({
        id: `${key}-${group.key}`,
        kind,
        area: key,
        severity: bySeverity(excess / group.target, 1, 0.5),
        title: `Reduce ${group.label.toLowerCase()} values from ${group.values.length} to ${group.target}`,
        detail: `A systematic ${label} layer rarely needs more than ${group.target} ${group.label.toLowerCase()} values.`,
        fix: `Keep the ${group.target} most used values as tokens and map the rest onto them.`,
        affected: excess,
        effortHours: hours(excess * effort),
        selectors: selectorsOf(rare),
        values: rare.map((v) => v.display),
      });
    }
  }
  return out;
}

function tokenOpportunities({ tokens }: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];
  const roleMatches = tokens.suggestions.filter((s) => s.confidence === 'role-match');
  if (roleMatches.length > 0) {
    const uses = roleMatches.reduce((n, s) => n + s.occurrences, 0);
    out.push({
      id: 'tokens-adopt-existing',
      kind: 'adopt-existing-tokens',
      area: 'tokens',
      severity: bySeverity(uses, 50, 10),
      title: `Use existing tokens for ${plural(uses, 'hard-coded value')}`,
      detail: `${plural(roleMatches.length, 'literal value')} exactly ${verb(roleMatches.length, 'matches', 'match')} a token already used for the same purpose.`,
      fix: 'Swap each literal for the suggested var(--token); no visual change.',
      affected: uses,
      effortHours: hours(uses * EFFORT_HOURS.adoptToken),
      selectors: [...new Set(roleMatches.flatMap((s) => s.selectors))].slice(0, 60),
      values: roleMatches.slice(0, 20).map((s) => `${s.literal} → var(${s.token})`),
    });
  }
  const literalCategories = Object.entries(tokens.coverageByCategory)
    .filter(([, c]) => c.coverage < 0.5 && c.literal >= 10)
    .sort((a, b) => b[1].literal - a[1].literal);
  if (literalCategories.length > 0) {
    const literals = literalCategories.reduce((n, [, c]) => n + c.literal, 0);
    out.push({
      id: 'tokens-coverage',
      kind: 'tokenize-literals',
      area: 'tokens',
      severity: bySeverity(1 - (tokens.coverage ?? 0), 0.8, 0.5),
      title: `Tokenise ${literalCategories.map(([c]) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS].toLowerCase()).slice(0, 3).join(', ')}`,
      detail: `${plural(literals, 'declaration')} in these categories ${verb(literals, 'is', 'are')} written as literals, so themes and rebrands must edit each one.`,
      fix: 'Introduce tokens for the most used values first, then migrate the long tail.',
      affected: literals,
      effortHours: hours(literals * EFFORT_HOURS.literalToToken),
      selectors: [],
    });
  }
  return out;
}

function componentOpportunities({ components }: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];
  for (const component of components) {
    const excess = component.variants.length - component.target;
    if (excess > 0) {
      out.push({
        id: `components-${component.kind}-sprawl`,
        kind: 'component-variant-sprawl',
        area: 'components',
        severity: bySeverity(excess / component.target, 1, 0.34),
        title: `${component.label}: ${component.variants.length} visual variants`,
        detail: `${plural(component.instances, 'instance')} render in ${component.variants.length} distinct styles; about ${component.target} is typical for a system.`,
        fix: `Define ${component.target} named variants and migrate the rare ones.`,
        affected: excess,
        effortHours: hours(excess * EFFORT_HOURS.excessVariant),
        selectors: component.variants.slice(component.target).flatMap((v) => v.selectors).slice(0, 60),
      });
    }
    if (component.nearDuplicatePairs.length > 0) {
      const n = component.nearDuplicatePairs.length;
      out.push({
        id: `components-${component.kind}-near-duplicates`,
        kind: 'merge-near-duplicate-variants',
        area: 'components',
        severity: bySeverity(n, 4, 2),
        title: `${component.label}: merge ${plural(n, 'near-identical variant pair')}`,
        detail: 'These variants differ only by barely visible amounts, which usually means values drifted.',
        fix: 'Pick the more common variant of each pair and align the other to it.',
        affected: n,
        effortHours: hours(n * EFFORT_HOURS.mergeVariant),
        selectors: component.nearDuplicatePairs.flatMap(([, j]) => component.variants[j]!.selectors).slice(0, 60),
      });
    }
  }
  return out;
}

function interactionOpportunities({ interaction }: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];
  const removed = interaction.outlineRemovedWithoutReplacement;
  if (removed.length > 0) {
    out.push({
      id: 'interaction-outline-removed',
      kind: 'focus-outline-removed',
      area: 'interaction',
      severity: 'high',
      title: `${plural(removed.length, 'focus rule')} ${verb(removed.length, 'removes', 'remove')} the outline without a replacement`,
      detail: 'Keyboard users lose track of focus on the elements these rules match.',
      fix: 'Draw focus with :focus-visible (outline or ring) wherever the outline is removed.',
      affected: removed.length,
      effortHours: hours(removed.length * EFFORT_HOURS.removedOutline),
      selectors: removed.map((r) => r.selector.replace(/:focus(-visible|-within)?/g, '')),
      values: removed.map((r) => r.selector),
    });
  }
  const { interactiveCount, withFocus, withHover } = interaction;
  if (interactiveCount >= 5 && interaction.focusCoverage !== null && interaction.focusCoverage < 0.6) {
    const missing = interactiveCount - withFocus;
    out.push({
      id: 'interaction-focus-coverage',
      kind: 'missing-focus-style',
      area: 'interaction',
      severity: bySeverity(1 - interaction.focusCoverage, 0.7, 0.4),
      title: `${plural(missing, 'interactive element')} ${verb(missing, 'has', 'have')} no custom focus style`,
      detail: 'They rely on the browser default focus ring, which often clashes with or disappears against the design.',
      fix: 'Add one shared :focus-visible treatment (a token-driven ring) to the base interactive styles.',
      affected: missing,
      effortHours: hours(Math.max(1, missing * EFFORT_HOURS.focusStylePerControl)),
      selectors: [],
    });
  }
  if (interactiveCount >= 5 && interaction.hoverCoverage !== null && interaction.hoverCoverage < 0.5) {
    const missing = interactiveCount - withHover;
    out.push({
      id: 'interaction-hover-coverage',
      kind: 'missing-hover-style',
      area: 'interaction',
      severity: 'low',
      title: `${plural(missing, 'interactive element')} ${verb(missing, 'has', 'have')} no hover style`,
      detail: 'Without hover feedback, clickable elements are harder to tell apart from static ones.',
      fix: 'Give each component variant a hover state, ideally from state tokens.',
      affected: missing,
      effortHours: hours(Math.max(1, missing * EFFORT_HOURS.hoverStylePerControl)),
      selectors: [],
    });
  }
  return out;
}

function accessibilityOpportunities({ accessibility }: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];
  const failures = accessibility.contrastFailures;
  if (failures.length > 0) {
    const pairs = new Set(failures.map((f) => `${f.foreground} on ${f.background}`));
    out.push({
      id: 'a11y-contrast',
      kind: 'low-contrast',
      area: 'accessibility',
      severity: bySeverity(failures.length / Math.max(1, accessibility.textChecked), 0.1, 0.02),
      title: `${plural(failures.length, 'text element')} ${verb(failures.length, 'fails', 'fail')} WCAG AA contrast`,
      detail: `${plural(pairs.size, 'colour pair')} ${verb(pairs.size, 'falls', 'fall')} short of 4.5:1 (3:1 for large text). The worst is ${failures[0]!.ratio}:1.`,
      fix: 'Darken the text or lighten the backdrop; define accessible text-on-surface token pairs.',
      affected: failures.length,
      effortHours: hours(pairs.size * EFFORT_HOURS.contrastPair),
      selectors: failures.map((f) => f.selector).slice(0, 60),
      values: [...pairs].slice(0, 20),
    });
  }
  const unnamed = accessibility.unnamedControls;
  if (unnamed.length > 0) {
    out.push({
      id: 'a11y-accessible-name',
      kind: 'missing-accessible-name',
      area: 'accessibility',
      severity: bySeverity(unnamed.length, 5, 1),
      title: `${plural(unnamed.length, 'button or link', 'buttons and links')} ${verb(unnamed.length, 'has', 'have')} no accessible name`,
      detail: 'Screen readers announce them as just “button” or “link”. Icon-only controls are the usual cause.',
      fix: 'Add an aria-label (or visually hidden text) to each icon-only control.',
      affected: unnamed.length,
      effortHours: hours(unnamed.length * EFFORT_HOURS.accessibleName),
      selectors: unnamed.map((u) => u.selector).slice(0, 60),
    });
  }
  return out;
}

const CONVENTION_LABELS: Record<ClassConvention, string> = {
  utility: 'utility classes',
  'css-in-js': 'CSS-in-JS',
  'css-modules': 'CSS Modules',
  bem: 'BEM',
  namespaced: 'namespaced prefixes',
  other: 'ad-hoc names',
};

function namingOpportunities({ naming }: OpportunityInput): Opportunity[] {
  if (naming.totalClasses < 20) return [];
  const significant = (Object.entries(naming.counts) as [ClassConvention, number][]).filter(
    ([convention, n]) => convention !== 'other' && n / naming.totalClasses >= 0.1,
  );
  if (significant.length < 2) return [];
  return [
    {
      id: 'naming-mixed',
      kind: 'mixed-naming-conventions',
      area: 'components',
      severity: significant.length >= 3 ? 'medium' : 'low',
      title: `${significant.length} class-naming conventions in use`,
      detail: `The page mixes ${significant.map(([c]) => CONVENTION_LABELS[c]).join(', ')}, a sign of several styling systems layered together.`,
      fix: 'Agree on one styling approach for new work and plan the migration of the others.',
      affected: significant.length,
      effortHours: EFFORT_HOURS.namingConvention,
      selectors: [],
    },
  ];
}

const RULES = [
  colorOpportunities,
  foundationOpportunities,
  tokenOpportunities,
  componentOpportunities,
  interactionOpportunities,
  accessibilityOpportunities,
  namingOpportunities,
];

export function findOpportunities(input: OpportunityInput): Opportunity[] {
  return RULES.flatMap((rule) => rule(input)).sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.affected - a.affected,
  );
}
