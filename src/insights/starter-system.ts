/**
 * A starter design system, extracted from the product itself: the colours,
 * text sizes, weights, fonts, spacing, corners and shadows the team already
 * uses, with near-copies merged into the value they copy and stray values
 * mapped to the nearest step. Each token lists the values it replaces, so
 * the file doubles as a migration guide.
 *
 * It is a proposal built from evidence, not a finished system: a designer
 * should review names and merges before adopting it.
 */

import type { Audit } from '../audit';
import { MAX_SCALE_SPACING } from '../inference/foundations/spacing';
import type { FoundationGroup, ValueStat } from '../inference/types';
import { deltaE, parseColor, toLab, type Rgba } from '../shared/color';
import { colourName } from './describe';

export type TokenCategory = 'color' | 'font-size' | 'font-weight' | 'font-family' | 'spacing' | 'radius' | 'shadow';

export interface StarterToken {
  name: string;
  value: string;
  category: TokenCategory;
  uses: number;
  /** Values in use today that this token replaces. */
  replaces: string[];
  /** For aliases: the token it points at, e.g. "color-gray-900". */
  alias?: string;
}

export interface StarterSystem {
  tokens: StarterToken[];
  /** Distinct values in use today, across these categories. */
  before: number;
  /** Core tokens in the proposal (aliases not counted). */
  after: number;
  groups: { category: TokenCategory; label: string; tokens: StarterToken[] }[];
  css: string;
  json: string;
}

const LABELS: Record<TokenCategory, string> = {
  color: 'Colour',
  'font-size': 'Text size',
  'font-weight': 'Font weight',
  'font-family': 'Font',
  spacing: 'Spacing',
  radius: 'Corner radius',
  shadow: 'Shadow',
};

const MAX_ACCENTS = 6;
const MAX_NEUTRALS = 9;
const MAX_SIZES = 8;

function groupOf(audit: Audit, foundation: keyof Audit['analysis']['foundations'], key: string): FoundationGroup | undefined {
  return audit.analysis.foundations[foundation].groups.find((g) => g.key === key);
}

function unique(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let i = 2; taken.has(candidate); i += 1) candidate = `${name}-${i}`;
  taken.add(candidate);
  return candidate;
}

// ── Colour ──────────────────────────────────────────────────────────────

const SEMANTIC: Record<string, string> = { red: 'danger', green: 'success', orange: 'warning', yellow: 'warning', teal: 'info' };

function neutralStep(c: Rgba): string {
  const l = toLab(c)[0];
  if (l >= 99.5) return 'white';
  if (l <= 1) return 'black';
  const steps: [number, string][] = [
    [96, '50'],
    [90, '100'],
    [80, '200'],
    [70, '300'],
    [60, '400'],
    [50, '500'],
    [40, '600'],
    [30, '700'],
    [20, '800'],
  ];
  return `gray-${steps.find(([min]) => l >= min)?.[1] ?? '900'}`;
}

