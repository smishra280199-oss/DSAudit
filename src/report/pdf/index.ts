/**
 * The client-facing PDF report. Written for a VP of Design or Product who
 * gives it two minutes: page 1 answers "what is this costing us and what
 * would fixing it return?", page 2 "where do we stand and where do we
 * start?", and the rest is the plan, the evidence and the method.
 */

import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Audit } from '../../audit';
import { summarise, STATUS_LABELS, type ExecutiveSummary, type HealthStatus } from '../../insights';
import type { Severity } from '../../inference/types';
import { formatMoney, formatMoneyShort } from '../../savings';
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

const STATUS_TONE: Record<HealthStatus, { fill: typeof COLORS.text; text: typeof COLORS.text; bar: typeof COLORS.text }> = {
  strong: { fill: COLORS.successSoft, text: COLORS.success, bar: COLORS.success },
  'needs-work': { fill: COLORS.warningSoft, text: COLORS.warning, bar: COLORS.warning },
  'at-risk': { fill: COLORS.dangerSoft, text: COLORS.danger, bar: COLORS.danger },
};

const SEVERITY_TONE: Record<Severity, { fill: typeof COLORS.text; text: typeof COLORS.text }> = {
  high: { fill: COLORS.dangerSoft, text: COLORS.danger },
  medium: { fill: COLORS.warningSoft, text: COLORS.warning },
  low: { fill: COLORS.sunken, text: COLORS.textSecondary },
};

const body: TextStyle = { size: TYPE.body, color: COLORS.textSecondary };
const small: TextStyle = { size: TYPE.small, color: COLORS.textSecondary };

/** Section heading outside cards: a title and an optional one-line lede. */
function sectionTitle(l: Layout, title: string, lede?: string): void {
  l.ensure(60);
  l.y += l.text(title, l.left, l.y, { size: TYPE.title, font: 'bold' });
  if (lede) l.y += 2 + l.text(lede, l.left, l.y + 2, small);
  l.gap(10);
}

// ── Page 1: cover and the money ─────────────────────────────────────────

async function cover(l: Layout, { audit, summary, options }: Context): Promise<void> {
  const { snapshot } = audit;
  const { branding, clientName } = options;

  l.logo(l.left, l.y, 20);
  l.text(branding.agencyName || 'System Audit', l.left + 28, l.y + 4, { size: 10.5, font: 'bold' });
  l.textRight(formatDate(snapshot.capturedAt), l.left + l.width, l.y + 5, { size: TYPE.small, color: COLORS.textSecondary });
  l.gap(46);

  const shot = snapshot.screenshot ? await embedScreenshot(l, snapshot.screenshot) : null;
  const shotWidth = shot ? 196 : 0;
  const titleWidth = l.width - (shot ? shotWidth + 20 : 0);
  const titleTop = l.y;

  let y = titleTop;
  y += l.text('DESIGN SYSTEM AUDIT', l.left, y, { size: TYPE.small, font: 'bold', color: COLORS.accentText });
  y += 6 + l.text(clientName, l.left, y + 6, { size: TYPE.display, font: 'bold', lineHeight: 30 }, titleWidth);
  y += 4 + l.text(snapshot.url, l.left, y + 4, { size: TYPE.small, color: COLORS.textTertiary }, titleWidth);
  const preparedBy = [branding.preparedBy, branding.agencyName].filter(Boolean).join(', ');
  if (preparedBy) y += 10 + l.text(`Prepared for ${clientName} by ${preparedBy}`, l.left, y + 10, body, titleWidth);

  if (shot) {
    const h = Math.min(130, (shotWidth * shot.height) / shot.width);
    const w = (h * shot.width) / shot.height;
    const x = l.left + l.width - shotWidth;
    l.roundedRect(x, titleTop, shotWidth, h + 12, 8, COLORS.surface, COLORS.border);
    l.page.drawImage(shot, { x: x + (shotWidth - w) / 2, y: PAGE.height - titleTop - 6 - h, width: w, height: h });
    y = Math.max(y, titleTop + h + 12);
  }
  l.y = y + 22;

  // The headline: one sentence about money, then the return on fixing it.
  const textWidth = l.width - PAD * 2 - 6;
  const headlineStyle: TextStyle = { size: TYPE.headline, font: 'bold', lineHeight: 21 };
  const subStyle: TextStyle = { size: 10, color: COLORS.textSecondary, lineHeight: 14 };
  const height = PAD * 2 + l.textHeight(summary.headline, headlineStyle, textWidth) + 8 + l.textHeight(summary.subheadline, subStyle, textWidth);
  l.card(l.left, l.y, l.width, height);
  l.roundedRect(l.left, l.y + 14, 3, height - 28, 1.5, COLORS.accent);
  let ty = l.y + PAD;
  ty += l.text(summary.headline, l.left + PAD + 6, ty, headlineStyle, textWidth);
  l.text(summary.subheadline, l.left + PAD + 6, ty + 8, subStyle, textWidth);
  l.y += height + 12;
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
  const { savings, assumptions } = audit;
  const short = (n: number) => formatMoneyShort(n, assumptions.currency);
  const tiles = [
    { value: short(savings.annualDragCost), label: 'Yearly cost of design inconsistency', color: COLORS.danger },
    { value: short(savings.annualSavings), label: 'Recoverable every year after cleanup', color: COLORS.success },
    { value: short(savings.cleanupCost), label: `One-time cleanup, ${summary.cleanupDuration}`, color: COLORS.text },
    { value: `${summary.score}/100`, label: `Design system maturity: ${summary.grade}, ${summary.maturity}`, color: COLORS.accentText },
  ];
  const gap = 8;
  const w = (l.width - gap * 3) / 4;
  const h = 70;
  tiles.forEach((tile, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, h);
    l.text(tile.value, x + 12, l.y + 12, { size: 17, font: 'bold', color: tile.color }, w - 24);
    l.text(tile.label, x + 12, l.y + 38, { size: TYPE.tiny, color: COLORS.textSecondary, lineHeight: 10 }, w - 24);
  });
  l.y += h + 12;
}

