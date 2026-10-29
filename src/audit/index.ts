/**
 * An Audit bundles a snapshot with everything derived from it. This is the
 * unit the panel renders and the report exports.
 */

import { analyse } from '../inference';
import type { AuditAnalysis } from '../inference/types';
import { estimateSavings, type SavingsAssumptions, type SavingsEstimate } from '../savings';
import { scoreAnalysis, type AuditScore } from '../scoring';
import type { PageSnapshot } from '../shared/snapshot';

export interface Audit {
  snapshot: PageSnapshot;
  analysis: AuditAnalysis;
  score: AuditScore;
  savings: SavingsEstimate;
  assumptions: SavingsAssumptions;
}

export function runAudit(snapshot: PageSnapshot, assumptions: SavingsAssumptions): Audit {
  const analysis = analyse(snapshot);
  return {
    snapshot,
    analysis,
    score: scoreAnalysis(analysis),
    savings: estimateSavings(analysis, assumptions),
    assumptions,
  };
}

/** Recomputes only the savings, e.g. after the assumptions change. */
export function withAssumptions(audit: Audit, assumptions: SavingsAssumptions): Audit {
  return { ...audit, assumptions, savings: estimateSavings(audit.analysis, assumptions) };
}

export interface AreaDelta {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
}

/** Per-area score change from `before` to `after`, for comparing two snapshots. */
export function compareAudits(before: Audit, after: Audit): { overall: number; areas: AreaDelta[] } {
  const areas = after.score.areas
    .filter((a) => a.applicable)
    .map((a) => {
      const previous = before.score.areas.find((b) => b.key === a.key)?.score ?? a.score;
      return { key: a.key, label: a.label, before: previous, after: a.score, delta: a.score - previous };
    });
  return { overall: after.score.overall - before.score.overall, areas };
}
