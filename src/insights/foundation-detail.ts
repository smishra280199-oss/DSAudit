/**
 * Foundations in detail: every colour, text style, spacing value and corner
 * radius the product uses, as rows a designer can act on:
 *
 *   value · how often · where (real screenshots) · is it a token? · what to do
 *
 * Token status is read from the page itself: a value is "a token" when a
 * root custom property holds it and the CSS uses that property; "typed in by
 * hand" when the CSS writes the raw value even though a token holds it; and
 * "no token" otherwise, with a suggested primitive token (the raw scale step,
 * e.g. gray-900, space-2) and, for colours, a semantic one (its job, e.g.
 * color-text, color-surface) taken from the starter system.
 */

import type { Audit } from '../audit';
import { viewElements } from '../inference/elements';
import { parseColor, toHex } from '../shared/color';
import type { DeclarationCategory, EvidenceShot } from '../shared/snapshot';
import type { StarterSystem } from './starter-system';

export type TokenStatus =
  | { kind: 'token'; name: string }
  | { kind: 'typed'; name: string; times: number }
  | { kind: 'none'; primitive: string | null; semantic: string | null };

export type RowFlag = 'ok' | 'near-copy' | 'off-scale' | 'one-off';

export interface Example {
  shot: EvidenceShot;
  /** What the element is, e.g. "“Add to cart”" or "a heading". */
  label: string;
}

export interface ValueRow {
  /** As shown: "#0f0f10", "14px", "Inter 14/20 · 500". */
  value: string;
  count: number;
  flag: RowFlag;
  /** Why it's flagged, e.g. "≈ #0f0f0f" or "off the 4px grid". */
  note: string;
  token: TokenStatus;
  examples: Example[];
  /** Selectors of elements using it (for the evidence plan and highlighting). */
  selectors: string[];
  /** Colours: the job it mostly does. */
  role?: 'text' | 'background' | 'border';
  /** Colours: translucency, 0–1. */
  alpha?: number;
}

export interface FoundationDetail {
  colours: ValueRow[];
  textStyles: ValueRow[];
  spacing: ValueRow[];
  radii: ValueRow[];
}

const MAX_COLOURS = 16;
const MAX_TEXT_STYLES = 14;
const MAX_SPACING = 18;
const MAX_RADII = 10;
const EXAMPLES = 3;

/** "rgb(15, 15, 16)", "#0F0F10", "0.875rem" → a comparable key: "#0f0f10", "14". */
function colourKey(value: string): string | null {
  const c = parseColor(value.trim());
  return c && c.a > 0 ? toHex(c) : null;
}

function lengthKey(value: string): string | null {
  const m = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!) * (m[2] === 'rem' ? 16 : 1);
  return m[2] || n === 0 ? String(Math.round(n * 100) / 100) : null;
}

const CATEGORY_KEY: Partial<Record<DeclarationCategory, (v: string) => string | null>> = {
  color: colourKey,
  spacing: lengthKey,
  'font-size': lengthKey,
  radius: lengthKey,
};

/** Root tokens by value, and how often each category types raw values by hand. */
function tokenIndex(audit: Audit) {
  const { snapshot } = audit;
  const used = new Set(snapshot.authored.declarations.flatMap((d) => d.tokens));
  const byValue = new Map<string, string[]>();
  for (const [name, value] of Object.entries(snapshot.rendered.rootCustomProperties)) {
    for (const key of [colourKey(value), lengthKey(value)]) {
      if (!key) continue;
      byValue.set(key, [...(byValue.get(key) ?? []), name]);
    }
  }
  const typed = new Map<string, number>();
  for (const d of snapshot.authored.declarations) {
    if (d.kind !== 'literal' || d.matchCount === 0) continue;
    const toKey = CATEGORY_KEY[d.category];
    if (!toKey) continue;
    for (const part of d.value.split(/\s+(?![^(]*\))/)) {
      const key = toKey(part);
      if (key) typed.set(`${d.category}:${key}`, (typed.get(`${d.category}:${key}`) ?? 0) + 1);
    }
  }
  return {
    status(category: DeclarationCategory, key: string, suggestion: { primitive: string | null; semantic: string | null }): TokenStatus {
      const names = byValue.get(key) ?? [];
      const name = names.find((n) => used.has(n)) ?? names[0];
      const times = typed.get(`${category}:${key}`) ?? 0;
      if (name && times > 0) return { kind: 'typed', name, times };
      if (name) return { kind: 'token', name };
      return { kind: 'none', ...suggestion };
    },
  };
}

