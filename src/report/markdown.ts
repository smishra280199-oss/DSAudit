/** A Markdown executive summary, for pasting into an email, ticket or doc. */

import type { Audit } from '../audit';
import { summarise, STATUS_LABELS } from '../insights';
import { formatMoney } from '../savings';
import { defaultClientName, type ClientReportOptions } from './branding';
import { formatDate } from './format';

export function auditToMarkdown(audit: Audit, options?: ClientReportOptions): string {
  const { snapshot, savings, assumptions } = audit;
  const summary = summarise(audit, options?.dismissed);
  const money = (n: number) => formatMoney(n, assumptions.currency);
  const client = options?.clientName || defaultClientName(snapshot.title, snapshot.url);

  const lines = [
    `# Design System Audit: ${client}`,
    '',
    `${snapshot.url} · captured ${formatDate(snapshot.capturedAt)}`,
    '',
    `**${summary.headline}** ${summary.subheadline}`,
    '',
    `- Yearly cost of inconsistency: **${money(savings.annualDragCost)}**`,
    `- Recoverable every year: **${money(savings.annualSavings)}**`,
    `- One-time cleanup: **${money(savings.cleanupCost)}** (${summary.cleanupDuration})`,
    `- Design system maturity: **${summary.score}/100** (${summary.grade}, ${summary.maturity})`,
  ];
  if (summary.consolidation.length) {
    lines.push('', '## What you have vs. what you need', '', '| Style | In use | Needed | Cost / year |', '| --- | ---: | ---: | ---: |');
    for (const row of summary.consolidation) lines.push(`| ${row.label} | ${row.current} | ${row.recommended} | ${money(row.annualCost)} |`);
  }
  if (summary.priorities.length) {
    lines.push('', '## Where to start', '');
    summary.priorities.forEach((p, i) => lines.push(`${i + 1}. **${p.title}** (~${p.effortHours}h). ${p.why}`));
  }
  lines.push('', '## Where you stand', '');
  for (const area of summary.areas) lines.push(`- **${area.label}**: ${STATUS_LABELS[area.status]} (${area.score}). ${area.impact}`);
  lines.push('', `_Costs are planning estimates (${assumptions.contributors} UI contributors at ${money(assumptions.hourlyRate)}/h). Confidence: ${audit.analysis.confidence.level}._`);
  return lines.join('\n');
}
