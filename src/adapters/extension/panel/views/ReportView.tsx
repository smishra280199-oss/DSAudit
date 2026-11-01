/**
 * The Report tab: what you send, and how you send it.
 *
 *  - Executive summary: the business case on one screen, in the order a
 *    founder reads it: what a system would have saved, what drifting costs
 *    each year, what fixing it costs once, and where to start.
 *  - Detailed report: every opportunity as a ready-to-paste task.
 *  - Outreach: for the sender only. Is this prospect worth a message, which
 *    angle will land, and first drafts built from their own product.
 */

import { useMemo, useState } from 'react';
import { assumptionsLine, buildBusinessCase, consistencyLevel, type BusinessCase } from '../../../../business';
import { AUDIENCES, leadFit, outreachKit, sendChecklist, type Audience } from '../../../../business/outreach';
import { summarise } from '../../../../insights';
import type { ConfidenceLevel } from '../../../../inference/types';
import { detailedMarkdown, executiveMarkdown, impactFileName, onePagerHtml } from '../../../../report/business';
import { auditToJson } from '../../../../report/json';
import { CURRENCIES, formatMoney, formatMoneyShort, type EffortPerItem, type SavingsAssumptions } from '../../../../savings';
import {
  AlertIcon,
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  List,
  Menu,
  NumberField,
  Row,
  SectionLabel,
  Segmented,
  SparkleIcon,
  TextField,
  type Tone,
} from '../ui';
import { Stat, StatStrip } from '../components/Stat';
import { copyText, download } from '../export';
import { useNavigation, type ReportVersion } from '../navigation';
import { useAuditState, useController } from '../use-audit';

const CONFIDENCE_TONE: Record<ConfidenceLevel, Tone> = { high: 'success', medium: 'info', low: 'warning' };
const CONFIDENCE_WHY: Record<ConfidenceLevel, string> = {
  high: 'Every stylesheet was read and the page gave plenty to measure.',
  medium: 'Some stylesheets couldn’t be read or the page was sampled, so the range is wider.',
  low: 'Much of the CSS was unreadable or the page was small; treat the figures as a rough guide.',
};
const IMPACT_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const;
const IMPACT_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const CAUSE_COLOURS = ['var(--accent)', 'var(--info)', 'var(--warning)', 'var(--success)'];

const h = (n: number) => `${Math.round(n).toLocaleString('en-US')} h`;
const pct = (today: number, after: number) => (today > 0 ? Math.round(((today - after) / today) * 100) : 0);

