/**
 * The growth side of an audit: is this prospect worth a message this week,
 * which angle will land with the person we're writing to, and a first draft
 * of that message built from their own product.
 *
 * Everything here is for the sender only. Nothing in this file ever reaches
 * a client report, and no message quotes a price: the audit is the opener,
 * the conversation is the sale.
 */

import type { Audit } from '../audit';
import type { ExecutiveSummary } from '../insights';
import type { ReportBranding } from '../report/branding';
import { formatMoneyShort } from '../savings';
import type { BusinessCase } from './index';

/** Accessibility issues found by the exact checks: contrast, focus, names, labels, targets, alt text. */
function a11yIssues(audit: Audit): number {
  const a = audit.analysis.accessibility;
  return (
    a.contrastFailures.length +
    audit.analysis.interaction.outlineRemovedWithoutReplacement.length +
    a.unnamedControls.length +
    a.unlabelledFields.length +
    a.smallTargets.length +
    a.imagesWithoutAlt.length
  );
}

// ── Lead fit ────────────────────────────────────────────────────────────

export type LeadTier = 'Strong lead' | 'Worth a message' | 'Low priority';

export interface LeadFit {
  score: number;
  tier: LeadTier;
  /** Why, as short facts: what makes the case strong or weak. */
  reasons: { text: string; positive: boolean }[];
  /** The angle most likely to land, in one line. */
  angle: string;
}

export function leadFit(audit: Audit, business: BusinessCase, summary: ExecutiveSummary): LeadFit {
  const reasons: LeadFit['reasons'] = [];
  const { analysis } = audit;

  // Pain: is the cost big enough for someone to care?
  const pain = Math.min(40, Math.round((business.yearly.hours / 400) * 40));
  reasons.push(
    business.yearly.hours >= 120
      ? { text: `About ${business.yearly.hours} team hours a year at stake`, positive: true }
      : { text: `Only about ${business.yearly.hours} team hours a year at stake`, positive: false },
  );

  // Evidence: can we show them their own product?
  const concrete = summary.painPoints.filter((p) => p.evidence.kind !== 'none').length;
  const evidence = Math.round(Math.min(25, concrete * 8) * (analysis.confidence.level === 'high' ? 1 : analysis.confidence.level === 'medium' ? 0.8 : 0.5));
  reasons.push(
    concrete >= 3
      ? { text: `${concrete} findings with examples from their own pages`, positive: true }
      : { text: concrete ? `Only ${concrete} finding${concrete === 1 ? '' : 's'} with concrete examples` : 'No concrete examples to show yet', positive: false },
  );
  if (analysis.confidence.level !== 'high') reasons.push({ text: `${analysis.confidence.level === 'low' ? 'Low' : 'Medium'} confidence: part of the CSS couldn’t be read`, positive: false });

  // Urgency: is there a reason to act now?
  const a11y = a11yIssues(audit);
  const highs = business.ranked.filter((r) => r.impact === 'high').length;
  const urgency = a11y > 0 ? 20 : highs > 0 ? 12 : 0;
  if (a11y > 0) reasons.push({ text: 'Accessibility gaps give a reason to act now', positive: true });
  else if (highs > 0) reasons.push({ text: `${highs} high-impact ${highs === 1 ? 'gap' : 'gaps'}`, positive: true });

  // Easy first step: can we offer a small, safe first project?
  const wins = business.quickWins.length;
  const entry = wins >= 2 ? 15 : wins === 1 ? 8 : 0;
  reasons.push(wins ? { text: `${wins} quick ${wins === 1 ? 'win' : 'wins'} to offer as a first step`, positive: true } : { text: 'No quick wins to open with', positive: false });

  const pages = business.pagesCaptured;
  const coverage = pages >= 3 ? 0 : -5;
  if (pages < 3) reasons.push({ text: `Only ${pages} page${pages === 1 ? '' : 's'} captured; 3 or more make the case harder to dismiss`, positive: false });

  const score = Math.max(0, Math.min(100, pain + evidence + urgency + entry + coverage));
  return {
    score,
    tier: score >= 65 ? 'Strong lead' : score >= 40 ? 'Worth a message' : 'Low priority',
    reasons: reasons.sort((x, y) => Number(y.positive) - Number(x.positive)),
    angle: angleFor(audit, business),
  };
}

function angleFor(audit: Audit, business: BusinessCase): string {
  if (a11yIssues(audit) > 0) {
    return 'Lead with accessibility: it is concrete, visible and a risk they may not know about.';
  }
  const change = business.typicalChanges[0];
  if (change && change.today >= 10) return `Lead with speed: “${change.label.toLowerCase()}” takes ${change.today} edits today and ${change.after} with tokens.`;
  if (business.parts.today > business.parts.after * 1.3) return 'Lead with simplicity: they maintain far more parts than they need.';
  return 'Lead with the yearly cost, and offer the quick wins as a low-risk start.';
}

// ── Message drafts ──────────────────────────────────────────────────────

export type Audience = 'founder' | 'design' | 'engineering';

export const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'founder', label: 'Founder' },
  { value: 'design', label: 'Design lead' },
  { value: 'engineering', label: 'Eng lead' },
];

export interface OutreachKit {
  subjects: string[];
  email: string;
  linkedin: string;
  followUp: string;
}

