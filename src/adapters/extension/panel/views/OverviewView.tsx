/**
 * The overview mirrors the client report: the headline cost, the one thing
 * they probably didn't know, what we found (which you can leave out of the
 * report), and the stock-take. What you see here is what the client reads.
 */

import { buildBusinessCase, consistencyLevel } from '../../../../business';
import { summarise, STATUS_LABELS, type HealthStatus, type PainPoint } from '../../../../insights';
import type { ConfidenceLevel, Severity } from '../../../../inference/types';
import { formatMoney, formatMoneyShort } from '../../../../savings';
import { Badge, Button, Card, ChevronRightIcon, EyeOffIcon, FileIcon, InfoIcon, List, Menu, PagesIcon, Row, Spinner, TargetIcon, UndoIcon, type Tone } from '../ui';
import { Stat, StatStrip } from '../components/Stat';
import { useNavigation } from '../navigation';
import { ImpactEffortMatrix } from './OpportunitiesView';
import { AccessibilityCard } from './Showcase';
import { useAuditState, useController } from '../use-audit';
import { useReports } from '../use-reports';

const CONFIDENCE_TONE: Record<ConfidenceLevel, Tone> = { high: 'success', medium: 'warning', low: 'danger' };
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
const STATUS_TONE: Record<HealthStatus, Tone> = { strong: 'success', 'needs-work': 'warning', 'at-risk': 'danger' };
const PRIORITY: Record<Severity, { label: string; tone: Tone }> = {
  high: { label: 'High priority', tone: 'danger' },
  medium: { label: 'Worth fixing', tone: 'warning' },
  low: { label: 'Nice to have', tone: 'neutral' },
};

