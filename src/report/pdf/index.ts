/**
 * The client-facing PDF: a guided, plain-language walk through the reader's
 * own product. It opens with a personal note and the one thing they likely
 * didn't know, then what inconsistency is costing them, then each problem
 * (where it shows up, why it matters, what we'd suggest), a stock-take of
 * their design system, a glossary and a short, low-key note on how we can help.
 *
 * Visual language: the reference boards only. Grey canvas, white hairline
 * cards, title-and-subtitle headings, sentence-case table headers on a grey
 * band, grey chips, and status shown as a coloured dot beside its label.
 */

import { PDFDocument, rgb, StandardFonts, type RGB } from 'pdf-lib';
import type { Audit } from '../../audit';
import { STATUS_LABELS, summarise, type Evidence, type ExecutiveSummary, type HealthStatus, type PainPoint } from '../../insights';
import type { Severity } from '../../inference/types';
import { formatMoney, formatMoneyShort } from '../../savings';
import { parseColor } from '../../shared/color';
import type { ClientReportOptions } from '../branding';
import { formatDate } from '../format';
import { barChart, beforeAfterChart, type BarRow } from './charts';
import { Layout, type TextStyle } from './layout';
import { COLORS, PAGE, TYPE } from './theme';

interface Context {
  audit: Audit;
  summary: ExecutiveSummary;
  options: ClientReportOptions;
  money: (n: number) => string;
}

const PAD = 16;
const body: TextStyle = { size: TYPE.body, color: COLORS.text, lineHeight: 13.5 };
const secondary: TextStyle = { size: TYPE.body, color: COLORS.textSecondary, lineHeight: 13.5 };
const small: TextStyle = { size: TYPE.small, color: COLORS.textSecondary, lineHeight: 11.5 };
const label: TextStyle = { size: TYPE.small, font: 'bold', color: COLORS.text };

const STATUS_COLOR: Record<HealthStatus, RGB> = { strong: COLORS.success, 'needs-work': COLORS.warning, 'at-risk': COLORS.danger };
const PRIORITY: Record<Severity, { label: string; color: RGB }> = {
  high: { label: 'High priority', color: COLORS.danger },
  medium: { label: 'Worth fixing', color: COLORS.warning },
  low: { label: 'Nice to have', color: COLORS.textTertiary },
};

function colour(value: string): RGB {
  const c = parseColor(value);
  return c ? rgb(c.r / 255, c.g / 255, c.b / 255) : COLORS.sunken;
}

function headingHeight(l: Layout, title: string, subtitle?: string): number {
  return l.textHeight(title, { size: TYPE.title, font: 'bold' }, l.width) + (subtitle ? 4 + l.textHeight(subtitle, secondary, l.width) : 0) + 12;
}

/**
 * Title with a grey subtitle underneath, as in the reference page headers.
 * `keepWith` is the height of what follows, so a heading never ends a page alone.
 */
function heading(l: Layout, title: string, subtitle?: string, keepWith = 80): void {
  l.ensure(headingHeight(l, title, subtitle) + keepWith);
  l.y += l.text(title, l.left, l.y, { size: TYPE.title, font: 'bold' });
  if (subtitle) l.y += 4 + l.text(subtitle, l.left, l.y + 4, secondary);
  l.gap(12);
}

/** A heading kept on the same page as the card that follows it. */
function section(l: Layout, title: string, subtitle: string | undefined, content: (top: number) => number, gapAfter = 18): void {
  heading(l, title, subtitle, l.measure(() => content(0)) + PAD * 2);
  card(l, content, gapAfter);
}

/** Draws a white card sized to its content. `content` draws from `top` and returns the height it used. */
function card(l: Layout, content: (top: number) => number, gapAfter = 10): void {
  const height = l.measure(() => content(l.y)) + PAD * 2;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, l.width, height);
  content(top + PAD);
  l.y = top + height + gapAfter;
}

// ── Page 1: who, what, and the whole picture at a glance ─────────────────

