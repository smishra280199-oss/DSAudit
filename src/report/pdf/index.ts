/**
 * The client PDF: a design-system health check in five short parts, built
 * to be understood in two minutes and checked in ten.
 *
 *   1. Summary        overall health, the three layers, the three things to fix first
 *   2. Foundations    colour, type, spacing, shape: their real values, drawn
 *   3. Components     every style of every element, photographed from the site
 *   4. Accessibility  the WCAG checks, with the failing elements photographed
 *   5. Next steps     the design system extracted from their product, and how we can help
 *
 * Wherever a screenshot exists (snapshot.evidence) we show the real element;
 * otherwise we redraw it from its captured styles. Every money figure is
 * labelled as an estimate, and no figure reads as a quote for our work.
 */

import { PDFDocument, rgb, StandardFonts, type PDFImage, type RGB } from 'pdf-lib';
import type { Audit } from '../../audit';
import type { GalleryGroup } from '../../insights/gallery';
import { healthReport, type HealthFinding, type HealthReport, type LayerKey, type Shot } from '../../insights/health';
import { tokenLabel, type ValueRow } from '../../insights/foundation-detail';
import { formatMoney } from '../../savings';
import { parseColor } from '../../shared/color';
import type { EvidenceShot } from '../../shared/snapshot';
import { bookingHref, displayUrl, hasContact, type ClientReportOptions } from '../branding';
import { formatDate } from '../format';
import { Layout, type TextStyle } from './layout';
import { COLORS, PAGE, TYPE } from './theme';

interface Context {
  audit: Audit;
  report: HealthReport;
  options: ClientReportOptions;
  money: (n: number) => string;
  images: Map<string, PDFImage>;
  /** The short version for a first email. */
  short?: boolean;
}

const PAD = 14;
const small: TextStyle = { size: TYPE.small, color: COLORS.textSecondary, lineHeight: 11.5 };
const tiny: TextStyle = { size: TYPE.tiny, color: COLORS.textSecondary, lineHeight: 10 };
const bold = (size: number, color = COLORS.text): TextStyle => ({ size, font: 'bold', color });

const LAYER_NAME: Record<LayerKey, string> = { foundations: 'Foundations', components: 'Components', accessibility: 'Accessibility' };

function colour(value: string): RGB {
  const c = parseColor(value);
  return c ? rgb(c.r / 255, c.g / 255, c.b / 255) : COLORS.sunken;
}

function scoreColour(score: number): RGB {
  return score >= 80 ? COLORS.success : score >= 60 ? COLORS.info : score >= 35 ? COLORS.warning : COLORS.danger;
}

// ── Images ───────────────────────────────────────────────────────────────

function allShots(report: HealthReport): EvidenceShot[] {
  const shots: (EvidenceShot | null)[] = [
    ...report.top.flatMap((f) => f.shots.map((s) => s.shot)),
    ...[...report.detail.colours, ...report.detail.textStyles, ...report.detail.spacing, ...report.detail.radii].flatMap((r) => r.examples.map((e) => e.shot)),
    ...report.components.flatMap((g) => g.items.map((i) => i.shot)),
    ...report.foundations.type.steps.map((s) => s.shot),
    ...report.foundations.colours.palette.flatMap((c) => c.copies.map((x) => x.shot)),
    ...report.accessibility.examples.flatMap((e) => e.shots.map((s) => s.shot)),
  ];
  return shots.filter((s): s is EvidenceShot => s !== null);
}

async function embed(pdf: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    return dataUrl.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** Draws a screenshot fitted into a box, centred, on a white tile. Returns false when there is no image. */
function drawShot(l: Layout, images: Map<string, PDFImage>, shot: EvidenceShot | null, x: number, top: number, w: number, h: number, frame = true): boolean {
  const img = shot ? images.get(shot.src) : undefined;
  if (frame) l.roundedRect(x, top, w, h, 6, COLORS.surface, COLORS.border);
  if (!img || !shot) return false;
  const inner = frame ? 5 : 1;
  // Never enlarge a crop beyond its real size (at 0.75 pt per CSS px): small things stay small.
  const scale = Math.min((w - inner * 2) / shot.w, (h - inner * 2) / shot.h, 0.75);
  const dw = shot.w * scale;
  const dh = shot.h * scale;
  l.image(img, x + (w - dw) / 2, top + (h - dh) / 2, dw, dh);
  return true;
}

// ── Shared pieces ────────────────────────────────────────────────────────

function scoreBar(l: Layout, x: number, top: number, w: number, score: number): void {
  l.roundedRect(x, top, w, 5, 2.5, COLORS.sunken);
  l.roundedRect(x, top, Math.max(5, (w * score) / 100), 5, 2.5, scoreColour(score));
}

function card(l: Layout, content: (top: number) => number, gapAfter = 10): void {
  const height = l.measure(() => content(l.y)) + PAD * 2;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, l.width, height);
  content(top + PAD);
  l.y = top + height + gapAfter;
}

/** Each part opens on a new page with its layer score. */
function partHeading(l: Layout, n: number, title: string, subtitle: string, layer?: { score: number; level: string }): void {
  l.addPage();
  // n = 0: no part number (the short version has no seven parts to count).
  if (n > 0) l.text(`${n} of 7`, l.left, l.y, { size: TYPE.small, color: COLORS.textSecondary });
  if (layer) {
    const label = `${layer.score}/100 · ${layer.level}`;
    const w = l.textWidth(label, { size: 8 }) + 9;
    l.status(label, scoreColour(layer.score), l.left + l.width - w, l.y);
  }
  l.y += 13;
  l.y += l.text(title, l.left, l.y, { size: 20, font: 'bold', lineHeight: 24 });
  l.y += 4 + l.text(subtitle, l.left, l.y + 4, { size: TYPE.body, color: COLORS.textSecondary, lineHeight: 13 });
  l.gap(14);
}


