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
import { formatMoney } from '../../savings';
import { parseColor } from '../../shared/color';
import type { EvidenceShot } from '../../shared/snapshot';
import { hasContact, type ClientReportOptions } from '../branding';
import { formatDate } from '../format';
import { barChart } from './charts';
import { Layout, type TextStyle } from './layout';
import { COLORS, PAGE, TYPE } from './theme';

interface Context {
  audit: Audit;
  report: HealthReport;
  options: ClientReportOptions;
  money: (n: number) => string;
  images: Map<string, PDFImage>;
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
  l.text(`${n} of 5`, l.left, l.y, { size: TYPE.small, color: COLORS.textSecondary });
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

function sectionTitle(l: Layout, x: number, top: number, title: string, note: string, width: number): number {
  let h = l.text(title, x, top, bold(11), width);
  if (note) h += 2 + l.text(note, x, top + h + 2, small, width);
  return h + 8;
}

// ── 1. Summary ───────────────────────────────────────────────────────────

async function summaryPage(l: Layout, ctx: Context): Promise<void> {
  const { report, options, audit, money } = ctx;
  const { branding } = options;
  if (branding.agencyName) l.text(branding.agencyName, l.left, l.y, bold(10.5));
  l.textRight(formatDate(audit.snapshot.capturedAt), l.left + l.width, l.y + 1, { size: TYPE.small, color: COLORS.textSecondary });
  l.gap(28);

  const shot = audit.snapshot.screenshot ? await embed(l.pdf, audit.snapshot.screenshot) : null;
  const shotW = shot ? 150 : 0;
  const textW = l.width - (shot ? shotW + 20 : 0);
  const top = l.y;
  let y = top;
  y += l.text(report.clientName, l.left, y, { size: TYPE.display, font: 'bold', lineHeight: 30 }, textW);
  const pages = report.pages.length === 1 ? report.pages[0]!.url : `${report.pages.length} pages: ${report.pages.map((p) => p.name).join(', ')}`;
  y += 4 + l.text(`Design system health check · ${pages}`, l.left, y + 4, { size: TYPE.body, color: COLORS.textSecondary, lineHeight: 13 }, textW);
  if (branding.note) y += 8 + l.text(branding.note, l.left, y + 8, small, textW);
  if (shot) {
    const h = Math.min(92, (shotW * shot.height) / shot.width);
    l.roundedRect(l.left + l.width - shotW, top, shotW, h + 8, 6, COLORS.surface, COLORS.border);
    l.image(shot, l.left + l.width - shotW + 4, top + 4, shotW - 8, h);
    y = Math.max(y, top + h + 8);
  }
  l.y = y + 16;

  // Health: the overall score and the three layers.
  const overallW = 132;
  const gap = 8;
  const layerW = (l.width - overallW - gap * 3) / 3;
  const cardH = 128;
  l.ensure(cardH);
  const t = l.y;
  l.card(l.left, t, overallW, cardH);
  l.text('Design system health', l.left + PAD, t + PAD, small, overallW - PAD * 2);
  l.text(String(report.overall.score), l.left + PAD, t + PAD + 16, { size: 38, font: 'bold' });
  l.text('/100', l.left + PAD + l.textWidth(String(report.overall.score), { size: 38, font: 'bold' }) + 3, t + PAD + 36, small);
  l.status(report.overall.level, scoreColour(report.overall.score), l.left + PAD, t + PAD + 64);
  scoreBar(l, l.left + PAD, t + PAD + 82, overallW - PAD * 2, report.overall.score);
  l.text('80+ is a mature system', l.left + PAD, t + PAD + 92, tiny, overallW - PAD * 2);
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

  // The cost, once, clearly labelled as an estimate.
  card(l, (top) => {
    let h = l.text(
      report.money.yearlyCost > 0
        ? `We estimate inconsistency costs your team about ${money(report.money.yearlyCost)} a year (${report.money.yearlyHours.toLocaleString('en-US')} hours).`
        : `${report.clientName} is built consistently: there is little design debt to pay down.`,
      l.left + PAD,
      top,
      bold(10),
      l.width - PAD * 2,
    );
    if (report.money.savedHours.likely > 0) {
      h += 3 + l.text(
        `A design system would have saved about ${report.money.savedHours.likely} hours of work so far (likely ${report.money.savedHours.low} to ${report.money.savedHours.high}). Planning estimates from what we measured and a team of ${audit.assumptions.contributors}; see the last page.`,
        l.left + PAD,
        top + h + 3,
        small,
        l.width - PAD * 2,
      );
    }
    return h;
  });

  // The three things to fix first, each with the real elements.
  if (report.top.length) {
    l.ensure(40);
    l.y += l.text('Fix these three first', l.left, l.y, bold(TYPE.title)) + 8;
    report.top.forEach((f, i) => topFinding(l, ctx, f, i + 1));
  }
}

function topFinding(l: Layout, ctx: Context, f: HealthFinding, n: number): void {
  const imgW = 196;
  const imgH = 74;
  const textX = l.left + PAD + imgW + 14;
  const textW = l.width - PAD * 2 - imgW - 14;
  card(
    l,
    (top) => {
      // Visual: real screenshots, or colour swatches for colour findings.
      visualFor(l, ctx, f, l.left + PAD, top, imgW, imgH);
      let h = l.text(`${n} · ${LAYER_NAME[f.layer]} · ${f.point.affects}`, textX, top, tiny, textW);
      h += 2 + l.text(f.point.title, textX, top + h + 2, bold(10.5), textW);
      h += 3 + l.text(f.point.summary, textX, top + h + 3, small, textW);
      h += 4 + l.text(`Fix: ${f.point.fixTitle}.`, textX, top + h + 4, { size: TYPE.small, font: 'bold', color: COLORS.text, lineHeight: 11.5 }, textW);
      return Math.max(h, imgH);
    },
    8,
  );
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

// ── 2. Foundations ───────────────────────────────────────────────────────

function foundationsPart(l: Layout, ctx: Context): void {
  const { report } = ctx;
  const layer = report.layers.find((x) => x.key === 'foundations')!;
  const f = report.foundations;
  partHeading(l, 2, 'Foundations', `The token layer: the colours, text styles, spacing and shapes everything else is built from. ${layer.summary}`, layer);
  const tokenShare = (label: string) => f.tokens.find((t) => t.label === label)?.share;
  const tokens = (label: string) => {
    const share = tokenShare(label);
    return share === null || share === undefined ? '' : ` · ${share}% through tokens`;
  };

  // Colour: the palette, with near-copies outlined, and where each copy is used.
  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    let h = sectionTitle(l, x, top, 'Colour', `${f.colours.total} colours in use${f.colours.copies ? `, ${f.colours.copies} of them near-copies nobody could tell apart` : ''}${tokens('Color')}.`, w);
    const tile = 26;
    const perRow = Math.floor((w + 6) / (tile + 6));
    const mains = f.colours.palette;
    mains.forEach((c, i) => {
      const cx = x + (i % perRow) * (tile + 6);
      const cy = top + h + Math.floor(i / perRow) * (tile + 14);
      l.roundedRect(cx, cy, tile, tile, 5, colour(c.main), COLORS.border);
      if (c.copies.length) {
        l.roundedRect(cx + tile - 11, cy - 3, 14, 11, 5.5, COLORS.danger);
        l.text(`+${c.copies.length}`, cx + tile - 8.5, cy - 1.5, { size: 6, font: 'bold', color: COLORS.white }, 20);
      }
      l.text(c.main, cx, cy + tile + 2, { size: 5.5, color: COLORS.textSecondary }, tile + 6);
    });
    h += Math.ceil(mains.length / perRow) * (tile + 14) + 4;
    const withCopies = mains.filter((c) => c.copies.length).slice(0, 4);
    if (withCopies.length) {
      h += l.text('Near-copies, and where they are used', x, top + h, bold(9), w) + 6;
      for (const c of withCopies) {
        l.roundedRect(x, top + h, 20, 20, 4, colour(c.main), COLORS.border);
        l.text(`${c.main} (keep)`, x + 26, top + h + 5, tiny, 90);
        let cx = x + 120;
        for (const copy of c.copies.slice(0, 3)) {
          l.roundedRect(cx, top + h, 20, 20, 4, colour(copy.hex), COLORS.danger);
          l.text(copy.hex, cx + 24, top + h + 5, tiny, 50);
          if (copy.shot) drawShot(l, ctx.images, copy.shot, cx + 70, top + h - 4, 52, 28);
          cx += 130;
        }
        h += 28;
      }
    }
    return h;
  });

