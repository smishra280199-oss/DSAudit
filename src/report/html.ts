/**
 * The client-facing report as a single HTML file: the web twin of the PDF,
 * built from the same executive summary. It follows the panel's visual
 * language, adapts to dark mode on screen and prints cleanly on A4.
 */

import type { Audit } from '../audit';
import { summarise, STATUS_LABELS } from '../insights';
import { formatMoney, formatMoneyShort } from '../savings';
import type { ClientReportOptions } from './branding';
import { formatDate } from './format';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLES = `
:root{--canvas:#f6f6f6;--surface:#fff;--sunken:#f1f1f1;--border:#ebebeb;--text:#171717;--text-2:#6b6b6b;--text-3:#a3a3a3;
--accent:#eb00df;--accent-text:#cc00c2;--accent-soft:#fdeafc;--danger:#e5484d;--danger-soft:#fdeeee;--warning:#c98207;--warning-soft:#fdf4e3;
--success:#2a9d3e;--success-soft:#e8f8eb;--shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.04);color-scheme:light}
@media screen and (prefers-color-scheme:dark){:root{--canvas:#0e0e0e;--surface:#191919;--sunken:#121212;--border:#262626;--text:#ededed;--text-2:#a1a1a1;
--text-3:#6e6e6e;--accent-text:#ff5cf7;--accent-soft:rgba(235,0,223,.16);--danger-soft:rgba(229,72,77,.16);--warning-soft:rgba(201,130,7,.18);
--success-soft:rgba(42,157,62,.18);--shadow:0 0 0 1px rgba(255,255,255,.05),0 1px 2px rgba(0,0,0,.4);color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:13px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:860px;margin:0 auto;padding:40px 24px 64px;display:grid;gap:14px}
h1{font-size:32px;line-height:1.1;margin:4px 0 6px;letter-spacing:-.02em}h2{font-size:17px;margin:22px 0 2px}h3{font-size:14px;margin:0}
p{margin:0}.muted{color:var(--text-2)}.faint{color:var(--text-3)}.small{font-size:12px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--accent-text)}
.top{display:flex;justify-content:space-between;align-items:center}.brand{display:flex;gap:8px;align-items:center;font-weight:600}
.mark{width:22px;height:22px;border-radius:6px;background:linear-gradient(#ff52f6,#df00d4)}
.cover{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;margin-top:24px}
.shot{width:240px;border-radius:10px;box-shadow:var(--shadow);background:var(--surface);padding:6px}.shot img{width:100%;border-radius:6px;display:block}
.card{background:var(--surface);border-radius:12px;box-shadow:var(--shadow);padding:18px 20px}
.headline{border-left:3px solid var(--accent)}.headline h2{margin:0 0 6px;font-size:21px;line-height:1.3}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpi b{display:block;font-size:22px;letter-spacing:-.01em}.kpi span{font-size:11.5px;color:var(--text-2)}
table{width:100%;border-collapse:collapse}td,th{padding:9px 4px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}
th{font-size:10.5px;color:var(--text-3);font-weight:600;letter-spacing:.04em}tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.need{color:var(--success);font-weight:700}.bar{height:5px;border-radius:9px;background:var(--sunken);width:110px;display:inline-block;vertical-align:middle;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}.note{background:var(--sunken);border-radius:8px;padding:8px 10px;margin-top:10px}
.pill{display:inline-block;padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600}
.strong{background:var(--success-soft);color:var(--success)}.needs-work{background:var(--warning-soft);color:var(--warning)}.at-risk{background:var(--danger-soft);color:var(--danger)}
.high{background:var(--danger-soft);color:var(--danger)}.medium{background:var(--warning-soft);color:var(--warning)}.low{background:var(--sunken);color:var(--text-2)}
.priority{display:grid;grid-template-columns:28px 1fr auto;gap:12px}.n{width:24px;height:24px;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);font-weight:700;display:grid;place-items:center}
.phase{display:grid;grid-template-columns:1fr auto;gap:16px}.phase ul{margin:8px 0 0;padding-left:16px;color:var(--text-2);font-size:12px}.weeks{text-align:right}.weeks b{font-size:20px;display:block}
.cta{background:var(--accent-soft);border-radius:12px;padding:18px 20px}.cta h3{color:var(--accent-text);margin-bottom:6px}
footer{color:var(--text-3);font-size:11px;text-align:center;margin-top:12px}
@media (max-width:640px){.grid4{grid-template-columns:repeat(2,1fr)}.cover{grid-template-columns:1fr}.shot{width:100%}}
@media print{@page{size:A4;margin:14mm}body{font-size:11px}main{padding:0;max-width:none}.card,.cta{break-inside:avoid}.page-break{break-before:page}}
`;