/** The starter system's token for a value, and the semantic alias pointing at it. */
function suggestionFor(system: StarterSystem, category: string, value: string): { primitive: string | null; semantic: string | null } {
  const primitive = system.tokens.find((t) => t.category === category && !t.alias && (t.value === value || t.replaces.includes(value)));
  const semantic = primitive ? system.tokens.find((t) => t.alias === primitive.name) : undefined;
  return { primitive: primitive ? `--${primitive.name}` : null, semantic: semantic ? `--${semantic.name}` : null };
}

/**
 * A colour's semantic token comes from its job, not from where it happens to
 * be used most: the brand colour is "primary", greys are text, surface or
 * border by role, and named accents (danger, success…) already say their job.
 */
function colourSuggestion(system: StarterSystem, value: string, role: 'text' | 'background' | 'border', neutral: boolean, mainText: boolean): { primitive: string | null; semantic: string | null } {
  const { primitive } = suggestionFor(system, 'color', value);
  const c = parseColor(value);
  const lightness = c ? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 : 0.5;
  let semantic: string | null = null;
  if (primitive === '--color-brand') semantic = '--color-primary';
  else if (neutral && role === 'text') semantic = lightness > 0.85 ? '--color-text-inverse' : mainText ? '--color-text' : '--color-text-muted';
  else if (neutral && role === 'background') semantic = lightness < 0.2 ? '--color-surface-inverse' : '--color-surface';
  else if (neutral) semantic = '--color-border';
  return { primitive, semantic };
}

