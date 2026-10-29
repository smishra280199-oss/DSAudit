/**
 * Pain points: the audit retold as a guided walk through the reader's own
 * product. Each finding names real things they will recognise (their
 * buttons, their colours, their pages), says why it matters in everyday
 * terms, suggests a fix, and puts a yearly cost on it where we can.
 *
 * The voice is "we" (whoever sends the report) talking to "you" (the
 * product team): helpful, specific, never salesy.
 */

import type { Audit } from '../audit';
import { viewElements } from '../inference/elements';
import type { AreaKey, ComponentAnalysis, ComponentVariant, Severity, ValueStat } from '../inference/types';
import type { StyleKey } from '../shared/snapshot';
import { colourName, describer, friendlyValue, listOf, type Describer } from './describe';

export type Evidence =
  | { kind: 'colours'; groups: { main: string; copies: string[] }[] }
  | { kind: 'values'; items: { value: string; count: number; flagged: boolean }[]; note: string }
  | { kind: 'contrast'; items: { text: string; foreground: string; background: string; ratio: number }[] }
  | { kind: 'variants'; items: { label: string; details: string }[] }
  | { kind: 'none' };

/** Where in the product a problem lives, for the report's problem map. */
export type ProblemLayer = 'Tokens & styles' | 'Components' | 'Elements';

export const PROBLEM_LAYERS: ProblemLayer[] = ['Tokens & styles', 'Components', 'Elements'];

export interface PainPoint {
  id: string;
  area: AreaKey;
  severity: Severity;
  layer: ProblemLayer;
  /** What it affects, in one or two words: "Colours", "Buttons", "Readability". */
  affects: string;
  /** How many places it shows up, and what is counted ("places", "hand-typed values"…). */
  count: number;
  countLabel: string;
  /** A plain statement of the problem, in their terms. */
  title: string;
  /** The problem in one short sentence, for scanning. */
  summary: string;
  /** The fix as a short instruction: "Merge your purples into one colour token". */
  fixTitle: string;
  /** What we saw, with their own examples. */
  story: string;
  /** Where it shows up: elements, and pages when several were audited. */
  where: string[];
  pages: string[];
  evidence: Evidence;
  why: string;
  suggestion: string;
  /** Estimated yearly cost, when the finding has one. */
  annualCost: number | null;
  annualHours: number | null;
  /** Elements to highlight in the panel. */
  selectors: string[];
}

const STYLE_NAMES: Partial<Record<StyleKey, string>> = {
  backgroundColor: 'background',
  color: 'text colour',
  borderTopColor: 'border colour',
  borderTopWidth: 'border',
  borderTopLeftRadius: 'corners',
  fontSize: 'text size',
  fontWeight: 'weight',
  fontFamily: 'font',
  lineHeight: 'line height',
  paddingLeft: 'padding',
  paddingTop: 'padding',
  boxShadow: 'shadow',
};

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/** Example names for a component's intentional styles, so suggestions fit the component. */
const VARIANT_EXAMPLES: Record<ComponentAnalysis['kind'], string> = {
  button: 'primary, secondary and danger',
  input: 'default and error',
  link: 'default and subtle',
  heading: 'page title, section title and card title',
  card: 'flat and raised',
  badge: 'neutral, success and warning',
  avatar: 'small and large',
};