export function auditToHtml(audit: Audit, options: ClientReportOptions): string {
  const { snapshot, savings, assumptions } = audit;
  const { branding, clientName } = options;
  const summary = summarise(audit, options.dismissed);
  const money = (n: number) => formatMoney(n, assumptions.currency);
  const short = (n: number) => formatMoneyShort(n, assumptions.currency);
  const open = audit.analysis.opportunities.filter((o) => !(options.dismissed ?? []).includes(o.id));
  const preparedBy = [branding.preparedBy, branding.agencyName].filter(Boolean).join(', ');
  const contact = [branding.preparedBy, branding.email, branding.website].filter(Boolean).map(escape).join(' · ');
  const agency = branding.agencyName ? escape(branding.agencyName) : '';

  const consolidationRows = summary.consolidation
    .map((row) => {
      const pct = row.current ? Math.round((row.excess / row.current) * 100) : 0;
      return `<tr><td><b>${escape(row.label)}</b></td><td class="num">${row.current}</td><td class="num need">${row.recommended}</td>
<td><span class="bar"><i style="width:${pct}%"></i></span> <span class="muted small">-${pct}%</span></td><td class="num">${money(row.annualCost)}</td></tr>`;
    })
    .join('');
  const totals = summary.consolidationTotals;
  const { retheme } = savings;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design System Audit: ${escape(clientName)}</title><style>${STYLES}</style></head>
<body><main>
<div class="top"><div class="brand"><span class="mark"></span>${agency || 'System Audit'}</div><span class="muted small">${escape(formatDate(snapshot.capturedAt))}</span></div>

<section class="cover"><div>
<div class="eyebrow">DESIGN SYSTEM AUDIT</div><h1>${escape(clientName)}</h1>
<p class="faint small">${escape(snapshot.url)}</p>
${preparedBy ? `<p class="muted" style="margin-top:10px">Prepared for ${escape(clientName)} by ${escape(preparedBy)}</p>` : ''}
</div>${snapshot.screenshot ? `<div class="shot"><img src="${snapshot.screenshot}" alt="The audited page"></div>` : ''}</section>

<section class="card headline"><h2>${escape(summary.headline)}</h2><p class="muted">${escape(summary.subheadline)}</p></section>

<section class="grid4">
<div class="card kpi"><b style="color:var(--danger)">${short(savings.annualDragCost)}</b><span>Yearly cost of design inconsistency</span></div>
<div class="card kpi"><b style="color:var(--success)">${short(savings.annualSavings)}</b><span>Recoverable every year after cleanup</span></div>
<div class="card kpi"><b>${short(savings.cleanupCost)}</b><span>One-time cleanup, ${escape(summary.cleanupDuration)}</span></div>
<div class="card kpi"><b style="color:var(--accent-text)">${summary.score}/100</b><span>Design system maturity: ${summary.grade}, ${escape(summary.maturity)}</span></div>
</section>

<section class="card"><h3>What you have vs. what you need</h3>
<p class="muted small">Redundant styles and variants in use today, the leaner set a design system needs, and what the excess costs each year.</p>
${
  summary.consolidation.length
    ? `<table style="margin-top:8px"><tr><th>STYLE</th><th class="num">IN USE</th><th class="num">NEEDED</th><th>REDUCTION</th><th class="num">COST / YEAR</th></tr>${consolidationRows}
<tr><td><b>Total</b></td><td class="num"><b>${totals.current}</b></td><td class="num need">${totals.recommended}</td><td class="muted small">${totals.reduction}% fewer styles overall</td>
<td class="num"><b>${money(summary.consolidation.reduce((n, r) => n + r.annualCost, 0))}</b></td></tr></table>`
    : '<p class="muted" style="margin-top:8px">No redundant values found. Every style family is within a healthy range.</p>'
}
${
  retheme.literals
    ? `<p class="note small muted">Rebrand or dark-mode effort: today ${retheme.literals.toLocaleString('en-US')} hard-coded values must each be found and edited (~${retheme.hoursToday}h per change). As tokens, that is ${retheme.distinctValues.toLocaleString('en-US')} edits in one place (~${retheme.hoursWithTokens}h).</p>`
    : ''
}</section>

<section class="grid4">${summary.facts.map((f) => `<div class="card kpi"><b>${escape(f.value)}</b><span>${escape(f.label)}</span></div>`).join('')}</section>

${
  summary.priorities.length
    ? `<h2 class="page-break">Where to start</h2><p class="muted small">The three changes with the most impact for the effort, in order.</p>
${summary.priorities
  .map(
    (p, i) => `<section class="card priority"><span class="n">${i + 1}</span><div><h3>${escape(p.title)}</h3><p class="muted">${escape(p.why)}</p>
<p class="small muted" style="margin-top:4px">How: ${escape(p.fix)}</p></div><span class="pill ${p.severity}">~${p.effortHours}h</span></section>`,
  )
  .join('')}`
    : ''
}

<h2>Where you stand</h2><p class="muted small">Overall ${summary.score}/100 (${summary.grade}, ${escape(summary.maturity)}). Each area is scored 0 to 100 from what the product actually renders.</p>
<section class="card"><table>${summary.areas
    .map(
      (a) => `<tr><td style="width:150px"><b>${escape(a.label)}</b></td><td style="width:110px"><span class="pill ${a.status}">${STATUS_LABELS[a.status]}</span> <span class="faint small">${a.score}</span></td>
<td class="muted small">${escape(a.impact)}</td></tr>`,
    )
    .join('')}</table></section>

${
  summary.plan.length
    ? `<h2 class="page-break">Recommended plan</h2><p class="muted small">Three phases, each shippable on its own. Timelines assume one person on the work; a pair halves them.</p>
${summary.plan
  .map(
    (phase, i) => `<section class="card phase"><div><div class="eyebrow">PHASE ${i + 1}</div><h3>${escape(phase.name)}</h3><p class="muted">${escape(phase.outcome)}</p>
<ul>${phase.items.map((t) => `<li>${escape(t)}</li>`).join('')}</ul></div>
<div class="weeks"><b>~${phase.weeks} ${phase.weeks === 1 ? 'week' : 'weeks'}</b><span class="muted small">${phase.hours}h · ${money(phase.hours * assumptions.hourlyRate)}</span></div></section>`,
  )
  .join('')}`
    : ''
}

<section class="cta"><h3>${agency ? `How ${agency} can help` : 'How we can help'}</h3>
<p>${agency || 'We'} turn${agency ? 's' : ''} audits like this into a working design system: a token layer, a lean component library and the governance to keep it lean, delivered alongside your roadmap rather than instead of it. For ${escape(clientName)}, that means recovering an estimated ${money(savings.annualSavings)} of team time every year, a faster path to rebrands and dark mode, and a more consistent, accessible product.</p>
${branding.note.trim() ? `<p style="margin-top:8px">“${escape(branding.note.trim())}”</p>` : ''}
${contact ? `<p style="margin-top:10px"><b>${contact}</b></p>` : ''}</section>

${
  open.length
    ? `<h2>All findings</h2><p class="muted small">${open.length} issues found on the captured page, most severe first.</p><section class="card"><table>${open
        .map(
          (o) => `<tr><td style="width:70px"><span class="pill ${o.severity}">${o.severity}</span></td><td><b>${escape(o.title)}</b><div class="muted small">${escape(o.detail)} ${escape(o.fix)}</div></td>
<td class="num">~${o.effortHours}h</td></tr>`,
        )
        .join('')}</table></section>`
    : ''
}

<h2>Method and assumptions</h2>
<p class="muted small">The product was captured in the browser as a user sees it: ${snapshot.rendered.elements.length.toLocaleString('en-US')} elements and ${snapshot.authored.declarations.length.toLocaleString('en-US')} design declarations from its stylesheets, at ${snapshot.viewport.width}×${snapshot.viewport.height}. No source code was used. Costs are planning estimates: ${assumptions.contributors} people building UI at ${money(assumptions.hourlyRate)}/h; ~${assumptions.hoursPerExcessValue}h per person per year for each redundant style value and ~${assumptions.hoursPerExcessVariant}h for each redundant component variant; ~${assumptions.minutesPerLiteralEdit} minutes per hard-coded value per re-theme, ${assumptions.rethemesPerYear} a year; ${Math.round(assumptions.realisationRate * 100)}% counted as recoverable. Confidence: ${audit.analysis.confidence.level}. ${escape(audit.analysis.confidence.reasons.join(' '))}</p>

<footer>Design System Audit · ${escape(clientName)}${agency ? ` · Prepared by ${agency}` : ''}</footer>
</main></body></html>`;
}
