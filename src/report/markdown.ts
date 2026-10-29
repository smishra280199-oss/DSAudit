/** A Markdown summary of an audit, for pasting into tickets and docs. */

import type { Audit } from '../audit';
import { formatMoney } from '../savings';
import { formatDate, hostOf, percent } from './format';

export function auditToMarkdown({ snapshot, analysis, score, savings, assumptions }: Audit): string {
  const lines = [
    `# System Audit: ${snapshot.title || hostOf(snapshot.url)}`,
    '',
    `${snapshot.url}  `,
    `Captured ${formatDate(snapshot.capturedAt)} at ${snapshot.viewport.width}×${snapshot.viewport.height} · confidence ${analysis.confidence.level}`,
    '',
    `**Score: ${score.overall}/100 (${score.grade}, ${score.maturity})**`,
    '',
    '| Area | Score | Notes |',
    '| --- | ---: | --- |',
    ...score.areas.filter((a) => a.applicable).map((a) => `| ${a.label} | ${a.score} | ${a.notes.slice(0, 2).join('; ')} |`),
    '',
    '## Top opportunities',
    '',
    ...analysis.opportunities.slice(0, 10).map((o) => `- **${o.title}** (${o.severity}, ~${o.effortHours}h). ${o.fix}`),
    '',
    '## Savings (planning estimate)',
    '',
    `- One-time cleanup: ~${savings.cleanupHours}h (${formatMoney(savings.cleanupCost, assumptions.currency)})`,
    `- Recoverable each year: ~${savings.annualSavingsHours}h (${formatMoney(savings.annualSavings, assumptions.currency)})`,
    `- Token coverage: ${percent(analysis.tokens.coverage)}`,
  ];
  if (analysis.confidence.reasons.length > 0) {
    lines.push('', '## Limits of this capture', '', ...analysis.confidence.reasons.map((r) => `- ${r}`));
  }
  return lines.join('\n');
}