async function cover(l: Layout, { audit, summary, options }: Context): Promise<void> {
  const { snapshot } = audit;
  const { branding } = options;

  if (branding.agencyName) l.text(branding.agencyName, l.left, l.y, { size: 10.5, font: 'bold' });
  l.textRight(formatDate(snapshot.capturedAt), l.left + l.width, l.y + 1, { size: TYPE.small, color: COLORS.textSecondary });
  l.gap(34);

  const shot = snapshot.screenshot ? await embedScreenshot(l, snapshot.screenshot) : null;
  const shotWidth = shot ? 170 : 0;
  const textWidth = l.width - (shot ? shotWidth + 24 : 0);
  const top = l.y;
  let y = top;
  y += l.text(summary.clientName, l.left, y, { size: TYPE.display, font: 'bold', lineHeight: 30 }, textWidth);
  const pages = summary.pages.length === 1 ? '1 page reviewed' : `${summary.pages.length} pages reviewed`;
  y += 4 + l.text(`Design system audit · ${pages}`, l.left, y + 4, secondary, textWidth);
  y += 10 + l.text(summary.intro, l.left, y + 10, { ...secondary, size: TYPE.small, lineHeight: 11.5 }, textWidth);
  const signature = [branding.preparedBy, branding.agencyName].filter(Boolean).join(', ');
  if (signature) y += 6 + l.text(signature, l.left, y + 6, { size: TYPE.small, font: 'bold' }, textWidth);

  if (shot) {
    const h = Math.min(108, (shotWidth * shot.height) / shot.width);
    const w = (h * shot.width) / shot.height;
    const x = l.left + l.width - shotWidth;
    l.roundedRect(x, top, shotWidth, h + 12, 8, COLORS.surface, COLORS.border);
    l.page.drawImage(shot, { x: x + (shotWidth - w) / 2, y: PAGE.height - top - 6 - h, width: w, height: h });
    y = Math.max(y, top + h + 12);
  }
  l.y = y + 16;
}

async function embedScreenshot(l: Layout, dataUrl: string) {
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    return await l.pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function kpis(l: Layout, { audit, summary }: Context): void {
  const short = (n: number) => formatMoneyShort(n, audit.assumptions.currency);
  const n = summary.numbers;
  const tiles = [
    { value: short(n.yearlyCost), caption: 'Yearly cost of inconsistency (estimate)' },
    { value: short(n.recoverable), caption: 'Could be saved every year' },
    { value: `${n.hoursLost}h`, caption: 'Team hours lost each year' },
    { value: `${summary.score}/100`, caption: 'Consistency score (75+ is healthy)' },
  ];
  l.y += l.text(summary.headline, l.left, l.y, { size: TYPE.title, font: 'bold' }, l.width);
  l.y += 3 + l.text(summary.subheadline, l.left, l.y + 3, small, l.width) + 10;
  const gap = 8;
  const w = (l.width - gap * 3) / 4;
  const h = 58;
  l.ensure(h);
  tiles.forEach((tile, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, h);
    l.text(tile.value, x + 12, l.y + 11, { size: 17, font: 'bold' }, w - 24);
    l.text(tile.caption, x + 12, l.y + 34, { size: TYPE.tiny, color: COLORS.textSecondary, lineHeight: 10 }, w - 24);
  });
  l.y += h + 10;
}