// ── 1. Executive summary ─────────────────────────────────────────────────

async function summaryPage(l: Layout, ctx: Context): Promise<void> {
  const { report, options, audit, money } = ctx;
  const { branding } = options;
  if (branding.agencyName) l.text(branding.agencyName, l.left, l.y, bold(10.5));
  l.textRight(formatDate(audit.snapshot.capturedAt), l.left + l.width, l.y + 1, { size: TYPE.small, color: COLORS.textSecondary });
  l.gap(26);

  const shot = audit.snapshot.screenshot ? await embed(l.pdf, audit.snapshot.screenshot) : null;
  const shotW = shot ? 140 : 0;
  const textW = l.width - (shot ? shotW + 20 : 0);
  const top = l.y;
  let y = top;
  y += l.text(report.clientName, l.left, y, { size: TYPE.display, font: 'bold', lineHeight: 30 }, textW);
  const pages = report.pages.length === 1 ? report.pages[0]!.url : `${report.pages.length} pages of ${report.pages[0]!.url.split('/')[0]}`;
  y += 4 + l.text(`Design system health check · ${pages}`, l.left, y + 4, { size: TYPE.body, color: COLORS.textSecondary, lineHeight: 13 }, textW);
  if (branding.note) y += 8 + l.text(branding.note, l.left, y + 8, small, textW);
  if (shot) {
    const h = Math.min(84, (shotW * shot.height) / shot.width);
    l.roundedRect(l.left + l.width - shotW, top, shotW, h + 8, 6, COLORS.surface, COLORS.border);
    l.image(shot, l.left + l.width - shotW + 4, top + 4, shotW - 8, h);
    y = Math.max(y, top + h + 8);
  }
  l.y = y + 14;

  // Health: the overall score and the three layers.
  const overallW = 132;
  const gap = 8;
  const layerW = (l.width - overallW - gap * 3) / 3;
  const cardH = 122;
  const t = l.y;
  l.card(l.left, t, overallW, cardH);
  l.text('Design system health', l.left + PAD, t + PAD, small, overallW - PAD * 2);
  l.text(String(report.overall.score), l.left + PAD, t + PAD + 14, { size: 38, font: 'bold' });
  l.text('/100', l.left + PAD + l.textWidth(String(report.overall.score), { size: 38, font: 'bold' }) + 3, t + PAD + 34, small);
  l.status(report.overall.level, scoreColour(report.overall.score), l.left + PAD, t + PAD + 62);
  scoreBar(l, l.left + PAD, t + PAD + 78, overallW - PAD * 2, report.overall.score);
  l.text('80+ is a mature system', l.left + PAD, t + PAD + 88, tiny, overallW - PAD * 2);
  report.layers.forEach((layer, i) => {
    const x = l.left + overallW + gap + i * (layerW + gap);
    l.card(x, t, layerW, cardH);
    l.text(layer.label, x + 12, t + 12, bold(10), layerW - 24);
    l.text(`${layer.score}`, x + 12, t + 27, { size: 20, font: 'bold' });
    l.status(layer.level, scoreColour(layer.score), x + 12 + l.textWidth(`${layer.score}`, { size: 20, font: 'bold' }) + 6, t + 34, 7.5);
    scoreBar(l, x + 12, t + 54, layerW - 24, layer.score);
    l.text(layer.summary, x + 12, t + 64, { ...tiny, lineHeight: 9.5 }, layerW - 24);
  });
  l.y = t + cardH + 10;

  // The money, prominently, clearly marked as planning estimates.
  const m = report.money;
  const tiles = [
    { value: `${m.savedHours.likely.toLocaleString('en-US')} h`, label: 'of work a design system would have saved so far', note: `${money(m.savedCost)} · likely ${m.savedHours.low}–${m.savedHours.high} h`, tone: COLORS.accentSoft, ink: COLORS.accentText },
    { value: `${money(m.yearlyCost)}`, label: 'estimated yearly cost of inconsistency', note: `${m.yearlyHours.toLocaleString('en-US')} h of team time a year`, tone: COLORS.dangerSoft, ink: COLORS.danger },
    { value: `${money(m.recoverable)}`, label: 'potential yearly savings with better design-system adoption', note: `${m.recoverableHours.toLocaleString('en-US')} h a year back`, tone: COLORS.successSoft, ink: COLORS.success },
  ];
  const tileW = (l.width - gap * 2) / 3;
  const tileH = 78;
  const mt = l.y;
  tiles.forEach((tile, i) => {
    const x = l.left + i * (tileW + gap);
    l.roundedRect(x, mt, tileW, tileH, 10, tile.tone, COLORS.border);
    l.text(tile.value, x + 12, mt + 11, { size: 21, font: 'bold', color: tile.ink }, tileW - 24);
    l.text(tile.label, x + 12, mt + 38, { size: 8, font: 'bold', color: COLORS.text, lineHeight: 10 }, tileW - 24);
    l.text(tile.note, x + 12, mt + 61, { size: 7, color: COLORS.textSecondary }, tileW - 24);
  });
  l.y = mt + tileH + 4;
  l.y += l.text(`Planning estimates, not measured savings: built from what we measured on your pages and a team of ${ctx.audit.assumptions.contributors} at ${money(ctx.audit.assumptions.hourlyRate)} an hour. How we worked them out is on the last page.`, l.left, l.y, { ...tiny, color: COLORS.textTertiary }) + 12;

  // Key findings and the three actions, at a glance.
  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    let h = l.text('What we found', x, top, bold(11), w) + 6;
    for (const k of report.keyFindings) h += l.text(`•  ${k}`, x, top + h, small, w) + 3;
    h += 8;
    h += l.text('Fix these three first', x, top + h, bold(11), w) + 6;
    report.top.forEach((f, i) => {
      l.roundedRect(x, top + h, 15, 15, 7.5, COLORS.text);
      l.text(String(i + 1), x + 5, top + h + 3.5, bold(7.5, COLORS.white));
      const th = l.text(`${f.point.fixTitle}.`, x + 22, top + h + 1, bold(9.5), w - 22);
      h += th + 1 + l.text(f.point.title, x + 22, top + h + th + 1, small, w - 22) + 7;
    });
    return h - 7;
  });
}