function consolidation(l: Layout, { audit, summary, money }: Context, limit: number): void {
  const rows = summary.consolidation.slice(0, limit);
  const { retheme } = audit.savings;
  const rowH = 22;
  const rethemeText =
    retheme.literals > 0
      ? `Rebrand or dark-mode effort: today ${retheme.literals.toLocaleString('en-US')} hard-coded values must each be found and edited (~${retheme.hoursToday}h per change). As tokens, that is ${retheme.distinctValues.toLocaleString('en-US')} edits in one place (~${retheme.hoursWithTokens}h).`
      : '';
  const rethemeH = rethemeText ? l.textHeight(rethemeText, small, l.width - PAD * 2) + 14 : 0;
  const height = PAD + 34 + 18 + Math.max(1, rows.length) * rowH + (rows.length ? rowH + 8 : 0) + rethemeH + PAD - 6;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, l.width, height);
  l.text('What you have vs. what you need', l.left + PAD, top + PAD, { size: 11, font: 'bold' });
  l.text('Redundant styles and variants in use today, the leaner set a design system needs, and what the excess costs each year.', l.left + PAD, top + PAD + 15, small, l.width - PAD * 2);

  const col = { label: l.left + PAD, current: l.left + 220, needed: l.left + 290, bar: l.left + 310, cost: l.left + l.width - PAD };
  let y = top + PAD + 42;
  const head: TextStyle = { size: TYPE.tiny, font: 'bold', color: COLORS.textTertiary };
  l.text('STYLE', col.label, y, head);
  l.textRight('IN USE', col.current, y, head);
  l.textRight('NEEDED', col.needed, y, head);
  l.text('REDUCTION', col.bar, y, head);
  l.textRight('COST / YEAR', col.cost, y, head);
  y += 14;

  if (rows.length === 0) {
    l.text('No redundant values found. Every style family is within a healthy range.', col.label, y + 6, body);
    y += rowH;
  }
  for (const row of rows) {
    l.rule(y);
    const mid = y + 7;
    l.text(row.label, col.label, mid, { size: TYPE.body, font: 'bold' });
    l.textRight(String(row.current), col.current, mid, { size: TYPE.body });
    l.textRight(String(row.recommended), col.needed, mid, { size: TYPE.body, font: 'bold', color: COLORS.success });
    const reduction = row.current ? row.excess / row.current : 0;
    l.bar(col.bar, mid + 3, 90, reduction, COLORS.accent);
    l.text(`-${Math.round(reduction * 100)}%`, col.bar + 96, mid, { size: TYPE.small, color: COLORS.textSecondary });
    l.textRight(money(row.annualCost), col.cost, mid, { size: TYPE.body });
    y += rowH;
  }
  if (rows.length) {
    l.rule(y);
    const totals = summary.consolidationTotals;
    const cost = summary.consolidation.reduce((n, r) => n + r.annualCost, 0);
    l.text('Total', col.label, y + 8, { size: TYPE.body, font: 'bold' });
    l.textRight(String(totals.current), col.current, y + 8, { size: TYPE.body, font: 'bold' });
    l.textRight(String(totals.recommended), col.needed, y + 8, { size: TYPE.body, font: 'bold', color: COLORS.success });
    l.text(`${totals.reduction}% fewer styles overall`, col.bar, y + 8, { size: TYPE.small, color: COLORS.textSecondary }, 150);
    l.textRight(money(cost), col.cost, y + 8, { size: TYPE.body, font: 'bold' });
    y += rowH + 8;
  }
  if (rethemeText) {
    l.roundedRect(l.left + PAD - 6, y, l.width - PAD * 2 + 12, rethemeH - 4, 6, COLORS.sunken);
    l.text(rethemeText, l.left + PAD, y + 5, small, l.width - PAD * 2);
  }
  l.y = top + height + 12;
}

