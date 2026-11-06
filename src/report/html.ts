/**
 * The client report as one HTML file: the web twin of the PDF, in the same
 * five parts (summary, foundations, components, accessibility, next steps),
 * with real screenshots of the elements embedded. Adapts to dark mode on
 * screen and prints on A4.
 */

import type { Audit } from '../audit';
import { replicaCss, type GalleryGroup } from '../insights/gallery';
import { healthReport, type HealthFinding, type Shot } from '../insights/health';
import { formatMoney } from '../savings';
import type { EvidenceShot } from '../shared/snapshot';
import { hasContact, type ClientReportOptions } from './branding';
import { formatDate } from './format';

export const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px}.tile{border-radius:8px;box-shadow:inset 0 0 0 1px var(--border);overflow:hidden}
.stage{display:grid;place-items:center;height:70px;padding:8px;background:#fff;border-bottom:1px solid var(--border)}.tmeta{padding:4px 8px}code{font-size:11.5px}
@media (max-width:640px){.grid2,.grid3,.stats{grid-template-columns:1fr}}
@media (max-width:640px){.grid4{grid-template-columns:repeat(2,1fr)}.cover{grid-template-columns:1fr}.shot{width:100%}}

.layers{display:grid;grid-template-columns:1.1fr 1fr 1fr 1fr;gap:8px}.score{font-size:40px;font-weight:700;letter-spacing:-.02em;line-height:1.1}.score small{font-size:13px;color:var(--text-2);font-weight:400}
.lscore{font-size:22px;font-weight:700}.bar{height:5px;border-radius:3px;background:var(--sunken);margin:8px 0;overflow:hidden}.bar i{display:block;height:100%;border-radius:3px}
.top3{display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:start}.shots{display:flex;gap:6px}.shotbox{flex:1;min-width:0}
.ev{display:grid;place-items:center;background:#fff;border-radius:6px;box-shadow:inset 0 0 0 1px var(--border);padding:5px;min-height:56px;overflow:hidden}.ev img{max-width:100%;max-height:120px;display:block}
.ev.bad{box-shadow:inset 0 0 0 1.5px var(--danger)}.cap{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:var(--text-2);margin-top:3px}.cap b{color:var(--danger)}
.pal{display:flex;flex-wrap:wrap;gap:8px}.sw2{width:44px;font-size:9.5px;color:var(--text-2);text-align:center;position:relative}.sw2 i{display:block;height:36px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);margin-bottom:3px}
.sw2 em{position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;font-style:normal;font-size:9px;font-weight:700;border-radius:8px;padding:0 4px}
.ramp td{vertical-align:middle}.ramp .ev{min-height:0;box-shadow:none;background:none;justify-items:start}.flag{color:var(--danger);font-weight:600;font-size:11.5px}.warn{color:var(--warning);font-weight:600;font-size:11.5px}
.ruler{display:grid;grid-template-columns:44px 1fr 40px;gap:4px 8px;align-items:center;font-size:11.5px}.ruler i{display:block;height:7px;border-radius:2px;background:var(--text)}.ruler .off{color:var(--danger);font-weight:600}.ruler .off+span i{background:var(--danger)}
.grid4c{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.grid3c{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
@media (max-width:640px){.layers,.grid4c,.grid3c{grid-template-columns:repeat(2,1fr)}.top3{grid-template-columns:1fr}}
@media print{@page{size:A4;margin:14mm}body{font-size:11px}main{padding:0;max-width:none}.card{break-inside:avoid}.break{break-before:page}}
`;

const PART = (n: number, title: string, intro: string, layer?: { score: number; level: string }) =>
  `<p class="part break">${n} of 5${layer ? ` · <span class="dot ${dot(layer.score)}">${layer.score}/100 · ${escape(layer.level)}</span>` : ''}</p><h2>${escape(title)}</h2><p class="muted">${escape(intro)}</p>`;

function dot(score: number): string {
  return score >= 80 ? 'strong' : score >= 35 ? 'needs-work' : 'at-risk';
}

function barColour(score: number): string {
  return score >= 80 ? 'var(--success)' : score >= 60 ? '#3b82f6' : score >= 35 ? 'var(--warning)' : 'var(--danger)';
}

function img(shot: EvidenceShot | null, alt: string, bad = false): string {
  return `<div class="ev${bad ? ' bad' : ''}">${shot ? `<img src="${shot.src}" alt="${escape(alt)}" style="width:${Math.min(shot.w, 520)}px">` : ''}</div>`;
}

function shotHtml(s: Shot, alt: string): string {
  return `<div class="shotbox">${img(s.shot, alt, Boolean(s.flag))}<div class="cap"><span>${escape(s.caption)}</span>${s.flag ? `<b>${escape(s.flag)}</b>` : ''}</div></div>`;
}

const cssText = (css: Record<string, string>) => Object.entries(css).map(([k, v]) => `${k}:${escape(v)}`).join(';');

function findingVisual(audit: Audit, f: HealthFinding): string {
  if (f.shots.length) return `<div class="shots">${f.shots.slice(0, 2).map((s) => shotHtml(s, f.point.affects)).join('')}</div>`;
  const e = f.point.evidence;
  if (f.point.id === 'tokens') {
    const share = Math.round((audit.analysis.tokens.coverage ?? 0) * 100);
    return `<div class="card" style="box-shadow:inset 0 0 0 1px var(--border)"><div class="score">${share}%</div><p class="small muted">of styling uses named tokens · ${audit.savings.retheme.literals.toLocaleString('en-US')} values typed by hand</p><div class="bar"><i style="width:${share}%;background:var(--success)"></i></div></div>`;
  }
  if (e.kind === 'colours') return e.groups.slice(0, 2).map((g) => `<div class="pal" style="margin-bottom:6px">${[g.main, ...g.copies].map((c, i) => `<div class="sw2"><i style="background:${escape(c)};${i ? 'box-shadow:inset 0 0 0 2px var(--danger)' : ''}"></i>${escape(c)}</div>`).join('')}</div>`).join('');
  if (e.kind === 'values') return `<div class="chips">${e.items.slice(0, 14).map((i) => `<span class="chip${i.flagged ? ' flag' : ''}">${escape(i.value)} ×${i.count}</span>`).join('')}</div>`;
  return '';
}

function componentsHtml(groups: GalleryGroup[]): string {
  if (groups.length === 0) return '<p class="muted">No element came in more than one style.</p>';
  return groups
    .map((g) => {
      const items = g.hasProblem ? g.items : g.items.slice(0, 4);
      const cls = g.kind === 'card' || g.kind === 'heading' ? 'grid3c' : 'grid4c';
      return `<section class="card"><header style="display:flex;justify-content:space-between;gap:12px"><h3>${escape(g.label)} · ${g.styles} styles, about ${g.needed} needed</h3><span class="dot ${g.hasProblem ? 'needs-work' : 'strong'}">${g.hasProblem ? 'Needs attention' : 'Consistent'}</span></header>
<p class="small muted">${escape(g.headline)}</p><div class="${cls}">${items
        .map((it) => {
          const visual = it.shot
            ? img(it.shot, `${g.label} style ${it.n}`, it.copyOf !== null)
            : `<div class="ev${it.copyOf !== null ? ' bad' : ''}"><span style="${cssText(replicaCss(g.kind, it.styles))};max-width:100%;overflow:hidden;text-overflow:ellipsis">${escape(it.label)}</span></div>`;
          return `<div>${visual}<div class="cap"><span>#${it.n} · used ${it.count}×</span>${it.copyOf !== null ? `<b>copy of #${it.copyOf}</b>` : it.rare ? '<span class="warn">used once</span>' : ''}</div></div>`;
        })
        .join('')}</div></section>`;
    })
    .join('');
}

export function auditToHtml(audit: Audit, options: ClientReportOptions): string {
  const { snapshot, assumptions: a } = audit;
  const { branding } = options;
  const r = healthReport(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const money = (n: number) => formatMoney(n, a.currency);
  const f = r.foundations;
  const layer = (k: string) => r.layers.find((x) => x.key === k)!;
  const tokens = (label: string) => {
    const share = f.tokens.find((t) => t.label === label)?.share;
    return share === null || share === undefined ? '' : ` · ${share}% through tokens`;
  };
  const contact = [branding.preparedBy, branding.email, branding.website].filter(Boolean).map(escape).join(' · ');
  const s = r.system;
  const steps = [...new Set([...r.quickWins.map((q) => q.opportunity.title), ...r.top.map((t) => t.point.fixTitle)])].slice(0, 5);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design system health check: ${escape(r.clientName)}</title><style>${STYLES}</style></head>
<body><main>
<div class="top">${escape(branding.agencyName)}<span>${escape(formatDate(snapshot.capturedAt))}</span></div>
<section class="cover"><div><h1>${escape(r.clientName)}</h1>
<p class="muted">Design system health check · ${r.pages.length === 1 ? escape(r.pages[0]!.url) : `${r.pages.length} pages: ${escape(r.pages.map((p) => p.name).join(', '))}`}</p>
${branding.note.trim() ? `<p style="margin-top:10px">${escape(branding.note.trim())}</p>` : ''}</div>
${snapshot.screenshot ? `<div class="shot"><img src="${snapshot.screenshot}" alt="The audited page"></div>` : ''}</section>

<section class="layers">
<div class="card"><span class="small muted">Design system health</span><div class="score">${r.overall.score}<small> /100</small></div><span class="dot ${dot(r.overall.score)}">${escape(r.overall.level)}</span>
<div class="bar"><i style="width:${r.overall.score}%;background:${barColour(r.overall.score)}"></i></div><span class="small faint">80+ is a mature system</span></div>
${r.layers
  .map(
    (l) => `<div class="card"><h3>${escape(l.label)}</h3><div class="lscore">${l.score} <span class="dot ${dot(l.score)}">${escape(l.level)}</span></div>
<div class="bar"><i style="width:${l.score}%;background:${barColour(l.score)}"></i></div><p class="small muted">${escape(l.summary)}</p></div>`,
  )
  .join('')}
</section>

<section class="card"><p><b>${
    r.money.yearlyCost > 0
      ? `We estimate inconsistency costs your team about ${money(r.money.yearlyCost)} a year (${r.money.yearlyHours.toLocaleString('en-US')} hours).`
      : `${escape(r.clientName)} is built consistently: there is little design debt to pay down.`
  }</b></p>${r.money.savedHours.likely ? `<p class="small muted">A design system would have saved about ${r.money.savedHours.likely} hours of work so far (likely ${r.money.savedHours.low} to ${r.money.savedHours.high}). Planning estimates for a team of ${a.contributors}.</p>` : ''}</section>

${
  r.top.length
    ? `<h2>Fix these three first</h2>${r.top
        .map(
          (t, i) => `<section class="card top3"><div>${findingVisual(audit, t)}</div><div><p class="small muted">${i + 1} · ${escape(layer(t.layer).label)} · ${escape(t.point.affects)}</p>
<h3 style="margin-top:2px">${escape(t.point.title)}</h3><p class="muted small" style="margin-top:4px">${escape(t.point.summary)}</p><p class="small" style="margin-top:6px"><b>Fix: ${escape(t.point.fixTitle)}.</b></p></div></section>`,
        )
        .join('')}`
    : ''
}

${PART(2, 'Foundations', `The token layer: the colours, text styles, spacing and shapes everything else is built from. ${layer('foundations').summary}`, layer('foundations'))}
<section class="card"><h3>Colour</h3><p class="small muted">${f.colours.total} colours in use${f.colours.copies ? `, ${f.colours.copies} of them near-copies nobody could tell apart` : ''}${tokens('Color')}.</p>
<div class="pal" style="margin-top:12px">${f.colours.palette.map((c) => `<div class="sw2"><i style="background:${escape(c.main)}"></i>${escape(c.main)}${c.copies.length ? `<em>+${c.copies.length}</em>` : ''}</div>`).join('')}</div>
${
  f.colours.palette.some((c) => c.copies.length)
    ? `<p class="label">Near-copies, and where they are used</p><table>${f.colours.palette
        .filter((c) => c.copies.length)
        .slice(0, 5)
        .map(
          (c) => `<tr><td style="width:120px"><span class="sw"><i style="background:${escape(c.main)}"></i>${escape(c.main)} (keep)</span></td><td>${c.copies
            .map((x) => `<span class="sw"><i style="background:${escape(x.hex)};box-shadow:inset 0 0 0 2px var(--danger)"></i>${escape(x.hex)}</span>${x.shot ? `<img src="${x.shot.src}" alt="Where ${escape(x.hex)} is used" style="height:28px;vertical-align:middle;margin-right:12px;border-radius:4px;box-shadow:0 0 0 1px var(--border)">` : ''}`)
            .join('')}</td></tr>`,
        )
        .join('')}</table>`
    : ''
}</section>
${
  f.type.steps.length
    ? `<section class="card tablecard"><div style="padding:16px 18px 4px"><h3>Typography</h3><p class="small muted">${f.type.steps.length} text sizes${f.type.families.length ? ` in ${escape(f.type.families.slice(0, 3).join(', '))}` : ''}${f.type.scaleNote ? `; ${escape(f.type.scaleNote)}` : ''}${tokens('Typography')}.</p></div>
<table class="ramp">${f.type.steps
        .slice(0, 14)
        .map(
          (t) => `<tr><td style="width:56px"><b>${t.px}px</b></td><td class="small muted" style="width:40px">${t.count}×</td><td>${t.shot ? img(t.shot, `Text at ${t.px}px`) : `<span style="font-size:${Math.min(t.px, 32)}px">The quick brown fox</span>`}</td>
<td class="num">${t.nearCopyOf ? `<span class="flag">≈ ${t.nearCopyOf}px, near-copy</span>` : t.offScale ? '<span class="warn">off the scale</span>' : ''}</td></tr>`,
        )
        .join('')}</table></section>`
    : ''
}
${
  f.spacing.values.length
    ? `<section class="card"><h3>Spacing</h3><p class="small muted">${Math.round(f.spacing.fit * 100)}% of uses follow a ${f.spacing.base}px grid${tokens('Spacing')}. Red values are off the grid.</p>
<div class="ruler" style="margin-top:10px">${f.spacing.values
        .filter((v) => v.px <= 64)
        .map((v) => `<span class="${v.onGrid ? '' : 'off'}">${v.px}px</span><span><i style="width:${Math.max(2, v.px * 3)}px"></i></span><span class="val">${v.count}×</span>`)
        .join('')}</div></section>`
    : ''
}
<section class="grid2"><div class="card"><h3>Shape & depth</h3><p class="small muted">${f.radii.length} corner styles${f.shadows.distinct ? `, ${f.shadows.distinct} shadows (about ${f.shadows.needed} would do)` : ''}.</p>
<div class="chips">${f.radii.map((x) => `<span style="display:inline-grid;place-items:center;width:44px;height:28px;border:1.5px solid var(--text);border-radius:${x.value === 'full' ? '14px' : escape(x.value)}" title="${x.count}×"></span><span class="small muted">${escape(x.value)} · ${x.count}×</span>`).join('')}</div></div>
<div class="card"><h3>Managed with tokens</h3><p class="small muted">Named tokens change everywhere in one edit.</p><div class="bars">${f.tokens
    .filter((t) => t.share !== null)
    .map((t) => `<span>${escape(t.label)}</span><span class="track"><i style="width:${Math.max(3, t.share!)}%;background:${barColour(t.share!)}"></i></span><span class="val">${t.share}%</span>`)
    .join('')}</div></div></section>

${PART(3, 'Components', `The building blocks. Every style we found, photographed from your pages and numbered; near-copies and one-offs are marked. ${layer('components').summary}`, layer('components'))}
${componentsHtml(r.components)}

${PART(4, 'Accessibility', `${r.accessibility.report.headline} Each check maps to a WCAG success criterion; the failing elements are shown below.`, layer('accessibility'))}
<section class="card tablecard"><table><tr><th>Check</th><th>WCAG</th><th>Who it affects</th><th>Result</th></tr>${r.accessibility.report.checks
  .filter((c) => c.status !== 'not-applicable')
  .map(
    (c) => `<tr><td><b>${escape(c.name)}</b></td><td class="muted">${c.sc} (${c.level}${c.version === '2.2' ? ', 2.2' : ''})</td><td class="small muted">${escape(c.impact)}</td>
<td>${c.status === 'fail' ? `<span class="dot at-risk">Fails: ${c.failed} of ${c.checked}</span>` : '<span class="dot strong">Passes</span>'}</td></tr>`,
  )
  .join('')}</table></section>
${r.accessibility.examples.map((e) => `<section class="card"><h3>${escape(e.title)}</h3><div class="grid4c">${e.shots.slice(0, 4).map((x) => shotHtml(x, e.title)).join('')}</div></section>`).join('')}
<p class="small muted">${r.accessibility.uncheckedText ? `${r.accessibility.uncheckedText} more pieces of text looked unreadable in the code but sit on images or panels we couldn't confirm on screen, so we left them out. ` : ''}${escape(r.accessibility.report.regulation)} Needs a manual review: ${escape(r.accessibility.report.manual.join('; '))}.</p>

${PART(5, 'Your design system, extracted', `We turned the ${s.before} values your product uses today into ${s.after} named tokens, built from your own colours, sizes and spacing. Reply and we'll send it as a ready-to-use file (CSS variables and design-token JSON).`)}
<section class="card"><h3>Colour tokens</h3><div class="pal" style="margin-top:10px">${s.tokens
  .filter((t) => t.category === 'color' && !t.alias)
  .map((t) => `<div class="sw2" style="width:84px"><i style="background:${escape(t.value)}"></i><b style="color:var(--text)">${escape(t.name.replace('color-', ''))}</b><br>${escape(t.value)}</div>`)
  .join('')}</div></section>
<section class="card">${s.groups
  .filter((g) => ['font-size', 'font-weight', 'spacing', 'radius'].includes(g.category))
  .map((g) => `<p class="label">${escape(g.label)}</p><p class="small muted">${g.tokens.map((t) => `<code>--${escape(t.name)}</code> ${escape(t.value)}`).join(' · ')}</p>`)
  .join('')}</section>
${steps.length ? `<h2>What we would do first</h2><section class="card"><ol style="margin:0;padding-left:18px">${steps.map((x) => `<li style="margin:4px 0">${escape(x)}</li>`).join('')}</ol></section>` : ''}
<section class="card"><h3>How ${branding.agencyName ? escape(branding.agencyName) : 'we'} can help</h3><p class="muted" style="margin-top:4px">We help product teams turn findings like these into a working design system: a small set of named colours, text styles and spacing, and components that get reused rather than rebuilt. Happy to walk your team through this report, with no obligation.</p>
${hasContact(branding) ? `<p style="margin-top:8px"><b>${contact}</b></p>` : ''}</section>
<p class="small faint">How we worked this out: we opened ${r.pages.length === 1 ? 'your page' : `${r.pages.length} of your pages`} in a normal browser and measured ${snapshot.rendered.elements.length.toLocaleString('en-US')} visible elements and ${snapshot.authored.declarations.length.toLocaleString('en-US')} styling rules; every picture is a screenshot of your live pages. Money figures are planning estimates for a team of about ${a.contributors} at ${money(a.hourlyRate)} an hour, not invoices. Pages: ${escape(r.pages.map((p) => p.url).join(', '))}.</p>
<footer>${escape(r.clientName)} · Design system health check</footer>
</main></body></html>`;
}
