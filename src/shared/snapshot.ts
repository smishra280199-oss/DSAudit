/**
 * The PageSnapshot is the contract between the capture script (which runs in
 * the inspected page) and everything else (inference, scoring, storage, UI).
 * It must stay JSON-compatible: Chrome serialises it across the
 * executeScript boundary and we persist it in chrome.storage.local.
 *
 * Bump SNAPSHOT_SCHEMA_VERSION whenever the shape changes incompatibly.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** Upper bound on elements walked in the rendered layer. */
export const MAX_ELEMENTS = 5_000;

/** Computed style properties recorded per element. */
export const STYLE_KEYS = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'borderTopColor',
  'borderTopWidth',
  'borderTopLeftRadius',
  'boxShadow',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'fontFamily',
  'letterSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'rowGap',
  'columnGap',
  'display',
  'cursor',
  'zIndex',
  'transitionDuration',
  'outlineStyle',
] as const;

export type StyleKey = (typeof STYLE_KEYS)[number];

/** Inherited properties are only recorded where they differ from the parent. */
export const INHERITED_KEYS: readonly StyleKey[] = [
  'color',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'lineHeight',
];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderedElement {
  /** Position in depth-first order; also the element's id within the snapshot. */
  index: number;
  /** Index of the nearest recorded ancestor, or -1 for the body. */
  parent: number;
  tag: string;
  /** Short CSS selector used to highlight the element later. */
  selector: string;
  classes: string[];
  /** A curated subset of attributes (role, type, aria-*, href presence, …). */
  attrs: Record<string, string>;
  /** Visible own text, trimmed to 80 characters. */
  text: string;
  rect: Rect;
  /**
   * Computed styles. Inherited keys appear only where they differ from the
   * parent; the rest only where they are not the browser default.
   */
  styles: Partial<Record<StyleKey, string>>;
}

export interface RenderedLayer {
  elements: RenderedElement[];
  /** True when the walk stopped at MAX_ELEMENTS. */
  truncated: boolean;
  /** Custom properties as resolved on the root element. */
  rootCustomProperties: Record<string, string>;
}

/** Design-relevant categories of an authored declaration. */
export type DeclarationCategory =
  | 'color'
  | 'spacing'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'font-family'
  | 'letter-spacing'
  | 'radius'
  | 'shadow'
  | 'border-width'
  | 'z-index'
  | 'motion';

/** How a value was written: through a var() token, as a literal, or as a CSS keyword. */
export type ValueKind = 'token' | 'literal' | 'keyword';

export const INTERACTION_STATES = [
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
  'checked',
  'invalid',
  'selected',
  'expanded',
] as const;

export type InteractionState = (typeof INTERACTION_STATES)[number];

export interface AuthoredDeclaration {
  property: string;
  value: string;
  category: DeclarationCategory;
  kind: ValueKind;
  /** Custom property names referenced through var(), in order. */
  tokens: string[];
  selector: string;
  /** Human-readable stylesheet label (href, "inline <style> #2", "adopted #1", "style attribute"). */
  sheet: string;
  states: InteractionState[];
  /** The enclosing @media condition, if any. */
  media: string | null;
  /** Whether that condition matches the captured viewport (true when there is none). */
  mediaMatches: boolean;
  /** Number of page elements the rule matches, with state pseudo-classes stripped. */
  matchCount: number;
}

export interface CustomPropertyDefinition {
  name: string;
  value: string;
  selector: string;
  sheet: string;
  media: string | null;
  /** Defined on :root, html, body or :host (as opposed to a redefining scope). */
  isRootScope: boolean;
}

export type FocusTechnique = 'outline' | 'box-shadow' | 'border' | 'background' | 'none';

export interface InteractionCoverage {
  interactiveCount: number;
  withHover: number;
  withFocus: number;
  /** How focus is drawn across focus rules, as counts per technique. */
  focusTechniques: Partial<Record<FocusTechnique, number>>;
  /** Focus rules that remove the outline without drawing anything instead. */
  outlineRemovedWithoutReplacement: { selector: string; sheet: string }[];
}

export type ClassConvention = 'utility' | 'css-in-js' | 'css-modules' | 'bem' | 'namespaced' | 'other';

export interface ClassNamingStats {
  totalClasses: number;
  counts: Record<ClassConvention, number>;
  /** Most common namespace prefixes, e.g. "mds-" or "Mui". */
  prefixes: { prefix: string; count: number }[];
}

export interface StylesheetInfo {
  label: string;
  origin: 'same-origin' | 'cross-origin-fetched' | 'inline' | 'adopted' | 'shadow';
  ruleCount: number;
}

/** Upper bound on recorded authored declarations, to keep snapshots small. */
export const MAX_DECLARATIONS = 25_000;

export interface AuthoredLayer {
  declarations: AuthoredDeclaration[];
  /** True when recording stopped at MAX_DECLARATIONS. */
  truncated: boolean;
  customProperties: CustomPropertyDefinition[];
  interaction: InteractionCoverage;
  classNaming: ClassNamingStats;
  sheets: StylesheetInfo[];
  /** Stylesheets that stayed unreadable even after the panel tried to fetch them. */
  unreadableSheets: string[];
}

export interface PageSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  /** ISO timestamp. */
  capturedAt: string;
  viewport: { width: number; height: number; dpr: number };
  colorScheme: 'light' | 'dark';
  /** False when the user declined the optional all-URLs host permission. */
  hostAccess: boolean;
  /** JPEG data URL of the visible viewport at capture time, for report covers. */
  screenshot?: string;
  /**
   * Present when this snapshot combines several captured pages (a multi-page
   * audit). Element selectors are then page-scoped; see page-scope.ts.
   */
  pages?: PageRef[];
  rendered: RenderedLayer;
  authored: AuthoredLayer;
}

/** One page inside a multi-page audit. */
export interface PageRef {
  snapshotId: string;
  url: string;
  title: string;
  capturedAt: string;
  elementCount: number;
}

/** Lightweight record kept in the snapshot index so history renders without loading every snapshot. */
export interface SnapshotMeta {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  capturedAt: string;
  score: number;
  elementCount: number;
  /** Number of pages, for multi-page audits. */
  pageCount?: number;
}
