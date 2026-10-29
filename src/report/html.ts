/**
 * A standalone HTML report in the panel's visual language: grey canvas,
 * white hairline cards, compact type and the magenta accent. It adapts to
 * dark mode like the panel. Everything is inline so the file can be shared.
 */

import type { Audit } from '../audit';
import { formatMoney } from '../savings';
import type { AreaScore } from '../scoring';
import { formatDate, hostOf, percent } from './format';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLES = `
:root{--canvas:#f6f6f6;--surface:#fff;--subtle:#fafafa;--sunken:#f1f1f1;--border:#ebebeb;--text:#171717;--text-2:#6b6b6b;--text-3:#a3a3a3;
--accent-top:#ff52f6;--accent-bottom:#df00d4;--accent-text:#cc00c2;--accent-soft:#fdeafc;--danger:#e5484d;--danger-soft:#fdeeee;
--warning:#e29a12;--warning-soft:#fdf4e3;--success:#2fb344;--success-soft:#e8f8eb;
--shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.04);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--canvas:#0e0e0e;--surface:#191919;--subtle:#151515;--sunken:#121212;--border:#262626;--text:#ededed;
--text-2:#a1a1a1;--text-3:#6e6e6e;--accent-text:#ff5cf7;--accent-soft:rgba(235,0,223,.16);--danger-soft:rgba(229,72,77,.16);
--warning-soft:rgba(226,154,18,.16);--success-soft:rgba(47,179,68,.16);--shadow:0 0 0 1px rgba(255,255,255,.04),0 1px 2px rgba(0,0,0,.4);color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:13px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:880px;margin:0 auto;padding:40px 24px 64px;display:grid;gap:16px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:8px}
h1{font-size:20px;font-weight:600;margin:0}h2{font-size:13px;font-weight:600;margin:0 0 12px}
.sub{color:var(--text-2);margin:2px 0 0}.mono{font:12px ui-monospace,"SF Mono",Menlo,monospace}
.card{background:var(--surface);border-radius:12px;box-shadow:var(--shadow);padding:16px 20px}
.score{display:flex;gap:24px;align-items:center;flex-wrap:wrap}.big{font-size:44px;font-weight:600;letter-spacing:-.02em;line-height:1}
.badge{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:6px;font-size:11px;font-weight:500;background:var(--sunken);color:var(--text-2);box-shadow:inset 0 0 0 1px var(--border)}
.accent{background:var(--accent-soft);color:var(--accent-text);box-shadow:none}.high{background:var(--danger-soft);color:var(--danger);box-shadow:none}
.medium{background:var(--warning-soft);color:var(--warning);box-shadow:none}.low{background:var(--sunken)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.stat{background:var(--subtle);border-radius:8px;box-shadow:inset 0 0 0 1px var(--border);padding:10px 12px}.stat b{display:block;font-size:18px;font-weight:600}.stat span{color:var(--text-2);font-size:12px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:9px 4px;border-bottom:1px solid var(--border);vertical-align:top}th{font-weight:500;color:var(--text-3);font-size:11px}
tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.meter{height:4px;border-radius:99px;background:var(--sunken);overflow:hidden;min-width:80px;margin-top:7px}.meter i{display:block;height:100%;border-radius:inherit}
.muted{color:var(--text-2)}.swatches{display:flex;flex-wrap:wrap;gap:6px}.sw{width:28px;height:28px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
ul{margin:0;padding-left:18px}footer{color:var(--text-3);font-size:11px;text-align:center}
`;

function meterColor(score: number): string {
  return score >= 70 ? 'var(--success)' : score >= 45 ? 'var(--warning)' : 'var(--danger)';
}

function areaRow(area: AreaScore): string {
  return `<tr><td>${escape(area.label)}<div class="muted">${escape(area.notes.slice(0, 2).join(' · '))}</div></td>
<td style="width:30%"><div class="meter"><i style="width:${area.score}%;background:${meterColor(area.score)}"></i></div></td>
<td class="num">${area.score}</td></tr>`;
}

export function auditToHtml({ snapshot, analysis, score, savings, assumptions }: Audit): string {
  const money = (n: number) => formatMoney(n, assumptions.currency);
  const title = snapshot.title || hostOf(snapshot.url);
  const palette = (analysis.foundations.color.palette ?? []).slice(0, 40);
  const opportunities = analysis.opportunities;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>System Audit: ${escape(title)}</title><style>${STYLES}</style></head>
<body><main>
<header><div><h1>System Audit</h1><p class="sub">${escape(title)} · <span class="mono">${escape(snapshot.url)}</span></p></div>
<p class="sub">${escape(formatDate(snapshot.capturedAt))} · ${snapshot.viewport.width}×${snapshot.viewport.height}</p></header>

<section class="card score"><div class="big">${score.overall}</div>
<div><span class="badge accent">${score.grade} · ${escape(score.maturity)}</span>
<p class="sub">Confidence ${analysis.confidence.level}. ${snapshot.rendered.elements.length.toLocaleString()} elements, ${snapshot.authored.declarations.length.toLocaleString()} design declarations, ${analysis.tokens.definedCount} tokens.</p></div></section>

<section class="card"><h2>Areas</h2><table>${score.areas.filter((a) => a.applicable).map(areaRow).join('')}</table></section>

<section class="card"><h2>Palette</h2><div class="swatches">${palette
    .map((c) => `<div class="sw" style="background:${c.hex}" title="${c.hex} · ${c.count} uses"></div>`)
    .join('')}</div></section>

<section class="card"><h2>Opportunities</h2>${
    opportunities.length === 0
      ? '<p class="muted">Nothing stands out. This page is built consistently.</p>'
      : `<table><tr><th>Opportunity</th><th>Severity</th><th class="num">Effort</th></tr>${opportunities
          .map(
            (o) => `<tr><td><b>${escape(o.title)}</b><div class="muted">${escape(o.detail)} ${escape(o.fix)}</div></td>
<td><span class="badge ${o.severity}">${o.severity}</span></td><td class="num">~${o.effortHours}h</td></tr>`,
          )
          .join('')}</table>`
  }</section>

<section class="card"><h2>Savings · planning estimate</h2><div class="grid">
<div class="stat"><b>${money(savings.annualSavings)}</b><span>recoverable per year (~${savings.annualSavingsHours}h)</span></div>
<div class="stat"><b>${money(savings.cleanupCost)}</b><span>one-time cleanup (~${savings.cleanupHours}h)</span></div>
<div class="stat"><b>${savings.paybackMonths === null ? '—' : `${savings.paybackMonths} mo`}</b><span>payback</span></div>
<div class="stat"><b>${percent(analysis.tokens.coverage)}</b><span>token coverage</span></div></div>
<p class="sub">Assumes ${assumptions.contributors} UI contributors at ${money(assumptions.hourlyRate)}/h, ${assumptions.hoursPerExcessValue}h per redundant value and ${assumptions.hoursPerExcessVariant}h per redundant variant per person per year, ${Math.round(assumptions.realisationRate * 100)}% realised.</p></section>

${
  analysis.confidence.reasons.length
    ? `<section class="card"><h2>Limits of this capture</h2><ul>${analysis.confidence.reasons.map((r) => `<li>${escape(r)}</li>`).join('')}</ul></section>`
    : ''
}
<footer>Generated by System Audit (dslint). Scores are heuristics; savings are planning estimates.</footer>
</main></body></html>`;
}