// ── 2. Website assessment ────────────────────────────────────────────────

function assessmentPage(l: Layout, ctx: Context): void {
  const { report } = ctx;
  const s = report.scan;
  partHeading(l, 2, 'What we looked at', 'We opened your product in a normal browser, the way your customers see it, and measured how it is built. No access to your code, files or team was needed.');
  const tiles = [
    { v: String(s.pages), l: s.pages === 1 ? 'page scanned' : 'pages scanned' },
    { v: s.elements.toLocaleString('en-US'), l: 'visible elements measured' },
    { v: s.rules.toLocaleString('en-US'), l: 'styling rules read' },
    { v: s.planned > s.screenshots ? `${s.screenshots} of ${s.planned}` : String(s.screenshots), l: 'elements photographed as evidence' },
  ];
  const gap = 8;
  const w = (l.width - gap * 3) / 4;
  tiles.forEach((t, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, 52);
    l.text(t.v, x + 12, l.y + 10, { size: 17, font: 'bold' }, w - 24);
    l.text(t.l, x + 12, l.y + 32, tiny, w - 24);
  });
  l.y += 62;
  card(l, (top) => {
    const x = l.left + PAD;
    let h = l.text('Pages', x, top, bold(9.5)) + 4;
    for (const p of report.pages) h += l.text(`${p.name} · ${p.url}`, x, top + h, small, l.width - PAD * 2) + 2;
    return h;
  });

  const evaluated = [
    { name: 'Foundations', what: 'Colours, text styles, spacing and corner shapes: how many there are, whether they follow a system, and whether they come from named design tokens.' },
    { name: 'Components', what: 'Buttons, icon buttons, tabs, links, inputs, badges, cards and headings: how many styles of each, and which are near-copies of each other.' },
    { name: 'Accessibility', what: 'Six automated WCAG checks: text contrast, keyboard focus, named buttons, form labels, image descriptions and tap-target size.' },
  ];
  l.y += 4 + l.text('What we evaluated', l.left, l.y + 4, bold(TYPE.title)) + 8;
  card(l, (top) => {
    const x = l.left + PAD;
    let h = 0;
    evaluated.forEach((e, i) => {
      const layer = report.layers.find((x2) => x2.label === e.name)!;
      if (i > 0) l.rule(top + h - 6, x, l.width - PAD * 2);
      l.text(e.name, x, top + h, bold(10), 110);
      const label = `${layer.score}/100 · ${layer.level}`;
      l.status(label, scoreColour(layer.score), l.left + l.width - PAD - l.textWidth(label, { size: 8 }) - 9, top + h + 1);
      h += 14 + l.text(e.what, x, top + h + 14, small, l.width - PAD * 2 - 10);
      h += 3 + l.text(layer.summary, x, top + h + 3, { ...small, color: COLORS.text }, l.width - PAD * 2 - 10) + 14;
    });
    return h - 14;
  });

  // Working well beside the gaps.
  l.y += 4 + l.text('In short', l.left, l.y + 4, bold(TYPE.title)) + 8;
  const colW = (l.width - 10) / 2;
  const list = (items: string[], x: number, top: number, title: string, dot: RGB) => {
    let h = l.text(title, x + PAD, top + PAD, bold(10), colW - PAD * 2) + 6;
    for (const it of items.length ? items : ['Nothing stands out here.']) {
      l.status('', dot, x + PAD, top + PAD + h + 1);
      h += l.text(it, x + PAD + 10, top + PAD + h, small, colW - PAD * 2 - 10) + 4;
    }
    return h + PAD * 2 - 4;
  };
  const height = Math.max(l.measure(() => list(report.working, l.left, 0, 'What’s working well', COLORS.success)), l.measure(() => list(report.gaps, l.left, 0, 'Where the gaps are', COLORS.warning)));
  l.ensure(height);
  const lt = l.y;
  l.card(l.left, lt, colW, height);
  l.card(l.left + colW + 10, lt, colW, height);
  list(report.working, l.left, lt, 'What’s working well', COLORS.success);
  list(report.gaps, l.left + colW + 10, lt, 'Where the gaps are', COLORS.warning);
  l.y = lt + height + 10;
}

// ── 3. Priority fixes ────────────────────────────────────────────────────

function priorityPage(l: Layout, ctx: Context): void {
  const { report } = ctx;
  if (report.top.length === 0) return;
  partHeading(l, ctx.short ? 0 : 3, 'Fix these three first', 'The three changes with the most effect for the effort, each with what is wrong, where it happens, why it matters and what to do.');
  report.top.forEach((f, i) => priorityFix(l, ctx, f, i + 1));
}

