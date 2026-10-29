/**
 * Output types of the inference engine. Everything here is derived from a
 * PageSnapshot by pure functions, so analyses are never stored: they are
 * recomputed whenever a snapshot is opened.
 *
 * To add an opportunity kind, extend OpportunityKind and emit it from
 * opportunities.ts; the panel and report pick it up automatically.
 */

import type { ContrastResult } from '../shared/contrast';
import type { ClassNamingStats, DeclarationCategory, InteractionCoverage, StyleKey } from '../shared/snapshot';

/** Scored areas. Each needs a weight in AREA_WEIGHTS (scoring/index.ts). */
export type AreaKey =
  | 'color'
  | 'typography'
  | 'spacing'
  | 'shape'
  | 'elevation'
  | 'motion'
  | 'components'
  | 'tokens'
  | 'interaction'
  | 'accessibility';

export type FoundationKey = Extract<AreaKey, 'color' | 'typography' | 'spacing' | 'shape' | 'elevation' | 'motion'>;

/** One distinct value of a foundation, with where it is used. */
export interface ValueStat {
  /** Normalised value used for grouping, e.g. "#1a1a1a" or "16". */
  value: string;
  /** Value as shown to people, e.g. "16px". */
  display: string;
  count: number;
  /** Selectors of up to 40 elements using it, for highlighting. */
  selectors: string[];
  onScale?: boolean;
  /** The more common value this one nearly duplicates. */
  nearDuplicateOf?: string;
}

export interface ScaleFit {
  kind: 'base-unit' | 'ratio';
  /** Base unit in px (spacing) or modular ratio (type). */
  value: number;
  /** Usage-weighted share of values that sit on the scale, 0–1. */
  fit: number;
}

export interface FoundationGroup {
  key: string;
  label: string;
  values: ValueStat[];
  /** A reasonable upper bound on distinct values for a systematic UI. */
  target: number;
  scale?: ScaleFit;
}

export interface ColorCluster {
  hex: string;
  count: number;
  members: ValueStat[];
  neutral: boolean;
  roles: { text: number; background: number; border: number };
}

export interface FoundationAnalysis {
  key: FoundationKey;
  label: string;
  groups: FoundationGroup[];
  /** Share of authored declarations in this foundation written with tokens (null when none were readable). */
  tokenCoverage: number | null;
  /** Colour only: perceptual clusters across all colour roles. */
  palette?: ColorCluster[];
  /** False when the page gives nothing to measure (e.g. no motion at all). */
  applicable: boolean;
}

export type ComponentKind = 'button' | 'input' | 'link' | 'heading' | 'card' | 'badge' | 'avatar';

export interface ComponentVariant {
  signature: string;
  /** The properties that define the variant, for previews and comparison. */
  styles: Partial<Record<StyleKey, string>>;
  count: number;
  selectors: string[];
  sampleText: string;
  tag: string;
}

export interface ComponentAnalysis {
  kind: ComponentKind;
  label: string;
  instances: number;
  variants: ComponentVariant[];
  target: number;
  /** Index pairs of variants that differ by one small amount. */
  nearDuplicatePairs: [number, number][];
}

export type SuggestionConfidence = 'role-match' | 'value-only';

/** What a token is for: the category, refined for colours by where the colour is painted. */
export type TokenRole = Exclude<DeclarationCategory, 'color'> | 'color-text' | 'color-background' | 'color-border';

export interface TokenSuggestion {
  literal: string;
  category: DeclarationCategory;
  role: TokenRole;
  token: string;
  /** role-match: the token is already used for this kind of property; value-only: same value, unknown intent. */
  confidence: SuggestionConfidence;
  occurrences: number;
  selectors: string[];
}

export interface TokenAnalysis {
  definedCount: number;
  rootDefinedCount: number;
  /** Scopes that redefine root tokens (themes), e.g. [data-theme="dark"]. */
  themeScopes: { scope: string; redefinitions: number }[];
  coverage: number | null;
  coverageByCategory: Partial<Record<DeclarationCategory, { token: number; literal: number; coverage: number }>>;
  suggestions: TokenSuggestion[];
  /** Tokens defined but never referenced by any readable declaration. */
  unusedTokens: string[];
  /** Hard-coded (literal) declarations, and how many distinct values they boil down to. */
  literalDeclarations: number;
  distinctLiteralValues: number;
}

export interface ContrastIssue extends ContrastResult {
  selector: string;
  text: string;
}

export interface AccessibilityAnalysis {
  textChecked: number;
  contrastFailures: ContrastIssue[];
  unnamedControls: { selector: string; tag: string }[];
  controlsChecked: number;
}

export interface InteractionAnalysis extends InteractionCoverage {
  hoverCoverage: number | null;
  focusCoverage: number | null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Confidence {
  level: ConfidenceLevel;
  reasons: string[];
}

export type Severity = 'high' | 'medium' | 'low';

export type OpportunityKind =
  | 'merge-near-duplicate-colors'
  | 'reduce-palette'
  | 'consolidate-type-scale'
  | 'off-scale-spacing'
  | 'reduce-shape-values'
  | 'reduce-elevation-values'
  | 'unify-motion'
  | 'tokenize-literals'
  | 'adopt-existing-tokens'
  | 'component-variant-sprawl'
  | 'merge-near-duplicate-variants'
  | 'focus-outline-removed'
  | 'missing-focus-style'
  | 'missing-hover-style'
  | 'low-contrast'
  | 'missing-accessible-name'
  | 'mixed-naming-conventions';

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  area: AreaKey;
  severity: Severity;
  title: string;
  detail: string;
  /** What to do about it, in one sentence. */
  fix: string;
  /** Number of values, variants or elements involved. */
  affected: number;
  /** Rough one-time effort to address it, in hours. */
  effortHours: number;
  selectors: string[];
  values?: string[];
}

export interface AuditAnalysis {
  foundations: Record<FoundationKey, FoundationAnalysis>;
  components: ComponentAnalysis[];
  tokens: TokenAnalysis;
  interaction: InteractionAnalysis;
  accessibility: AccessibilityAnalysis;
  naming: ClassNamingStats;
  confidence: Confidence;
  opportunities: Opportunity[];
}
