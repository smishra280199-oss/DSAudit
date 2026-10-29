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

// ── Page 1: hello, the hook, the numbers ─────────────────────────────────

async function cover(l: Layout, { audit, summary, options }: Context): Promise<void> {
  const { snapshot } = audit;
  const { branding } = options;

  if (branding.agencyName) l.text(branding.agencyName, l.left, l.y, { size: 10.5, font: 'bold' });
  l.textRight(formatDate(snapshot.capturedAt), l.left + l.width, l.y + 1, { size: TYPE.small, color: COLORS.textSecondary });
  l.gap(40);

  const shot = snapshot.screenshot ? await embedScreenshot(l, snapshot.screenshot) : null;
  const shotWidth = shot ? 196 : 0;
  const textWidth = l.width - (shot ? shotWidth + 24 : 0);
  const top = l.y;
  let y = top;
  y += l.text(summary.clientName, l.left, y, { size: TYPE.display, font: 'bold', lineHeight: 30 }, textWidth);
  const pages = summary.pages.length === 1 ? '1 page reviewed' : `${summary.pages.length} pages reviewed`;
  y += 4 + l.text(`Design system audit · ${pages}`, l.left, y + 4, secondary, textWidth);
  y += 2 + l.text(snapshot.url, l.left, y + 2, { size: TYPE.small, color: COLORS.textTertiary }, textWidth);

  if (shot) {
    const h = Math.min(124, (shotWidth * shot.height) / shot.width);
    const w = (h * shot.width) / shot.height;
    const x = l.left + l.width - shotWidth;
    l.roundedRect(x, top, shotWidth, h + 12, 8, COLORS.surface, COLORS.border);
    l.page.drawImage(shot, { x: x + (shotWidth - w) / 2, y: PAGE.height - top - 6 - h, width: w, height: h });
    y = Math.max(y, top + h + 12);
  }
  l.y = y + 20;

  // A personal note: who is writing, and what this document is.
  const signature = [branding.preparedBy, branding.agencyName].filter(Boolean).join(', ');
  const greeting = `Hi ${summary.clientName === 'your product' ? 'there' : `${summary.clientName} team`},`;
  card(l, (t) => {
    let h = l.text(greeting, l.left + PAD, t, { ...body, font: 'bold' }, l.width - PAD * 2);
    h += 6 + l.text(summary.intro, l.left + PAD, t + h + 6, body, l.width - PAD * 2);
    if (branding.note.trim()) h += 6 + l.text(branding.note.trim(), l.left + PAD, t + h + 6, body, l.width - PAD * 2);
    if (signature) h += 8 + l.text(signature, l.left + PAD, t + h + 8, secondary, l.width - PAD * 2);
    return h;
  });

  if (summary.hook) {
    card(l, (t) => {
      let h = l.text('Something you may not know', l.left + PAD, t, { size: 11, font: 'bold' }, l.width - PAD * 2);
      h += 4 + l.text(summary.hook!, l.left + PAD, t + h + 4, body, l.width - PAD * 2);
      return h;
    });
  }
}