function colourTokens(audit: Audit): StarterToken[] {
  const palette = audit.analysis.foundations.color.palette ?? [];
  const taken = new Set<string>();
  const tokens: (StarterToken & { rgba: Rgba })[] = [];
  const keep = (name: string, hex: string, uses: number, replaces: string[]) => {
    const rgba = parseColor(hex)!;
    tokens.push({ name: `color-${unique(name, taken)}`, value: hex, category: 'color', uses, replaces, rgba });
  };
  const nearest = (rgba: Rgba, pool: typeof tokens) => pool.reduce((best, t) => (deltaE(t.rgba, rgba) < deltaE(best.rgba, rgba) ? t : best));

  // See-through colours are overlays (scrims, hairlines on any background): they stay their own tokens.
  const translucent = (hex: string) => (parseColor(hex)?.a ?? 1) < 1;
  const overlays = palette.filter((c) => translucent(c.hex));
  const neutrals = palette.filter((c) => c.neutral && !translucent(c.hex));
  const accents = palette.filter((c) => !c.neutral && !translucent(c.hex));

  // Accents: the most used is the brand; then semantic names by hue; rare extras fold into the nearest kept one.
  accents.forEach((c, i) => {
    const copies = c.members.slice(1).map((m) => m.value);
    const rgba = parseColor(c.hex)!;
    if (i < MAX_ACCENTS) {
      const hue = colourName(c.hex).split(' ').at(-1)!;
      const l = toLab(rgba)[0];
      const shade = l > 85 ? '-subtle' : l < 35 ? '-strong' : '';
      keep(i === 0 ? 'brand' : `${SEMANTIC[hue] ?? hue}${shade}`, c.hex, c.count, copies);
    } else {
      const home = nearest(rgba, tokens);
      home.replaces.push(c.hex, ...copies);
      home.uses += c.count;
    }
  });

  // Neutrals: one token per lightness step; two greys on the same step merge into the more used one.
  const byStep = new Map<string, (typeof tokens)[number]>();
  for (const c of neutrals) {
    const rgba = parseColor(c.hex)!;
    const step = neutralStep(rgba);
    const copies = c.members.slice(1).map((m) => m.value);
    const home = byStep.get(step);
    if (home || byStep.size >= MAX_NEUTRALS) {
      const target = home ?? nearest(rgba, [...byStep.values()]);
      target.replaces.push(c.hex, ...copies);
      target.uses += c.count;
      continue;
    }
    taken.add(step);
    const token = { name: `color-${step}`, value: c.hex, category: 'color' as const, uses: c.count, replaces: copies, rgba };
    byStep.set(step, token);
    tokens.push(token);
  }

  overlays.slice(0, 3).forEach((c, i) => keep(`overlay-${i + 1}`, c.hex, c.count, c.members.slice(1).map((m) => m.value)));
  for (const c of overlays.slice(3)) {
    const home = tokens.find((t) => t.name.startsWith('color-overlay'));
    if (home) {
      home.replaces.push(c.hex);
      home.uses += c.count;
    }
  }

  // Semantic aliases: what text, surfaces and borders use most today.
  const aliases: StarterToken[] = [];
  const tokenFor = (hex: string) => tokens.find((t) => t.value === hex || t.replaces.includes(hex));
  const roleTop = (role: 'text' | 'background' | 'border', skip?: string) =>
    [...palette].filter((c) => c.roles[role] > 0 && tokenFor(c.hex)?.name !== skip).sort((a, b) => b.roles[role] - a.roles[role])[0];
  const alias = (name: string, cluster: (typeof palette)[number] | undefined) => {
    const target = cluster && tokenFor(cluster.hex);
    if (target) aliases.push({ name, value: `var(--${target.name})`, category: 'color', uses: cluster!.roles.text + cluster!.roles.background + cluster!.roles.border, replaces: [], alias: target.name });
    return target?.name;
  };
  const text = alias('color-text', roleTop('text'));
  // Muted text is a mid grey: never white (text on buttons) or the main text colour.
  const midGrey = (hex: string) => {
    const l = toLab(parseColor(hex)!)[0];
    return l > 25 && l < 75;
  };
  alias('color-text-muted', [...palette].filter((c) => c.neutral && c.roles.text > 0 && midGrey(c.hex) && tokenFor(c.hex)?.name !== text).sort((a, b) => b.roles.text - a.roles.text)[0]);
  alias('color-surface', roleTop('background'));
  // Borders: the most used neutral border (buttons in the brand colour would otherwise win).
  alias('color-border', [...palette].filter((c) => c.neutral && c.roles.border > 0).sort((a, b) => b.roles.border - a.roles.border)[0] ?? roleTop('border'));

  return [...tokens.map(({ rgba: _rgba, ...t }) => t), ...aliases];
}

// ── Type, spacing, shape, shadow ────────────────────────────────────────

const SIZE_NAMES_DOWN = ['sm', 'xs', '2xs', '3xs'];
const SIZE_NAMES_UP = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];

