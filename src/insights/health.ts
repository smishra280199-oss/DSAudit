/**
 * The design-system health report, organised the way a design system is
 * built: Foundations (the token layer: colour, type, spacing, shape),
 * Components (the building blocks made from them) and Accessibility (the
 * quality bar both must meet). Tokens are not a separate area: they are how
 * well each foundation is managed.
 *
 * Wherever possible every finding carries real screenshots of the elements
 * involved (snapshot.evidence), so the report shows the problem instead of
 * describing it.
 */

import type { Audit } from '../audit';
import { buildBusinessCase, consistencyLevel, type ConsistencyLevel, type RankedOpportunity } from '../business';
import type { AreaKey, FoundationKey } from '../inference/types';
import { AREA_WEIGHTS } from '../scoring';
import type { EvidenceShot } from '../shared/snapshot';
import { componentGallery, type GalleryGroup } from './gallery';
import { formatMoney } from '../savings';
import { summarise, type PainPoint } from './index';
import { starterSystem, type StarterSystem } from './starter-system';
import { accessibilityReport, type AccessibilityReport } from './wcag';
import { foundationDetail, type FoundationDetail } from './foundation-detail';

export type LayerKey = 'foundations' | 'components' | 'accessibility';

export interface LayerScore {
  key: LayerKey;
  label: string;
  /** What the layer answers, in one line. */
  question: string;
  score: number;
  level: ConsistencyLevel;
  /** The layer's state in one sentence, with its numbers. */
  summary: string;
}

export interface Shot {
  shot: EvidenceShot;
  caption: string;
  /** A short flag drawn on the shot, e.g. "copy of #1" or "2.3:1". */
  flag?: string;
}

export interface HealthFinding {
  point: PainPoint;
  layer: LayerKey;
  shots: Shot[];
  /** Where exactly, as concrete lines: "Style 6 copies style 4: padding 8px → 10px". */
  details: string[];
}

export interface TypeStep {
  px: number;
  count: number;
  offScale: boolean;
  nearCopyOf: string | null;
  shot: EvidenceShot | null;
}

export interface ColourGroup {
  main: string;
  copies: { hex: string; shot: EvidenceShot | null }[];
  count: number;
}

export interface HealthReport {
  clientName: string;
  pages: { name: string; url: string }[];
  overall: { score: number; level: ConsistencyLevel };
  layers: LayerScore[];
  /** The three findings to lead with: most severe first, one per layer where possible. */
  top: HealthFinding[];
  findings: HealthFinding[];
  money: { yearlyCost: number; yearlyHours: number; savedHours: { low: number; likely: number; high: number }; savedCost: number; recoverable: number; recoverableHours: number };
  quickWins: RankedOpportunity[];
  foundations: {
    colours: { total: number; copies: number; palette: ColourGroup[] };
    type: { steps: TypeStep[]; families: string[]; scaleNote: string };
    spacing: { base: number; fit: number; values: { px: number; count: number; onGrid: boolean }[] };
    radii: { value: string; count: number }[];
    shadows: { distinct: number; needed: number };
    /** Share of each foundation's styling written with tokens. */
    tokens: { label: string; share: number | null }[];
  };
  components: GalleryGroup[];
  accessibility: { report: AccessibilityReport; examples: { title: string; shots: Shot[] }[]; uncheckedText: number };
  system: StarterSystem;
  /** Every colour, text style, spacing value and radius, with examples and token status. */
  detail: FoundationDetail;
  /** What we scanned and how. */
  scan: { pages: number; elements: number; rules: number; screenshots: number; planned: number; date: string; contributors: number; hourlyRate: number };
  /** Three or four plain sentences: the headline findings. */
  keyFindings: string[];
  working: string[];
  gaps: string[];
  opportunities: string[];
  outcomes: string[];
}

const LAYER_AREAS: Record<LayerKey, AreaKey[]> = {
  foundations: ['color', 'typography', 'spacing', 'shape', 'elevation', 'motion', 'tokens'],
  components: ['components', 'interaction'],
  accessibility: ['accessibility'],
};

export function layerOf(point: PainPoint): LayerKey {
  if (point.area === 'accessibility' || point.id === 'keyboard') return 'accessibility';
  if (point.area === 'components' || point.area === 'interaction' || point.id.startsWith('component-')) return 'components';
  return 'foundations';
}