/** Two charts side by side: where the cost comes from, and how each area scores. */
function dashboard(l: Layout, { summary, audit }: Context): void {
  const short = (n: number) => formatMoneyShort(n, audit.assumptions.currency);
  const gap = 10;
  const w = (l.width - gap) / 2;
  const inner = w - PAD * 2;
  const costRows: BarRow[] = summary.painPoints
    .filter((p) => p.annualCost)
    .sort((a, b) => (b.annualCost ?? 0) - (a.annualCost ?? 0))
    .slice(0, 7)
    .map((p) => ({ label: p.affects, value: p.annualCost!, valueLabel: short(p.annualCost!) }));
  const healthRows: BarRow[] = [...summary.areas]
    .sort((a, b) => a.score - b.score)
    .map((a) => ({ label: a.label, value: a.score, valueLabel: String(a.score), dot: STATUS_COLOR[a.status] }));

  const left = (top: number) => {
    let h = l.text('Where the cost comes from', l.left + PAD, top, { size: 11, font: 'bold' }, inner);
    h += 2 + l.text('Estimated yearly cost, by problem', l.left + PAD, top + h + 2, small, inner) + 10;
    h += costRows.length
      ? barChart(l, l.left + PAD, top + h, inner, costRows)
      : l.text('Nothing here carries a measurable cost.', l.left + PAD, top + h, secondary, inner);
    return h;
  };
  const right = (top: number) => {
    const x = l.left + w + gap + PAD;
    let h = l.text('Health by area', x, top, { size: 11, font: 'bold' }, inner);
    h += 2 + l.text('Score out of 100, weakest first', x, top + h + 2, small, inner) + 8;
    h += barChart(l, x, top + h, inner, healthRows, { max: 100, marker: { value: 75, label: 'Healthy' }, labelWidth: 104 });
    return h;
  };
  const height = Math.max(l.measure(() => left(0)), l.measure(() => right(0))) + PAD * 2;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, w, height);
  l.card(l.left + w + gap, top, w, height);
  left(top + PAD);
  right(top + PAD);
  l.y = top + height + 10;
}

/** The three parts of the report, with how much is in each. */
function contents(l: Layout, { summary }: Context): void {
  const parts = [
    { n: '1', title: 'The problems', detail: `${summary.painPoints.length} found: where, how often, what they cost` },
    { n: '2', title: 'The fixes', detail: `${summary.fixes.length} suggestions and what each is worth` },
    { n: '3', title: 'What’s working well', detail: `${summary.strengths.length + summary.healthyMetrics.length} things already in good shape` },
  ];
  const gap = 8;
  const w = (l.width - gap * 2) / 3;
  const h = 44;
  l.ensure(h);
  parts.forEach((p, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, h);
    l.roundedRect(x + 12, l.y + 12, 20, 20, 10, COLORS.sunken, COLORS.border);
    l.text(p.n, x + 19.5, l.y + 17, { size: TYPE.small, font: 'bold', color: COLORS.textSecondary });
    l.text(p.title, x + 40, l.y + 10, { size: TYPE.body, font: 'bold' }, w - 52);
    l.text(p.detail, x + 40, l.y + 23, { size: TYPE.tiny, color: COLORS.textSecondary, lineHeight: 9.5 }, w - 52);
  });
  l.y += h + 10;
}

function hook(l: Layout, { summary }: Context): void {
  if (!summary.hook) return;
  card(l, (t) => {
    let h = l.text('Something you may not know', l.left + PAD, t, { size: TYPE.body, font: 'bold' }, l.width - PAD * 2);
    h += 3 + l.text(summary.hook!, l.left + PAD, t + h + 3, secondary, l.width - PAD * 2);
    return h;
  });
}

/** A part divider: "Part 1" over the part's title and one line of context. */
function partHeading(l: Layout, part: number, title: string, subtitle: string): void {
  l.addPage();
  l.text(`Part ${part}`, l.left, l.y, { size: TYPE.small, color: COLORS.textSecondary });
  l.y += 13;
  l.y += l.text(title, l.left, l.y, { size: 20, font: 'bold', lineHeight: 24 });
  l.y += 4 + l.text(subtitle, l.left, l.y + 4, secondary);
  l.gap(16);
}

// ── Part 1: the problems ─────────────────────────────────────────────────

function problemMap(l: Layout, { summary, money }: Context): void {
  const gap = 8;
  const w = (l.width - gap * 2) / 3;
  const h = 62;
  l.ensure(h);
  summary.layers.forEach((layer, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, h);
    l.text(layer.layer, x + 12, l.y + 10, { size: TYPE.small, color: COLORS.textSecondary }, w - 24);
    l.text(layer.problems === 1 ? '1 problem' : `${layer.problems} problems`, x + 12, l.y + 24, { size: 14, font: 'bold' }, w - 24);
    const detail = layer.problems ? `${layer.places.toLocaleString('en-US')} places · ${layer.annualCost ? `${money(layer.annualCost)}/yr` : 'risk, not cost'}` : 'Nothing to fix';
    l.text(detail, x + 12, l.y + 43, { size: TYPE.tiny, color: COLORS.textSecondary }, w - 24);
  });
  l.y += h + 10;
}