  // Typography: the real text at each size, largest first.
  const steps = f.type.steps.slice(0, 14);
  if (steps.length) {
    card(l, (top) => {
      const x = l.left + PAD;
      const w = l.width - PAD * 2;
      let h = sectionTitle(
        l,
        x,
        top,
        'Typography',
        `${f.type.steps.length} text sizes${f.type.families.length ? ` in ${f.type.families.slice(0, 3).join(', ')}` : ''}${f.type.scaleNote ? `; ${f.type.scaleNote}` : ''}${tokens('Typography')}.`,
        w,
      );
      for (const s of steps) {
        const rowH = Math.min(30, Math.max(17, s.px * 0.75 + 7));
        l.text(`${s.px}px`, x, top + h + rowH / 2 - 5, bold(8.5), 46);
        l.text(`${s.count}×`, x + 46, top + h + rowH / 2 - 5, tiny, 30);
        const shown = drawShot(l, ctx.images, s.shot, x + 80, top + h, Math.min(220, w - 80 - 92), rowH, false);
        if (!shown) l.text('The quick brown fox', x + 84, top + h + Math.max(0, rowH / 2 - (s.px * 0.75) / 2 - 1), { size: Math.min(24, s.px * 0.75) }, w - 180);
        const flag = s.nearCopyOf ? `≈ ${s.nearCopyOf}px, near-copy` : s.offScale ? 'off the scale' : '';
        if (flag) l.textRight(flag, x + w, top + h + rowH / 2 - 5, { size: 7.5, font: 'bold', color: s.nearCopyOf ? COLORS.danger : COLORS.warning });
        h += rowH + 2;
        l.rule(top + h - 1, x, w);
      }
      return h;
    });
  }

