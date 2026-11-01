/**
 * The Report tab's two versions, as text and files:
 *
 *  - Executive summary: the business case on one page, for a founder or
 *    head of design. Markdown for emails, a printable HTML one-pager.
 *  - Detailed report: every opportunity with its evidence and limits, for
 *    designers and engineers. Markdown for docs, tickets and AI agents.
 *
 * Both are built from buildBusinessCase(), so every figure matches the panel.
 */

import type { Audit } from '../audit';
import { assumptionsLine, buildBusinessCase, consistencyLevel, type BusinessCase, type RankedOpportunity } from '../business';
import { summarise } from '../insights';
import { starterSystem } from '../insights/starter-system';
import { accessibilityReport } from '../insights/wcag';
import type { AreaKey } from '../inference/types';
import { formatMoney } from '../savings';
import { hasContact, type ClientReportOptions } from './branding';
import { escape, STYLES } from './html';
import { formatDate, slug } from './format';

export const AREA_NAMES: Record<AreaKey, string> = {
  color: 'Color',
  typography: 'Type',
  spacing: 'Spacing',
  shape: 'Shape & depth',
  elevation: 'Shape & depth',
  motion: 'Motion',
  components: 'Components',
  tokens: 'Tokens',
  interaction: 'Focus & hover',
  accessibility: 'Accessibility',
};

const IMPACT = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const EFFORT = { small: 'Small', medium: 'Medium', large: 'Large' } as const;

const pct = (today: number, after: number) => (today > 0 ? Math.round(((today - after) / today) * 100) : 0);
const h = (n: number) => `${Math.round(n).toLocaleString('en-US')} h`;

export function impactFileName(clientName: string, extension: string): string {
  return `${slug(clientName)}-design-system-impact.${extension}`;
}

/** One opportunity as a Markdown task, for a ticket or an AI agent. */
export function opportunityTask(r: RankedOpportunity, audit: Audit): string {
  const o = r.opportunity;
  const lines = [
    `## ${o.title}`,
    '',
    `**Area:** ${AREA_NAMES[o.area]} · **Impact:** ${IMPACT[r.impact]} · **Effort:** ${EFFORT[r.effort]} (about ${h(r.hours)}) · **Confidence:** ${r.confidence}% (${r.basis.toLowerCase()})`,
    '',
    o.detail,
    '',
    `**Why it matters.** ${r.benefit}`,
    '',
    `**Proposed change.** ${o.fix}`,
  ];
  if (o.values?.length) lines.push('', `**Values involved (${o.values.length}):** ${o.values.slice(0, 16).map((v) => `\`${v}\``).join(', ')}${o.values.length > 16 ? `, +${o.values.length - 16} more` : ''}`);
  if (o.selectors.length) lines.push('', '**Where it happens:**', ...o.selectors.slice(0, 5).map((s) => `- \`${s}\``), ...(o.selectors.length > 5 ? [`- +${o.selectors.length - 5} more`] : []));
  lines.push('', `**Done when:** no element on the captured pages uses the replaced values, and a re-capture no longer lists this opportunity.`, '', `_Found by System Audit on ${audit.snapshot.url}_`);
  return lines.join('\n');
}

function heroLine(b: BusinessCase, clientName: string): string {
  return b.avoidable.likely > 0
    ? `A design system would have saved ${clientName} about ${h(b.avoidable.likely)} (${b.teamTime}).`
    : `${clientName} is already built systematically; there is little avoidable work.`;
}