/** A table header band on a card, as in the reference's users table. */
function tableHeader(l: Layout, top: number, height: number, columns: { label: string; x: number; right?: boolean }[]): void {
  l.roundedRect(l.left + 0.75, top + 0.75, l.width - 1.5, height, 9, COLORS.canvas);
  l.roundedRect(l.left + 0.75, top + 10, l.width - 1.5, height - 9.25, 0, COLORS.canvas);
  l.rule(top + height, l.left, l.width);
  const style: TextStyle = { size: TYPE.small, color: COLORS.textTertiary };
  for (const c of columns) c.right ? l.textRight(c.label, c.x, top + 8, style) : l.text(c.label, c.x, top + 8, style);
}

function problemTable(l: Layout, { summary, money }: Context): void {
  if (summary.painPoints.length === 0) return;
  // Column anchors: left edges for text, right edges for numbers.
  const col = { n: l.left + PAD, title: l.left + PAD + 18, affects: l.left + 252, places: l.left + 366, cost: l.left + 428, priority: l.left + 440 };
  const titleW = col.affects - col.title - 10;
  const rows = summary.painPoints.map((p) => ({ p, h: Math.max(14, l.textHeight(p.title, { size: TYPE.small, font: 'bold' }, titleW)) + 12 }));
  const headH = 24;
  const height = headH + rows.reduce((n, r) => n + r.h, 0) + 4;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, l.width, height);
  tableHeader(l, top, headH, [
    { label: '#', x: col.n },
    { label: 'Problem', x: col.title },
    { label: 'Affects', x: col.affects },
    { label: 'Places', x: col.places, right: true },
    { label: 'Cost a year', x: col.cost, right: true },
    { label: 'Priority', x: col.priority },
  ]);
  let y = top + headH;
  rows.forEach(({ p, h }, i) => {
    if (i > 0) l.rule(y);
    l.text(String(i + 1), col.n, y + 7, { size: TYPE.small, color: COLORS.textSecondary });
    l.text(p.title, col.title, y + 7, { size: TYPE.small, font: 'bold' }, titleW);
    l.text(p.affects, col.affects, y + 7, { size: TYPE.small, color: COLORS.textSecondary }, 76);
    l.textRight(p.count.toLocaleString('en-US'), col.places, y + 7, { size: TYPE.small });
    l.textRight(p.annualCost ? money(p.annualCost) : '—', col.cost, y + 7, { size: TYPE.small, color: p.annualCost ? COLORS.text : COLORS.textTertiary });
    const pr = PRIORITY[p.severity];
    l.status(pr.label, pr.color, col.priority, y + 8, TYPE.tiny);
    y += h;
  });
  l.y = top + height + 14;
}

