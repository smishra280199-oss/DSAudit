/**
 * The executive overview: the same story as page one of the client PDF, so
 * what you see in the panel is what the client will read. Cost first, then
 * what to consolidate, where to start, and how each area stands.
 */

import { useState } from 'react';
import { summarise, STATUS_LABELS, type HealthStatus } from '../../../../insights';
import type { ConfidenceLevel } from '../../../../inference/types';
import { formatMoney, formatMoneyShort } from '../../../../savings';
import { Badge, Button, Card, FileIcon, InfoIcon, List, Meter, Row, Spinner, type Tone } from '../ui';
import { Stat, StatStrip } from '../components/Stat';
import { destinationFor, useNavigation } from '../navigation';
import { useAuditState, useController } from '../use-audit';
import { useReports } from '../use-reports';

const CONFIDENCE_TONE: Record<ConfidenceLevel, Tone> = { high: 'success', medium: 'warning', low: 'danger' };
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
const STATUS_TONE: Record<HealthStatus, Tone> = { strong: 'success', 'needs-work': 'warning', 'at-risk': 'danger' };

export function OverviewView() {
  const controller = useController();
  const { audit, dismissed, hostAccess } = useAuditState();
  const { go, openSettings, openReportDetails } = useNavigation();
  const reports = useReports();
  const [allRows, setAllRows] = useState(false);
  if (!audit) return null;

  const { analysis, savings, assumptions } = audit;
  const summary = summarise(audit, dismissed);
  const money = (n: number) => formatMoney(n, assumptions.currency);
  const short = (n: number) => formatMoneyShort(n, assumptions.currency);
  const comparison = controller.comparison();
  const rows = allRows ? summary.consolidation : summary.consolidation.slice(0, 6);
  const opportunityById = new Map(analysis.opportunities.map((o) => [o.id, o]));

  return (
    <div className="stack">
      <Card className="hero">
        <div className="hero__eyebrow">Cost of inconsistency</div>
        <div className="hero__figure">
          {money(savings.annualDragCost)}
          <span className="hero__unit"> / year</span>
        </div>
        <p className="hero__text">{summary.subheadline}</p>
        <div className="hero__actions">
          <Button
            variant="primary"
            icon={reports.generating ? <Spinner label="Generating" /> : <FileIcon size={14} />}
            disabled={reports.generating}
            onClick={() => void reports.downloadPdf(audit)}
          >
            Download PDF report
          </Button>
          <Button variant="ghost" size="sm" onClick={openReportDetails}>
            Report details
          </Button>
        </div>
      </Card>

      <StatStrip>
        <Stat value={short(savings.annualSavings)} label="Recoverable / year" />
        <Stat value={short(savings.cleanupCost)} label={`Cleanup, ${summary.cleanupDuration.replace('about ', '~')}`} />
        <Stat value={savings.paybackMonths === null ? '—' : `${savings.paybackMonths} mo`} label="Payback" />
        <Stat value={`${summary.score}`} label={`Maturity · ${summary.grade} ${summary.maturity}`} />
      </StatStrip>

      {comparison && (
        <Card
          title="Change since baseline"
          subtitle={`Overall ${comparison.overall >= 0 ? '+' : ''}${comparison.overall} points`}
          action={
            <Button size="sm" variant="ghost" onClick={() => void controller.compareWith(null)}>
              Clear
            </Button>
          }
        >
          <List label="Score changes">
            {comparison.areas.map((a) => (
              <Row
                key={a.key}
                title={a.label}
                meta={`${a.before} → ${a.after}`}
                trailing={<Badge tone={a.delta > 0 ? 'success' : a.delta < 0 ? 'danger' : 'neutral'}>{a.delta > 0 ? `+${a.delta}` : a.delta}</Badge>}
              />
            ))}
          </List>
        </Card>
      )}

      <Card
        title="What you have vs. what you need"
        subtitle={
          summary.consolidation.length
            ? `${summary.consolidationTotals.current} styles in use where ${summary.consolidationTotals.recommended} would do (−${summary.consolidationTotals.reduction}%).`
            : 'Every style family is within a healthy range.'
        }
        action={
          <Button size="sm" variant="ghost" onClick={openSettings}>
            Assumptions
          </Button>
        }
      >
        {rows.length > 0 && (
          <List label="Consolidation">
            {rows.map((row) => (
              <Row
                key={row.key}
                title={row.label}
                meta={`${row.current} in use → ${row.recommended} needed`}
                trailing={
                  <span className="consolidation__cost">
                    <span className="consolidation__pct">−{Math.round((row.excess / row.current) * 100)}%</span>
                    {money(row.annualCost)}/yr
                  </span>
                }
                onClick={() => void controller.highlight(row.selectors, `${row.label}: redundant`)}
              />
            ))}
          </List>
        )}
        {summary.consolidation.length > 6 && (
          <Button size="sm" variant="ghost" onClick={() => setAllRows((v) => !v)}>
            {allRows ? 'Show fewer' : `Show all ${summary.consolidation.length}`}
          </Button>
        )}
        {savings.retheme.literals > 0 && (
          <p className="callout">
            A rebrand or dark mode today means editing <strong>{savings.retheme.literals.toLocaleString()}</strong> hard-coded values (~
            {savings.retheme.hoursToday}h). With tokens: <strong>{savings.retheme.distinctValues.toLocaleString()}</strong> edits in one place (~
            {savings.retheme.hoursWithTokens}h).
          </p>
        )}
      </Card>

      <Card
        title="Where to start"
        subtitle="Most impact for the effort, in order."
        action={
          <Button size="sm" variant="ghost" onClick={() => go('opportunities')}>
            All {analysis.opportunities.length}
          </Button>
        }
      >
        {summary.priorities.length === 0 ? (
          <p className="muted">Nothing stands out. This page is built consistently.</p>
        ) : (
          <List label="Priorities">
            {summary.priorities.map((p, i) => (
              <Row
                key={p.id}
                leading={<span className="step">{i + 1}</span>}
                title={p.title}
                meta={p.why}
                wrap
                trailing={`~${p.effortHours}h`}
                onClick={() => void controller.highlight(opportunityById.get(p.id)?.selectors ?? [], p.title)}
              />
            ))}
          </List>
        )}
      </Card>

      <Card title="Health by area" subtitle={`${summary.score}/100 overall. Select an area for the evidence.`}>
        <List label="Area health">
          {summary.areas.map((area) => {
            const target = destinationFor(area.key);
            return (
              <Row
                key={area.key}
                title={area.label}
                meta={area.impact}
                wrap
                onClick={() => go(target.view, target.foundation)}
                trailing={
                  <>
                    <Badge tone={STATUS_TONE[area.status]}>{STATUS_LABELS[area.status]}</Badge>
                    <div className="area-meter">
                      <Meter value={area.score} label={`${area.label} score`} />
                    </div>
                  </>
                }
              />
            );
          })}
        </List>
      </Card>

      <Card
        title="About this capture"
        action={
          <Badge tone={CONFIDENCE_TONE[analysis.confidence.level]} dot>
            {CONFIDENCE_LABEL[analysis.confidence.level]}
          </Badge>
        }
      >
        <ul className="reasons">
          <li>
            <InfoIcon size={14} />
            {audit.snapshot.rendered.elements.length.toLocaleString()} elements, {audit.snapshot.authored.declarations.length.toLocaleString()}{' '}
            design declarations and {analysis.tokens.definedCount} tokens read from one viewport.
          </li>
          {analysis.confidence.reasons.map((reason) => (
            <li key={reason}>
              <InfoIcon size={14} />
              {reason}
            </li>
          ))}
        </ul>
        {!hostAccess && (
          <Button size="sm" onClick={() => void controller.requestHostAccess()}>
            Allow access to all sites
          </Button>
        )}
      </Card>
    </div>
  );
}
