/**
 * The client report as a single HTML file: the web twin of the PDF, built
 * from the same executive summary and in the same visual language (grey
 * canvas, white hairline cards, sentence-case table headers, grey chips,
 * status dots). Adapts to dark mode on screen and prints on A4.
 */

import type { Audit } from '../audit';
import { STATUS_LABELS, summarise, type Evidence, type PainPoint } from '../insights';
import type { Severity } from '../inference/types';
import { formatMoney, formatMoneyShort } from '../savings';
import type { ClientReportOptions } from './branding';
import { formatDate } from './format';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PRIORITY: Record<Severity, { label: string; dot: string }> = {
  high: { label: 'High priority', dot: 'at-risk' },
  medium: { label: 'Worth fixing', dot: 'needs-work' },
  low: { label: 'Nice to have', dot: 'muted' },
};

const STYLES = `
:root{--canvas:#f6f6f6;--surface:#fff;--sunken:#f1f1f1;--border:#ebebeb;--text:#171717;--text-2:#6b6b6b;--text-3:#a3a3a3;
--danger:#e5484d;--warning:#c98207;--success:#2a9d3e;--shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.04);color-scheme:light}
@media screen and (prefers-color-scheme:dark){:root{--canvas:#0e0e0e;--surface:#191919;--sunken:#121212;--border:#262626;--text:#ededed;--text-2:#a1a1a1;
--text-3:#6e6e6e;--shadow:0 0 0 1px rgba(255,255,255,.05),0 1px 2px rgba(0,0,0,.4);color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:13px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:820px;margin:0 auto;padding:40px 24px 64px;display:grid;gap:12px}
h1{font-size:30px;line-height:1.15;margin:0 0 4px;letter-spacing:-.02em}h2{font-size:16px;margin:28px 0 0}h3{font-size:14px;margin:0}
p{margin:0}.muted{color:var(--text-2)}.faint{color:var(--text-3)}.small{font-size:12px}
.top{display:flex;justify-content:space-between;font-weight:600}.top span{font-weight:400;color:var(--text-2);font-size:12px}
.cover{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;margin-top:20px}
.shot{width:240px;border-radius:10px;box-shadow:var(--shadow);background:var(--surface);padding:6px}.shot img{width:100%;border-radius:6px;display:block}
.card{background:var(--surface);border-radius:12px;box-shadow:var(--shadow);padding:16px 18px}.card p+p{margin-top:8px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tile b{display:block;font-size:21px}.tile span{font-size:11.5px;color:var(--text-2)}
.dot{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);white-space:nowrap}.dot::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--text-3)}
.dot.at-risk::before{background:var(--danger)}.dot.needs-work::before{background:var(--warning)}.dot.strong::before{background:var(--success)}
.finding{padding:0;overflow:hidden}.finding .body{padding:16px 18px}.finding .foot{padding:12px 18px;background:var(--canvas);border-top:1px solid var(--border)}
.finding header{display:flex;justify-content:space-between;gap:12px}.label{font-weight:600;font-size:12px;margin-top:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.chip{font-size:11.5px;padding:1px 7px;border-radius:5px;background:var(--sunken);box-shadow:inset 0 0 0 1px var(--border);color:var(--text-2)}
.chip.flag{box-shadow:inset 0 0 0 1px var(--danger)}.sw{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-2);margin-right:14px}
.sw i{width:16px;height:16px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}.swrow{margin-top:8px}
ul{margin:4px 0 0;padding-left:18px;color:var(--text-2)}
table{width:100%;border-collapse:collapse}th{font-weight:400;color:var(--text-3);font-size:11.5px;text-align:left;padding:8px;background:var(--canvas);border-bottom:1px solid var(--border)}
td{padding:9px 8px;border-bottom:1px solid var(--border);vertical-align:top}tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.tablecard{padding:0;overflow:hidden}.aa{display:inline-grid;place-items:center;width:30px;height:18px;border-radius:4px;font-weight:700;font-size:11px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
footer{color:var(--text-3);font-size:11px;text-align:center;margin-top:16px}
@media (max-width:640px){.grid4{grid-template-columns:repeat(2,1fr)}.cover{grid-template-columns:1fr}.shot{width:100%}}
@media print{@page{size:A4;margin:14mm}body{font-size:11px}main{padding:0;max-width:none}.card{break-inside:avoid}.break{break-before:page}}
`;