/** One problem, compact: headline numbers, one line of explanation, the evidence, where it was seen. */
function problemCard(l: Layout, p: PainPoint, index: number, money: (n: number) => string): void {
  const inner = l.width - PAD * 2;
  const x = l.left + PAD;
  const priority = PRIORITY[p.severity];
  const stats = [
    { value: p.count.toLocaleString('en-US'), label: p.countLabel },
    { value: p.pages.length ? String(p.pages.length) : '—', label: p.pages.length === 1 ? 'page affected' : p.pages.length ? 'pages affected' : 'single page' },
    { value: p.annualCost ? money(p.annualCost) : '—', label: p.annualCost ? 'estimated cost a year' : 'risk rather than cost' },
  ];

  const content = (top: number): number => {
    const statusWidth = l.measure(() => l.status(priority.label, priority.color, 0, 0));
    let y = top;
    y += l.text(`${index}. ${p.title}`, x, y, { size: 11, font: 'bold', lineHeight: 14 }, inner - statusWidth - 12);
    l.status(priority.label, priority.color, x + inner - statusWidth, top + 2);
    y += 3 + l.text(p.summary, x, y + 3, secondary, inner);

    // Three headline numbers in a row.
    y += 10;
    const sw = (inner - 16) / 3;
    stats.forEach((s, i) => {
      const sx = x + i * (sw + 8);
      l.roundedRect(sx, y, sw, 38, 8, COLORS.canvas, COLORS.border);
      l.text(s.value, sx + 10, y + 7, { size: 12, font: 'bold' }, sw - 20);
      l.text(s.label, sx + 10, y + 23, { size: TYPE.tiny, color: COLORS.textSecondary }, sw - 20);
    });
    y += 38;

    const ev = l.measure(() => evidence(l, p.evidence, x, 0, inner));
    if (ev > 0) y += 12 + evidence(l, p.evidence, x, y + 12, inner);

    const seen = [...p.where.map((w) => w.charAt(0).toUpperCase() + w.slice(1)), ...(p.where.length ? [] : p.pages)];
    if (seen.length) {
      y += 12 + l.text('Seen in', x, y + 12, label, inner);
      y += 4;
      let cx = x;
      for (const item of seen.slice(0, 6)) {
        const w = l.textWidth(item, { size: 7.5 }) + 10;
        if (cx + w > x + inner) {
          cx = x;
          y += 18;
        }
        l.chip(item, cx, y);
        cx += w + 6;
      }
      y += 15;
    }
    y += 10 + l.text(`Why it matters: ${p.why}`, x, y + 10, small, inner);
    return y - top;
  };

  const height = l.measure(() => content(0)) + PAD * 2;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, l.width, height);
  content(top + PAD);
  l.y = top + height + 10;
}

function partProblems(l: Layout, ctx: Context): void {
  const { summary } = ctx;
  partHeading(l, 1, 'The problems', 'Where each problem lives, how many places it shows up and what it is likely costing your team. Most important first.');
  if (summary.painPoints.length === 0) {
    l.y += l.text('We didn’t find any problems worth reporting.', l.left, l.y, secondary) + 10;
    return;
  }
  problemMap(l, ctx);
  problemTable(l, ctx);
  summary.painPoints.forEach((p, i) => problemCard(l, p, i + 1, ctx.money));
}

// ── Part 2: the fixes ────────────────────────────────────────────────────

function partFixes(l: Layout, ctx: Context): void {
  const { summary, money, audit } = ctx;
  if (summary.fixes.length === 0) return;
  const recoverable = summary.fixes.reduce((n, f) => n + (f.annualSaving ?? 0), 0);
  partHeading(
    l,
    2,
    'The fixes',
    `What we would do about each problem, and what each fix is realistically worth: about ${money(recoverable)} a year together. Numbers match the problems in Part 1.`,
  );

  // Fix table: one row per fix, linked to the problem number.
  const col = { n: l.left + PAD, fix: l.left + PAD + 18, saves: l.left + l.width - PAD };
  const fixW = l.width - PAD * 2 - 18 - 90;
  const rows = summary.fixes.map((f) => ({
    f,
    h: l.textHeight(f.title, { size: TYPE.body, font: 'bold' }, fixW) + 3 + l.textHeight(f.detail, small, fixW) + 14,
  }));
  const headH = 24;
  let i = 0;
  while (i < rows.length) {
    l.ensure(headH + rows[i]!.h + 8);
    const top = l.y;
    let height = headH;
    let j = i;
    while (j < rows.length && top + height + rows[j]!.h + 8 <= PAGE.height - PAGE.margin - PAGE.footer) height += rows[j++]!.h;
    height += 4;
    l.card(l.left, top, l.width, height);
    tableHeader(l, top, headH, [
      { label: '#', x: col.n },
      { label: 'Fix', x: col.fix },
      { label: 'Saves a year', x: col.saves, right: true },
    ]);
    let y = top + headH;
    for (let k = i; k < j; k += 1) {
      const { f, h } = rows[k]!;
      if (k > i) l.rule(y);
      l.text(String(f.problem), col.n, y + 8, { size: TYPE.small, color: COLORS.textSecondary });
      const th = l.text(f.title, col.fix, y + 7, { size: TYPE.body, font: 'bold' }, fixW);
      l.text(f.detail, col.fix, y + 10 + th, small, fixW);
      l.textRight(f.annualSaving ? money(f.annualSaving) : '—', col.saves, y + 8, { size: TYPE.body, font: f.annualSaving ? 'bold' : 'regular', color: f.annualSaving ? COLORS.text : COLORS.textTertiary });
      y += h;
    }
    l.y = top + height + 12;
    i = j;
  }

  if (summary.beforeAfter.length) {
    section(l, 'After the cleanup', 'How many distinct styles you would maintain, today versus after the fixes above.', (t) =>
      beforeAfterChart(l, l.left + PAD, t, l.width - PAD * 2, summary.beforeAfter.slice(0, 10)),
    );
  }

  const { retheme } = audit.savings;
  if (retheme.literals >= 10) {
    section(l, 'A redesign, before and after tokens', 'Hours to change every hand-typed value once, for a rebrand or dark mode.', (t) =>
      barChart(
        l,
        l.left + PAD,
        t,
        l.width - PAD * 2,
        [
          { label: 'Today', value: retheme.hoursToday, valueLabel: `${retheme.hoursToday}h` },
          { label: 'With tokens', value: retheme.hoursWithTokens, valueLabel: `${retheme.hoursWithTokens}h` },
        ],
        { max: Math.max(retheme.hoursToday, 1) },
      ),
    );
  }
}