// ── Page 2: where you stand and where to start ──────────────────────────

function areaHealth(l: Layout, { summary }: Context): void {
  sectionTitle(l, 'Where you stand', `Overall ${summary.score}/100 (${summary.grade}, ${summary.maturity}). Each area is scored 0 to 100 from what the product actually renders.`);
  const impactWidth = l.width - PAD * 2 - 190;
  const rows = summary.areas.map((a) => ({ area: a, h: Math.max(33, l.textHeight(a.impact, small, impactWidth) + 14) }));
  const height = PAD + rows.reduce((n, r) => n + r.h, 0) + PAD - 6;
  l.ensure(height);
  const top = l.y;
  l.card(l.left, top, l.width, height);
  let y = top + PAD - 4;
  rows.forEach(({ area, h }, i) => {
    if (i > 0) l.rule(y);
    const tone = STATUS_TONE[area.status];
    l.text(area.label, l.left + PAD, y + 9, { size: TYPE.body, font: 'bold' });
    l.pill(STATUS_LABELS[area.status], l.left + PAD + 100, y + 8, tone.fill, tone.text);
    l.bar(l.left + PAD + 100, y + 25, 56, area.score / 100, tone.bar);
    l.text(String(area.score), l.left + PAD + 162, y + 22, { size: TYPE.tiny, color: COLORS.textSecondary });
    l.text(area.impact, l.left + PAD + 190, y + 9, small, impactWidth);
    y += h;
  });
  l.y = top + height + 12;
}

function facts(l: Layout, { summary }: Context): void {
  const gap = 8;
  const w = (l.width - gap * 3) / 4;
  const h = 52;
  l.ensure(h);
  summary.facts.forEach((fact, i) => {
    const x = l.left + i * (w + gap);
    l.card(x, l.y, w, h);
    l.text(fact.value, x + 12, l.y + 10, { size: 15, font: 'bold' }, w - 24);
    l.text(fact.label, x + 12, l.y + 31, { size: TYPE.tiny, color: COLORS.textSecondary, lineHeight: 10 }, w - 24);
  });
  l.y += h + 18;
}

function priorities(l: Layout, { summary }: Context): void {
  if (summary.priorities.length === 0) return;
  sectionTitle(l, 'Where to start', 'The three changes with the most impact for the effort, in order.');
  const textWidth = l.width - PAD * 2 - 34;
  summary.priorities.forEach((p, i) => {
    const fix = `How: ${p.fix}`;
    const h = PAD * 2 + l.textHeight(p.title, { size: 10.5, font: 'bold' }, textWidth - 60) + 4 + l.textHeight(p.why, body, textWidth) + 4 + l.textHeight(fix, small, textWidth);
    l.ensure(h);
    const top = l.y;
    l.card(l.left, top, l.width, h);
    l.roundedRect(l.left + PAD, top + PAD - 2, 20, 20, 10, COLORS.accentSoft);
    l.text(String(i + 1), l.left + PAD + (i === 0 ? 7.5 : 7), top + PAD + 3, { size: 10, font: 'bold', color: COLORS.accentText });
    const x = l.left + PAD + 34;
    let y = top + PAD;
    y += l.text(p.title, x, y, { size: 10.5, font: 'bold' }, textWidth - 60);
    y += 4 + l.text(p.why, x, y + 4, body, textWidth);
    l.text(fix, x, y + 4, small, textWidth);
    const tone = SEVERITY_TONE[p.severity];
    const effort = `~${p.effortHours}h`;
    l.pill(effort, l.left + l.width - PAD - l.textWidth(effort, { size: 7.5, font: 'bold' }) - 10, top + PAD - 1, tone.fill, tone.text);
    l.y = top + h + 6;
  });
  l.gap(12);
}