function evidenceHtml(e: Evidence): string {
  switch (e.kind) {
    case 'colours':
      return e.groups
        .map((g) => `<div class="swrow">${[g.main, ...g.copies].map((c) => `<span class="sw"><i style="background:${escape(c)}"></i>${escape(c)}</span>`).join('')}</div>`)
        .join('');
    case 'values':
      return `<div class="chips">${e.items.map((i) => `<span class="chip${i.flagged ? ' flag' : ''}">${escape(i.value)} ×${i.count}</span>`).join('')}</div><p class="small muted" style="margin-top:6px">${escape(e.note)}</p>`;
    case 'contrast':
      return `<table style="margin-top:8px">${e.items
        .map(
          (i) => `<tr><td style="width:40px"><span class="aa" style="color:${escape(i.foreground)};background:${escape(i.background)}">Aa</span></td>
<td>“${escape(i.text)}”<div class="small faint">${escape(i.foreground)} on ${escape(i.background)}</div></td><td class="num small muted">${i.ratio} : 1 (needs 4.5)</td></tr>`,
        )
        .join('')}</table>`;
    case 'variants':
      return `<table style="margin-top:8px">${e.items.map((i) => `<tr><td><b>${escape(i.label)}</b></td><td class="small muted">${escape(i.details)}</td></tr>`).join('')}</table>`;
    case 'none':
      return '';
  }
}

function findingHtml(p: PainPoint, index: number, money: (n: number) => string): string {
  const meta = [p.pages.length ? `Seen on ${p.pages.slice(0, 4).join(', ')}` : '', p.annualCost ? `about ${money(p.annualCost)} a year` : '']
    .filter(Boolean)
    .join(' · ');
  const priority = PRIORITY[p.severity];
  return `<section class="card finding"><div class="body">
<header><h3>${index}. ${escape(p.title)}</h3><span class="dot ${priority.dot}">${priority.label}</span></header>
${meta ? `<p class="small muted">${escape(meta)}</p>` : ''}
<p style="margin-top:8px">${escape(p.story)}</p>
${evidenceHtml(p.evidence)}
${p.where.length ? `<p class="label">Where we saw it</p><ul>${p.where.map((w) => `<li>${escape(w.charAt(0).toUpperCase() + w.slice(1))}</li>`).join('')}</ul>` : ''}
<p class="label">Why it matters</p><p class="muted">${escape(p.why)}</p></div>
<div class="foot"><p class="label" style="margin-top:0">What we’d suggest</p><p>${escape(p.suggestion)}</p></div></section>`;
}