// ── Part 3: what's working well ──────────────────────────────────────────

function partStrengths(l: Layout, { summary }: Context): void {
  partHeading(l, 3, 'What’s working well', 'Parts of your product that are already consistent. Worth protecting as the product grows.');
  if (summary.strengths.length === 0 && summary.healthyMetrics.length === 0) {
    l.y += l.text('Every area has room to improve, which also means every fix above pays off quickly.', l.left, l.y, secondary) + 16;
    return;
  }

  // Strengths as a two-column grid of cards.
  const gap = 8;
  const w = (l.width - gap) / 2;
  for (let i = 0; i < summary.strengths.length; i += 2) {
    const pair = summary.strengths.slice(i, i + 2);
    const draw = (s: (typeof pair)[number], x: number, top: number) => {
      l.status('', COLORS.success, x + 12, top + 1, TYPE.body);
      l.text(s.title, x + 22, top, { size: TYPE.body, font: 'bold' }, w - 34);
      return 14 + l.text(s.detail, x + 12, top + 16, small, w - 24);
    };
    const h = Math.max(...pair.map((s) => l.measure(() => draw(s, 0, 0)))) + 24;
    l.ensure(h);
    pair.forEach((s, k) => {
      const x = l.left + k * (w + gap);
      l.card(x, l.y, w, h);
      draw(s, x, l.y + 12);
    });
    l.y += h + gap;
  }

  if (summary.healthyMetrics.length) {
    l.gap(8);
    const rows = summary.healthyMetrics;
    const headH = 24;
    const rowH = 22;
    const height = headH + rows.length * rowH + 4;
    heading(l, 'Building blocks already in good shape', undefined, height);
    l.ensure(height);
    const top = l.y;
    l.card(l.left, top, l.width, height);
    const col = { what: l.left + PAD, found: l.left + 300, status: l.left + l.width - PAD };
    tableHeader(l, top, headH, [
      { label: 'Building block', x: col.what },
      { label: 'In use', x: col.found },
      { label: 'Status', x: col.status, right: true },
    ]);
    let y = top + headH;
    rows.forEach((m, k) => {
      if (k > 0) l.rule(y);
      l.text(m.label, col.what, y + 7, { size: TYPE.small, font: 'bold' }, 270);
      l.text(m.found, col.found, y + 7, { size: TYPE.small, color: COLORS.textSecondary });
      const sw = l.measure(() => l.status(STATUS_LABELS[m.status], STATUS_COLOR[m.status], 0, 0, TYPE.tiny));
      l.status(STATUS_LABELS[m.status], STATUS_COLOR[m.status], col.status - sw, y + 8, TYPE.tiny);
      y += rowH;
    });
    l.y = top + height + 18;
  }
}

// ── Evidence visuals ─────────────────────────────────────────────────────