function priorityFix(l: Layout, ctx: Context, f: HealthFinding, n: number): void {
  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    l.roundedRect(x, top, 20, 20, 10, COLORS.text);
    l.text(String(n), x + 7, top + 5, bold(9, COLORS.white));
    l.text(`${LAYER_NAME[f.layer]} · ${f.point.affects}`, x + 28, top, tiny, w - 28);
    let h = 10 + l.text(f.point.title, x + 28, top + 10, bold(12), w - 28) + 8;
    // Evidence: the real elements, large enough to recognise.
    if (f.shots.length) {
      const cols = Math.min(4, f.shots.length);
      const sw = (w - 8 * (cols - 1)) / cols;
      f.shots.slice(0, cols).forEach((s, i) => shotTile(l, ctx, s, x + i * (sw + 8), top + h, sw, 64));
      h += 72;
    } else if (f.point.evidence.kind !== 'none' || f.point.id === 'tokens') {
      visualFor(l, ctx, f, x, top + h, Math.min(w, 300), 70);
      h += 78;
    }
    const block = (label: string, text: string) => {
      l.text(label, x, top + h, { size: 8, font: 'bold', color: COLORS.textSecondary }, 90);
      h += Math.max(11, l.text(text, x + 92, top + h, { size: TYPE.small, color: COLORS.text, lineHeight: 11.5 }, w - 92)) + 6;
    };
    block('What’s wrong', f.point.story);
    if (f.details.length) block('Where', f.details.join(' '));
    block('Why it matters', f.point.why);
    block('How to fix it', f.point.suggestion);
    return h - 6;
  });
}

// ── 4. Foundations, value by value ───────────────────────────────────────

const TONE = { good: COLORS.success, warn: COLORS.warning, bad: COLORS.danger } as const;

/** One row per value: the value, how often, real examples, what's off and its token status. */
function valueTable(l: Layout, ctx: Context, rows: ValueRow[], drawValue: (r: ValueRow, x: number, top: number) => void): void {
  const cols = { value: l.left + 10, uses: l.left + 150, examples: l.left + 186, status: l.left + 378 };
  const statusW = l.left + l.width - 10 - cols.status;
  const header = () => {
    l.ensure(16 + 40);
    l.text('Value', cols.value, l.y, tiny);
    l.text('Uses', cols.uses, l.y, tiny);
    l.text('Where it is used (real elements)', cols.examples, l.y, tiny);
    l.text('Token', cols.status, l.y, tiny);
    l.y += 13;
  };
  header();
  for (const r of rows) {
    const token = tokenLabel(r.token);
    const statusH = l.measure(() => (r.note ? l.text(r.note, cols.status, 0, { size: 7, font: 'bold' }, statusW) + 2 : 0) + l.text(token.text, cols.status, 0, { size: 7 }, statusW));
    const rowH = Math.max(34, statusH + 12);
    if (l.y + rowH > PAGE.height - PAGE.margin - PAGE.footer) {
      l.addPage();
      header();
    }
    const top = l.y;
    l.roundedRect(l.left, top, l.width, rowH, 6, COLORS.surface, r.flag === 'ok' ? COLORS.border : r.flag === 'near-copy' ? COLORS.danger : COLORS.warning);
    drawValue(r, cols.value, top + 6);
    l.text(`${r.count}×`, cols.uses, top + rowH / 2 - 5, bold(8.5));
    r.examples.forEach((e, i) => {
      const ex = cols.examples + i * 64;
      drawShot(l, ctx.images, e.shot, ex, top + 4, 60, rowH - 8);
    });
    if (r.examples.length === 0) l.text('no screenshot', cols.examples, top + rowH / 2 - 5, { size: 7, color: COLORS.textTertiary });
    let sy = top + 6;
    if (r.note) sy += l.text(r.note, cols.status, sy, { size: 7, font: 'bold', color: r.flag === 'near-copy' ? COLORS.danger : COLORS.warning }, statusW) + 2;
    l.text(token.text, cols.status, sy, { size: 7, color: TONE[token.tone] }, statusW);
    l.y = top + rowH + 3;
  }
  l.y += 8;
}