/** Keeps the most used values (near-copies and the least used fold into their nearest kept value). */
function numericSteps(values: ValueStat[], max: number, isKept: (v: ValueStat) => boolean = () => true) {
  const kept = values.filter((v) => !v.nearDuplicateOf && isKept(v)).slice(0, max);
  const steps = kept.map((v) => ({ n: parseFloat(v.value), display: v.display, uses: v.count, replaces: [] as string[] }));
  for (const v of values) {
    if (kept.includes(v)) continue;
    const n = parseFloat(v.value);
    if (!Number.isFinite(n) || steps.length === 0) continue;
    const home = steps.reduce((best, s) => (Math.abs(s.n - n) < Math.abs(best.n - n) ? s : best));
    home.replaces.push(v.display);
    home.uses += v.count;
  }
  return steps.sort((a, b) => a.n - b.n);
}

function sizeTokens(audit: Audit): StarterToken[] {
  const group = groupOf(audit, 'typography', 'font-size');
  if (!group || group.values.length === 0) return [];
  const steps = numericSteps(group.values, MAX_SIZES);
  const base = parseFloat(group.values[0]!.value);
  const baseIndex = Math.max(0, steps.findIndex((s) => s.n === base));
  return steps.map((s, i) => ({
    name: `font-size-${i === baseIndex ? 'base' : i < baseIndex ? SIZE_NAMES_DOWN[baseIndex - i - 1] ?? `down-${baseIndex - i}` : SIZE_NAMES_UP[i - baseIndex - 1] ?? `up-${i - baseIndex}`}`,
    value: `${s.n}px`,
    category: 'font-size',
    uses: s.uses,
    replaces: s.replaces,
  }));
}

const WEIGHT_NAMES: Record<string, string> = { '100': 'thin', '200': 'extralight', '300': 'light', '400': 'regular', '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black' };

function weightTokens(audit: Audit): StarterToken[] {
  const group = groupOf(audit, 'typography', 'font-weight');
  return (group?.values ?? [])
    .slice()
    .sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
    .map((v) => ({ name: `font-weight-${WEIGHT_NAMES[v.value] ?? v.value}`, value: v.value, category: 'font-weight' as const, uses: v.count, replaces: [] }));
}

function familyTokens(audit: Audit): StarterToken[] {
  const values = groupOf(audit, 'typography', 'font-family')?.values ?? [];
  const names = ['body', 'alt'];
  const kept = values.slice(0, 2);
  return kept.map((v, i) => ({
    name: `font-${names[i]}`,
    value: /\s/.test(v.value) && !/^["']/.test(v.value) ? `"${v.value}", sans-serif` : `${v.value}, sans-serif`,
    category: 'font-family' as const,
    uses: v.count + (i === 0 ? values.slice(2).reduce((n, x) => n + x.count, 0) : 0),
    replaces: i === 0 ? values.slice(2).map((x) => x.display) : [],
  }));
}

function spacingTokens(audit: Audit): StarterToken[] {
  const group = audit.analysis.foundations.spacing.groups[0];
  if (!group || !group.scale) return [];
  const base = group.scale.value;
  const small = group.values.filter((v) => parseFloat(v.value) <= MAX_SCALE_SPACING);
  const steps = numericSteps(small, 12, (v) => v.onScale !== false);
  const byFour = base % 4 === 0;
  return steps.map((s, i) => ({
    name: `space-${byFour ? String(s.n / 4).replace('.', '_') : i + 1}`,
    value: `${s.n}px`,
    category: 'spacing' as const,
    uses: s.uses,
    replaces: s.replaces,
  }));
}

function radiusTokens(audit: Audit): StarterToken[] {
  const values = groupOf(audit, 'shape', 'radius')?.values ?? [];
  const full = values.find((v) => v.value === 'full');
  const numeric = values.filter((v) => v.value !== 'full');
  const steps = numericSteps(numeric, 4);
  const names = steps.length <= 1 ? ['md'] : steps.length === 2 ? ['sm', 'lg'] : steps.length === 3 ? ['sm', 'md', 'lg'] : ['xs', 'sm', 'md', 'lg'];
  const tokens: StarterToken[] = steps.map((s, i) => ({ name: `radius-${names[i]}`, value: `${s.n}px`, category: 'radius', uses: s.uses, replaces: s.replaces }));
  if (full) tokens.push({ name: 'radius-full', value: '9999px', category: 'radius', uses: full.count, replaces: [] });
  return tokens;
}

function shadowTokens(audit: Audit): StarterToken[] {
  // Fully transparent shadows are layout tricks (e.g. a 9999px inset), not elevation.
  const values = (groupOf(audit, 'elevation', 'shadow')?.values ?? []).filter((v) => !/^(rgba\([^)]*,\s*0\)\s*[^,]*)(,\s*rgba\([^)]*,\s*0\)[^,]*)*$/.test(v.value));
  const kept = values.slice(0, 3);
  const extra = values.slice(3);
  return kept.map((v, i) => ({
    name: `shadow-${['sm', 'md', 'lg'][i]}`,
    value: v.value,
    category: 'shadow' as const,
    uses: v.count + (i === kept.length - 1 ? extra.reduce((n, x) => n + x.count, 0) : 0),
    replaces: i === kept.length - 1 ? extra.map((x) => x.value) : [],
  }));
}

