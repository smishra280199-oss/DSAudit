/**
 * The client report as one HTML file: the web twin of the PDF, in the same
 * five parts (summary, foundations, components, accessibility, next steps),
 * with real screenshots of the elements embedded. Adapts to dark mode on
 * screen and prints on A4.
 */

import type { Audit } from '../audit';
import { replicaCss, type GalleryGroup } from '../insights/gallery';
import { healthReport, type HealthFinding, type Shot } from '../insights/health';
import { tokenLabel, type ValueRow } from '../insights/foundation-detail';
import { formatMoney } from '../savings';
import type { EvidenceShot } from '../shared/snapshot';
import { bookingHref, displayUrl, hasContact, type ClientReportOptions } from './branding';
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
  `<p class="part break">${n} of 7${layer ? ` · <span class="dot ${dot(layer.score)}">${layer.score}/100 · ${escape(layer.level)}</span>` : ''}</p><h2>${escape(title)}</h2><p class="muted">${escape(intro)}</p>`;

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
      return `<section class="card"><header style="display:flex;justify-content:space-between;gap:12px"><h3>${escape(g.label)} · ${g.styles} ${g.styles === 1 ? 'style' : 'styles'}, about ${g.needed} needed</h3><span class="dot ${g.hasProblem ? 'needs-work' : 'strong'}">${g.hasProblem ? 'Needs attention' : 'Consistent'}</span></header>
<p class="small muted">${escape(g.headline)}</p><div class="${cls}">${items
        .map((it) => {
          const visual = it.shot
            ? img(it.shot, `${g.label} style ${it.n}`, it.copyOf !== null)
            : `<div class="ev${it.copyOf !== null ? ' bad' : ''}"><span style="${cssText(replicaCss(g.kind, it.styles))};max-width:100%;overflow:hidden;text-overflow:ellipsis">${escape(it.label)}</span></div>`;
          const below = [it.diff.join('; '), it.page ?? ''].filter(Boolean).join(' · ');
          return `<div>${visual}<div class="cap"><span>#${it.n} · used ${it.count}×</span>${it.copyOf !== null ? `<b>copy of #${it.copyOf}</b>` : it.rare ? '<span class="warn">used once</span>' : ''}</div>${below ? `<div class="small ${it.copyOf !== null ? 'flag' : 'faint'}" style="font-size:10.5px">${escape(below)}</div>` : ''}</div>`;
        })
        .join('')}</div></section>`;
    })
    .join('');
}

const TONE_CSS = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' } as const;

function valueTableHtml(rows: ValueRow[], value: (r: ValueRow) => string): string {
  return `<section class="card tablecard"><table><tr><th>Value</th><th class="num">Uses</th><th>Where it is used (real elements)</th><th>Token</th></tr>${rows
    .map((r) => {
      const t = tokenLabel(r.token);
      return `<tr${r.flag === 'ok' ? '' : ' style="box-shadow:inset 3px 0 0 var(--danger)"'}><td>${value(r)}</td><td class="num"><b>${r.count}×</b></td>
<td><div class="shots" style="max-width:300px">${r.examples.map((e) => `<div class="shotbox">${img(e.shot, e.label)}</div>`).join('') || '<span class="faint small">no screenshot</span>'}</div></td>
<td class="small">${r.note ? `<div class="${r.flag === 'near-copy' ? 'flag' : 'warn'}">${escape(r.note)}</div>` : ''}<div style="color:${TONE_CSS[t.tone]}">${escape(t.text)}</div></td></tr>`;
    })
    .join('')}</table></section>`;
}

export function auditToHtml(audit: Audit, options: ClientReportOptions): string {
  const { snapshot, assumptions: a } = audit;
  const { branding } = options;
  const r = healthReport(audit, { clientName: options.clientName, dismissed: options.dismissed });
  const money = (n: number) => formatMoney(n, a.currency);
  const f = r.foundations;
  const d = r.detail;
  const m = r.money;
  const layer = (k: string) => r.layers.find((x) => x.key === k)!;
  const contact = [branding.preparedBy, branding.email, branding.website].filter(Boolean).map(escape).join(' · ');
  const href = bookingHref(branding.bookingUrl);
  const cta = (headline: string) =>
    href
      ? `<section class="card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap"><div><h3>${escape(headline)}</h3><p class="small muted">We’ll go through these findings on your own screens, and what fixing them would take.</p></div>
