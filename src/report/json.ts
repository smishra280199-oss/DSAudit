/** Machine-readable export: the raw snapshot plus derived results. */

import type { Audit } from '../audit';

export function auditToJson(audit: Audit): string {
  return JSON.stringify(
    {
      generator: 'System Audit (dslint)',
      snapshot: audit.snapshot,
      score: audit.score,
      opportunities: audit.analysis.opportunities,
      savings: { assumptions: audit.assumptions, estimate: audit.savings },
    },
    null,
    2,
  );
}