// ── Page 3: the plan and how we help ────────────────────────────────────

function plan(l: Layout, { summary, money, audit }: Context): void {
  if (summary.plan.length === 0) return;
  l.addPage();
  sectionTitle(l, 'Recommended plan', 'Three phases, each shippable on its own. Timelines assume one person on the work; a pair halves them.');
  const textWidth = l.width - PAD * 2 - 130;
  summary.plan.forEach((phase, i) => {
    const items = phase.items.slice(0, 4).map((t) => `• ${t}`);
    if (phase.items.length > 4) items.push(`• and ${phase.items.length - 4} more`);
    const itemsText = items.join('\n');
    const h = PAD * 2 + 12 + l.textHeight(phase.name, { size: 11, font: 'bold' }, textWidth) + 3 + l.textHeight(phase.outcome, body, textWidth) + 8 + l.textHeight(itemsText, small, textWidth);
    l.ensure(h);
    const top = l.y;
    l.card(l.left, top, l.width, h);
    let y = top + PAD;
    y += l.text(`PHASE ${i + 1}`, l.left + PAD, y, { size: TYPE.tiny, font: 'bold', color: COLORS.accentText }) + 2;
    y += l.text(phase.name, l.left + PAD, y, { size: 11, font: 'bold' }, textWidth);
    y += 3 + l.text(phase.outcome, l.left + PAD, y + 3, body, textWidth);
    l.text(itemsText, l.left + PAD, y + 8, small, textWidth);
    const right = l.left + l.width - PAD;
    l.textRight(`~${phase.weeks} ${phase.weeks === 1 ? 'week' : 'weeks'}`, right, top + PAD + 8, { size: 15, font: 'bold' });
    l.textRight(`${phase.hours}h · ${money(phase.hours * audit.assumptions.hourlyRate)}`, right, top + PAD + 28, small);
    l.y = top + h + 8;
  });
  l.gap(10);
}

function callToAction(l: Layout, { options, money, audit }: Context): void {
  const { branding, clientName } = options;
  const who = branding.agencyName || 'We';
  const title = branding.agencyName ? `How ${branding.agencyName} can help` : 'How we can help';
  const pitch =
    `${who} turn${branding.agencyName ? 's' : ''} audits like this into a working design system: a token layer, a lean component library and the governance to keep it lean, delivered alongside your roadmap rather than instead of it. ` +
    `For ${clientName}, that means recovering an estimated ${money(audit.savings.annualSavings)} of team time every year, a faster path to rebrands and dark mode, and a more consistent, accessible product.`;
  const contact = [branding.preparedBy, branding.email, branding.website].filter(Boolean).join('   ·   ');
  const note = branding.note.trim();
  const width = l.width - PAD * 2;
  const h =
    PAD * 2 + 16 + l.textHeight(pitch, body, width) + (note ? 8 + l.textHeight(`“${note}”`, body, width) : 0) + (contact ? 22 : 0);
  l.ensure(h);
  const top = l.y;
  l.roundedRect(l.left, top, l.width, h, 10, COLORS.accentSoft);
  let y = top + PAD;
  y += l.text(title, l.left + PAD, y, { size: 11, font: 'bold', color: COLORS.accentText }) + 6;
  y += l.text(pitch, l.left + PAD, y, { ...body, color: COLORS.text }, width);
  if (note) y += 8 + l.text(`“${note}”`, l.left + PAD, y + 8, { ...body, color: COLORS.text }, width);
  if (contact) l.text(contact, l.left + PAD, y + 10, { size: TYPE.body, font: 'bold' }, width);
  l.y = top + h + 18;
}