export function foundationDetail(audit: Audit, system: StarterSystem): FoundationDetail {
  const { analysis, snapshot } = audit;
  const evidence = snapshot.evidence ?? {};
  const tokens = tokenIndex(audit);
  const views = viewElements(snapshot);
  const bySelector = new Map(views.map((v) => [v.el.selector, v]));
  const label = (selector: string) => {
    const v = bySelector.get(selector);
    if (!v) return 'an element';
    if (v.el.text) return `“${v.el.text.slice(0, 26)}”`;
    if (v.el.attrs['aria-label']) return `“${v.el.attrs['aria-label'].slice(0, 26)}”`;
    return /^h[1-6]$/.test(v.el.tag) ? 'a heading' : v.el.tag === 'button' ? 'a button' : v.el.tag === 'a' ? 'a link' : v.el.tag === 'input' ? 'a field' : 'a box';
  };
  const examplesOf = (selectors: string[]) =>
    selectors
      .filter((s) => evidence[s])
      .slice(0, EXAMPLES)
      .map((s) => ({ shot: evidence[s]!, label: label(s) }));

  // ── Colours: each colour as it appears, near-copies next to the one they copy ──
  const colours: ValueRow[] = [];
  const palette = analysis.foundations.color.palette ?? [];
  // The body text colour: the dark neutral that text uses most.
  const mainText = [...palette]
    .filter((c) => c.neutral && c.roles.text > 0 && (parseColor(c.hex)?.r ?? 255) < 128)
    .sort((a, b) => b.roles.text - a.roles.text)[0];
  for (const cluster of palette.slice(0, MAX_COLOURS)) {
    cluster.members.forEach((m, i) => {
      const c = parseColor(m.value);
      const role = (['text', 'background', 'border'] as const).reduce((best, r) => (cluster.roles[r] > cluster.roles[best] ? r : best), 'text' as 'text' | 'background' | 'border');
      colours.push({
        value: m.value,
        count: m.count,
        flag: i > 0 ? 'near-copy' : cluster.count <= 2 && !cluster.neutral ? 'one-off' : 'ok',
        note: i > 0 ? `≈ ${cluster.hex}, keep that one` : cluster.count <= 2 && !cluster.neutral ? 'used once or twice' : '',
        token: tokens.status('color', m.value, colourSuggestion(system, m.value, role, cluster.neutral, i === 0 && cluster === mainText)),
        examples: examplesOf(m.selectors),
        selectors: m.selectors,
        role,
        alpha: c?.a ?? 1,
      });
    });
  }

  // ── Text styles: family, size, weight and line height together ──
  const styles = new Map<string, { family: string; size: number; weight: string; lineHeight: string; count: number; selectors: string[] }>();
  for (const v of views) {
    if (!v.el.text) continue;
    const size = parseFloat(v.styles.fontSize ?? '');
    if (!Number.isFinite(size) || size <= 0) continue;
    const family = (v.styles.fontFamily ?? '').split(',')[0]!.replace(/["']/g, '').trim() || 'default';
    const weight = v.styles.fontWeight ?? '400';
    const lh = parseFloat(v.styles.lineHeight ?? '');
    const lineHeight = Number.isFinite(lh) ? `${Math.round(lh)}` : 'normal';
    const key = `${family}|${size}|${weight}|${lineHeight}`;
    const entry = styles.get(key) ?? { family, size, weight, lineHeight, count: 0, selectors: [] };
    entry.count += 1;
    if (entry.selectors.length < 40) entry.selectors.push(v.el.selector);
    styles.set(key, entry);
  }
  const sizeGroup = analysis.foundations.typography.groups.find((g) => g.key === 'font-size');
  const sizeInfo = new Map((sizeGroup?.values ?? []).map((v) => [parseFloat(v.value), v]));
  const sorted = [...styles.values()].sort((a, b) => b.count - a.count).slice(0, MAX_TEXT_STYLES);
  const textStyles: ValueRow[] = sorted
    .map((s) => {
      // A near-copy: same font and weight as a more used style, a pixel or two off in size or line height.
      const twin = sorted.find(
        (o) => o !== s && o.count > s.count && o.family === s.family && o.weight === s.weight && Math.abs(o.size - s.size) <= 1 && (o.size !== s.size || o.lineHeight !== s.lineHeight),
      );
      const info = sizeInfo.get(s.size);
      const sizeKey = String(Math.round(s.size * 100) / 100);
      return {
        value: `${s.family} ${Math.round(s.size * 10) / 10}/${s.lineHeight} · ${s.weight}`,
        count: s.count,
        flag: (twin ? 'near-copy' : info?.onScale === false ? 'off-scale' : 'ok') as RowFlag,
        note: twin ? `≈ ${twin.family} ${Math.round(twin.size * 10) / 10}/${twin.lineHeight}, a near-copy` : info?.onScale === false ? 'size is off the type scale' : '',
        token: tokens.status('font-size', sizeKey, suggestionFor(system, 'font-size', `${sizeKey}px`)),
        examples: examplesOf(s.selectors),
        selectors: s.selectors,
      };
    })
    .sort((a, b) => b.count - a.count);

  // ── Spacing ──
  const group = analysis.foundations.spacing.groups[0];
  const base = group?.scale?.value ?? 4;
  const spacing: ValueRow[] = (group?.values ?? [])
    .filter((v) => parseFloat(v.value) <= 64)
    .sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
    .slice(0, MAX_SPACING)
    .map((v) => ({
      value: `${v.value}px`,
      count: v.count,
      flag: v.onScale === false ? 'off-scale' : 'ok',
      note: v.onScale === false ? `off the ${base}px grid` : '',
      token: tokens.status('spacing', v.value, suggestionFor(system, 'spacing', `${v.value}px`)),
      examples: examplesOf(v.selectors),
      selectors: v.selectors,
    }));

  // ── Corner radius ──
  const radiusGroup = analysis.foundations.shape.groups.find((g) => g.key === 'radius');
  const radii: ValueRow[] = (radiusGroup?.values ?? []).slice(0, MAX_RADII).map((v) => ({
    value: v.value === 'full' ? 'fully round' : `${v.value}px`,
    count: v.count,
    flag: v.nearDuplicateOf ? 'near-copy' : v.count <= 2 ? 'one-off' : 'ok',
    note: v.nearDuplicateOf ? `≈ ${v.nearDuplicateOf}px` : v.count <= 2 ? 'used once or twice' : '',
    token: v.value === 'full' ? tokens.status('radius', '9999', { primitive: '--radius-full', semantic: null }) : tokens.status('radius', v.value, suggestionFor(system, 'radius', `${v.value}px`)),
    examples: examplesOf(v.selectors),
    selectors: v.selectors,
  }));

  return { colours, textStyles, spacing, radii };
}

/** "Token --gray-900", "Typed by hand 12× (token --x exists)", "No token: use --space-2". */
export function tokenLabel(t: TokenStatus): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (t.kind === 'token') return { text: `Token ${t.name}`, tone: 'good' };
  if (t.kind === 'typed') return { text: `Typed by hand ${t.times}×; token ${t.name} exists`, tone: 'warn' };
  const suggestion = [t.semantic, t.primitive].filter(Boolean).join(' → ');
  return { text: suggestion ? `No token. Suggest ${suggestion}` : 'No token', tone: 'bad' };
}

/** Selectors worth photographing for the foundation tables. */
export function foundationEvidence(detail: FoundationDetail): string[] {
  const pick = (rows: ValueRow[], n: number) => rows.flatMap((r) => r.selectors.slice(0, n));
  return [...pick(detail.colours, 2), ...pick(detail.textStyles, 2), ...pick(detail.spacing, 2), ...pick(detail.radii, 2)];
}