function foundationsPart(l: Layout, ctx: Context): void {
  const { report } = ctx;
  const layer = report.layers.find((x) => x.key === 'foundations')!;
  const d = report.detail;
  const f = report.foundations;
  const share = (label: string) => f.tokens.find((t) => t.label === label)?.share;
  const tokenNote = (label: string) => {
    const s = share(label);
    return s === null || s === undefined ? '' : ` ${s}% of it is written with tokens.`;
  };
  partHeading(l, 4, 'Foundations', `The token layer: colours, text styles, spacing and shapes, value by value, with real examples from your pages and whether each maps to a design token. Outlined rows need attention. ${layer.summary}`, layer);

  const legend = 'Token column: “Token” means the value already comes from a design token. “Typed by hand” means a token exists but this place types the raw value. “No token” suggests a semantic token (its job) → a primitive token (the raw step).';
  l.y += l.text(legend, l.left, l.y, { ...tiny, color: COLORS.textSecondary }) + 10;

  if (d.colours.length) {
    sub(l, 'Colour', `${f.colours.total} colours in use${f.colours.copies ? `, ${f.colours.copies} of them near-copies nobody could tell apart` : ''}.${tokenNote('Color')}`);
    valueTable(l, ctx, d.colours, (r, x, top) => {
      const a = r.alpha ?? 1;
      const c = parseColor(r.value);
      // Translucent colours are shown as they look on white, with their opacity named.
      const shown = c ? rgb(1 - a + (a * c.r) / 255, 1 - a + (a * c.g) / 255, 1 - a + (a * c.b) / 255) : COLORS.sunken;
      l.roundedRect(x, top, 22, 22, 4, shown, COLORS.border);
      l.text(r.value.length > 7 ? r.value.slice(0, 7) : r.value, x + 28, top + 2, bold(8), 110);
      l.text(`${r.role ?? ''}${a < 1 ? ` · ${Math.round(a * 100)}% opacity` : ''}`, x + 28, top + 13, { size: 6.5, color: COLORS.textSecondary }, 110);
    });
  }
  if (d.textStyles.length) {
    sub(l, 'Typography', `${d.textStyles.length} text styles (font, size/line height, weight) across ${f.type.steps.length} sizes.${tokenNote('Typography')}`);
    valueTable(l, ctx, d.textStyles, (r, x, top) => {
      const [family, rest] = [r.value.split(' ').slice(0, -2).join(' '), r.value.split(' ').slice(-2).join(' ')];
      l.text(family || r.value, x, top + 2, bold(8), 134);
      l.text(rest, x, top + 13, { size: 7, color: COLORS.textSecondary }, 134);
    });
  }
  if (d.spacing.length) {
    sub(l, 'Spacing', `Padding, margins and gaps. ${Math.round(f.spacing.fit * 100)}% of uses follow a ${f.spacing.base}px grid.${tokenNote('Spacing')}`);
    valueTable(l, ctx, d.spacing, (r, x, top) => {
      l.text(r.value, x, top + 2, bold(8.5), 50);
      l.roundedRect(x + 46, top + 4, Math.max(2, Math.min(80, parseFloat(r.value) * 1.4)), 7, 1.5, r.flag === 'ok' ? COLORS.text : COLORS.danger);
    });
  }
  if (d.radii.length) {
    sub(l, 'Shape', `Corner radius. ${f.radii.length} corner styles${f.shadows.distinct ? `, plus ${f.shadows.distinct} shadows (about ${f.shadows.needed} would do)` : ''}.${tokenNote('Shape')}`);
    valueTable(l, ctx, d.radii, (r, x, top) => {
      const rad = r.value === 'fully round' ? 10 : Math.min(10, parseFloat(r.value) * 0.75);
      l.roundedRect(x, top, 30, 20, rad, COLORS.surface, COLORS.text);
      l.text(r.value, x + 36, top + 5, bold(8), 90);
    });
  }
}

function sub(l: Layout, title: string, note: string): void {
  l.ensure(90);
  l.y += l.text(title, l.left, l.y, bold(TYPE.title)) + 3;
  l.y += l.text(note, l.left, l.y, small) + 8;
}

// ── 7. Where a design system helps ───────────────────────────────────────

function helpPart(l: Layout, ctx: Context): void {
  const { report, options } = ctx;
  const s = report.system;
  partHeading(l, 7, 'Where a design system helps', 'What is already working, where the gaps are, and what a design system would change for your team.');
  const block = (title: string, items: string[], dot: RGB) => {
    if (items.length === 0) return;
    card(l, (top) => {
      const x = l.left + PAD;
      const w = l.width - PAD * 2;
      let h = l.text(title, x, top, bold(11), w) + 6;
      for (const it of items) {
        l.status('', dot, x, top + h + 1);
        h += l.text(it, x + 10, top + h, { size: TYPE.small, color: COLORS.text, lineHeight: 11.5 }, w - 10) + 4;
      }
      return h - 4;
    });
  };
  block('What’s working well', report.working, COLORS.success);
  block('Where the gaps are', report.gaps, COLORS.warning);
  block('Opportunities to improve consistency', report.opportunities, COLORS.info);
  block('How a design system helps your team', report.outcomes, COLORS.accent);

  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    let h = l.text('Your starter design system', x, top, bold(11), w) + 4;
    h += l.text(`We turned the ${s.before} values in use today into ${s.after} named tokens, built from your own colours, sizes and spacing. Reply and we’ll send it as a ready-to-use file (CSS variables and design-token JSON).`, x, top + h, small, w) + 8;
    const colours = s.tokens.filter((t) => t.category === 'color' && !t.alias).slice(0, 12);
    colours.forEach((t, i) => {
      const cx = x + (i % 6) * (w / 6);
      const cy = top + h + Math.floor(i / 6) * 26;
      l.roundedRect(cx, cy, 18, 18, 4, colour(t.value), COLORS.border);
      l.text(t.name.replace('color-', ''), cx + 22, cy + 4, { size: 7, color: COLORS.text }, w / 6 - 24);
    });
    return h + Math.ceil(colours.length / 6) * 26 - 8;
  });

  const { branding } = options;
  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    let h = l.text(branding.agencyName ? `How ${branding.agencyName} can help` : 'How we can help', x, top, bold(10.5), w) + 4;
    h += l.text('We help product teams turn findings like these into a working design system: a small set of named colours, text styles and spacing, and components that get reused rather than rebuilt. Happy to walk your team through this report, with no obligation.', x, top + h, small, w) + 6;
    if (hasContact(branding)) h += l.text([branding.preparedBy, branding.email, branding.website].filter(Boolean).join(' · '), x, top + h, bold(9), w) + 6;
    const href = bookingHref(branding.bookingUrl);
    if (href) {
      l.button('Book a 20-minute walkthrough', href, x, top + h, COLORS.accent, COLORS.white);
      l.text(displayUrl(href), x + l.textWidth('Book a 20-minute walkthrough', { size: 9, font: 'bold' }) + 34, top + h + 7, small, w);
      h += 30;
    }
    h += 4 + l.text(methodNote(ctx), x, top + h + 4, { ...tiny, color: COLORS.textTertiary }, w);
    return h;
  });
}