export function auditToHtml(audit: Audit, options: ClientReportOptions): string {
  const { snapshot, assumptions: a } = audit;
  const { branding } = options;
  const summary = summarise(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const money = (n: number) => formatMoney(n, a.currency);
  const short = (n: number) => formatMoneyShort(n, a.currency);
  const n = summary.numbers;
  const signature = [branding.preparedBy, branding.agencyName].filter(Boolean).join(', ');
  const contact = [branding.preparedBy, branding.email, branding.website].filter(Boolean).map(escape).join(' · ');
  const agency = branding.agencyName ? escape(branding.agencyName) : '';
  const greeting = summary.clientName === 'your product' ? 'Hi there,' : `Hi ${escape(summary.clientName)} team,`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design system audit: ${escape(summary.clientName)}</title><style>${STYLES}</style></head>
<body><main>
<div class="top">${agency}<span>${escape(formatDate(snapshot.capturedAt))}</span></div>

<section class="cover"><div><h1>${escape(summary.clientName)}</h1>
<p class="muted">Design system audit · ${summary.pages.length === 1 ? '1 page reviewed' : `${summary.pages.length} pages reviewed`}</p>
<p class="faint small">${escape(snapshot.url)}</p></div>
${snapshot.screenshot ? `<div class="shot"><img src="${snapshot.screenshot}" alt="The audited page"></div>` : ''}</section>

<section class="card"><p><b>${greeting}</b></p><p>${escape(summary.intro)}</p>
${branding.note.trim() ? `<p>${escape(branding.note.trim())}</p>` : ''}${signature ? `<p class="muted">${escape(signature)}</p>` : ''}</section>

${summary.hook ? `<section class="card"><h3>Something you may not know</h3><p style="margin-top:4px">${escape(summary.hook)}</p></section>` : ''}

<h2>${escape(summary.headline)}</h2><p class="muted">${escape(summary.subheadline)}</p>
<section class="grid4">
<div class="card tile"><b>${short(n.yearlyCost)}</b><span>Estimated yearly cost of inconsistency</span></div>
<div class="card tile"><b>${short(n.recoverable)}</b><span>Could be saved every year</span></div>
<div class="card tile"><b>${n.hoursLost}h</b><span>Team hours lost each year</span></div>
<div class="card tile"><b>${summary.score}/100</b><span>Consistency score (75+ is healthy)</span></div>
</section>
<p class="small muted">${escape(summary.scoreExplainer)}</p>

${
  summary.painPoints.length
    ? `<h2 class="break">What we found</h2><p class="muted">The problems we noticed, most important first. For each one we show where it appears, why it matters and what we would do about it.</p>
${summary.painPoints.map((p, i) => findingHtml(p, i + 1, money)).join('')}`
    : ''
}

<h2>Your design system at a glance</h2><p class="muted">A stock-take of the building blocks in your product that need attention, compared with what a tidy design system usually has. The biggest gaps are at the top.</p>
${
  summary.metrics.length
    ? `<section class="card tablecard"><table><tr><th>What we looked at</th><th>What we found</th><th>A tidy system has</th><th>Status</th><th class="num">Cost a year</th></tr>
${summary.metrics
  .map(
    (m) => `<tr><td><b>${escape(m.label)}</b><div class="small muted">${escape(m.explainer)}</div></td><td><b>${escape(m.found)}</b>${m.foundNote ? `<div class="small muted">${escape(m.foundNote)}</div>` : ''}</td>
<td class="muted">${escape(m.healthy)}</td><td><span class="dot ${m.status}">${STATUS_LABELS[m.status]}</span></td><td class="num">${m.annualCost ? money(m.annualCost) : '<span class="faint">—</span>'}</td></tr>`,
  )
  .join('')}</table></section>`
    : ''
}
${summary.healthyMetrics.length ? `<p class="muted small">Also checked and already in good shape: ${summary.healthyMetrics.map((m) => `${escape(m.label.toLowerCase())} (${escape(m.found)})`).join(', ')}.</p>` : ''}

${
  summary.pages.length > 1
    ? `<h2>Pages we reviewed</h2><section class="card tablecard"><table><tr><th>Page</th><th>Address</th><th class="num">Elements</th></tr>${summary.pages
        .map((p) => `<tr><td><b>${escape(p.name)}</b></td><td class="small muted">${escape(p.url)}</td><td class="num">${p.elements}</td></tr>`)
        .join('')}</table></section>`
    : ''
}

<h2>How we worked this out</h2>
<p class="muted">We opened your product in a normal browser and measured it the way your customers see it: ${snapshot.rendered.elements.length.toLocaleString('en-US')} visible elements and the ${snapshot.authored.declarations.length.toLocaleString('en-US')} styling rules behind them. We didn’t need access to your code, files or team.</p>
<p class="muted">The money figures are estimates, not invoices. They assume about ${a.contributors} people regularly design or build your product, at around ${money(a.hourlyRate)} an hour. Every unnecessary colour, size or spacing value costs each of them roughly ${a.hoursPerExcessValue} hours a year, every unnecessary component style about ${a.hoursPerExcessVariant} hours, and every hand-typed value about ${a.minutesPerLiteralEdit} minutes to change during a redesign. We count only ${Math.round(a.realisationRate * 100)}% of the total as realistically recoverable.</p>
<p class="muted">Other pages, screen sizes and states weren’t part of this review, so the real picture is usually a little bigger, not smaller.</p>

<h2>Words used in this report</h2>
<section class="card tablecard"><table>${summary.glossary.map((g) => `<tr><td style="width:180px"><b>${escape(g.term)}</b></td><td class="muted">${escape(g.meaning)}</td></tr>`).join('')}</table></section>

<h2>${agency ? `How ${agency} can help` : 'How we can help'}</h2>
<section class="card"><p>If any of this is useful, ${agency ? `${agency} would` : 'we’d'} be glad to talk it through. We help product teams turn findings like these into a working design system: a small set of named colours, text styles and spacing, and components that get reused rather than rebuilt. Happy to walk your team through the report, or to answer questions about any of it, with no obligation.</p>
${contact ? `<p><b>${contact}</b></p>` : ''}</section>

<footer>${escape(summary.clientName)} · Design system audit${agency ? ` · Prepared by ${agency}` : ''}</footer>
</main></body></html>`;
}