interface KitInput {
  audit: Audit;
  summary: ExecutiveSummary;
  business: BusinessCase;
  branding: ReportBranding;
  audience: Audience;
  /** First name of the person we're writing to; a placeholder if unknown. */
  recipient?: string;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function sentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function signature(b: ReportBranding): string {
  const name = [b.preparedBy, b.agencyName].filter(Boolean).join(', ');
  return [name || '[Your name]', b.website || b.email].filter(Boolean).join('\n');
}

export function outreachKit({ audit, summary, business, branding, audience, recipient }: KitInput): OutreachKit {
  const client = summary.clientName;
  const hi = `Hi ${recipient?.trim() || '[first name]'},`;
  const money = (n: number) => formatMoneyShort(n, audit.assumptions.currency);
  const pages = summary.pages.length;
  const looked = pages === 1 ? `the ${summary.pages[0]!.name === 'the home page' ? 'home page' : `${summary.pages[0]!.name} page`} of ${client}` : `${pages} pages of ${client}`;
  const hook = summary.hook ? sentence(summary.hook) : sentence(summary.painPoints[0]?.title ?? `${client} is built more consistently than most`);
  const second = summary.painPoints[1] ?? null;
  const win = business.quickWins[0] ?? null;
  const change = business.typicalChanges[0] ?? null;
  const speedup = Math.round(business.effectiveSpeedup * 100);
  const yearly = business.yearly;
  // No hours or money for the fixes: in a first message they read as a quote, and a low one.
  const winLine = win
    ? `The good news: ${business.quickWins.length === 1 ? 'one of the fixes is' : `${business.quickWins.length} of the fixes are`} small enough to ship in a sprint.` +
      (audience === 'founder' ? '' : ` I'd start with: ${lowerFirst(win.opportunity.title)}.`)
    : '';

  const subjects = [
    `${client}: ~${yearly.hours} hours a year hiding in the UI`,
    `A quick look at how ${client} is built`,
    summary.painPoints[0] && summary.painPoints[0].title.length <= 48 ? `${client}: ${lowerFirst(summary.painPoints[0].title)}` : `${client}'s design system, from the outside`,
  ];

  const offer = 'I put it together in a short report, with examples from your own pages. Want me to send it over?';
  const sign = signature(branding);

  let body: string[];
  if (audience === 'founder') {
    body = [
      hi,
      `I went through ${looked} the way your customers see it, and took stock of how it's built: every colour, text size, gap and component.`,
      `One thing stood out: ${lowerFirst(hook)}`,
      `We estimate that for a product team of about ${audit.assumptions.contributors} people, inconsistency like this costs around ${yearly.inconsistencyHours} hours a year` +
        (speedup >= 5 ? `, and each new screen takes about ${speedup}% longer than it would with a shared system. All in, roughly ${money(yearly.cost)} a year.` : ` (roughly ${money(yearly.cost)}).`),
      winLine,
      offer,
    ];
  } else if (audience === 'design') {
    body = [
      hi,
      `I ran an outside-in audit of ${looked}: colours, type, spacing, components and focus states, straight from what the browser renders.`,
      `It scores ${summary.score}/100 for consistency. The biggest drift: ${lowerFirst(hook)}`,
      second ? `Also worth a look: ${lowerFirst(sentence(second.title))}` : '',
      winLine,
      `Happy to walk your team through it in 15 minutes, or just send the report if that's easier.`,
    ];
  } else {
    const tokenShare = audit.analysis.tokens.coverage;
    body = [
      hi,
      `I looked at how ${client}'s front end is styled, from the rendered page and its CSS${pages > 1 ? ` across ${pages} pages` : ''}.`,
      tokenShare !== null ? `About ${Math.round(tokenShare * 100)}% of the styling goes through design tokens; the rest is typed in by hand.` : '',
      change ? `In practice, “${lowerFirst(change.label)}” means ${change.today} ${change.unit} today, against ${change.after} with tokens and shared components.` : sentence(hook),
      winLine,
      `I've written it up with the exact values and selectors, ready to drop into tickets. Want a copy?`,
    ];
  }
  const email = [...body.filter(Boolean), sign].join('\n\n');

  const linkedin = `${hi.replace(',', ' –')} I did an outside-in audit of ${client}'s UI. ${hook} I wrote up what it's costing and ${business.quickWins.length ? 'a couple of quick wins' : 'where to start'}. Want it?`;

  const followUpFact = change
    ? `“${change.label}” currently means ${change.today} ${change.unit}; with tokens it's ${change.after}.`
    : second
      ? sentence(second.title)
      : `the product scores ${summary.score}/100 for consistency.`;
  const followUp = [hi, `Quick follow-up on the ${client} audit. One more thing from it: ${lowerFirst(followUpFact)}`, `The report is ready whenever it's useful. Happy to send it, no strings.`, sign].join('\n\n');

  return { subjects, email, linkedin, followUp };
}

// ── Ready to send? ──────────────────────────────────────────────────────

export interface ChecklistItem {
  label: string;
  done: boolean;
  hint: string;
}

export function sendChecklist(audit: Audit, branding: ReportBranding, assumptionsCustomised: boolean, dismissedCount: number): ChecklistItem[] {
  const pages = audit.snapshot.pages?.length ?? 1;
  return [
    { label: 'Three or more pages captured', done: pages >= 3, hint: 'Patterns across pages are much harder to dismiss than one page.' },
    { label: 'High-confidence capture', done: audit.analysis.confidence.level === 'high', hint: 'Allow site access and re-capture so every stylesheet is read.' },
    { label: 'Your name and agency on the report', done: Boolean(branding.preparedBy && branding.agencyName), hint: 'Set them under Report details.' },
    { label: 'Personal note for this prospect', done: Boolean(branding.note.trim()), hint: 'One line on why you looked at their product.' },
    { label: 'Team numbers tuned to this company', done: assumptionsCustomised, hint: 'A 5-person startup and a 60-person scale-up need different numbers.' },
    { label: 'Findings reviewed', done: dismissedCount > 0 || audit.analysis.opportunities.length <= 5, hint: 'Leave out anything you wouldn’t defend on a call.' },
  ];
}