/** The best picture of a finding: its screenshots, its colours, or its values. */
function visualFor(l: Layout, ctx: Context, f: HealthFinding, x: number, top: number, w: number, h: number): void {
  const e = f.point.evidence;
  if (f.shots.length > 0) {
    const shots = f.shots.slice(0, f.shots.length >= 2 ? 2 : 1);
    const gap = 6;
    const sw = (w - gap * (shots.length - 1)) / shots.length;
    shots.forEach((s, i) => shotTile(l, ctx, s, x + i * (sw + gap), top, sw, h));
    return;
  }
  l.roundedRect(x, top, w, h, 6, COLORS.surface, COLORS.border);
  if (f.point.id === 'tokens') {
    const share = ctx.audit.analysis.tokens.coverage ?? 0;
    const typed = ctx.audit.savings.retheme.literals;
    l.text(`${Math.round(share * 100)}%`, x + 12, top + 10, { size: 24, font: 'bold' });
    l.text('of styling uses named tokens', x + 12, top + 38, tiny, w - 24);
    l.roundedRect(x + 12, top + 52, w - 24, 6, 3, COLORS.dangerSoft);
    if (share > 0) l.roundedRect(x + 12, top + 52, Math.max(6, (w - 24) * share), 6, 3, COLORS.success);
    l.text(`${typed.toLocaleString('en-US')} values typed in by hand`, x + 12, top + 61, { size: 6.5, color: COLORS.danger }, w - 24);
    return;
  }
  if (e.kind === 'colours') {
    const groups = e.groups.slice(0, 2);
    groups.forEach((g, gi) => {
      const y = top + 10 + gi * 30;
      [g.main, ...g.copies].slice(0, 6).forEach((c, ci) => {
        l.roundedRect(x + 10 + ci * 30, y, 24, 24, 4, colour(c), ci === 0 ? COLORS.border : COLORS.danger);
      });
    });
    l.text('First colour in each row is the one to keep; outlined ones are near-copies.', x + 10, top + h - 14, { size: 6.5, color: COLORS.textSecondary }, w - 20);
  } else if (e.kind === 'values') {
    let cx = x + 8;
    let cy = top + 10;
    for (const item of e.items.slice(0, 14)) {
      const label = `${item.value} ×${item.count}`;
      const cw = l.textWidth(label, { size: 7 }) + 10;
      if (cx + cw > x + w - 8) {
        cx = x + 8;
        cy += 17;
      }
      if (cy > top + h - 18) break;
      l.roundedRect(cx, cy, cw, 13, 3, COLORS.sunken, item.flagged ? COLORS.danger : COLORS.border);
      l.text(label, cx + 5, cy + 3, { size: 7, color: COLORS.textSecondary }, Number.MAX_SAFE_INTEGER);
      cx += cw + 4;
    }
  } else {
    l.text(f.point.affects, x + 10, top + h / 2 - 6, small, w - 20);
  }
}

function shotTile(l: Layout, ctx: Context, s: Shot, x: number, top: number, w: number, h: number): void {
  const capH = 12;
  drawShot(l, ctx.images, s.shot, x, top, w, h - capH);
  l.text(s.caption, x + 2, top + h - capH + 2, { size: 6.5, color: COLORS.textSecondary }, w - 4 - (s.flag ? l.textWidth(s.flag, { size: 6.5, font: 'bold' }) + 4 : 0));
  if (s.flag) l.textRight(s.flag, x + w - 2, top + h - capH + 2, { size: 6.5, font: 'bold', color: COLORS.danger });
}

// ── 3. Components ────────────────────────────────────────────────────────

function componentsPart(l: Layout, ctx: Context): void {
  const { report } = ctx;
  const layer = report.layers.find((x) => x.key === 'components')!;
  partHeading(l, 5, 'Components', `The building blocks. Every style we found, photographed from your pages and numbered; near-copies and one-offs are marked. ${layer.summary}`, layer);
  if (report.components.length === 0) {
    l.y += l.text('No element came in more than one style.', l.left, l.y, small) + 10;
    return;
  }
  for (const group of report.components.filter((g) => g.hasProblem || g.styles > 1)) componentGroup(l, ctx, group);
  // Kinds with a single style are good news: one compact card, one tile per kind.
  const single = report.components.filter((g) => !g.hasProblem && g.styles === 1);
  if (single.length) {
    card(l, (top) => {
      const x = l.left + PAD;
      const w = l.width - PAD * 2;
      let h = l.text('Consistent: one style each, used everywhere', x, top, bold(11), w) + 8;
      const cols = 4;
      const tw = (w - 8 * (cols - 1)) / cols;
      single.forEach((g, i) => {
        const tx = x + (i % cols) * (tw + 8);
        const ty = top + h + Math.floor(i / cols) * 66;
        const item = g.items[0]!;
        l.roundedRect(tx, ty, tw, 48, 6, COLORS.surface, COLORS.border);
        if (!drawShot(l, ctx.images, item.shot, tx, ty, tw, 48, false)) replica(l, g, item, tx + tw / 2, ty + 24, tw - 12);
        l.text(`${g.label} · used ${item.count}×`, tx + 2, ty + 51, { size: 6.5, color: COLORS.textSecondary }, tw);
      });
      return h + Math.ceil(single.length / cols) * 66 - 8;
    });
  }
}