/** Real-pixel shots for a list of selectors, in order, skipping those we couldn't photograph. */
export function shotsFor(audit: Audit, selectors: string[], caption: (i: number) => string, limit = 4): Shot[] {
  const evidence = audit.snapshot.evidence ?? {};
  const out: Shot[] = [];
  for (const s of selectors) {
    const shot = evidence[s];
    if (shot) out.push({ shot, caption: caption(out.length) });
    if (out.length >= limit) break;
  }
  return out;
}

function layerScore(audit: Audit, key: LayerKey): number {
  const areas = audit.score.areas.filter((a) => a.applicable && LAYER_AREAS[key].includes(a.key));
  const weight = areas.reduce((n, a) => n + AREA_WEIGHTS[a.key], 0);
  return weight ? Math.round(areas.reduce((n, a) => n + a.score * AREA_WEIGHTS[a.key], 0) / weight) : 100;
}

const pct = (n: number | null) => (n === null ? null : Math.round(n * 100));

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}

export function healthReport(audit: Audit, options: { clientName: string; dismissed?: string[] }): HealthReport {
  const { analysis, snapshot } = audit;
  const summary = summarise(audit, options);
  const business = buildBusinessCase(audit, options.dismissed);
  const access = accessibilityReport(audit);
  const gallery = componentGallery(audit);
  const evidence = snapshot.evidence ?? {};

  // ── Foundations ──
  const palette = analysis.foundations.color.palette ?? [];
  const copies = palette.reduce((n, c) => n + c.members.length - 1, 0);
  const sizes = analysis.foundations.typography.groups.find((g) => g.key === 'font-size');
  const families = analysis.foundations.typography.groups.find((g) => g.key === 'font-family')?.values.map((v) => v.display) ?? [];
  const spacingGroup = analysis.foundations.spacing.groups[0];
  const offGrid = spacingGroup?.values.filter((v) => v.onScale === false) ?? [];
  const tokenShare = analysis.tokens.coverage;
  const foundationFacts = [
    `${palette.reduce((n, c) => n + c.members.length, 0)} colours${copies ? ` (${copies} near-copies)` : ''}`,
    `${sizes?.values.length ?? 0} text sizes`,
    offGrid.length ? `${offGrid.length} off-grid spacing values` : 'spacing on a grid',
    tokenShare === null ? null : `${Math.round(tokenShare * 100)}% of styling through tokens`,
  ].filter(Boolean);

  // ── Components ──
  const overKinds = gallery.filter((g) => g.styles > g.needed).sort((a, b) => b.styles - b.needed - (a.styles - a.needed));
  const componentSummary = overKinds.length
    ? `${overKinds
        .slice(0, 3)
        .map((g) => `${g.styles} ${g.noun} styles (${g.needed} needed)`)
        .join(', ')}.`
    : gallery.some((g) => g.hasProblem)
      ? 'Few styles, but some are near-copies of each other.'
      : 'Each kind of element comes in a small, distinct set of styles.';

  // Accessibility: half how many WCAG checks pass outright, half how widespread the failures are,
  // so "3 of 5 checks fail" can never read as highly accessible.
  const applicable = access.checks.filter((c) => c.status !== 'not-applicable');
  const passShare = applicable.length ? applicable.filter((c) => c.status === 'pass').length / applicable.length : 1;
  const scores: Record<LayerKey, number> = {
    foundations: layerScore(audit, 'foundations'),
    components: layerScore(audit, 'components'),
    accessibility: Math.round(passShare * 50 + layerScore(audit, 'accessibility') * 0.5),
  };
  const layers: LayerScore[] = [
    { key: 'foundations', label: 'Foundations', question: 'Are colour, type and spacing a small, named set?', score: scores.foundations, level: consistencyLevel(scores.foundations).level, summary: `${foundationFacts.join(', ')}.` },
    { key: 'components', label: 'Components', question: 'Is each element built once and reused?', score: scores.components, level: consistencyLevel(scores.components).level, summary: componentSummary },
    { key: 'accessibility', label: 'Accessibility', question: 'Can everyone read and use it?', score: scores.accessibility, level: consistencyLevel(scores.accessibility).level.replace('consistent', 'accessible').replace('Inconsistent', 'Not accessible') as ConsistencyLevel, summary: access.headline },
  ];

  // ── Findings with their screenshots ──
  const failures = analysis.accessibility.contrastFailures;
  const detailEarly = foundationDetail(audit, starterSystem(audit, summary.clientName));
  const findings: HealthFinding[] = summary.painPoints.map((point) => {
    const layer = layerOf(point);
    const kind = point.id.startsWith('component-') ? point.id.slice('component-'.length) : null;
    const group = kind ? gallery.find((g) => g.kind === kind) : undefined;
    let shots: Shot[] = [];
    let details: string[] = [];
    if (group) {
      // Show each near-copy next to the style it copies, then the rest.
      const order = group.items.flatMap((i) => (i.copyOf ? [group.items[i.copyOf - 1]!, i] : []));
      for (const i of [...order, ...group.items]) {
        if (shots.length >= 4 || !i.shot || shots.some((s) => s.shot === i.shot)) continue;
        shots.push({ shot: i.shot, caption: `Style ${i.n} · used ${i.count}×`, flag: i.copyOf ? `copy of #${i.copyOf}` : undefined });
      }
      details = group.items
        .filter((i) => i.copyOf)
        .slice(0, 3)
        .map((i) => `Style ${i.n} is a near-copy of style ${i.copyOf}${i.diff.length ? `: ${i.diff.join(', ')}` : ''}.`);
      const once = group.items.filter((i) => i.rare).length;
      if (group.styles > group.needed) details.unshift(`${group.styles} ${group.noun} styles where about ${group.needed} would do${once ? `; ${once} are used only once` : ''}.`);
    } else if (point.id === 'contrast') {
      shots = failures
        .filter((f) => evidence[f.selector])
        .slice(0, 4)
        .map((f) => ({ shot: evidence[f.selector]!, caption: `${f.foreground} on ${f.background}`, flag: `${f.ratio}:1` }));
      // Group by colour pair: most failures come from a handful of colour choices.
      const pairs = new Map<string, { n: number; text: string; ratio: number }>();
      for (const f of failures) {
        const key = `${f.foreground} on ${f.background}`;
        const p = pairs.get(key) ?? { n: 0, text: f.text, ratio: f.ratio };
        p.n += 1;
        pairs.set(key, p);
      }
      details = [...pairs.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 3)
        .map(([pair, p]) => `${pair} (${p.ratio}:1, needs ${failures[0]?.largeText ? 3 : 4.5}:1) in ${p.n} ${p.n === 1 ? 'place' : 'places'}, e.g. “${p.text.slice(0, 30)}”.`);
    } else if (point.id === 'type-sizes' || point.id === 'spacing' || point.id === 'colours') {
      const rows = point.id === 'type-sizes' ? detailEarly.textStyles : point.id === 'spacing' ? detailEarly.spacing : detailEarly.colours;
      shots = rows
        .filter((r) => r.flag !== 'ok' && r.examples.length)
        .slice(0, 4)
        .map((r) => ({ shot: r.examples[0]!.shot, caption: `${r.value} · ${r.count}×`, flag: r.flag === 'near-copy' ? 'near-copy' : r.flag === 'off-scale' ? 'off scale' : 'one-off' }));
      const e = point.evidence;
      if (e.kind === 'values') details = [`Values off the system: ${e.items.filter((i) => i.flagged).slice(0, 8).map((i) => `${i.value} (${i.count}×)`).join(', ')}.`];
      else if (e.kind === 'colours') details = e.groups.slice(0, 3).map((g) => `${g.copies.join(', ')} ${g.copies.length === 1 ? 'is a near-copy' : 'are near-copies'} of ${g.main}.`);
    } else {
      shots = shotsFor(audit, point.selectors, () => point.affects);
      const e = point.evidence;
      if (e.kind === 'values') details = [`Values off the system: ${e.items.filter((i) => i.flagged).slice(0, 8).map((i) => `${i.value} (${i.count}×)`).join(', ')}.`];
      else if (e.kind === 'colours') details = e.groups.slice(0, 3).map((g) => `${g.copies.join(', ')} ${g.copies.length === 1 ? 'is a near-copy' : 'are near-copies'} of ${g.main}.`);
      else if (point.id === 'targets') details = analysis.accessibility.smallTargets.slice(0, 3).map((t) => `“${t.text.slice(0, 26)}” is ${t.w}×${t.h} px, close to other controls.`);
      else if (point.id === 'tokens') details = [`${audit.savings.retheme.literals.toLocaleString('en-US')} values are typed in by hand; a rebrand would mean editing each one.`];
    }
    if (point.pages.length) details.push(`Seen on ${point.pages.slice(0, 4).join(', ')}.`);
    return { point, layer, shots, details };
  });

  // Lead with the most severe finding of each layer, then the next most severe overall.
  const top: HealthFinding[] = [];
  for (const layer of ['foundations', 'components', 'accessibility'] as LayerKey[]) {
    const first = findings.find((f) => f.layer === layer && f.point.severity !== 'low');
    if (first) top.push(first);
  }
  for (const f of findings) if (top.length < 3 && !top.includes(f) && f.point.severity !== 'low') top.push(f);
  top.sort((a, b) => findings.indexOf(a) - findings.indexOf(b));

  // ── Accessibility examples, photographed ──
  const a = analysis.accessibility;
  const examples = [
    {
      title: 'Text too faint to read',
      shots: a.contrastFailures
        .filter((f) => evidence[f.selector])
        .slice(0, 4)
        .map((f) => ({ shot: evidence[f.selector]!, caption: `${f.foreground} on ${f.background}`, flag: `${f.ratio}:1, needs ${f.largeText ? '3' : '4.5'}` })),
    },
    { title: 'Tap targets under 24 px', shots: a.smallTargets.filter((t) => evidence[t.selector]).slice(0, 4).map((t) => ({ shot: evidence[t.selector]!, caption: `${t.w}×${t.h} px` })) },
    { title: 'Form fields without a label', shots: shotsFor(audit, a.unlabelledFields.map((f) => f.selector), (i) => (a.unlabelledFields[i]?.placeholderOnly ? 'placeholder only' : 'no label')) },
    { title: 'Buttons without a name', shots: shotsFor(audit, a.unnamedControls.map((c) => c.selector), () => 'read as just “button”') },
    { title: 'Images without alt text', shots: shotsFor(audit, a.imagesWithoutAlt.map((i) => i.selector), () => 'no alt text', 3) },
  ].filter((e) => e.shots.length > 0);

  const radii = analysis.foundations.shape.groups.find((g) => g.key === 'radius')?.values ?? [];
  const shadowLine = audit.savings.lines.find((l) => l.key === 'shadow');
  const scaleNote = sizes?.scale ? `${Math.round(sizes.scale.fit * 100)}% of text sits on one type scale` : '';

  // ── The narrative: what works, where the gaps are, what's possible ──
  const money = (n: number) => formatMoney(n, audit.assumptions.currency);
  const system = starterSystem(audit, summary.clientName);
  const detail = detailEarly;
  const allRows = [...detail.colours, ...detail.textStyles, ...detail.spacing, ...detail.radii];
  const typedWithToken = allRows.filter((r) => r.token.kind === 'typed').length;
  const noToken = allRows.filter((r) => r.token.kind === 'none').length;
  const tokenised = allRows.filter((r) => r.token.kind === 'token').length;

  const working: string[] = [];
  for (const g of gallery.filter((g) => !g.hasProblem && g.items.some((i) => i.count > 1))) working.push(`${g.label}: ${g.styles === 1 ? 'one style, used everywhere' : `${g.styles} clearly distinct styles`}.`);
  for (const t of (['color', 'typography', 'spacing'] as FoundationKey[]).map((k) => analysis.foundations[k])) {
    if (t.tokenCoverage !== null && t.tokenCoverage >= 0.7) working.push(`${t.label}: ${Math.round(t.tokenCoverage * 100)}% of it is managed with design tokens.`);
  }
  if ((spacingGroup?.scale?.fit ?? 0) >= 0.85) working.push(`Spacing follows a ${spacingGroup!.scale!.value}px grid in ${Math.round(spacingGroup!.scale!.fit * 100)}% of places.`);
  if ((sizes?.values.length ?? 99) <= 8) working.push(`Type uses a short set of ${sizes!.values.length} text sizes.`);
  const passed = access.checks.filter((c) => c.status === 'pass');
  if (passed.length) working.push(`Accessibility: ${passed.map((c) => c.name.toLowerCase()).join(', ')} pass.`);
  if (tokenised) working.push(`${tokenised} of the values we looked at already come from tokens.`);

  const gaps = findings.filter((f) => f.point.severity !== 'low').slice(0, 5).map((f) => f.point.title.replace(/\.$/, '') + '.');

  const opportunities: string[] = [];
  if (business.quickWins.length) opportunities.push(`${business.quickWins.length} quick ${business.quickWins.length === 1 ? 'win' : 'wins'}: small changes with visible impact (${[...new Set(business.quickWins.map((q) => q.changeType.toLowerCase()))].slice(0, 3).join(', ')}).`);
  if (typedWithToken) opportunities.push(`${typedWithToken} values are typed in by hand although a token already holds them: switching them over is mechanical and safe.`);
  if (noToken) opportunities.push(`${noToken} values have no token yet. ${system.after} named tokens would cover everything in use today (${system.before} values now).`);
  const merge = gallery.filter((g) => g.styles > g.needed);
  if (merge.length) opportunities.push(`Merging near-copies: ${merge.map((g) => `${g.noun}s ${g.styles} → ${g.needed}`).join(', ')}.`);

  const outcomes: string[] = [];
  if (business.effectiveSpeedup >= 0.05) outcomes.push(`New screens: about ${Math.round(business.effectiveSpeedup * 100)}% faster to design and build, because the parts already exist.`);
  if (audit.savings.retheme.hoursToday > audit.savings.retheme.hoursWithTokens) outcomes.push(`Visual changes: a rebrand or dark mode takes about ${Math.round(audit.savings.retheme.hoursWithTokens)} h of edits instead of ${Math.round(audit.savings.retheme.hoursToday)} h.`);
  if (business.parts.today > business.parts.after) outcomes.push(`Less to maintain: ${business.parts.today} separately made parts become ${business.parts.after} shared ones.`);
  outcomes.push('Accessibility by default: approved colour pairs, focus styles and target sizes live in the tokens and components, so new screens pass without extra work.');
  if (audit.savings.annualSavings > 0) outcomes.push(`Time back: an estimated ${money(audit.savings.annualSavings)} a year of team time (planning estimate).`);

  const keyFindings = layers.map((l) => `${l.label} ${l.key === 'accessibility' ? 'is' : 'are'} ${l.level.toLowerCase()} (${l.score}/100): ${l.summary.replace(/\.$/, '')}.`);

  return {
    clientName: summary.clientName,
    pages: summary.pages.map((p) => ({ name: p.name, url: cleanUrl(p.url) })),
    overall: { score: audit.score.overall, level: consistencyLevel(audit.score.overall).level },
    layers,
    top: top.slice(0, 3),
    findings,
    money: {
      yearlyCost: audit.savings.annualDragCost,
      yearlyHours: Math.round(audit.savings.annualDragHours),
      savedHours: business.avoidable,
      savedCost: Math.round(business.avoidableCost),
      recoverable: audit.savings.annualSavings,
      recoverableHours: Math.round(audit.savings.annualSavingsHours),
    },
    quickWins: business.quickWins.slice(0, 4),
    foundations: {
      colours: {
        total: palette.reduce((n, c) => n + c.members.length, 0),
        copies,
        palette: palette.slice(0, 32).map((c) => ({
          main: c.hex,
          count: c.count,
          copies: c.members.slice(1).map((m) => ({ hex: m.value, shot: evidence[m.selectors[0] ?? ''] ?? null })),
        })),
      },
      type: {
        steps: (sizes?.values ?? [])
          .map((v) => ({ px: parseFloat(v.value), count: v.count, offScale: v.onScale === false, nearCopyOf: v.nearDuplicateOf ?? null, shot: evidence[v.selectors[0] ?? ''] ?? null }))
          .sort((x, y) => y.px - x.px),
        families,
        scaleNote,
      },
      spacing: {
        base: spacingGroup?.scale?.value ?? 4,
        fit: spacingGroup?.scale?.fit ?? 1,
        values: (spacingGroup?.values ?? []).map((v) => ({ px: parseFloat(v.value), count: v.count, onGrid: v.onScale !== false })).sort((x, y) => x.px - y.px),
      },
      radii: radii.map((v) => ({ value: v.value === 'full' ? 'full' : `${v.value}px`, count: v.count })),
      shadows: { distinct: shadowLine?.current ?? 0, needed: shadowLine?.recommended ?? 0 },
      tokens: (['color', 'typography', 'spacing', 'shape', 'elevation'] as FoundationKey[]).map((k) => ({ label: analysis.foundations[k].label, share: pct(analysis.foundations[k].tokenCoverage) })),
    },
    components: gallery,
    accessibility: { report: access, examples, uncheckedText: a.contrastUnverified },
    system,
    detail,
    scan: {
      pages: summary.pages.length,
      elements: snapshot.rendered.elements.length,
      rules: snapshot.authored.declarations.length,
      screenshots: Object.keys(evidence).length,
      planned: snapshot.evidenceReport?.planned ?? Object.keys(evidence).length,
      date: snapshot.capturedAt,
      contributors: audit.assumptions.contributors,
      hourlyRate: audit.assumptions.hourlyRate,
    },
    keyFindings,
    working: working.slice(0, 6),
    gaps,
    opportunities,
    outcomes,
  };
}