async function embedScreenshot(l: Layout, dataUrl: string) {
  try {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    return await l.pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function numbers(l: Layout, { audit, summary }: Context): void {
  const short = (n: number) => formatMoneyShort(n, audit.assumptions.currency);
  const n = summary.numbers;
  heading(l, summary.headline, summary.subheadline);
  const tiles = [
    { value: short(n.yearlyCost), caption: 'Estimated yearly cost of inconsistency' },
    { value: short(n.recoverable), caption: 'Could be saved every year' },
    { value: `${n.hoursLost}h`, caption: 'Team hours lost each year' },
    { value: `${summary.score}/100`, caption: 'Consistency score (75+ is healthy)' },
  ];
  const gap = 8;
  const w = (l.width - gap * 3) / 4;
  const h = 62;
  l.ensure(h);
  tiles.forEach((tile, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, h);
    l.text(tile.value, x + 12, l.y + 12, { size: 17, font: 'bold' }, w - 24);
    l.text(tile.caption, x + 12, l.y + 36, { size: TYPE.tiny, color: COLORS.textSecondary, lineHeight: 10 }, w - 24);
  });
  l.y += h + 8;
  l.y += l.text(summary.scoreExplainer, l.left, l.y, small) + 16;
}

// ── The problems, one card each ──────────────────────────────────────────

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

function painPoint(l: Layout, p: PainPoint, index: number, money: (n: number) => string): void {
  const inner = l.width - PAD * 2;
  const x = l.left + PAD;
  const priority = PRIORITY[p.severity];
  const meta = [
    p.pages.length ? `Seen on ${p.pages.slice(0, 4).join(', ')}` : '',
    p.annualCost ? `about ${money(p.annualCost)} a year` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // Header and body share a card; the suggestion sits in a grey footer band, like the reference dialogs.
  const content = (top: number): number => {
    const statusWidth = l.measure(() => l.status(priority.label, priority.color, 0, 0));
    let y = top;
    y += l.text(`${index}. ${p.title}`, x, y, { size: 11, font: 'bold', lineHeight: 14 }, inner - statusWidth - 12);
    l.status(priority.label, priority.color, x + inner - statusWidth, top + 2);
    if (meta) y += 2 + l.text(meta, x, y + 2, small, inner);
    y += 8 + l.text(p.story, x, y + 8, body, inner);

    const ev = l.measure(() => evidence(l, p.evidence, x, 0, inner));
    if (ev > 0) y += 10 + evidence(l, p.evidence, x, y + 10, inner);

    if (p.where.length) {
      y += 10 + l.text('Where we saw it', x, y + 10, label, inner);
      y += 3 + l.text(p.where.map((w) => `• ${w.charAt(0).toUpperCase()}${w.slice(1)}`).join('\n'), x, y + 3, secondary, inner);
    }
    y += 10 + l.text('Why it matters', x, y + 10, label, inner);
    y += 3 + l.text(p.why, x, y + 3, secondary, inner);
    return y - top;
  };
  const footer = (top: number): number => {
    let h = l.text('What we’d suggest', x, top, label, inner);
    h += 3 + l.text(p.suggestion, x, top + h + 3, body, inner);
    return h;
  };

  const bodyH = l.measure(() => content(0)) + PAD * 2;
  const footH = l.measure(() => footer(0)) + 24;
  l.ensure(bodyH + footH);
  const top = l.y;
  l.card(l.left, top, l.width, bodyH + footH);
  l.roundedRect(l.left + 0.75, top + bodyH, l.width - 1.5, footH - 0.75, 9, COLORS.canvas);
  l.roundedRect(l.left + 0.75, top + bodyH, l.width - 1.5, 10, 0, COLORS.canvas);
  l.rule(top + bodyH, l.left, l.width);
  content(top + PAD);
  footer(top + bodyH + 12);
  l.y = top + bodyH + footH + 10;
}

function painPoints(l: Layout, { summary, money }: Context): void {
  if (summary.painPoints.length === 0) return;
  l.addPage();
  heading(
    l,
    'What we found',
    'The problems we noticed, most important first. For each one we show where it appears, why it matters and what we would do about it.',
  );
  summary.painPoints.forEach((p, i) => painPoint(l, p, i + 1, money));
  l.gap(8);
}

// ── Stock-take table ─────────────────────────────────────────────────────

function stockTake(l: Layout, { summary, money }: Context): void {
  if (summary.metrics.length + summary.healthyMetrics.length === 0) return;
  heading(
    l,
    'Your design system at a glance',
    'A stock-take of the building blocks in your product that need attention, compared with what a tidy design system usually has. The biggest gaps are at the top.',
    160,
  );
  const col = { what: l.left + PAD, found: l.left + 230, healthy: l.left + 330, status: l.left + 410, cost: l.left + l.width - PAD };
  const headH = 24;
  const rows = summary.metrics.map((m) => ({
    m,
    h: Math.max(
      l.textHeight(m.label, { size: TYPE.body, font: 'bold' }, 200) + 2 + (m.explainer ? l.textHeight(m.explainer, small, 200) : 0),
      12 + (m.foundNote ? l.textHeight(m.foundNote, small, 92) : 0),
    ) + 14,
  }));

  const drawHeader = (top: number) => {
    l.roundedRect(l.left + 0.75, top + 0.75, l.width - 1.5, headH, 9, COLORS.canvas);
    l.roundedRect(l.left + 0.75, top + 10, l.width - 1.5, headH - 9.25, 0, COLORS.canvas);
    l.rule(top + headH, l.left, l.width);
    const h: TextStyle = { size: TYPE.small, color: COLORS.textTertiary };
    l.text('What we looked at', col.what, top + 8, h);
    l.text('What we found', col.found, top + 8, h);
    l.text('A tidy system has', col.healthy, top + 8, h);
    l.text('Status', col.status, top + 8, h);
    l.textRight('Cost a year', col.cost, top + 8, h);
  };

  // The table may span pages: each page gets its own card and header.
  let i = 0;
  while (i < rows.length) {
    l.ensure(headH + rows[i]!.h + 8);
    const top = l.y;
    let height = headH;
    let j = i;
    while (j < rows.length && top + height + rows[j]!.h + 8 <= PAGE.height - PAGE.margin - PAGE.footer) height += rows[j++]!.h;
    height += 6;
    l.card(l.left, top, l.width, height);
    drawHeader(top);
    let y = top + headH;
    for (let k = i; k < j; k += 1) {
      const { m, h } = rows[k]!;
      if (k > i) l.rule(y);
      let ty = y + 7;
      ty += l.text(m.label, col.what, ty, { size: TYPE.body, font: 'bold' }, 200);
      if (m.explainer) l.text(m.explainer, col.what, ty + 2, small, 200);
      l.text(m.found, col.found, y + 7, { size: TYPE.body, font: 'bold' });
      if (m.foundNote) l.text(m.foundNote, col.found, y + 20, small, 92);
      l.text(m.healthy, col.healthy, y + 7, { size: TYPE.body, color: COLORS.textSecondary }, 76);
      l.status(STATUS_LABELS[m.status], STATUS_COLOR[m.status], col.status, y + 8);
      l.textRight(m.annualCost ? money(m.annualCost) : '—', col.cost, y + 7, { size: TYPE.body, color: m.annualCost ? COLORS.text : COLORS.textTertiary });
      y += h;
    }
    l.y = top + height + 8;
    i = j;
  }
  if (summary.healthyMetrics.length) {
    const fine = `Also checked and already in good shape: ${summary.healthyMetrics.map((m) => `${m.label.toLowerCase()} (${m.found})`).join(', ')}.`;
    l.ensure(l.textHeight(fine, secondary, l.width));
    l.y += l.text(fine, l.left, l.y, secondary, l.width);
  }
  l.gap(18);
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
  numbers(l, ctx);
  painPoints(l, ctx);
  stockTake(l, ctx);
  pagesReviewed(l, ctx);
  method(l, ctx);
  glossary(l, ctx);
  howWeCanHelp(l, ctx);
  footers(l, ctx);
  return pdf.save();
}