<a href="${escape(href)}" style="background:#e600da;color:#fff;font-weight:600;padding:9px 16px;border-radius:999px;text-decoration:none;white-space:nowrap">Book a 20-minute walkthrough</a></section>`
      : '';
  const list = (items: string[], dotClass: string) => `<ul style="list-style:none;padding:0;margin:8px 0 0">${items.map((x) => `<li class="small" style="margin:5px 0"><span class="dot ${dotClass}"></span> ${escape(x)}</li>`).join('')}</ul>`;
  const block = (label: string, text: string) => `<tr><td class="small muted" style="width:110px"><b>${escape(label)}</b></td><td class="small">${escape(text)}</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design system health check: ${escape(r.clientName)}</title><style>${STYLES}
.money{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.money .card b{display:block;font-size:26px;letter-spacing:-.02em}.money .card span{font-size:12px;font-weight:600}
@media (max-width:640px){.money{grid-template-columns:1fr}}</style></head>
<body><main>
<div class="top">${escape(branding.agencyName)}<span>${escape(formatDate(snapshot.capturedAt))}</span></div>
<section class="cover"><div><h1>${escape(r.clientName)}</h1>
<p class="muted">Design system health check · ${r.pages.length === 1 ? escape(r.pages[0]!.url) : `${r.pages.length} pages`}</p>
${branding.note.trim() ? `<p style="margin-top:10px">${escape(branding.note.trim())}</p>` : ''}</div>
${snapshot.screenshot ? `<div class="shot"><img src="${snapshot.screenshot}" alt="The audited page"></div>` : ''}</section>

<section class="layers">
<div class="card"><span class="small muted">Design system health</span><div class="score">${r.overall.score}<small> /100</small></div><span class="dot ${dot(r.overall.score)}">${escape(r.overall.level)}</span>
<div class="bar"><i style="width:${r.overall.score}%;background:${barColour(r.overall.score)}"></i></div><span class="small faint">80+ is a mature system</span></div>
${r.layers.map((l) => `<div class="card"><h3>${escape(l.label)}</h3><div class="lscore">${l.score} <span class="dot ${dot(l.score)}">${escape(l.level)}</span></div><div class="bar"><i style="width:${l.score}%;background:${barColour(l.score)}"></i></div><p class="small muted">${escape(l.summary)}</p></div>`).join('')}
</section>
<section class="money">
<div class="card" style="background:#fdeafc"><b style="color:#c400b9">${m.savedHours.likely.toLocaleString('en-US')} h</b><span>of work a design system would have saved so far</span><p class="small muted">${money(m.savedCost)} · likely ${m.savedHours.low}–${m.savedHours.high} h</p></div>
<div class="card" style="background:#fdeeee"><b style="color:var(--danger)">${money(m.yearlyCost)}</b><span>estimated yearly cost of inconsistency</span><p class="small muted">${m.yearlyHours.toLocaleString('en-US')} h of team time a year</p></div>
<div class="card" style="background:#e8f8eb"><b style="color:var(--success)">${money(m.recoverable)}</b><span>potential yearly savings with better design-system adoption</span><p class="small muted">${m.recoverableHours.toLocaleString('en-US')} h a year back</p></div>
</section>
<p class="small faint">Planning estimates, not measured savings: built from what we measured on your pages and a team of ${a.contributors} at ${money(a.hourlyRate)} an hour.</p>
<section class="card"><h3>What we found</h3>${list(r.keyFindings, 'muted')}<h3 style="margin-top:14px">Fix these three first</h3><ol style="margin:6px 0 0;padding-left:18px">${r.top.map((t) => `<li style="margin:6px 0"><b>${escape(t.point.fixTitle)}.</b> <span class="small muted">${escape(t.point.title)}</span></li>`).join('')}</ol></section>

${PART(2, 'What we looked at', 'We opened your product in a normal browser, the way your customers see it, and measured how it is built. No access to your code, files or team was needed.')}
<section class="grid4"><div class="card tile"><b>${r.scan.pages}</b><span>${r.scan.pages === 1 ? 'page' : 'pages'} scanned</span></div><div class="card tile"><b>${r.scan.elements.toLocaleString('en-US')}</b><span>visible elements measured</span></div>
<div class="card tile"><b>${r.scan.rules.toLocaleString('en-US')}</b><span>styling rules read</span></div><div class="card tile"><b>${r.scan.screenshots}</b><span>elements photographed as evidence</span></div></section>
<section class="card"><p class="label" style="margin-top:0">Pages</p>${r.pages.map((p) => `<p class="small muted">${escape(p.name)} · ${escape(p.url)}</p>`).join('')}</section>
<section class="card tablecard"><table><tr><th>What we evaluated</th><th>Result</th></tr>
<tr><td><b>Foundations</b><div class="small muted">Colours, text styles, spacing and corner shapes: how many, whether they follow a system, whether they come from design tokens.</div><div class="small">${escape(layer('foundations').summary)}</div></td><td><span class="dot ${dot(layer('foundations').score)}">${layer('foundations').score}/100 · ${escape(layer('foundations').level)}</span></td></tr>
<tr><td><b>Components</b><div class="small muted">Buttons, icon buttons, tabs, links, inputs, badges, cards and headings: how many styles of each, and which are near-copies.</div><div class="small">${escape(layer('components').summary)}</div></td><td><span class="dot ${dot(layer('components').score)}">${layer('components').score}/100 · ${escape(layer('components').level)}</span></td></tr>
<tr><td><b>Accessibility</b><div class="small muted">Six automated WCAG checks: contrast, keyboard focus, named buttons, form labels, image descriptions and tap-target size.</div><div class="small">${escape(layer('accessibility').summary)}</div></td><td><span class="dot ${dot(layer('accessibility').score)}">${layer('accessibility').score}/100 · ${escape(layer('accessibility').level)}</span></td></tr></table></section>
<section class="grid2"><div class="card"><h3>What’s working well</h3>${list(r.working.length ? r.working : ['Nothing stands out yet.'], 'strong')}</div><div class="card"><h3>Where the gaps are</h3>${list(r.gaps.length ? r.gaps : ['No major gaps.'], 'needs-work')}</div></section>

${
  r.top.length
    ? `${PART(3, 'Fix these three first', 'The three changes with the most effect for the effort: what is wrong, where it happens, why it matters and what to do.')}
${r.top
  .map(
    (t, i) => `<section class="card"><p class="small muted">${i + 1} · ${escape(layer(t.layer).label)} · ${escape(t.point.affects)}</p><h3 style="font-size:16px;margin:2px 0 10px">${escape(t.point.title)}</h3>
<div style="margin-bottom:10px">${t.shots.length ? `<div class="grid4c" style="margin-top:0">${t.shots.slice(0, 4).map((x) => shotHtml(x, t.point.affects)).join('')}</div>` : findingVisual(audit, t)}</div>
<table>${block('What’s wrong', t.point.story)}${t.details.length ? block('Where', t.details.join(' ')) : ''}${block('Why it matters', t.point.why)}${block('How to fix it', t.point.suggestion)}</table></section>`,
  )
  .join('')}`
    : ''
}

${cta('Want to see this on your own screens?')}

${PART(4, 'Foundations', `Colours, text styles, spacing and shapes, value by value, with real examples from your pages and whether each maps to a design token. Rows marked on the left need attention. ${layer('foundations').summary}`, layer('foundations'))}
<p class="small muted">Token column: “Token” means the value already comes from a design token; “Typed by hand” means a token exists but this place types the raw value; “No token” suggests a semantic token (its job) → a primitive token (the raw step).</p>
${d.colours.length ? `<h3 style="margin-top:14px">Colour</h3><p class="small muted">${f.colours.total} colours in use${f.colours.copies ? `, ${f.colours.copies} of them near-copies` : ''}.</p>${valueTableHtml(d.colours, (x) => `<span class="sw"><i style="background:${escape(x.value)}"></i><b style="color:var(--text)">${escape(x.value)}</b></span><div class="small faint">${escape(x.role ?? '')}${(x.alpha ?? 1) < 1 ? ` · ${Math.round((x.alpha ?? 1) * 100)}% opacity` : ''}</div>`)}` : ''}
${d.textStyles.length ? `<h3 style="margin-top:14px">Typography</h3><p class="small muted">${d.textStyles.length} text styles (font, size/line height, weight).</p>${valueTableHtml(d.textStyles, (x) => `<b>${escape(x.value)}</b>`)}` : ''}
${d.spacing.length ? `<h3 style="margin-top:14px">Spacing</h3><p class="small muted">${Math.round(f.spacing.fit * 100)}% of uses follow a ${f.spacing.base}px grid.</p>${valueTableHtml(d.spacing, (x) => `<b class="${x.flag === 'ok' ? '' : 'flag'}">${escape(x.value)}</b>`)}` : ''}
${d.radii.length ? `<h3 style="margin-top:14px">Shape</h3><p class="small muted">Corner radius${f.shadows.distinct ? `; plus ${f.shadows.distinct} shadows (about ${f.shadows.needed} would do)` : ''}.</p>${valueTableHtml(d.radii, (x) => `<span style="display:inline-block;width:30px;height:20px;border:1.5px solid var(--text);border-radius:${x.value === 'fully round' ? '10px' : escape(x.value)};vertical-align:middle"></span> <b>${escape(x.value)}</b>`)}` : ''}

${PART(5, 'Components', `Every style we found, photographed from your pages and numbered; near-copies show exactly what differs. ${layer('components').summary}`, layer('components'))}
${componentsHtml(r.components)}

${PART(6, 'Accessibility', `${r.accessibility.report.headline} Each check maps to a WCAG success criterion; the failing elements are shown below.`, layer('accessibility'))}
<section class="card tablecard"><table><tr><th>Check</th><th>WCAG</th><th>Who it affects</th><th>Result</th></tr>${r.accessibility.report.checks
    .filter((c) => c.status !== 'not-applicable')
    .map((c) => `<tr><td><b>${escape(c.name)}</b></td><td class="muted">${c.sc} (${c.level}${c.version === '2.2' ? ', 2.2' : ''})</td><td class="small muted">${escape(c.impact)}</td><td>${c.status === 'fail' ? `<span class="dot at-risk">Fails: ${c.failed} of ${c.checked}</span>` : '<span class="dot strong">Passes</span>'}</td></tr>`)
    .join('')}</table></section>
${r.accessibility.examples.map((e) => `<section class="card"><h3>${escape(e.title)}</h3><div class="grid4c">${e.shots.slice(0, 4).map((x) => shotHtml(x, e.title)).join('')}</div></section>`).join('')}
<p class="small muted">${r.accessibility.uncheckedText ? `${r.accessibility.uncheckedText} more pieces of text looked unreadable in the code but sit on images or panels we couldn't confirm on screen, so we left them out. ` : ''}${escape(r.accessibility.report.regulation)} Needs a manual review: ${escape(r.accessibility.report.manual.join('; '))}.</p>

${PART(7, 'Where a design system helps', 'What is already working, where the gaps are, and what a design system would change for your team.')}
<section class="grid2"><div class="card"><h3>What’s working well</h3>${list(r.working, 'strong')}</div><div class="card"><h3>Where the gaps are</h3>${list(r.gaps, 'needs-work')}</div></section>
<section class="card"><h3>Opportunities to improve consistency</h3>${list(r.opportunities, 'muted')}</section>
<section class="card"><h3>How a design system helps your team</h3>${list(r.outcomes, 'strong')}</section>
<section class="card"><h3>Your starter design system</h3><p class="small muted">We turned the ${r.system.before} values in use today into ${r.system.after} named tokens, built from your own colours, sizes and spacing. Reply and we’ll send it as a ready-to-use file (CSS variables and design-token JSON).</p>
<div class="pal" style="margin-top:10px">${r.system.tokens
    .filter((t) => t.category === 'color' && !t.alias)
    .map((t) => `<div class="sw2" style="width:84px"><i style="background:${escape(t.value)}"></i><b style="color:var(--text)">${escape(t.name.replace('color-', ''))}</b><br>${escape(t.value)}</div>`)
    .join('')}</div></section>
<section class="card"><h3>How ${branding.agencyName ? escape(branding.agencyName) : 'we'} can help</h3><p class="muted" style="margin-top:4px">We help product teams turn findings like these into a working design system: a small set of named colours, text styles and spacing, and components that get reused rather than rebuilt. Happy to walk your team through this report, with no obligation.</p>
${hasContact(branding) ? `<p style="margin-top:8px"><b>${contact}</b></p>` : ''}${href ? `<p style="margin-top:10px"><a href="${escape(href)}" style="background:#e600da;color:#fff;font-weight:600;padding:8px 14px;border-radius:999px;text-decoration:none">Book a 20-minute walkthrough</a> <span class="small muted">${escape(displayUrl(href))}</span></p>` : ''}</section>
<p class="small faint">How we worked this out: we opened ${r.pages.length === 1 ? 'your page' : `${r.pages.length} of your pages`} in a normal browser and measured ${snapshot.rendered.elements.length.toLocaleString('en-US')} visible elements and ${snapshot.authored.declarations.length.toLocaleString('en-US')} styling rules; every picture is a screenshot of your live pages. Money figures are planning estimates for a team of about ${a.contributors} at ${money(a.hourlyRate)} an hour, not invoices. Pages: ${escape(r.pages.map((p) => p.url).join(', '))}.</p>
<footer>${escape(r.clientName)} · Design system health check</footer>
</main></body></html>`;
}