function componentGroup(l: Layout, ctx: Context, group: GalleryGroup): void {
  const cols = group.kind === 'card' || group.kind === 'heading' ? 3 : 4;
  const items = group.hasProblem ? group.items : group.items.slice(0, cols);
  const gap = 8;
  const tileW = (l.width - PAD * 2 - gap * (cols - 1)) / cols;
  const stageH = group.kind === 'card' ? 92 : 52;
  // Room under each tile for what differs from the style it copies, and the page it is on.
  const extra = items.some((i) => i.diff.length || i.page) ? 18 : 0;
  const tileH = stageH + 14 + extra;
  card(l, (top) => {
    const x = l.left + PAD;
    const title = `${group.label} · ${group.styles} ${group.styles === 1 ? 'style' : 'styles'}, about ${group.needed} needed`;
    l.text(title, x, top, bold(11), l.width - PAD * 2 - 90);
    l.status(group.hasProblem ? 'Needs attention' : 'Consistent', group.hasProblem ? COLORS.warning : COLORS.success, l.left + l.width - PAD - 80, top + 1);
    let h = 16 + l.text(group.headline, x, top + 16, small, l.width - PAD * 2) + 8;
    items.forEach((item, i) => {
      const tx = x + (i % cols) * (tileW + gap);
      const ty = top + h + Math.floor(i / cols) * (tileH + gap);
      const flagged = item.copyOf !== null;
      l.roundedRect(tx, ty, tileW, stageH, 6, COLORS.surface, flagged ? COLORS.danger : COLORS.border);
      if (!drawShot(l, ctx.images, item.shot, tx, ty, tileW, stageH, false)) replica(l, group, item, tx + tileW / 2, ty + stageH / 2, tileW - 12);
      l.text(`#${item.n} · used ${item.count}×`, tx + 2, ty + stageH + 3, { size: 6.5, color: COLORS.textSecondary }, tileW);
      if (flagged) l.textRight(`copy of #${item.copyOf}`, tx + tileW - 2, ty + stageH + 3, { size: 6.5, font: 'bold', color: COLORS.danger });
      else if (item.rare) l.textRight('used once', tx + tileW - 2, ty + stageH + 3, { size: 6.5, font: 'bold', color: COLORS.warning });
      const below = [item.diff.join('; '), item.page ?? ''].filter(Boolean).join(' · ');
      if (below) l.text(below, tx + 2, ty + stageH + 12, { size: 6, color: flagged ? COLORS.danger : COLORS.textTertiary, lineHeight: 7.5 }, tileW - 4);
    });
    return h + Math.ceil(items.length / cols) * (tileH + gap) - gap;
  });
}

/** Fallback when there is no screenshot: the element redrawn from its captured styles. */
function replica(l: Layout, group: GalleryGroup, item: GalleryGroup['items'][number], cx: number, cy: number, maxW: number): void {
  const s = item.styles;
  const px = (v: string | undefined, max: number, fallback: number) => {
    const n = v ? parseFloat(v) : NaN;
    return Math.min(Number.isFinite(n) && n > 0 ? n : fallback, max);
  };
  const size = px(s.fontSize, group.kind === 'heading' ? 22 : 16, 14) * 0.75;
  const style: TextStyle = { size, font: Number(s.fontWeight ?? 400) >= 600 ? 'bold' : 'regular', color: s.color ? colour(s.color) : COLORS.text };
  const boxed = group.kind === 'button' || group.kind === 'badge' || group.kind === 'input';
  const padX = boxed ? px(s.paddingLeft, 24, 8) * 0.75 : 0;
  const padY = boxed ? px(s.paddingTop, 12, 4) * 0.75 : 0;
  let label = item.label;
  while (label.length > 3 && l.textWidth(label, style) + padX * 2 > maxW) label = `${label.slice(0, -2)}…`;
  const w = Math.max(group.kind === 'input' ? 90 : 0, l.textWidth(label, style) + padX * 2);
  const h = size * 1.25 + padY * 2;
  const bg = s.backgroundColor && (parseColor(s.backgroundColor)?.a ?? 0) > 0 ? colour(s.backgroundColor) : null;
  const border = s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 ? colour(s.borderTopColor ?? s.color ?? '#000') : undefined;
  if (bg || border) l.roundedRect(cx - w / 2, cy - h / 2, w, h, Math.min(px(s.borderTopLeftRadius, 999, 0) * 0.75, h / 2), bg ?? COLORS.surface, border);
  l.text(label, cx - w / 2 + padX, cy - h / 2 + padY + size * 0.12, style, Number.MAX_SAFE_INTEGER);
}

// ── 4. Accessibility ─────────────────────────────────────────────────────

