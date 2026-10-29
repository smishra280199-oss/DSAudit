import { formatMoney } from '../../../../savings';
import { percent } from '../../../../report/format';
import type { ConfidenceLevel } from '../../../../inference/types';
import { Badge, Button, Card, InfoIcon, List, Meter, Row, type Tone } from '../ui';
import { SeverityIcon } from '../components/SeverityIcon';
import { Stat, StatStrip } from '../components/Stat';
import { destinationFor, useNavigation } from '../navigation';
import { useAuditState, useController } from '../use-audit';

const CONFIDENCE_TONE: Record<ConfidenceLevel, Tone> = { high: 'success', medium: 'warning', low: 'danger' };
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

export function OverviewView() {
  const controller = useController();
  const { audit, dismissed, hostAccess } = useAuditState();
  const { go, openSettings } = useNavigation();
  if (!audit) return null;

  const { snapshot, analysis, score, savings, assumptions } = audit;
  const comparison = controller.comparison();
  const top = analysis.opportunities.filter((o) => !dismissed.includes(o.id)).slice(0, 3);
  const money = (n: number) => formatMoney(n, assumptions.currency);

  return (
    <div className="stack">
      <Card>
        <div className="score">
          <span className="score__value" aria-label={`Score ${score.overall} out of 100`}>
            {score.overall}
          </span>
          <div className="score__details">
            <div className="score__badges">
              <Badge tone="accent">
                {score.grade} · {score.maturity}
              </Badge>
              <Badge tone={CONFIDENCE_TONE[analysis.confidence.level]} dot>
                {CONFIDENCE_LABEL[analysis.confidence.level]}
              </Badge>
            </div>
            <p className="score__caption">
              {snapshot.rendered.elements.length.toLocaleString()} elements · {snapshot.authored.declarations.length.toLocaleString()}{' '}
              declarations · {analysis.tokens.definedCount} tokens
            </p>
          </div>
        </div>
      </Card>

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

      <Card title="Areas" subtitle="Heuristic scores, 0–100. Select one for details.">
        <List label="Area scores">
          {score.areas
            .filter((a) => a.applicable)
            .map((area) => {
              const target = destinationFor(area.key);
              return (
                <Row
                  key={area.key}
                  title={area.label}
                  meta={area.notes[0]}
                  onClick={() => go(target.view, target.foundation)}
                  trailing={
                    <>
                      <div className="area-meter">
                        <Meter value={area.score} label={`${area.label} score`} />
                      </div>
                      <span className="area-score">{area.score}</span>
                    </>
                  }
                />
              );
            })}
        </List>
      </Card>

      <Card
        title="Savings"
        subtitle="Planning estimate from editable assumptions"
        action={
          <Button size="sm" variant="ghost" onClick={openSettings}>
            Assumptions
          </Button>
        }
      >
        <StatStrip>
          <Stat value={money(savings.annualSavings)} label="Recoverable per year" />
          <Stat value={money(savings.cleanupCost)} label={`Cleanup (~${savings.cleanupHours}h)`} />
          <Stat value={savings.paybackMonths === null ? '—' : `${savings.paybackMonths} mo`} label="Payback" />
          <Stat value={percent(analysis.tokens.coverage)} label="Token coverage" />
        </StatStrip>
      </Card>

      <Card
        title="Top opportunities"
        action={
          <Button size="sm" variant="ghost" onClick={() => go('opportunities')}>
            See all {analysis.opportunities.length}
          </Button>
        }
      >
        {top.length === 0 ? (
          <p className="muted">Nothing stands out. This page is built consistently.</p>
        ) : (
          <List label="Top opportunities">
            {top.map((o) => (
              <Row
                key={o.id}
                leading={<SeverityIcon severity={o.severity} />}
                title={o.title}
                meta={o.fix}
                trailing={`~${o.effortHours}h`}
                onClick={() => void controller.highlight(o.selectors, o.title)}
              />
            ))}
          </List>
        )}
      </Card>

      {analysis.confidence.reasons.length > 0 && (
        <Card title="Limits of this capture">
          <ul className="reasons">
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
      )}
    </div>
  );
}