export function executiveMarkdown(audit: Audit, options: ClientReportOptions): string {
  const b = buildBusinessCase(audit, options.dismissed);
  const summary = summarise(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const a = audit.assumptions;
  const money = (n: number) => formatMoney(n, a.currency);
  const level = consistencyLevel(summary.score);
  const lines = [
    `# ${summary.clientName}: the case for a design system`,
    '',
    `**${heroLine(b, summary.clientName)}** Likely range ${h(b.avoidable.low)} to ${h(b.avoidable.high)}, ${b.confidence} confidence. That is about ${money(b.avoidableCost)} of team time.`,
    '',
    `| Yearly cost | One-time fix | Consistency |`,
    `| --- | --- | --- |`,
    `| ${h(b.yearly.hours)} (${money(b.yearly.cost)} a year: ${h(b.yearly.inconsistencyHours)} inconsistency + ${h(b.yearly.newScreenHours)} slower new screens) | ${b.oneTimeFix.hours ? `${h(b.oneTimeFix.hours)}${b.breakEvenMonths ? `, breaks even in ${b.breakEvenMonths} months` : ''}` : 'Nothing urgent'} | ${summary.score}/100, ${level.level.toLowerCase()} |`,
  ];
  if (b.parts.today > b.parts.after) {
    lines.push('', '## Simplify and reuse', '', `${b.parts.today} parts made separately today → ${b.parts.after} shared parts with a design system (−${pct(b.parts.today, b.parts.after)}%).`);
  }
  if (b.causes.length) {
    lines.push('', '## Where the time went', '', ...b.causes.map((c) => `- **${c.label}:** ${h(c.hours)} (${c.basis})`));
  }
  if (b.breakEvenMonths) {
    lines.push('', '## Return on closing the gaps', '', `A one-time fix of about ${h(b.oneTimeFix.hours)} (${money(b.oneTimeFix.cost)}) gives back about ${h(b.yearlyBenefit.hours)} (${money(b.yearlyBenefit.cost)}) a year. It breaks even in about ${b.breakEvenMonths} months.`);
  }
  if (b.typicalChanges.length) {
    lines.push('', '## Cost of a typical change', '', ...b.typicalChanges.map((c) => `- **${c.label}:** ${c.today} ${c.unit} today → ${c.after} after (−${pct(c.today, c.after)}%)`));
  }
  if (b.highlights.length) lines.push('', '## What we found', '', ...b.highlights.map((x) => `- ${x.warning ? '⚠️ ' : ''}${x.text}`));
  lines.push('', `**Accessibility:** ${accessibilityReport(audit).headline}`);
  const system = starterSystem(audit, summary.clientName);
  if (system.tokens.length) lines.push('', `**Your design system, extracted:** the ${system.before} values in use today map onto ${system.after} named tokens. We can send the ready-to-use token file.`);
  if (b.nextSteps.items.length) {
    lines.push(
      '',
      '## Recommended next steps',
      '',
      `About ${h(b.nextSteps.hours)} of team time closes the ${b.nextSteps.items.length} priority ${b.nextSteps.items.length === 1 ? 'gap' : 'gaps'}.`,
      '',
      ...b.nextSteps.items.map((r, i) => `${i + 1}. **${r.opportunity.title}**: ${EFFORT[r.effort].toLowerCase()} effort, about ${h(r.hours)}, ${IMPACT[r.impact].toLowerCase()} impact${r.quickWin ? ' (quick win)' : ''}.`),
    );
  }
  lines.push('', `_Estimates based on: ${assumptionsLine(a, money)}. Captured ${formatDate(audit.snapshot.capturedAt)} from ${b.pagesCaptured} ${b.pagesCaptured === 1 ? 'page' : 'pages'}._`);
  const { branding } = options;
  if (hasContact(branding)) lines.push('', `Prepared by ${[branding.preparedBy, branding.agencyName].filter(Boolean).join(', ')}${branding.email ? ` · ${branding.email}` : ''}${branding.website ? ` · ${branding.website}` : ''}`);
  return lines.join('\n');
}

export function detailedMarkdown(audit: Audit, options: ClientReportOptions): string {
  const b = buildBusinessCase(audit, options.dismissed);
  const { analysis, snapshot } = audit;
  const lines = [
    `# Design system audit: ${options.clientName} (detailed)`,
    '',
    `Every opportunity with its evidence and the stated limits, for designers and engineers. Captured ${formatDate(snapshot.capturedAt)} from ${snapshot.pages ? snapshot.pages.map((p) => p.url).join(', ') : snapshot.url}.`,
    '',
    `- **Consistency:** ${audit.score.overall}/100 (${consistencyLevel(audit.score.overall).level})`,
    `- **Opportunities:** ${b.ranked.length}, of which ${b.ranked.filter((r) => r.impact === 'high').length} high impact and ${b.quickWins.length} quick wins`,
    `- **One-time fix:** about ${h(b.oneTimeFix.hours)}`,
    '',
    '## Scores by area',
    '',
    '| Area | Score |',
    '| --- | ---: |',
    ...audit.score.areas.filter((x) => x.applicable).map((x) => `| ${x.label} | ${x.score} |`),
    '',
    '## Accessibility check',
    '',
    '| Check | WCAG | Result |',
    '| --- | --- | --- |',
    ...accessibilityReport(audit).checks.map((c) => `| ${c.name} | ${c.sc} (${c.level}) | ${c.status === 'fail' ? `Fails: ${c.failed} of ${c.checked}` : c.status === 'pass' ? `Passes (${c.checked} checked)` : 'Nothing to check'} |`),
    '',
    '# Opportunities, ordered by impact',
    '',
    ...b.ranked.flatMap((r) => [opportunityTask(r, audit), '']),
    '## Starter design tokens',
    '',
    'Extracted from the live product: near-copies merged, stray values mapped to the nearest step. Review before adopting.',
    '',
    '```css',
    starterSystem(audit, options.clientName).css,
    '```',
    '',
    '## Limits of this audit',
    '',
    ...analysis.confidence.reasons.map((r) => `- ${r}`),
    '- Each capture reflects one viewport at one moment; hidden states and other breakpoints are not measured.',
    '- Scores, component recognition and every hour figure are heuristics and planning estimates.',
  ];
  return lines.join('\n');
}

/** The executive summary as a printable one-page HTML file. */
export function onePagerHtml(audit: Audit, options: ClientReportOptions): string {
  const b = buildBusinessCase(audit, options.dismissed);
  const summary = summarise(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const a = audit.assumptions;
  const money = (n: number) => formatMoney(n, a.currency);
  const level = consistencyLevel(summary.score);
  const { branding } = options;
  const maxCause = Math.max(1, ...b.causes.map((c) => c.hours));
  const tile = (value: string, label: string, note: string) => `<div class="card tile"><b>${escape(value)}</b><span>${escape(label)}</span><div class="small faint">${escape(note)}</div></div>`;
  const span = Math.max(1, b.avoidable.high - b.avoidable.low);
  const marker = Math.round(((b.avoidable.likely - b.avoidable.low) / span) * 100);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(summary.clientName)}: design system impact</title><style>${STYLES}
.hero{padding:22px}.eyebrow{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2);display:flex;justify-content:space-between}
.big{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1.1;margin-top:8px}.big small{font-size:18px;font-weight:600;color:var(--text-2);margin-left:6px}
.range{position:relative;height:8px;border-radius:4px;background:var(--sunken);margin:14px 0 4px}.range i{position:absolute;top:-4px;width:3px;height:16px;border-radius:2px;background:var(--text)}
.rl{display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-2)}.grid3 .tile b{font-size:19px}</style></head><body><main>
<div class="top">${escape(branding.agencyName || 'System Audit')}<span>${escape(formatDate(audit.snapshot.capturedAt))}</span></div>
<h1 style="margin-top:20px">${escape(summary.clientName)}</h1><p class="muted">The case for a design system · ${b.pagesCaptured} ${b.pagesCaptured === 1 ? 'page' : 'pages'} reviewed</p>
${branding.note ? `<p class="card">${escape(branding.note)}</p>` : ''}
<section class="card hero"><div class="eyebrow"><span>A design system would have saved</span><span class="dot ${b.confidence === 'high' ? 'strong' : b.confidence === 'medium' ? 'needs-work' : 'at-risk'}">${b.confidence} confidence</span></div>
<div class="big">${Math.round(b.avoidable.likely).toLocaleString('en-US')}<small>hours</small></div>
<p class="muted">${escape(b.teamTime)} · ${escape(money(b.avoidableCost))} · across about ${b.screens} screens</p>
<div class="range" aria-hidden="true"><i style="left:calc(${marker}% - 1px)"></i></div><div class="rl"><span>${h(b.avoidable.low)}</span><span>Likely range</span><span>${h(b.avoidable.high)}</span></div></section>
<section class="grid3">${tile(b.yearly.hours ? h(b.yearly.hours) : '—', 'Yearly cost', b.yearly.hours ? `${money(b.yearly.cost)} a year: ${h(b.yearly.inconsistencyHours)} inconsistency + ${h(b.yearly.newScreenHours)} slower new screens` : 'None found')}
${tile(b.oneTimeFix.hours ? h(b.oneTimeFix.hours) : '—', 'One-time fix', b.breakEvenMonths ? `Breaks even in ${b.breakEvenMonths} months` : 'Nothing urgent')}
${tile(`${summary.score}/100`, 'Consistency', level.level)}</section>
${b.causes.length ? `<section class="card"><h3>Where the time went</h3><div class="bars">${b.causes.map((c) => `<span>${escape(c.label)}</span><span class="track"><i style="width:${Math.max(3, (c.hours / maxCause) * 100)}%"></i></span><span class="val">${h(c.hours)}</span>`).join('')}</div></section>` : ''}
<section class="grid2">${b.parts.today > b.parts.after ? `<div class="card"><h3>Simplify and reuse</h3><p class="big" style="font-size:26px">${b.parts.today} → ${b.parts.after}</p><p class="small muted">Parts made separately today, and shared parts with a design system (−${pct(b.parts.today, b.parts.after)}%).</p></div>` : ''}
${b.breakEvenMonths ? `<div class="card"><h3>Return on closing the gaps</h3><p class="small muted" style="margin-top:6px">A one-time fix of ${h(b.oneTimeFix.hours)} gives back ${h(b.yearlyBenefit.hours)} a year (${escape(money(b.yearlyBenefit.cost))}). Break-even in about ${b.breakEvenMonths} months; ${escape(money(b.roi[2]!.savings))} saved over three years.</p></div>` : ''}</section>
${b.typicalChanges.length ? `<section class="card tablecard"><table><tr><th>Cost of a typical change</th><th class="num">Today</th><th class="num">After</th></tr>${b.typicalChanges.map((c) => `<tr><td>${escape(c.label)}<div class="small faint">${escape(c.unit)}</div></td><td class="num">${c.today}</td><td class="num"><b>${c.after}</b></td></tr>`).join('')}</table></section>` : ''}
${b.highlights.length ? `<section class="card"><h3>What we found</h3><ul>${b.highlights.map((x) => `<li>${x.warning ? '⚠ ' : ''}${escape(x.text)}</li>`).join('')}</ul></section>` : ''}
${b.nextSteps.items.length ? `<section class="card tablecard"><table><tr><th>Recommended next steps · about ${h(b.nextSteps.hours)} closes the ${b.nextSteps.items.length} priority gaps</th><th class="num">Effort</th><th class="num">Impact</th></tr>${b.nextSteps.items.map((r, i) => `<tr><td>${i + 1}. ${escape(r.opportunity.title)}${r.quickWin ? ' <span class="chip">Quick win</span>' : ''}</td><td class="num">${h(r.hours)}</td><td class="num">${IMPACT[r.impact]}</td></tr>`).join('')}</table></section>` : ''}
<p class="small faint">Planning estimates based on ${escape(assumptionsLine(a, money))}. Every figure is a count from your product times one of these numbers.</p>
${hasContact(branding) ? `<footer>Prepared by ${escape([branding.preparedBy, branding.agencyName].filter(Boolean).join(', '))}${branding.email ? ` · ${escape(branding.email)}` : ''}${branding.website ? ` · ${escape(branding.website)}` : ''}</footer>` : ''}
</main></body></html>`;
}