interface Context {
  audit: Audit;
  d: Describer;
  lineCost: (key: string) => { cost: number; hours: number } | null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function px(value: string): string {
  return /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
}

// ── Colour ────────────────────────────────────────────────────────────────

function colours({ audit, d, lineCost }: Context): PainPoint | null {
  const palette = audit.analysis.foundations.color.palette ?? [];
  const drifted = palette.filter((c) => c.members.length > 1);
  const total = palette.reduce((n, c) => n + c.members.length, 0);
  if (drifted.length === 0 && palette.length <= 20) return null;

  const copies = drifted.reduce((n, c) => n + c.members.length - 1, 0);
  // Lead with a brand-like colour if one drifted: a purple in three shades says more than two whites.
  const top = [...drifted].sort((a, b) => Number(a.neutral) - Number(b.neutral) || b.members.length - a.members.length)[0];
  const selectors = drifted.flatMap((c) => c.members.slice(1).flatMap((m) => m.selectors));
  const where = d.examples(selectors);
  const cost = lineCost('colors');

  let story = `We counted ${plural(total, 'different colour')} across text, backgrounds and borders.`;
  if (top) {
    const name = colourName(top.hex);
    story += ` ${plural(copies, 'of them is a near-identical copy', 'of them are near-identical copies')} of another colour. For example, your ${name} ${top.hex} also appears as ${listOf(top.members.slice(1, 3).map((m) => m.value))}. Side by side, nobody can tell them apart, but in code they are separate colours that each have to be chosen, checked and maintained.`;
  }
  if (palette.length > 20) story += ` Even after merging those, there are ${palette.length} distinct colours, more than most well-run products need.`;
  const copyUses = drifted.reduce((n, c) => n + c.members.slice(1).reduce((m, v) => m + v.count, 0), 0);

  return {
    id: 'colours',
    area: 'color',
    layer: 'Tokens & styles',
    affects: 'Colours',
    count: copyUses,
    countLabel: copyUses === 1 ? 'place uses a near-copy' : 'places use a near-copy',
    summary: `${plural(copies, 'colour is a near-identical copy', 'colours are near-identical copies')} of another, out of ${total} in use.`,
    fixTitle: top ? `Merge your ${colourName(top.hex)}s into one named colour` : 'Merge near-identical colours into one palette',
    severity: copies >= 6 || palette.length > 30 ? 'high' : 'medium',
    title: top ? `Your ${colourName(top.hex)} exists in ${plural(top.members.length, 'slightly different shade')}` : `${total} colours where about 20 would do`,
    story,
    where,
    pages: d.pages(selectors),
    evidence: { kind: 'colours', groups: [top!, ...drifted.filter((c) => c !== top)].filter(Boolean).slice(0, 5).map((c) => ({ main: c.hex, copies: c.members.slice(1, 4).map((m) => m.value) })) },
    why: 'Every extra shade is a small decision someone has to make again, and a small inconsistency your customers notice without knowing why. It is how a brand slowly starts to look “off”.',
    suggestion: `Agree on one value for each colour and give it a name (a design token such as “brand-primary”). Then replace the ${plural(copies, 'copy', 'copies')} with that name, so the product can’t drift again.`,
    annualCost: cost?.cost ?? null,
    annualHours: cost?.hours ?? null,
    selectors: selectors.slice(0, 60),
  };
}

// ── Typography ────────────────────────────────────────────────────────────

function typeSizes({ audit, d, lineCost }: Context): PainPoint | null {
  const group = audit.analysis.foundations.typography.groups.find((g) => g.key === 'font-size');
  if (!group || group.values.length === 0) return null;
  const flagged = group.values.filter((v) => v.nearDuplicateOf || v.onScale === false);
  if (flagged.length === 0 && group.values.length <= group.target) return null;

  const twins = group.values.filter((v) => v.nearDuplicateOf);
  const example = twins[0];
  const selectors = flagged.flatMap((v) => v.selectors);
  const cost = lineCost('font-size');
  const needed = audit.savings.lines.find((l) => l.key === 'font-size')?.recommended ?? group.target;
  let story = `Your text comes in ${plural(group.values.length, 'different size')}.`;
  if (example) {
    story += ` Some are only a pixel apart: ${px(example.value)} next to ${px(example.nearDuplicateOf!)}, for instance. At that distance readers can’t see a difference, but every designer and developer still has to pick between them.`;
  } else {
    story += ` ${plural(flagged.length, 'of them doesn’t', 'of them don’t')} fit the size steps the rest of the product follows.`;
  }

  const flaggedUses = flagged.reduce((n, v) => n + v.count, 0);
  return {
    id: 'type-sizes',
    area: 'typography',
    layer: 'Tokens & styles',
    affects: 'Text sizes',
    count: flaggedUses,
    countLabel: flaggedUses === 1 ? 'piece of text off the scale' : 'pieces of text off the scale',
    summary: example
      ? `${group.values.length} text sizes, some only a pixel apart (${px(example.value)} and ${px(example.nearDuplicateOf!)}).`
      : `${group.values.length} text sizes; ${flagged.length} don’t fit the scale.`,
    fixTitle: `Settle on a ${needed}-step type scale`,
    severity: group.values.length > group.target * 1.5 || twins.length >= 3 ? 'high' : 'medium',
    title: `Text comes in ${plural(group.values.length, 'size')} where about ${needed} would do`,
    story,
    where: d.examples(selectors),
    pages: d.pages(selectors),
    evidence: valueEvidence(group.values, (v) => Boolean(v.nearDuplicateOf || v.onScale === false), 'Highlighted sizes are near-duplicates or off the scale.'),
    why: 'A short, fixed set of text sizes (a “type scale”) is what makes headings, labels and body text feel related. Without one, hierarchy gets reinvented on every screen and pages start to feel uneven.',
    suggestion: `Pick about ${needed} sizes, give each a job (page title, section title, body, caption…) and move every other size to its nearest step.`,
    annualCost: cost?.cost ?? null,
    annualHours: cost?.hours ?? null,
    selectors: selectors.slice(0, 60),
  };
}

function valueEvidence(values: ValueStat[], flag: (v: ValueStat) => boolean, note: string): Evidence {
  return {
    kind: 'values',
    items: [...values]
      .sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
      .slice(0, 16)
      .map((v) => ({ value: v.display, count: v.count, flagged: flag(v) })),
    note,
  };
}

// ── Spacing ───────────────────────────────────────────────────────────────

function spacing({ audit, d, lineCost }: Context): PainPoint | null {
  const group = audit.analysis.foundations.spacing.groups[0];
  if (!group?.scale) return null;
  const off = group.values.filter((v) => v.onScale === false);
  if (off.length === 0 && group.values.length <= group.target) return null;
  const base = group.scale.value;
  const selectors = off.flatMap((v) => v.selectors);
  const cost = lineCost('spacing');
  const uses = off.reduce((n, v) => n + v.count, 0);
  return {
    id: 'spacing',
    area: 'spacing',
    layer: 'Tokens & styles',
    affects: 'Spacing',
    count: uses,
    countLabel: uses === 1 ? 'place uses a one-off gap' : 'places use one-off gaps',
    summary: `Only ${Math.round(group.scale.fit * 100)}% of gaps and padding follow your ${base}px rhythm.`,
    fixTitle: `Snap spacing to named ${base}px steps`,
    severity: group.scale.fit < 0.7 ? 'high' : group.scale.fit < 0.9 ? 'medium' : 'low',
    title: off.length ? `${plural(off.length, 'spacing value breaks', 'spacing values break')} your ${base}px rhythm` : `${group.values.length} spacing values where ${group.target} would do`,
    story:
      (group.scale.fit >= 0.85
        ? `Most of the gaps and padding in your product follow a ${base}px rhythm: ${Math.round(group.scale.fit * 100)}% of them are multiples of ${base}px. That is a good sign. `
        : `The closest thing to a spacing rhythm in your product is ${base}px, but only ${Math.round(group.scale.fit * 100)}% of gaps and padding actually follow it. `) +
      (off.length
        ? `But ${plural(uses, 'place uses', 'places use')} one-off values like ${listOf(off.slice(0, 3).map((v) => v.display))}, which is why some layouts feel slightly uneven.`
        : `Even so, there are ${group.values.length} different values in use.`),
    where: d.examples(selectors),
    pages: d.pages(selectors),
    evidence: valueEvidence(group.values, (v) => v.onScale === false, `Highlighted values are not multiples of ${base}px.`),
    why: 'Consistent spacing is most of what makes a layout feel calm and intentional. One-off values also turn into review comments and back-and-forth between design and development.',
    suggestion: `Keep the ${base}px rhythm as the rule, name the steps (for example small, medium, large) and round the one-off values to the nearest step.`,
    annualCost: cost?.cost ?? null,
    annualHours: cost?.hours ?? null,
    selectors: selectors.slice(0, 60),
  };
}

// ── Components ────────────────────────────────────────────────────────────

function variantLabel(v: ComponentVariant): string {
  return v.sampleText ? `“${v.sampleText.slice(0, 28)}”` : `a ${v.tag}`;
}

function differences(a: ComponentVariant, b: ComponentVariant): string[] {
  const out: string[] = [];
  for (const [key, name] of Object.entries(STYLE_NAMES) as [StyleKey, string][]) {
    const x = a.styles[key];
    const y = b.styles[key];
    if (x !== undefined && y !== undefined && x !== y && !out.some((o) => o.startsWith(name))) out.push(`${name} ${friendlyValue(x)} vs ${friendlyValue(y)}`);
  }
  return out;
}

function componentPoint(c: ComponentAnalysis, { d, lineCost }: Context): PainPoint | null {
  const excess = c.variants.length - c.target;
  if (excess <= 0 && c.nearDuplicatePairs.length === 0) return null;
  const noun = c.label.toLowerCase();
  const pair = c.nearDuplicatePairs[0];
  const selectors = c.variants.flatMap((v) => v.selectors);
  const cost = lineCost(`component-${c.kind}`);
  let story = `Your ${noun} come in ${plural(c.variants.length, 'different visual style')} across ${plural(c.instances, 'instance')}.`;
  if (pair) {
    const [a, b] = [c.variants[pair[0]]!, c.variants[pair[1]]!];
    const diff = differences(a, b);
    story += ` Some are meant to be the same thing but were built slightly differently: ${variantLabel(a)} and ${variantLabel(b)} look alike, yet differ in ${listOf(diff.slice(0, 3))}.`;
  }
  if (excess > 0) story += ` Most products need about ${c.target} ${noun.replace(/s$/, '')} styles.`;
  const keep = Math.min(c.variants.length - new Set(c.nearDuplicatePairs.map(([, j]) => j)).size, c.target);
  const redundant = c.variants.filter((_, i) => i >= keep || c.nearDuplicatePairs.some(([, j]) => j === i));
  const redundantUses = redundant.reduce((n, v) => n + v.count, 0);
  const singular = noun.replace(/s$/, '');
  return {
    id: `component-${c.kind}`,
    area: 'components',
    layer: 'Components',
    affects: c.label,
    count: redundantUses,
    countLabel: redundantUses === 1 ? `${singular} uses an extra style` : `${noun} use an extra style`,
    summary: pair
      ? `${c.variants.length} ${singular} styles; ${variantLabel(c.variants[pair[0]]!)} and ${variantLabel(c.variants[pair[1]]!)} are near-copies.`
      : `${c.variants.length} ${singular} styles where ${c.target} would do.`,
    fixTitle: `Build one ${singular} component with ${keep} named styles`,
    severity: excess > c.target || c.nearDuplicatePairs.length >= 2 ? 'high' : 'medium',
    title: pair ? `Some of your ${noun} look almost identical but are built differently` : `Your ${noun} come in ${c.variants.length} styles where ${c.target} would do`,
    story,
    where: [],
    pages: d.pages(selectors),
    evidence: {
      kind: 'variants',
      items: c.variants.slice(0, 6).map((v) => ({
        label: variantLabel(v),
        details: [
          v.styles.backgroundColor && `background ${friendlyValue(v.styles.backgroundColor)}`,
          v.styles.color && `text ${friendlyValue(v.styles.color)}`,
          v.styles.borderTopLeftRadius && `corners ${friendlyValue(v.styles.borderTopLeftRadius)}`,
          v.styles.fontSize && `size ${v.styles.fontSize}`,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    },
    why: `Every extra ${noun.replace(/s$/, '')} style has to be designed, built, tested and kept in sync. Near-copies are the most expensive kind: they cost the same effort as a real variant but give users nothing.`,
    suggestion: `Define a small set of named ${noun.replace(/s$/, '')} styles (for example ${VARIANT_EXAMPLES[c.kind]}) as one reusable component, and move every ${noun.replace(/s$/, '')} onto it.`,
    annualCost: cost?.cost ?? null,
    annualHours: cost?.hours ?? null,
    selectors: selectors.slice(0, 60),
  };
}

// ── Tokens ────────────────────────────────────────────────────────────────

function tokens({ audit }: Context): PainPoint | null {
  const { tokens: t } = audit.analysis;
  const { retheme } = audit.savings;
  if (t.coverage === null || t.coverage >= 0.7 || retheme.literals < 10) return null;
  const saved = Math.max(0, retheme.hoursToday - retheme.hoursWithTokens);
  const reuse = t.suggestions.filter((s) => s.confidence === 'role-match');
  const reuseUses = reuse.reduce((n, s) => n + s.occurrences, 0);
  let story =
    `Design tokens are named, reusable values, like “brand-primary” instead of a raw colour code. Only ${Math.round(t.coverage * 100)}% of your styling uses them today. ` +
    `The other ${plural(retheme.literals, 'value is', 'values are')} typed in by hand. So a rebrand, a dark mode or even a new accent colour means finding and editing every one of them: about ${retheme.hoursToday} hours of careful work each time, compared with about ${retheme.hoursWithTokens} hours if they were tokens.`;
  if (reuseUses > 0) {
    const ex = reuse[0]!;
    story += ` In ${plural(reuseUses, 'place')}, a token already exists and simply isn’t used. For example, ${ex.literal} is typed in where “${ex.token.replace(/^--/, '')}” already holds that exact value.`;
  }
  const a = audit.assumptions;
  return {
    id: 'tokens',
    area: 'tokens',
    layer: 'Tokens & styles',
    affects: 'Design tokens',
    count: retheme.literals,
    countLabel: 'hand-typed values',
    summary: `Only ${Math.round(t.coverage * 100)}% of styling uses tokens; a redesign means ${retheme.literals.toLocaleString('en-US')} manual edits.`,
    fixTitle: 'Move your most-used values into design tokens',
    severity: t.coverage < 0.3 ? 'high' : 'medium',
    title: `${Math.round((1 - t.coverage) * 100)}% of your styling is typed in by hand`,
    story,
    where: [],
    pages: [],
    evidence: { kind: 'none' },
    why: 'Hand-typed values are the main reason design changes take weeks instead of days, and the main way colours and sizes quietly drift apart over time.',
    suggestion: 'Start with the values used most (colours, then spacing and text sizes): give them names once, and use the names everywhere. Quick win: switch the places where a matching token already exists.',
    annualCost: Math.round(saved * a.rethemesPerYear * a.hourlyRate) || null,
    annualHours: saved * a.rethemesPerYear || null,
    selectors: [],
  };
}

// ── Accessibility and interaction ─────────────────────────────────────────

function contrast({ audit, d }: Context): PainPoint | null {
  const failures = audit.analysis.accessibility.contrastFailures;
  if (failures.length === 0) return null;
  const worst = failures[0]!;
  const selectors = failures.map((f) => f.selector);
  return {
    id: 'contrast',
    area: 'accessibility',
    layer: 'Elements',
    affects: 'Readability',
    count: failures.length,
    countLabel: failures.length === 1 ? 'piece of text below standard' : 'pieces of text below standard',
    summary: `The faintest scores ${worst.ratio}:1; the accessibility standard asks for 4.5:1.`,
    fixTitle: 'Darken faint text to at least 4.5:1',
    severity: failures.length >= 5 || worst.ratio < 3 ? 'high' : 'medium',
    title: `${plural(failures.length, 'piece of text is', 'pieces of text are')} hard to read`,
    story: `Text needs enough contrast with its background to be read comfortably, in sunlight, on cheap screens, or by the many people with weaker eyesight. The accepted standard (WCAG AA) asks for a ratio of at least 4.5 to 1. For example, “${worst.text.slice(0, 48)}” is ${colourName(worst.foreground)} (${worst.foreground}) on ${colourName(worst.background)} (${worst.background}), which scores only ${worst.ratio} to 1.`,
    where: d.examples(selectors),
    pages: d.pages(selectors),
    evidence: { kind: 'contrast', items: failures.slice(0, 5).map((f) => ({ text: f.text.slice(0, 40), foreground: f.foreground, background: f.background, ratio: f.ratio })) },
    why: 'Hard-to-read text costs conversions and support tickets, and accessibility standards are increasingly a legal requirement for digital products.',
    suggestion: 'Darken these text colours (or lighten the backgrounds) until they reach 4.5 to 1, and save the approved text-and-background pairs as tokens so new screens get them right by default.',
    annualCost: null,
    annualHours: null,
    selectors: selectors.slice(0, 60),
  };
}

function keyboard({ audit }: Context): PainPoint | null {
  const { interaction } = audit.analysis;
  const removed = interaction.outlineRemovedWithoutReplacement;
  const missing = interaction.interactiveCount - interaction.withFocus;
  if (removed.length === 0 && (interaction.focusCoverage ?? 1) >= 0.6) return null;
  const what = removed.some((r) => /input|field|select|textarea/i.test(r.selector))
    ? 'your form fields'
    : removed.some((r) => /btn|button/i.test(r.selector))
      ? 'your buttons'
      : 'some controls';
  return {
    id: 'keyboard',
    area: 'interaction',
    layer: 'Elements',
    affects: 'Keyboard access',
    count: removed.length ? Math.max(1, missing) : missing,
    countLabel: 'controls without a visible focus style',
    summary: removed.length ? `The focus outline is switched off on ${what}, with nothing in its place.` : 'Controls rely on the browser’s default focus outline.',
    fixTitle: 'Add one visible focus style everywhere',
    severity: removed.length > 0 ? 'high' : 'medium',
    title: removed.length ? 'Keyboard users can lose track of where they are' : `${plural(missing, 'control has', 'controls have')} no visible focus style`,
    story: removed.length
      ? `When someone moves through a page with the Tab key, the browser draws an outline around the focused element. On ${what}, that outline has been switched off and nothing replaces it, so keyboard users can’t see where they are.`
      : `${plural(missing, 'of your interactive elements relies', 'of your interactive elements rely')} on the browser’s default focus outline, which often clashes with the design or disappears against it.`,
    where: [],
    pages: [],
    evidence: { kind: 'none' },
    why: 'Keyboard navigation is used by power users and by people who can’t use a mouse. A missing focus indicator is one of the most common accessibility failures.',
    suggestion: 'Add one consistent focus style (for example a 2px ring in your brand colour) and apply it to every interactive element.',
    annualCost: null,
    annualHours: null,
    selectors: [],
  };
}

function unnamed({ audit, d }: Context): PainPoint | null {
  const controls = audit.analysis.accessibility.unnamedControls;
  if (controls.length === 0) return null;
  const selectors = controls.map((c) => c.selector);
  return {
    id: 'unnamed',
    area: 'accessibility',
    layer: 'Elements',
    affects: 'Screen readers',
    count: controls.length,
    countLabel: controls.length === 1 ? 'unlabelled control' : 'unlabelled controls',
    summary: 'Icon-only controls are announced as just “button”.',
    fixTitle: 'Label every icon-only button',
    severity: controls.length >= 5 ? 'high' : 'medium',
    title: `${plural(controls.length, 'icon button has', 'icon buttons have')} no name for screen readers`,
    story: controls.length === 1
      ? 'One button shows only an icon and has no text label behind it. A screen reader announces it as just “button”, so a blind user has no idea what it does.'
      : `${controls.length} buttons and links show only an icon and have no text label behind them. A screen reader announces them as just “button”, so a blind user has no idea what they do.`,
    where: [],
    pages: d.pages(selectors),
    evidence: { kind: 'none' },
    why: 'It is a quick fix with a big effect for the people who depend on it, and a common item in accessibility reviews.',
    suggestion: 'Give each icon-only control a short hidden label (an aria-label such as “Close” or “Settings”).',
    annualCost: null,
    annualHours: null,
    selectors,
  };
}

function details({ audit, lineCost }: Context): PainPoint | null {
  const lines = audit.savings.lines.filter((l) => ['radius', 'border-width', 'shadow', 'z-index', 'duration'].includes(l.key) && l.excess > 0);
  if (lines.length === 0) return null;
  const cost = lines.map((l) => lineCost(l.key)).reduce((n, c) => n + (c?.cost ?? 0), 0);
  const hours = lines.map((l) => lineCost(l.key)).reduce((n, c) => n + (c?.hours ?? 0), 0);
  const extra = lines.reduce((n, l) => n + l.excess, 0);
  return {
    id: 'details',
    area: 'shape',
    layer: 'Tokens & styles',
    affects: 'Corners & shadows',
    count: extra,
    countLabel: extra === 1 ? 'extra style' : 'extra styles',
    summary: listOf(lines.map((l) => `${l.current} ${l.label.toLowerCase()} (${l.recommended} needed)`)) + '.',
    fixTitle: 'Name a few corner, shadow and timing styles',
    severity: 'low',
    title: 'Small details vary more than they need to',
    story: `Corners, borders, shadows and animation timing are the details people feel rather than see. We found ${listOf(lines.map((l) => `${l.current} ${l.label.toLowerCase()} where ${l.recommended} would do`))}.`,
    where: [],
    pages: [],
    evidence: { kind: 'none' },
    why: 'Consistent details are what make a product feel like one coherent thing rather than screens built at different times by different people.',
    suggestion: 'Define a few named corner, shadow and timing styles and use only those.',
    annualCost: cost || null,
    annualHours: hours || null,
    selectors: lines.flatMap((l) => l.selectors).slice(0, 60),
  };
}

export function findPainPoints(audit: Audit, dismissed: string[] = []): PainPoint[] {
  const views = viewElements(audit.snapshot);
  const d = describer(audit.snapshot, views);
  const lineCost = (key: string) => {
    const line = audit.savings.lines.find((l) => l.key === key);
    return line && line.excess > 0 ? { cost: line.annualCost, hours: line.annualHours } : null;
  };
  const ctx: Context = { audit, d, lineCost };

  const points = [
    colours(ctx),
    typeSizes(ctx),
    spacing(ctx),
    ...audit.analysis.components.filter((c) => c.instances > 0).map((c) => componentPoint(c, ctx)),
    tokens(ctx),
    contrast(ctx),
    keyboard(ctx),
    unnamed(ctx),
    details(ctx),
  ].filter((p): p is PainPoint => p !== null && !dismissed.includes(p.id));

  return points.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.annualCost ?? 0) - (a.annualCost ?? 0));
}