export function OverviewView() {
  const controller = useController();
  const { audit, dismissed, hostAccess, collection } = useAuditState();
  const { go, openReportDetails, openSettings, openOpportunity, openReport } = useNavigation();
  const reports = useReports();
  if (!audit) return null;

  const { analysis, assumptions, snapshot } = audit;
  const clientName = controller.clientName();
  const summary = summarise(audit, { clientName, dismissed });
  const leftOut = summarise(audit, { clientName }).painPoints.filter((p) => dismissed.includes(p.id));
  const money = (n: number) => formatMoney(n, assumptions.currency);
  const short = (n: number) => formatMoneyShort(n, assumptions.currency);
  const comparison = controller.comparison();
  const business = buildBusinessCase(audit, dismissed);
  const level = consistencyLevel(summary.score);
  const top = business.ranked.slice(0, 3);

  const findingRow = (p: PainPoint, index: number, excluded: boolean) => (
    <Row
      key={p.id}
      wrap
      leading={<span className="step">{excluded ? '–' : index}</span>}
      title={<span className={excluded ? 'row-dimmed' : undefined}>{p.title}</span>}
      meta={
        <span className="value-flags">
          <Badge tone={PRIORITY[p.severity].tone}>{PRIORITY[p.severity].label}</Badge>
          {p.annualCost ? <span>about {money(p.annualCost)} a year</span> : null}
        </span>
      }
      onClick={() => void controller.highlight(p.selectors, p.title)}
      actions={
        <Menu
          label={`Actions for ${p.title}`}
          sections={[
            {
              items: [
                ...(p.selectors.length ? [{ label: 'Highlight on page', icon: <TargetIcon />, onSelect: () => void controller.highlight(p.selectors, p.title) }] : []),
                excluded
                  ? { label: 'Put back in the report', icon: <UndoIcon />, onSelect: () => void controller.setDismissed(p.id, false) }
                  : { label: 'Leave out of the report', icon: <EyeOffIcon />, onSelect: () => void controller.setDismissed(p.id, true) },
              ],
            },
          ]}
        />
      }
    />
  );

  return (
    <div className="stack">
      <Card title={summary.headline} subtitle={summary.subheadline}>
        <StatStrip>
          <Stat value={short(summary.numbers.yearlyCost)} label="Yearly cost of inconsistency" />
          <Stat value={short(summary.numbers.recoverable)} label="Could be saved each year" />
          <Stat value={`${summary.numbers.hoursLost}h`} label="Team hours lost a year" />
          <Stat value={`${summary.score}/100`} label={`Consistency · ${level.level}`} />
        </StatStrip>
        <div className="overview-actions">
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

      {top.length > 0 && (
        <Card
          title="Biggest opportunities"
          subtitle={`${business.ranked.length} changes found, ${business.ranked.filter((r) => r.impact === 'high').length} high impact; ${business.quickWins.length} quick ${business.quickWins.length === 1 ? 'win needs' : 'wins need'} only small effort.${business.quickWins.length ? ' Start with these.' : ''}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => openReport('executive')}>
              See the business case →
            </Button>
          }
        >
          <List label="Biggest opportunities">
            {top.map((r, i) => (
              <Row
                key={r.opportunity.id}
                wrap
                leading={<span className="step">{i + 1}</span>}
                title={r.opportunity.title}
                meta={`${r.effort.charAt(0).toUpperCase()}${r.effort.slice(1)} effort · ${r.opportunity.affected.toLocaleString()} affected${r.quickWin ? ' · Quick win' : ''}`}
                trailing={
                  <>
                    <Badge tone={PRIORITY[r.impact].tone}>{r.impact === 'high' ? 'High' : r.impact === 'medium' ? 'Medium' : 'Low'}</Badge>
                    <ChevronRightIcon size={14} />
                  </>
                }
                onClick={() => openOpportunity(r.opportunity.id)}
              />
            ))}
          </List>
          {business.ranked.length > 1 && <ImpactEffortMatrix ranked={business.ranked} />}
          {business.ranked.length > 3 && (
            <Button size="sm" variant="secondary" onClick={() => go('opportunities')}>
              View all {business.ranked.length} opportunities →
            </Button>
          )}
        </Card>
      )}

      <Card
        title={snapshot.pages ? `${snapshot.pages.length} pages reviewed` : '1 page reviewed'}
        subtitle={
          snapshot.pages
            ? snapshot.pages.map((p) => p.url.replace(/^https?:\/\/[^/]+/, '') || '/').join(', ')
            : 'Add more pages for a fuller picture of the product.'
        }
        action={
          <Button size="sm" variant="ghost" icon={<PagesIcon size={14} />} onClick={() => go('pages')}>
            {collection.length ? `Pages (${collection.length})` : 'Add pages'}
          </Button>
        }
      />

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
              <Row key={a.key} title={a.label} meta={`${a.before} → ${a.after}`} trailing={<span className="cost">{a.delta > 0 ? `+${a.delta}` : a.delta}</span>} />
            ))}
          </List>
        </Card>
      )}

      {summary.hook && <Card title="Something they may not know" subtitle={summary.hook} />}

      <Card title="What we found" subtitle="In report order. Use the menu on a finding to leave it out of the report.">
        {summary.painPoints.length === 0 && leftOut.length === 0 ? (
          <p className="muted">Nothing stands out. This product is built consistently.</p>
        ) : (
          <List label="Findings">
            {summary.painPoints.map((p, i) => findingRow(p, i + 1, false))}
            {leftOut.map((p) => findingRow(p, 0, true))}
          </List>
        )}
      </Card>

      <Card
        title="At a glance"
        subtitle="What we found against what a tidy design system usually has."
        action={
          <Button size="sm" variant="ghost" onClick={openSettings}>
            Assumptions
          </Button>
        }
      >
        <List label="Stock-take">
          {[...summary.metrics, ...summary.healthyMetrics].map((m) => (
            <Row
              key={m.key}
              wrap
              title={m.label}
              meta={`${m.found} found${m.foundNote ? ` (${m.foundNote})` : ''} · ${m.healthy === `${m.found} is fine` ? 'fine as it is' : `a tidy system has ${m.healthy}`}`}
              trailing={
                <>
                  <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABELS[m.status]}</Badge>
                  {m.annualCost ? <span className="cost">{short(m.annualCost)}</span> : null}
                </>
              }
              onClick={m.selectors.length ? () => void controller.highlight(m.selectors, m.label) : undefined}
            />
          ))}
        </List>
      </Card>

      <AccessibilityCard />

      <Card title="About this capture" action={<Badge tone={CONFIDENCE_TONE[analysis.confidence.level]}>{CONFIDENCE_LABEL[analysis.confidence.level]}</Badge>}>
        <ul className="reasons">
          <li>
            <InfoIcon size={14} />
            {snapshot.rendered.elements.length.toLocaleString()} elements and {snapshot.authored.declarations.length.toLocaleString()} styling rules read
            {snapshot.pages ? ` across ${snapshot.pages.length} pages` : ' from one page'}.
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
