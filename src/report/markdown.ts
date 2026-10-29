/** A plain-text version of the report's opening, for pasting into an email. */

import type { Audit } from '../audit';
import { summarise } from '../insights';
import { formatMoney } from '../savings';
import { defaultClientName, type ClientReportOptions } from './branding';

export function auditToMarkdown(audit: Audit, options?: ClientReportOptions): string {
  const clientName = options?.clientName || defaultClientName(audit.snapshot.title, audit.snapshot.url);
  const summary = summarise(audit, { clientName, dismissed: options?.dismissed });
  const money = (n: number) => formatMoney(n, audit.assumptions.currency);
  const lines = [
    `# Design system audit: ${clientName}`,
    '',
    summary.intro,
    '',
    ...(summary.hook ? [`**Something you may not know:** ${summary.hook}`, ''] : []),
    `**${summary.headline}** ${summary.subheadline}`,
    '',
    '## What we found',
    '',
    ...summary.painPoints.slice(0, 5).map((p, i) => `${i + 1}. **${p.title}**${p.annualCost ? ` (about ${money(p.annualCost)} a year)` : ''}. ${p.suggestion}`),
  ];
  if (summary.metrics.length) {
    lines.push('', '## At a glance', '', '| What we looked at | What we found | A tidy system has | Cost a year |', '| --- | --- | --- | ---: |');
    for (const m of summary.metrics) lines.push(`| ${m.label} | ${m.found}${m.foundNote ? ` (${m.foundNote})` : ''} | ${m.healthy} | ${m.annualCost ? money(m.annualCost) : '—'} |`);
  }
  lines.push('', `_Money figures are estimates based on a team of about ${audit.assumptions.contributors} people building the product._`);
  return lines.join('\n');
}