// ── Appendix: every finding, method and limits ──────────────────────────

function findings(l: Layout, { audit, options }: Context): void {
  const open = audit.analysis.opportunities.filter((o) => !(options.dismissed ?? []).includes(o.id));
  if (open.length === 0) return;
  sectionTitle(l, 'All findings', `${open.length} issues found on the captured page, most severe first.`);
  const textWidth = l.width - PAD * 2 - 110;
  for (const o of open) {
    const detail = `${o.detail} ${o.fix}`;
    const h = 14 + l.textHeight(o.title, { size: TYPE.body, font: 'bold' }, textWidth) + 2 + l.textHeight(detail, small, textWidth);
    l.ensure(h + 4);
    const top = l.y;
    l.card(l.left, top, l.width, h);
    const tone = SEVERITY_TONE[o.severity];
    l.pill(o.severity.toUpperCase(), l.left + PAD - 4, top + 8, tone.fill, tone.text, 6.5);
    let y = top + 7;
    y += l.text(o.title, l.left + PAD + 50, y, { size: TYPE.body, font: 'bold' }, textWidth);
    l.text(detail, l.left + PAD + 50, y + 2, small, textWidth);
    l.textRight(`~${o.effortHours}h`, l.left + l.width - PAD, top + 8, { size: TYPE.body, font: 'bold' });
    l.y = top + h + 4;
  }
  l.gap(14);
}

function method(l: Layout, { audit }: Context): void {
  const { assumptions: a, snapshot, analysis } = audit;
  const money = (n: number) => formatMoney(n, a.currency);
  const paragraphs = [
    `How this audit works. The product was captured in the browser as a user sees it: ${snapshot.rendered.elements.length.toLocaleString('en-US')} elements and their computed styles, plus ${snapshot.authored.declarations.length.toLocaleString('en-US')} design declarations from its stylesheets. No source code or internal documentation was used. The capture reflects one page at ${snapshot.viewport.width}x${snapshot.viewport.height}; other pages, breakpoints and states will add to these findings, not remove them.`,
    `Cost model (planning estimate). ${a.contributors} people regularly design or build UI at ${money(a.hourlyRate)}/h. Each redundant style value costs each of them ~${a.hoursPerExcessValue}h a year and each redundant component variant ~${a.hoursPerExcessVariant}h (choosing between near-identical options, reviews, fixing drift). Each hard-coded value takes ~${a.minutesPerLiteralEdit} minutes to find and edit per re-theme, at ${a.rethemesPerYear} re-theme(s) a year. ${Math.round(a.realisationRate * 100)}% of the yearly cost is counted as recoverable. Cleanup effort is the sum of the per-finding estimates above.`,
    `Confidence: ${analysis.confidence.level}.${analysis.confidence.reasons.length ? ` ${analysis.confidence.reasons.join(' ')}` : ''} Scores and component recognition are heuristics.`,
  ];
  sectionTitle(l, 'Method and assumptions');
  for (const p of paragraphs) {
    l.ensure(l.textHeight(p, small, l.width) + 8);
    l.y += l.text(p, l.left, l.y, small, l.width) + 8;
  }
}

function footers(l: Layout, { options }: Context): void {
  const label = ['Design System Audit', options.clientName, options.branding.agencyName && `Prepared by ${options.branding.agencyName}`]
    .filter(Boolean)
    .join('  ·  ');
  l.pages.forEach((page, i) => {
    l.page = page;
    const top = PAGE.height - PAGE.margin + 6;
    l.text(label, l.left, top, { size: TYPE.tiny, color: COLORS.textTertiary }, l.width - 60);
    l.textRight(`${i + 1} / ${l.pages.length}`, l.left + l.width, top, { size: TYPE.tiny, color: COLORS.textTertiary });
  });
}

export async function auditToPdf(audit: Audit, options: ClientReportOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const summary = summarise(audit, options.dismissed);
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
  consolidation(l, ctx, 7);
  facts(l, ctx);

  l.addPage();
  priorities(l, ctx);
  areaHealth(l, ctx);

  plan(l, ctx);
  callToAction(l, ctx);
  findings(l, ctx);
  method(l, ctx);
  footers(l, ctx);

  return pdf.save();
}
