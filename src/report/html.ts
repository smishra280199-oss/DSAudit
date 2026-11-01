/**
 * The client report as a single HTML file: the web twin of the PDF (summary
 * dashboard, then problems, fixes and what's working well), built
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

export const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PRIORITY: Record<Severity, { label: string; dot: string }> = {
  high: { label: 'High priority', dot: 'at-risk' },
  medium: { label: 'Worth fixing', dot: 'needs-work' },
  low: { label: 'Nice to have', dot: 'muted' },
};

export const STYLES = `
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
table{width:100%;border-collapse:collapse}th{font-weight:400;color:var(--text-3);font-size:11.5px;text-align:left;padding:8px;white-space:nowrap;background:var(--canvas);border-bottom:1px solid var(--border)}
td{padding:9px 8px;border-bottom:1px solid var(--border);vertical-align:top}tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.tablecard{padding:0;overflow:hidden}.aa{display:inline-grid;place-items:center;width:30px;height:18px;border-radius:4px;font-weight:700;font-size:11px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
footer{color:var(--text-3);font-size:11px;text-align:center;margin-top:16px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bars{display:grid;grid-template-columns:auto 1fr auto;gap:8px 10px;align-items:center;margin-top:10px;font-size:12px}
.track{height:7px;border-radius:4px;background:var(--sunken);overflow:hidden;position:relative}.track i{position:absolute;inset:0 auto 0 0;border-radius:4px;background:var(--text)}
.track b{position:absolute;inset:0 auto 0 0;border-radius:4px;background:var(--border)}.val{color:var(--text-2);text-align:right;font-variant-numeric:tabular-nums}
.part{font-size:12px;color:var(--text-2);margin-top:36px}.part+h2{font-size:22px;margin-top:2px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.stats div{background:var(--canvas);border-radius:8px;box-shadow:inset 0 0 0 1px var(--border);padding:8px 10px}
.stats b{display:block;font-size:15px}.stats span{font-size:11px;color:var(--text-2)}
@media (max-width:640px){.grid2,.grid3,.stats{grid-template-columns:1fr}}
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

function problemHtml(p: PainPoint, index: number, money: (n: number) => string): string {
  const priority = PRIORITY[p.severity];
  const seen = p.where.length ? p.where.map((w) => w.charAt(0).toUpperCase() + w.slice(1)) : p.pages;
  return `<section class="card"><header style="display:flex;justify-content:space-between;gap:12px"><h3>${index}. ${escape(p.title)}</h3><span class="dot ${priority.dot}">${priority.label}</span></header>
<p class="muted">${escape(p.summary)}</p>
<div class="stats"><div><b>${p.count.toLocaleString('en-US')}</b><span>${escape(p.countLabel)}</span></div>
<div><b>${p.pages.length || '—'}</b><span>${p.pages.length === 1 ? 'page affected' : p.pages.length ? 'pages affected' : 'single page'}</span></div>
<div><b>${p.annualCost ? money(p.annualCost) : '—'}</b><span>${p.annualCost ? 'estimated cost a year' : 'risk rather than cost'}</span></div></div>
${evidenceHtml(p.evidence)}
${seen.length ? `<p class="label">Seen in</p><div class="chips">${seen.slice(0, 6).map((w) => `<span class="chip">${escape(w)}</span>`).join('')}</div>` : ''}
<details style="margin-top:10px"><summary class="small muted">More detail</summary><p class="small muted" style="margin-top:6px">${escape(p.story)}</p></details>
<p class="small muted" style="margin-top:8px">Why it matters: ${escape(p.why)}</p></section>`;
}

function bars(rows: { label: string; value: number; valueLabel: string; dot?: string }[], max: number): string {
  return `<div class="bars">${rows
    .map(
      (r) => `<span>${r.dot ? `<span class="dot ${r.dot}"></span> ` : ''}${escape(r.label)}</span><span class="track"><i style="width:${Math.max(3, (Math.min(r.value, max) / max) * 100)}%"></i></span><span class="val">${escape(r.valueLabel)}</span>`,
    )
    .join('')}</div>`;
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
  const costRows = summary.painPoints
    .filter((p) => p.annualCost)
    .sort((x, y) => (y.annualCost ?? 0) - (x.annualCost ?? 0))
    .slice(0, 7)
    .map((p) => ({ label: p.affects, value: p.annualCost!, valueLabel: short(p.annualCost!) }));

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
<div class="card tile"><b>${short(n.yearlyCost)}</b><span>Yearly cost of inconsistency (estimate)</span></div>
<div class="card tile"><b>${short(n.recoverable)}</b><span>Could be saved every year</span></div>
<div class="card tile"><b>${n.hoursLost}h</b><span>Team hours lost each year</span></div>
<div class="card tile"><b>${summary.score}/100</b><span>Consistency score (75+ is healthy)</span></div>
</section>
<section class="grid2">
<div class="card"><h3>Where the cost comes from</h3><p class="small muted">Estimated yearly cost, by problem</p>
${bars(costRows, Math.max(1, ...costRows.map((r) => r.value)))}</div>
<div class="card"><h3>Health by area</h3><p class="small muted">Score out of 100, weakest first. 75 and above is healthy.</p>
${bars([...summary.areas].sort((x, y) => x.score - y.score).map((ar) => ({ label: ar.label, value: ar.score, valueLabel: String(ar.score), dot: ar.status })), 100)}</div>
</section>
<p class="small muted">${escape(summary.scoreExplainer)}</p>

<p class="part">Part 1</p><h2>The problems</h2><p class="muted">Where each problem lives, how many places it shows up and what it is likely costing your team. Most important first.</p>
<section class="grid3">${summary.layers
  .map((ly) => `<div class="card tile"><span>${escape(ly.layer)}</span><b>${ly.problems === 1 ? '1 problem' : `${ly.problems} problems`}</b><span>${ly.problems ? `${ly.places.toLocaleString('en-US')} places · ${ly.annualCost ? `${money(ly.annualCost)}/yr` : 'risk, not cost'}` : 'Nothing to fix'}</span></div>`)
  .join('')}</section>
${
  summary.painPoints.length
    ? `<section class="card tablecard"><table><tr><th>#</th><th>Problem</th><th>Affects</th><th class="num">Places</th><th class="num">Cost a year</th><th>Priority</th></tr>${summary.painPoints
        .map(
          (p, i) => `<tr><td class="muted">${i + 1}</td><td><b>${escape(p.title)}</b></td><td class="muted">${escape(p.affects)}</td><td class="num">${p.count.toLocaleString('en-US')}</td>
<td class="num">${p.annualCost ? money(p.annualCost) : '<span class="faint">—</span>'}</td><td><span class="dot ${PRIORITY[p.severity].dot}">${PRIORITY[p.severity].label}</span></td></tr>`,
        )
        .join('')}</table></section>
${summary.painPoints.map((p, i) => problemHtml(p, i + 1, money)).join('')}`
    : '<p class="muted">We didn’t find any problems worth reporting.</p>'
}

${
  summary.fixes.length
    ? `<p class="part break">Part 2</p><h2>The fixes</h2><p class="muted">What we would do about each problem, and what each fix is realistically worth: about ${money(summary.fixes.reduce((t, f) => t + (f.annualSaving ?? 0), 0))} a year together. Numbers match the problems in Part 1.</p>
<section class="card tablecard"><table><tr><th>#</th><th>Fix</th><th class="num">Saves a year</th></tr>${summary.fixes
        .map((f) => `<tr><td class="muted">${f.problem}</td><td><b>${escape(f.title)}</b><div class="small muted">${escape(f.detail)}</div></td><td class="num">${f.annualSaving ? `<b>${money(f.annualSaving)}</b>` : '<span class="faint">—</span>'}</td></tr>`)
        .join('')}</table></section>
${
  summary.beforeAfter.length
    ? `<section class="card"><h3>After the cleanup</h3><p class="small muted">Distinct styles to maintain, today versus after the fixes. <span class="sw"><i style="background:var(--text)"></i>after cleanup</span><span class="sw"><i style="background:var(--border)"></i>removed</span></p>
<div class="bars">${summary.beforeAfter
        .map((r) => {
          const max = Math.max(...summary.beforeAfter.map((x) => x.today));
          return `<span>${escape(r.label)}</span><span class="track" style="background:none"><b style="width:${(r.today / max) * 100}%"></b><i style="width:${Math.max(3, (r.after / max) * 100)}%"></i></span><span class="val">${r.today} → ${r.after}</span>`;
        })
        .join('')}</div></section>`
    : ''
}`
    : ''
}

<p class="part break">Part 3</p><h2>What’s working well</h2><p class="muted">Parts of your product that are already consistent. Worth protecting as the product grows.</p>
${
  summary.strengths.length
    ? `<section class="grid2">${summary.strengths.map((st) => `<div class="card"><h3><span class="dot strong"></span> ${escape(st.title)}</h3><p class="small muted" style="margin-top:4px">${escape(st.detail)}</p></div>`).join('')}</section>`
    : ''
}
${
  summary.healthyMetrics.length
    ? `<section class="card tablecard"><table><tr><th>Building block</th><th>In use</th><th>Status</th></tr>${summary.healthyMetrics
        .map((m) => `<tr><td><b>${escape(m.label)}</b></td><td class="muted">${escape(m.found)}</td><td><span class="dot strong">${STATUS_LABELS[m.status]}</span></td></tr>`)
        .join('')}</table></section>`
    : ''
}
${summary.strengths.length + summary.healthyMetrics.length === 0 ? '<p class="muted">Every area has room to improve, which also means every fix above pays off quickly.</p>' : ''}

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