function evidence(l: Layout, e: Evidence, x: number, top: number, width: number): number {
  switch (e.kind) {
    case 'colours': {
      let y = top;
      for (const group of e.groups) {
        let cx = x;
        for (const value of [group.main, ...group.copies]) {
          l.swatch(colour(value), cx, y, 16);
          l.text(value, cx + 21, y + 4, { size: TYPE.small, color: COLORS.textSecondary }, 80);
          cx += 84;
          if (cx > x + width - 84) break;
        }
        y += 22;
      }
      return y - top;
    }
    case 'values': {
      let cx = x;
      let y = top;
      for (const item of e.items) {
        const text = `${item.value} ×${item.count}`;
        const w = l.textWidth(text, { size: 7.5 }) + 10;
        if (cx + w > x + width) {
          cx = x;
          y += 18;
        }
        if (item.flagged) l.roundedRect(cx - 1, y - 1, w + 2, 16.5, 5, COLORS.surface, COLORS.danger);
        l.chip(text, cx, y);
        cx += w + 6;
      }
      y += 20;
      return y - top + l.text(e.note, x, y, small, width);
    }
    case 'contrast': {
      let y = top;
      for (const item of e.items) {
        l.roundedRect(x, y, 30, 18, 4, colour(item.background), COLORS.border);
        l.text('Aa', x + 8, y + 4.5, { size: 8.5, font: 'bold', color: colour(item.foreground) });
        l.text(`“${item.text}”`, x + 40, y + 1, { size: TYPE.small, color: COLORS.text }, width - 140);
        l.textRight(`${item.ratio} : 1 (needs 4.5)`, x + width, y + 1, { size: TYPE.small, color: COLORS.textSecondary });
        l.text(`${item.foreground} on ${item.background}`, x + 40, y + 10, { size: TYPE.tiny, color: COLORS.textTertiary }, width - 140);
        y += 24;
      }
      return y - top;
    }
    case 'variants': {
      let y = top;
      e.items.forEach((item, i) => {
        if (i > 0) l.rule(y - 3, x, width);
        l.text(item.label, x, y + 2, { size: TYPE.small, font: 'bold' }, 150);
        l.text(item.details, x + 160, y + 2, { size: TYPE.small, color: COLORS.textSecondary }, width - 160);
        y += 17;
      });
      return y - top;
    }
    case 'none':
      return 0;
  }
}

// ── Pages, method, glossary, help ────────────────────────────────────────

function pagesReviewed(l: Layout, { summary }: Context): void {
  if (summary.pages.length < 2) return;
  section(l, 'Pages we reviewed', 'The findings in this report combine all of these pages.', (t) => {
    let y = t;
    summary.pages.forEach((p, i) => {
      if (i > 0) l.rule(y - 5);
      l.text(p.name, l.left + PAD, y, { size: TYPE.body, font: 'bold' }, 200);
      l.text(p.url, l.left + PAD + 210, y, { size: TYPE.small, color: COLORS.textSecondary }, l.width - PAD * 2 - 290);
      l.textRight(`${p.elements.toLocaleString('en-US')} elements`, l.left + l.width - PAD, y, { size: TYPE.small, color: COLORS.textSecondary });
      y += 20;
    });
    return y - t - 8;
  });
}