function accessibilityPart(l: Layout, ctx: Context): void {
  const { report } = ctx;
  const layer = report.layers.find((x) => x.key === 'accessibility')!;
  const a = report.accessibility;
  partHeading(l, 6, 'Accessibility', `${a.report.headline} Each check maps to a WCAG success criterion; the failing elements are shown below.`, layer);
  const rows = a.report.checks.filter((c) => c.status !== 'not-applicable');
  card(l, (top) => {
    const x = l.left + PAD;
    const nameW = l.width - PAD * 2 - 120;
    let y = top;
    rows.forEach((c, i) => {
      if (i > 0) l.rule(y - 5, x, l.width - PAD * 2);
      l.text(c.name, x, y, bold(9.5), nameW);
      const result = c.status === 'fail' ? `Fails: ${c.failed} of ${c.checked}` : `Passes (${c.checked} checked)`;
      const w = l.textWidth(result, { size: 8 }) + 9;
      l.status(result, c.status === 'fail' ? COLORS.danger : COLORS.success, l.left + l.width - PAD - w, y + 1);
      y += 12 + l.text(`WCAG ${c.sc}, level ${c.level}${c.version === '2.2' ? ' (WCAG 2.2)' : ''} · ${c.impact}`, x, y + 12, tiny, nameW) + 10;
    });
    return y - top - 6;
  });
  for (const example of a.examples) {
    card(l, (top) => {
      const x = l.left + PAD;
      const h = l.text(example.title, x, top, bold(10.5), l.width - PAD * 2) + 8;
      const cols = 4;
      const gap = 8;
      const w = (l.width - PAD * 2 - gap * (cols - 1)) / cols;
      example.shots.slice(0, cols).forEach((s, i) => shotTile(l, ctx, s, x + i * (w + gap), top + h, w, 64));
      return h + 64;
    });
  }
  const notes = [
    a.uncheckedText > 0
      ? `${a.uncheckedText} more pieces of text looked unreadable in the code but sit on images or panels we couldn't confirm on screen, so we left them out.`
      : '',
    a.report.regulation,
    `Needs a manual review: ${a.report.manual.join('; ')}.`,
  ].filter(Boolean);
  card(l, (top) => notes.reduce((h, n) => h + l.text(n, l.left + PAD, top + h, small, l.width - PAD * 2) + 5, 0) - 5);
}

function methodNote({ report, audit, money }: Context): string {
  const a = audit.assumptions;
  return (
    `How we worked this out: we opened ${report.pages.length === 1 ? 'your page' : `${report.pages.length} of your pages`} in a normal browser and measured ${audit.snapshot.rendered.elements.length.toLocaleString('en-US')} visible elements and ${audit.snapshot.authored.declarations.length.toLocaleString('en-US')} styling rules; every picture is a screenshot of your live pages. Money figures are planning estimates for a team of about ${a.contributors} at ${money(a.hourlyRate)} an hour, not invoices. Pages: ${report.pages.map((p) => p.url).join(', ')}.`
  );
}

function footers(l: Layout, ctx: Context): void {
  l.pages.forEach((page, i) => {
    l.page = page;
    const top = PAGE.height - PAGE.margin + 6;
    l.text(`${ctx.report.clientName} · Design system health check`, l.left, top, { size: TYPE.tiny, color: COLORS.textTertiary }, l.width - 60);
    l.textRight(`${i + 1} / ${l.pages.length}`, l.left + l.width, top, { size: TYPE.tiny, color: COLORS.textTertiary });
  });
}

/** "Book a 20-minute walkthrough": a clickable button to the booking page, when one is set. */
function bookingCta(l: Layout, ctx: Context, headline: string): void {
  const href = bookingHref(ctx.options.branding.bookingUrl);
  if (!href) return;
  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    const label = 'Book a 20-minute walkthrough';
    const bw = l.textWidth(label, { size: 9, font: 'bold' }) + 24;
    let h = l.text(headline, x, top, bold(10.5), w - bw - 16);
    h += 3 + l.text(`We’ll go through these findings on your own screens, and what fixing them would take. ${displayUrl(href)}`, x, top + h + 3, small, w - bw - 16);
    l.button(label, href, x + w - bw, top + Math.max(0, h / 2 - 11.5), COLORS.accent, COLORS.white);
    return Math.max(h, 23);
  });
}

async function setup(audit: Audit, options: ClientReportOptions, title: string) {
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const report = healthReport(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const images = new Map<string, PDFImage>();
  for (const shot of allShots(report)) {
    if (images.has(shot.src)) continue;
    const img = await embed(pdf, shot.src);
    if (img) images.set(shot.src, img);
  }
  const ctx: Context = { audit, report, options, money: (n) => formatMoney(n, audit.assumptions.currency), images };
  pdf.setTitle(`${title}: ${options.clientName}`);
  pdf.setSubject(audit.snapshot.url);
  pdf.setAuthor(options.branding.agencyName || options.branding.preparedBy || 'System Audit');
  pdf.setCreator('System Audit (dslint)');
  pdf.setProducer('System Audit (dslint)');
  pdf.setCreationDate(new Date(audit.snapshot.capturedAt));
  return { pdf, ctx, l: new Layout(pdf, fonts) };
}

/** The full report: everything a design lead needs, about a dozen pages. */
export async function auditToPdf(audit: Audit, options: ClientReportOptions): Promise<Uint8Array> {
  const { pdf, ctx, l } = await setup(audit, options, 'Design system health check');
  await summaryPage(l, ctx);
  assessmentPage(l, ctx);
  priorityPage(l, ctx);
  bookingCta(l, ctx, 'Want to see this on your own screens?');
  foundationsPart(l, ctx);
  componentsPart(l, ctx);
  accessibilityPart(l, ctx);
  helpPart(l, ctx);
  footers(l, ctx);
  return pdf.save();
}

/**
 * The short version for a first email: the summary and the three priority
 * fixes with their screenshots, then the booking button. The full report is
 * what the walkthrough is for.
 */
export async function auditToTeaserPdf(audit: Audit, options: ClientReportOptions): Promise<Uint8Array> {
  const { pdf, ctx, l } = await setup(audit, options, 'Design system health check (summary)');
  ctx.short = true;
  await summaryPage(l, ctx);
  priorityPage(l, ctx);
  bookingCta(l, ctx, 'This is the short version. The full report goes value by value through your colours, type, spacing and components.');
  footers(l, ctx);
  return pdf.save();
}