// ── Output ──────────────────────────────────────────────────────────────

function toCss(tokens: StarterToken[], clientName: string): string {
  const lines = [
    `/* Starter design tokens for ${clientName}, extracted from the live product by System Audit.`,
    ` * Each comment lists the values in use today that the token replaces. Review names and merges before adopting. */`,
    ':root {',
  ];
  let category: TokenCategory | null = null;
  for (const t of tokens) {
    if (t.category !== category) {
      if (category) lines.push('');
      lines.push(`  /* ${LABELS[t.category]} */`);
      category = t.category;
    }
    const note = t.replaces.length ? ` /* replaces ${t.replaces.slice(0, 8).join(', ')}${t.replaces.length > 8 ? ', …' : ''} */` : '';
    lines.push(`  --${t.name}: ${t.value};${note}`);
  }
  lines.push('}');
  return lines.join('\n');
}

const DTCG_TYPE: Record<TokenCategory, string> = {
  color: 'color',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'font-family': 'fontFamily',
  spacing: 'dimension',
  radius: 'dimension',
  shadow: 'shadow',
};

/** W3C Design Tokens (DTCG) format, readable by Tokens Studio, Style Dictionary and Figma plugins. */
function toJson(tokens: StarterToken[]): string {
  const root: Record<string, Record<string, unknown>> = {};
  for (const t of tokens) {
    const [group, ...rest] = t.name.split('-');
    const key = rest.join('-') || group!;
    root[group!] ??= {};
    root[group!]![key] = {
      $type: DTCG_TYPE[t.category],
      $value: t.alias ? `{${t.alias.split('-')[0]}.${t.alias.split('-').slice(1).join('-')}}` : t.value,
      ...(t.replaces.length ? { $description: `Replaces ${t.replaces.join(', ')}` } : {}),
    };
  }
  return JSON.stringify(root, null, 2);
}

export function starterSystem(audit: Audit, clientName = 'your product'): StarterSystem {
  const tokens = [
    ...colourTokens(audit),
    ...familyTokens(audit),
    ...sizeTokens(audit),
    ...weightTokens(audit),
    ...spacingTokens(audit),
    ...radiusTokens(audit),
    ...shadowTokens(audit),
  ];
  const core = tokens.filter((t) => !t.alias);
  const f = audit.analysis.foundations;
  const before =
    (f.color.palette ?? []).reduce((n, c) => n + c.members.length, 0) +
    ['font-size', 'font-weight', 'font-family'].reduce((n, k) => n + (groupOf(audit, 'typography', k)?.values.length ?? 0), 0) +
    (f.spacing.groups[0]?.values.filter((v) => parseFloat(v.value) <= MAX_SCALE_SPACING).length ?? 0) +
    (groupOf(audit, 'shape', 'radius')?.values.length ?? 0) +
    (groupOf(audit, 'elevation', 'shadow')?.values.length ?? 0);
  const categories = [...new Set(tokens.map((t) => t.category))];
  return {
    tokens,
    before,
    after: core.length,
    groups: categories.map((category) => ({ category, label: LABELS[category], tokens: tokens.filter((t) => t.category === category) })),
    css: toCss(tokens, clientName),
    json: toJson(tokens),
  };
}

/** Whether a colour value is light, for picking readable text on a swatch. */
export function isLight(hex: string): boolean {
  const c = parseColor(hex);
  return c ? toLab(c)[0] > 65 : true;
}