function method(l: Layout, { audit, money }: Context): void {
  const a = audit.assumptions;
  const { snapshot, analysis } = audit;
  heading(l, 'How we worked this out', 'So you can check our numbers.');
  const paragraphs = [
    `We opened your product in a normal browser and measured it the way your customers see it: ${snapshot.rendered.elements.length.toLocaleString('en-US')} visible elements and the ${snapshot.authored.declarations.length.toLocaleString('en-US')} styling rules behind them. We didn’t need access to your code, files or team.`,
    `The money figures are estimates, not invoices. They assume about ${a.contributors} people regularly design or build your product, at around ${money(a.hourlyRate)} an hour. Every unnecessary colour, size or spacing value costs each of them roughly ${a.hoursPerExcessValue} hours a year (choosing between near-identical options, review comments, fixing drift), and every unnecessary component style about ${a.hoursPerExcessVariant} hours. Every hand-typed value takes about ${a.minutesPerLiteralEdit} minutes to find and change during a redesign. We count only ${Math.round(a.realisationRate * 100)}% of the total as realistically recoverable. If your team is bigger or smaller, the numbers scale with it.`,
    `What this can’t see: other pages, screen sizes and states (menus that were closed, error messages that weren’t showing) weren’t part of this review, so the real picture is usually a little bigger, not smaller.${analysis.confidence.reasons.length ? ` ${analysis.confidence.reasons.join(' ')}` : ''}`,
  ];
  for (const p of paragraphs) {
    l.ensure(l.textHeight(p, secondary, l.width) + 8);
    l.y += l.text(p, l.left, l.y, secondary, l.width) + 8;
  }
  l.gap(10);
}

function glossary(l: Layout, { summary }: Context): void {
  section(l, 'Words used in this report', undefined, (t) => {
    let y = t;
    summary.glossary.forEach((g, i) => {
      if (i > 0) l.rule(y - 6);
      l.text(g.term, l.left + PAD, y, { size: TYPE.body, font: 'bold' }, 130);
      const h = l.text(g.meaning, l.left + PAD + 140, y, secondary, l.width - PAD * 2 - 140);
      y += Math.max(h, 12) + 12;
    });
    return y - t - 12;
  });
}

function howWeCanHelp(l: Layout, { options }: Context): void {
  const { branding } = options;
  const who = branding.agencyName || 'We';
  const text =
    `If any of this is useful, ${branding.agencyName ? `${who} would` : 'we’d'} be glad to talk it through. We help product teams turn findings like these into a working design system: a small set of named colours, text styles and spacing, and components that get reused rather than rebuilt. ` +
    `Happy to walk your team through the report, or to answer questions about any of it, with no obligation.`;
  const contact = [branding.preparedBy, branding.email, branding.website].filter(Boolean).join('   ·   ');
  section(l, branding.agencyName ? `How ${branding.agencyName} can help` : 'How we can help', undefined, (t) => {
    let h = l.text(text, l.left + PAD, t, body, l.width - PAD * 2);
    if (contact) h += 10 + l.text(contact, l.left + PAD, t + h + 10, { size: TYPE.body, font: 'bold' }, l.width - PAD * 2);
    return h;
  });
}

function footers(l: Layout, { options, summary }: Context): void {
  const text = [summary.clientName, 'Design system audit', options.branding.agencyName && `Prepared by ${options.branding.agencyName}`]
    .filter(Boolean)
    .join('  ·  ');
  l.pages.forEach((page, i) => {
    l.page = page;
    const top = PAGE.height - PAGE.margin + 6;
    l.text(text, l.left, top, { size: TYPE.tiny, color: COLORS.textTertiary }, l.width - 60);
    l.textRight(`${i + 1} / ${l.pages.length}`, l.left + l.width, top, { size: TYPE.tiny, color: COLORS.textTertiary });
  });
}

export async function auditToPdf(audit: Audit, options: ClientReportOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const summary = summarise(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const ctx: Context = { audit, summary, options, money: (n) => formatMoney(n, audit.assumptions.currency) };

  pdf.setTitle(`Design System Audit: ${options.clientName}`);
  pdf.setSubject(audit.snapshot.url);
  pdf.setAuthor(options.branding.agencyName || options.branding.preparedBy || 'System Audit');
  pdf.setCreator('System Audit (dslint)');
  pdf.setProducer('System Audit (dslint)');
  pdf.setCreationDate(new Date(audit.snapshot.capturedAt));

  const l = new Layout(pdf, fonts);
  await cover(l, ctx);
  kpis(l, ctx);
  dashboard(l, ctx);
  contents(l, ctx);
  hook(l, ctx);
  partProblems(l, ctx);
  partFixes(l, ctx);
  partStrengths(l, ctx);
  pagesReviewed(l, ctx);
  method(l, ctx);
  glossary(l, ctx);
  howWeCanHelp(l, ctx);
  footers(l, ctx);
  return pdf.save();
}