  // Spacing (left) beside shape & depth and token use (right), in one card.
  const values = f.spacing.values.filter((v) => v.px <= 64);
  const rows = f.tokens.filter((t) => t.share !== null);
  card(l, (top) => {
    const x = l.left + PAD;
    const colW = (l.width - PAD * 2 - 24) / 2;
    let left = 0;
    if (values.length) {
      const off = values.filter((v) => !v.onGrid).length;
      left = sectionTitle(l, x, top, 'Spacing', `${Math.round(f.spacing.fit * 100)}% of uses follow a ${f.spacing.base}px grid${off ? `; ${off} values don't (in red)` : ''}${tokens('Spacing')}.`, colW);
      values.slice(0, 18).forEach((v, i) => {
        const cy = top + left + i * 11.5;
        l.text(`${v.px}px`, x, cy, { size: 7.5, font: v.onGrid ? 'regular' : 'bold', color: v.onGrid ? COLORS.text : COLORS.danger }, 34);
        l.roundedRect(x + 36, cy + 2, Math.max(2, v.px * 2), 6, 1.5, v.onGrid ? COLORS.text : COLORS.danger);
        l.textRight(`${v.count}×`, x + colW, cy, tiny);
      });
      left += Math.min(values.length, 18) * 11.5;
    }
    const rx = x + colW + 24;
    let right = 0;
    if (f.radii.length) {
      right = sectionTitle(l, rx, top, 'Shape & depth', `${f.radii.length} corner styles${f.shadows.distinct ? `, ${f.shadows.distinct} shadows (about ${f.shadows.needed} would do)` : ''}.`, colW);
      f.radii.slice(0, 6).forEach((r, i) => {
        const cx = rx + i * 38;
        const rad = r.value === 'full' ? 10 : Math.min(10, parseFloat(r.value) * 0.75);
        l.roundedRect(cx, top + right, 30, 20, rad, COLORS.surface, COLORS.text);
        l.text(`${r.value} · ${r.count}×`, cx, top + right + 23, { size: 5.5, color: COLORS.textSecondary }, 38);
      });
      right += 38;
    }
    if (rows.length) {
      right += sectionTitle(l, rx, top + right, 'Managed with tokens', 'Named tokens change everywhere in one edit.', colW);
      right += barChart(
        l,
        rx,
        top + right,
        colW,
        rows.map((t) => ({ label: t.label, value: t.share!, valueLabel: `${t.share}%`, dot: scoreColour(t.share!) })),
        { max: 100, labelWidth: 74 },
      );
    }
    return Math.max(left, right);
  });
}

// ── 3. Components ────────────────────────────────────────────────────────

function componentsPart(l: Layout, ctx: Context): void {
  const { report } = ctx;
  const layer = report.layers.find((x) => x.key === 'components')!;
  partHeading(l, 3, 'Components', `The building blocks. Every style we found, photographed from your pages and numbered; near-copies and one-offs are marked. ${layer.summary}`, layer);
  if (report.components.length === 0) {
    l.y += l.text('No element came in more than one style.', l.left, l.y, small) + 10;
    return;
  }
  for (const group of report.components) componentGroup(l, ctx, group);
}

function componentGroup(l: Layout, ctx: Context, group: GalleryGroup): void {
  const cols = group.kind === 'card' || group.kind === 'heading' ? 3 : 4;
  const items = group.hasProblem ? group.items : group.items.slice(0, cols);
  const gap = 8;
  const tileW = (l.width - PAD * 2 - gap * (cols - 1)) / cols;
  const stageH = group.kind === 'card' ? 92 : 52;
  const tileH = stageH + 14;
  card(l, (top) => {
    const x = l.left + PAD;
    const title = `${group.label} · ${group.styles} styles, about ${group.needed} needed`;
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
  partHeading(l, 4, 'Accessibility', `${a.report.headline} Each check maps to a WCAG success criterion; the failing elements are shown below.`, layer);
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

// ── 5. Next steps ────────────────────────────────────────────────────────

function nextStepsPart(l: Layout, ctx: Context): void {
  const { report, options } = ctx;
  const s = report.system;
  partHeading(
    l,
    5,
    'Your design system, extracted',
    `We turned the ${s.before} values your product uses today into ${s.after} named tokens, built from your own colours, sizes and spacing. Reply and we'll send it as a ready-to-use file (CSS variables and design-token JSON).`,
  );
  const colours = s.tokens.filter((t) => t.category === 'color' && !t.alias);
  if (colours.length) {
    card(l, (top) => {
      const x = l.left + PAD;
      const cols = 4;
      const w = (l.width - PAD * 2 - 8 * (cols - 1)) / cols;
      const h = l.text('Colour tokens', x, top, bold(10)) + 8;
      colours.forEach((t, i) => {
        const cx = x + (i % cols) * (w + 8);
        const cy = top + h + Math.floor(i / cols) * 32;
        l.roundedRect(cx, cy, 24, 24, 4, colour(t.value), COLORS.border);
        l.text(t.name.replace('color-', ''), cx + 30, cy + 2, bold(8), w - 32);
        l.text(`${t.value}${t.replaces.length ? ` · replaces ${t.replaces.length}` : ''}`, cx + 30, cy + 13, tiny, w - 32);
      });
      return h + Math.ceil(colours.length / cols) * 32 - 8;
    });
  }
  const scales = s.groups.filter((g) => ['font-size', 'spacing', 'radius', 'font-weight'].includes(g.category));
  if (scales.length) {
    card(l, (top) => {
      const x = l.left + PAD;
      let h = 0;
      for (const g of scales) {
        h += l.text(g.label, x, top + h, bold(9)) + 3;
        h += l.text(g.tokens.map((t) => `${t.name.split('-').slice(g.category === 'font-size' || g.category === 'font-weight' ? 2 : 1).join('-')} ${t.value}`).join('   ·   '), x, top + h, small, l.width - PAD * 2) + 9;
      }
      return h - 9;
    });
  }

  // Next steps: the fixes in order, quick wins first.
  const steps = [...new Set([...report.quickWins.map((q) => q.opportunity.title), ...report.top.map((f) => f.point.fixTitle)])].slice(0, 5);
  if (steps.length) {
    l.ensure(60);
    l.y += 6 + l.text('What we would do first', l.left, l.y + 6, bold(TYPE.title)) + 8;
    card(l, (top) =>
      steps.reduce((h, step, i) => {
        l.roundedRect(l.left + PAD, top + h, 16, 16, 8, COLORS.sunken, COLORS.border);
        l.text(String(i + 1), l.left + PAD + 5, top + h + 3.5, bold(7.5));
        return h + Math.max(16, l.text(step, l.left + PAD + 24, top + h + 2, { size: TYPE.body, lineHeight: 12.5 }, l.width - PAD * 2 - 24)) + 8;
      }, 0) - 8,
    );
  }

  // How we can help, and how we worked it out.
  const { branding } = options;
  const method = methodNote(ctx);
  card(l, (top) => {
    const x = l.left + PAD;
    const w = l.width - PAD * 2;
    let h = l.text(branding.agencyName ? `How ${branding.agencyName} can help` : 'How we can help', x, top, bold(10.5), w) + 4;
    h += l.text('We help product teams turn findings like these into a working design system: a small set of named colours, text styles and spacing, and components that get reused rather than rebuilt. Happy to walk your team through this report, with no obligation.', x, top + h, small, w) + 6;
    if (hasContact(branding)) h += l.text([branding.preparedBy, branding.email, branding.website].filter(Boolean).join(' · '), x, top + h, bold(9), w) + 6;
    h += 4 + l.text(method, x, top + h + 4, { ...tiny, color: COLORS.textTertiary }, w);
    return h;
  });
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

export async function auditToPdf(audit: Audit, options: ClientReportOptions): Promise<Uint8Array> {
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

  pdf.setTitle(`Design system health check: ${options.clientName}`);
  pdf.setSubject(audit.snapshot.url);
  pdf.setAuthor(options.branding.agencyName || options.branding.preparedBy || 'System Audit');
  pdf.setCreator('System Audit (dslint)');
  pdf.setProducer('System Audit (dslint)');
  pdf.setCreationDate(new Date(audit.snapshot.capturedAt));

  const l = new Layout(pdf, fonts);
  await summaryPage(l, ctx);
  foundationsPart(l, ctx);
  componentsPart(l, ctx);
  accessibilityPart(l, ctx);
  nextStepsPart(l, ctx);
  footers(l, ctx);
  return pdf.save();
}