export function ReportView() {
  const controller = useController();
  const { audit, dismissed, branding } = useAuditState();
  const { reportVersion, openReport } = useNavigation();

  const options = controller.reportOptions();
  const business = useMemo(() => (audit ? buildBusinessCase(audit, dismissed) : null), [audit, dismissed]);
  if (!audit || !business) return null;

  const notify = (ok: boolean, success: string) => controller.notify(ok ? success : 'Copy failed.');
  const executive = reportVersion !== 'detailed';
  const copy = () =>
    executive
      ? void copyText(executiveMarkdown(audit, options)).then((ok) => notify(ok, 'Executive summary copied. Paste it into an email, a doc or a ticket.'))
      : void copyText(detailedMarkdown(audit, options)).then((ok) => notify(ok, 'Detailed report copied. Paste it into a doc, a ticket or an AI agent.'));
  const name = options.clientName;
  const downloads = executive
    ? [
        { label: 'One-pager (.html, printable to PDF)', icon: <DownloadIcon />, onSelect: () => download(impactFileName(name, 'html'), onePagerHtml(audit, options), 'text/html') },
        { label: 'Markdown (.md)', icon: <DownloadIcon />, onSelect: () => download(impactFileName(name, 'md'), executiveMarkdown(audit, options), 'text/markdown') },
      ]
    : [
        { label: 'Markdown (.md)', icon: <DownloadIcon />, onSelect: () => download(impactFileName(name, 'md'), detailedMarkdown(audit, options), 'text/markdown') },
        { label: 'Raw data (.json)', icon: <DownloadIcon />, onSelect: () => download(impactFileName(name, 'json'), auditToJson(audit), 'application/json') },
      ];

  return (
    <div className="stack">
      <Segmented<ReportVersion>
        label="Report version"
        fill
        value={reportVersion}
        onChange={openReport}
        options={[
          { value: 'executive', label: 'Executive summary' },
          { value: 'detailed', label: 'Detailed report' },
          { value: 'outreach', label: 'Outreach' },
        ]}
      />
      {reportVersion !== 'outreach' && (
        <div className="toolbar" role="toolbar" aria-label="Report actions">
          <Button variant="primary" size="sm" icon={<CopyIcon size={14} />} onClick={copy}>
            {executive ? 'Copy summary' : 'Copy report'}
          </Button>
          <Menu
            label="Download"
            trigger={({ onClick, expanded }) => (
              <Button size="sm" icon={<DownloadIcon size={14} />} aria-haspopup="menu" aria-expanded={expanded} onClick={onClick}>
                Download
              </Button>
            )}
            sections={[{ items: downloads }]}
          />
        </div>
      )}
      {reportVersion === 'executive' && <Executive business={business} />}
      {reportVersion === 'detailed' && (
        <>
          <p className="muted">Every opportunity with its evidence and the stated limits, for designers and engineers. Paste it into a doc, a ticket or an AI agent.</p>
          <pre className="scroll-box" tabIndex={0} aria-label="Detailed report">
            {detailedMarkdown(audit, options)}
          </pre>
        </>
      )}
      {reportVersion === 'outreach' && <Outreach business={business} brandingNote={branding.note} />}
    </div>
  );
}

// ── Executive summary ───────────────────────────────────────────────────

function Executive({ business: b }: { business: BusinessCase }) {
  const controller = useController();
  const { audit, dismissed } = useAuditState();
  const { openOpportunity } = useNavigation();
  if (!audit) return null;
  const a = audit.assumptions;
  const money = (n: number) => formatMoney(n, a.currency);
  const short = (n: number) => formatMoneyShort(n, a.currency);
  const summary = summarise(audit, { clientName: controller.clientName(), dismissed });
  const level = consistencyLevel(summary.score);
  const span = Math.max(1, b.avoidable.high - b.avoidable.low);
  const marker = ((b.avoidable.likely - b.avoidable.low) / span) * 100;
  const lines = audit.savings.lines.filter((l) => l.excess > 0).sort((x, y) => y.excess - x.excess);
  const totalCause = b.causes.reduce((n, c) => n + c.hours, 0) || 1;

  return (
    <>
      <Card className="hero">
        <div className="hero__top">
          <span className="eyebrow">A design system would have saved</span>
          <span title={CONFIDENCE_WHY[b.confidence]} tabIndex={0} aria-label={`${b.confidence} confidence. ${CONFIDENCE_WHY[b.confidence]}`}>
            <Badge tone={CONFIDENCE_TONE[b.confidence]}>{b.confidence} confidence</Badge>
          </span>
        </div>
        <p className="hero__figure">
          {Math.round(b.avoidable.likely).toLocaleString('en-US')}
          <span> hours</span>
        </p>
        <p className="muted">
          {b.teamTime} · {money(b.avoidableCost)} · across about {b.screens} screens
        </p>
        <div className="range" aria-label={`Likely range ${h(b.avoidable.low)} to ${h(b.avoidable.high)}`} role="img">
          <i style={{ left: `calc(${marker}% - 1px)` }} />
        </div>
        <div className="range__labels" aria-hidden="true">
          <span>{h(b.avoidable.low)}</span>
          <span>Likely range</span>
          <span>{h(b.avoidable.high)}</span>
        </div>
        <StatStrip>
          <Stat value={b.yearly.hours ? h(b.yearly.hours) : '—'} label={b.yearly.hours ? `Yearly cost · ${short(b.yearly.cost)} a year (${h(b.yearly.inconsistencyHours)} inconsistency + ${h(b.yearly.newScreenHours)} slower new screens)` : 'Yearly cost · none found'} />
          <Stat
            value={b.oneTimeFix.hours ? h(b.oneTimeFix.hours) : '—'}
            label={b.oneTimeFix.hours ? (b.breakEvenMonths ? `One-time fix · breaks even in ${b.breakEvenMonths} months` : `One-time fix · ${b.oneTimeFix.opportunities} fixes`) : 'One-time fix · nothing urgent'}
          />
          <Stat value={`${summary.score}/100`} label={`Consistency · ${level.level}`} />
        </StatStrip>
      </Card>

      {b.parts.today > b.parts.after && (
        <Card title="Simplify and reuse" subtitle={`${b.parts.today} parts made separately today, ${b.parts.after} shared parts with a design system: ${pct(b.parts.today, b.parts.after)}% fewer to maintain.`}>
          <List label="Parts by kind">
            {lines.slice(0, 6).map((l) => (
              <Row
                key={l.key}
                title={l.label.replace(' variants', ' styles')}
                meta={`${l.current} → ${l.recommended}`}
                trailing={<Badge tone="success">−{pct(l.current, l.recommended)}%</Badge>}
                onClick={l.selectors.length ? () => void controller.highlight(l.selectors, l.label) : undefined}
              />
            ))}
          </List>
        </Card>
      )}

      {b.causes.length > 0 && (
        <Card title="Where the time went" subtitle="Avoidable hours so far, by cause. Hover a cause for how it was worked out.">
          <div className="stacked-bar" role="img" aria-label={b.causes.map((c) => `${c.label} ${h(c.hours)}`).join(', ')}>
            {b.causes.map((c, i) => (
              <i key={c.key} style={{ width: `${(c.hours / totalCause) * 100}%`, background: CAUSE_COLOURS[i % CAUSE_COLOURS.length] }} />
            ))}
          </div>
          <ul className="legend">
            {b.causes.map((c, i) => {
              const share = (c.hours / totalCause) * 100;
              return (
                <li key={c.key} title={c.basis}>
                  <span className="legend__swatch" style={{ background: CAUSE_COLOURS[i % CAUSE_COLOURS.length] }} />
                  <span className="legend__main">
                    <span>{c.label}</span>
                    <span className="legend__detail">{c.basis}</span>
                  </span>
                  <strong>{h(c.hours)}</strong>
                  <span className="muted">{share < 1 ? '<1%' : `${Math.round(share)}%`}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {b.breakEvenMonths !== null && (
        <Card
          title="Return on closing the gaps"
          subtitle={`A one-time fix of ${h(b.oneTimeFix.hours)} gives back about ${h(b.yearlyBenefit.hours)} a year: ${b.yearly.newScreenHours ? `faster new screens (${h(b.yearly.newScreenHours)}) and ` : ''}${Math.round(a.realisationRate * 100)}% of the inconsistency drag.`}
        >
          <RoiChart business={b} money={short} />
        </Card>
      )}

      {b.typicalChanges.length > 0 && (
        <Card title="Cost of a typical change" subtitle="Places to edit for one design change today, and after the proposed tokens and components.">
          <div className="change-list">
            {b.typicalChanges.map((c) => (
              <div key={c.label} className="change" role="img" aria-label={`${c.label}: ${c.today} today, ${c.after} after`}>
                <div className="change__head">
                  <strong>{c.label}</strong>
                  <Badge tone="success">−{pct(c.today, c.after)}%</Badge>
                </div>
                <div className="change__bar">
                  <i style={{ width: '100%' }} />
                  <span>{c.today} today</span>
                </div>
                <div className="change__bar change__bar--after">
                  <i style={{ width: `${Math.max(2, (c.after / c.today) * 100)}%` }} />
                  <span>{c.after} after</span>
                </div>
                <span className="muted small">{c.unit}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {b.highlights.length > 0 && (
        <Card title="What we found">
          <ul className="reasons">
            {b.highlights.map((x) => (
              <li key={x.text}>
                {x.warning ? <AlertIcon size={14} /> : <SparkleIcon size={14} />}
                {x.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {b.nextSteps.items.length > 0 && (
        <Card title="Recommended next steps" subtitle={`About ${h(b.nextSteps.hours)} (${teamTimeShort(b.nextSteps.hours)}) closes the ${b.nextSteps.items.length} priority ${b.nextSteps.items.length === 1 ? 'gap' : 'gaps'}.`}>
          <List label="Next steps">
            {b.nextSteps.items.map((r, i) => (
              <Row
                key={r.opportunity.id}
                wrap
                leading={<span className="step">{i + 1}</span>}
                title={r.opportunity.title}
                meta={`${r.effort.charAt(0).toUpperCase()}${r.effort.slice(1)} effort · about ${h(r.hours)}${r.quickWin ? ' · Quick win' : ''}`}
                trailing={
                  <>
                    <Badge tone={IMPACT_TONE[r.impact]}>{IMPACT_LABEL[r.impact]}</Badge>
                    <ChevronRightIcon size={14} />
                  </>
                }
                onClick={() => openOpportunity(r.opportunity.id)}
              />
            ))}
          </List>
        </Card>
      )}

      <TeamNumbers money={money} />
    </>
  );
}

function teamTimeShort(hours: number): string {
  return hours < 8 ? 'under a day' : hours < 35 ? `${Math.round(hours / 7)} days for one person` : `${Math.round(hours / 35)} person-weeks`;
}

/** Cumulative savings against the one-time cost, over three years. */
function RoiChart({ business: b, money }: { business: BusinessCase; money: (n: number) => string }) {
  const W = 300;
  const H = 120;
  const fixCost = b.oneTimeFix.cost;
  const yearly = b.yearlyBenefit.cost;
  const max = Math.max(fixCost, yearly * 3) * 1.05 || 1;
  const x = (months: number) => (months / 36) * W;
  const y = (v: number) => H - (v / max) * H;
  const be = b.breakEvenMonths ?? 0;
  const beX = x(Math.min(36, be));
  const tagLeft = beX > W / 2;
  return (
    <figure className="roi">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Savings pass the one-time cost of ${money(fixCost)} after about ${be} months, reaching ${money(yearly * 3)} by year 3.`}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={H - g * H} y2={H - g * H} className="roi__grid" />
        ))}
        <path d={`M0 ${H} L${W} ${y(yearly * 3)} L${W} ${H} Z`} className="roi__area" />
        <line x1={0} y1={H} x2={W} y2={y(yearly * 3)} className="roi__savings" />
        <line x1={0} y1={y(fixCost)} x2={W} y2={y(fixCost)} className="roi__cost" />
        {be <= 36 && (
          <>
            <circle cx={beX} cy={y(fixCost)} r={4} className="roi__dot" />
            <text x={tagLeft ? beX - 8 : beX + 8} y={y(fixCost) - 8} textAnchor={tagLeft ? 'end' : 'start'} className="roi__tag">
              Break-even · {be} months
            </text>
          </>
        )}
        {['Now', '1 yr', '2 yr', '3 yr'].map((t, i) => (
          <text key={t} x={x(i * 12)} y={H + 14} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} className="roi__axis">
            {t}
          </text>
        ))}
      </svg>
      <figcaption className="legend legend--inline">
        <span>
          <span className="legend__swatch" style={{ background: 'var(--accent)' }} />
          Savings: {money(yearly)} by year 1
        </span>
        <span>
          <span className="legend__swatch legend__swatch--line" />
          One-time cost: {money(fixCost)}
        </span>
      </figcaption>
    </figure>
  );
}

// ── Your team's numbers ─────────────────────────────────────────────────

function TeamNumbers({ money }: { money: (n: number) => string }) {
  const controller = useController();
  const { assumptions, audit } = useAuditState();
  const [open, setOpen] = useState(false);
  if (!assumptions || !audit) return null;
  const customised = controller.assumptionsCustomised();
  const pages = audit.snapshot.pages?.length ?? 1;
  const set = (patch: Partial<SavingsAssumptions>) => void controller.updateAssumptions({ ...assumptions, ...patch });
  const setEffort = (patch: Partial<EffortPerItem>) => set({ effort: { ...assumptions.effort, ...patch } });
  const e = assumptions.effort;

  return (
    <Card
      title="Your team’s numbers"
      subtitle={`${assumptionsLine(assumptions, money)}${customised ? ' · customised' : ''}`}
      action={
        <button type="button" className="link-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide assumptions' : 'Adjust assumptions'}
        </button>
      }
    >
      {open && (
        <div className="form-grid">
          <NumberField label="Cost per hour" value={assumptions.hourlyRate} min={1} max={1000} step={5} onChange={(hourlyRate) => set({ hourlyRate })} hint="Blended design and engineering" />
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="currency">
              Currency
            </label>
            <select id="currency" className="ui-field__input" value={assumptions.currency} onChange={(ev) => set({ currency: ev.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <NumberField label="Screens in the product" value={Math.max(pages, assumptions.screens)} min={pages} max={2000} step={1} onChange={(screens) => set({ screens })} hint={`${pages} reviewed`} />
          <NumberField label="New screens a year" value={assumptions.newScreensPerYear} min={0} max={500} step={1} onChange={(newScreensPerYear) => set({ newScreensPerYear })} />
          <NumberField label="Hours per new screen" value={assumptions.hoursPerNewScreen} min={1} max={400} step={4} suffix="h" onChange={(hoursPerNewScreen) => set({ hoursPerNewScreen })} hint="Design and build" />
          <NumberField
            label="Design system speed-up"
            value={Math.round(assumptions.systemSpeedup * 100)}
            min={0}
            max={90}
            step={5}
            suffix="%"
            onChange={(v) => set({ systemSpeedup: v / 100 })}
            hint="Faster UI work with a mature system"
          />
          <NumberField label="Visual changes a year" value={assumptions.rethemesPerYear} min={0} max={24} step={1} onChange={(rethemesPerYear) => set({ rethemesPerYear })} hint="Rebrands, colour or spacing updates" />
          <NumberField label="UI contributors" value={assumptions.contributors} min={1} max={500} step={1} onChange={(contributors) => set({ contributors })} hint="People who build or change UI" />

          <SectionLabel>Effort per item</SectionLabel>
          <NumberField label="Build one control" value={e.buildControl} min={0} max={200} step={1} suffix="h" onChange={(buildControl) => setEffort({ buildControl })} />
          <NumberField label="One extra variant" value={e.extraVariant} min={0} max={100} step={0.5} suffix="h" onChange={(extraVariant) => setEffort({ extraVariant })} />
          <NumberField label="One hand-built copy" value={e.handBuiltCopy} min={0} max={40} step={0.25} suffix="h" onChange={(handBuiltCopy) => setEffort({ handBuiltCopy })} />
          <NumberField label="One one-off style decision" value={e.oneOffDecision} min={0} max={20} step={0.25} suffix="h" onChange={(oneOffDecision) => setEffort({ oneOffDecision })} />
          <NumberField label="Fix one focus state" value={e.focusState} min={0} max={20} step={0.25} suffix="h" onChange={(focusState) => setEffort({ focusState })} />
          <NumberField label="One manual edit" value={assumptions.minutesPerLiteralEdit} min={0} max={60} step={1} suffix="min" onChange={(minutesPerLiteralEdit) => set({ minutesPerLiteralEdit })} />
          <NumberField label="Small fix" value={e.smallFix} min={0} max={40} step={1} suffix="h" onChange={(smallFix) => setEffort({ smallFix })} />
          <NumberField label="Medium fix" value={e.mediumFix} min={0} max={160} step={1} suffix="h" onChange={(mediumFix) => setEffort({ mediumFix })} />
          <NumberField label="Large fix" value={e.largeFix} min={0} max={500} step={2} suffix="h" onChange={(largeFix) => setEffort({ largeFix })} />
        </div>
      )}
      {customised ? (
        <Button size="sm" variant="ghost" onClick={() => void controller.resetAssumptions()}>
          Reset to defaults
        </Button>
      ) : (
        <p className="muted small">
          Defaults: {money(assumptions.hourlyRate)}/h blended design and engineering cost, a team of {assumptions.contributors}, and a {Math.round(assumptions.systemSpeedup * 100)}% speed-up once a system is in place. Every change recalculates
          the page and is saved.
        </p>
      )}
    </Card>
  );
}

// ── Outreach (for the sender only) ──────────────────────────────────────

const TIER_TONE = { 'Strong lead': 'success', 'Worth a message': 'info', 'Low priority': 'warning' } as const;

function Draft({ title, text, copied }: { title: string; text: string; copied: string }) {
  const controller = useController();
  return (
    <div className="draft">
      <div className="draft__head">
        <strong>{title}</strong>
        <Button size="sm" variant="ghost" icon={<CopyIcon size={14} />} onClick={() => void copyText(text).then((ok) => controller.notify(ok ? copied : 'Copy failed.'))}>
          Copy
        </Button>
      </div>
      <pre className="draft__body">{text}</pre>
    </div>
  );
}

function Outreach({ business, brandingNote }: { business: BusinessCase; brandingNote: string }) {
  const controller = useController();
  const { audit, dismissed, branding } = useAuditState();
  const { openReportDetails } = useNavigation();
  const [audience, setAudience] = useState<Audience>('founder');
  const [recipient, setRecipient] = useState('');
  if (!audit) return null;

  const summary = summarise(audit, { clientName: controller.clientName(), dismissed });
  const fit = leadFit(audit, business, summary);
  const kit = outreachKit({ audit, summary, business, branding, audience, recipient });
  const checklist = sendChecklist(audit, branding, controller.assumptionsCustomised(), dismissed.length);
  const ready = checklist.filter((c) => c.done).length;

  return (
    <>
      <p className="muted">
        <InfoIcon size={14} /> Only you see this tab. Nothing here goes into the client report, and no draft quotes a price.
      </p>

      <Card title="Lead fit" subtitle={fit.angle} action={<Badge tone={TIER_TONE[fit.tier]}>{fit.tier}</Badge>}>
        <div className="lead-score">
          <strong>{fit.score}</strong>
          <span className="muted">/100</span>
        </div>
        <ul className="reasons">
          {fit.reasons.map((r) => (
            <li key={r.text}>
              {r.positive ? <SparkleIcon size={14} /> : <AlertIcon size={14} />}
              {r.text}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Ready to send?" subtitle={`${ready} of ${checklist.length} done`} action={<Button size="sm" variant="ghost" onClick={openReportDetails}>Report details</Button>}>
        <ul className="checklist">
          {checklist.map((c) => (
            <li key={c.label} className={c.done ? 'is-done' : undefined}>
              <span className="checklist__mark" aria-hidden="true">{c.done ? '✓' : ''}</span>
              <span>
                {c.label}
                <span className="checklist__state">{c.done ? ', done' : ', to do'}</span>
                {!c.done && <span className="legend__detail">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Message drafts" subtitle="Built from their own product. Edit before sending: your voice beats ours.">
        <div className="form-stack">
          <Segmented<Audience> label="Writing to" fill value={audience} onChange={setAudience} options={AUDIENCES} />
          <TextField label="Their first name" value={recipient} onChange={setRecipient} placeholder="e.g. Priya" />
          {!brandingNote && <p className="muted small">Tip: add a personal note under Report details. It opens the PDF and makes the report feel written for them.</p>}
          <SectionLabel>Subject lines</SectionLabel>
          <List label="Subject lines">
            {kit.subjects.map((s) => (
              <Row
                key={s}
                wrap
                title={s}
                trailing={<CopyIcon size={14} />}
                onClick={() => void copyText(s).then((ok) => controller.notify(ok ? 'Subject copied.' : 'Copy failed.'))}
              />
            ))}
          </List>
          <Draft title="First email" text={kit.email} copied="Email copied." />
          <Draft title="LinkedIn message" text={kit.linkedin} copied="LinkedIn message copied." />
          <Draft title="Follow-up (3 or 4 days later)" text={kit.followUp} copied="Follow-up copied." />
        </div>
      </Card>
    </>
  );
}
