/**
 * Website technology: what the audited site is built with, detected from
 * the capture with no extra step, and how sure we are. The primary result
 * leads with its evidence; everything else found is listed under it, and
 * single weak clues are kept apart so a guess never reads as a finding.
 */

import type { DetectedTechnology, DetectionStatus, TechnologyAnalysis } from '../../../../inference/technology';
import { technologySummary } from '../../../../inference/technology';
import { Badge, Button, Card, CopyIcon, InfoIcon, List, Row, SectionLabel, type Tone } from '../ui';
import { copyText } from '../export';
import { useAuditState, useController } from '../use-audit';

const CONFIDENCE: Record<TechnologyAnalysis['confidence'], { label: string; tone: Tone }> = {
  high: { label: 'High confidence', tone: 'success' },
  medium: { label: 'Medium confidence', tone: 'warning' },
  low: { label: 'Low confidence', tone: 'danger' },
};

const STATUS: Record<DetectionStatus, { label: string; tone: Tone }> = {
  confirmed: { label: 'Confirmed', tone: 'success' },
  probable: { label: 'Probable', tone: 'warning' },
  possible: { label: 'Possible', tone: 'neutral' },
};

const nameOf = (t: DetectedTechnology) => `${t.name}${t.version ? ` ${t.version}` : ''}`;

export function TechnologyCard() {
  const controller = useController();
  const { audit } = useAuditState();
  const tech = audit?.analysis.technology;
  if (!tech) return null;

  const others = tech.technologies.filter((t) => t !== tech.primary);
  const copy = () => void copyText(technologySummary(tech)).then((ok) => controller.notify(ok ? 'Technology analysis copied.' : 'Couldn’t copy to the clipboard.'));

  return (
    <Card
      title="Website technology"
      subtitle={tech.primary ? tech.websiteType : 'Unknown / custom implementation suspected'}
      action={<Badge tone={CONFIDENCE[tech.confidence].tone}>{CONFIDENCE[tech.confidence].label}</Badge>}
    >
      {tech.primary ? (
        <>
          <List label="Detected technology">
            <Row wrap title={nameOf(tech.primary)} meta={`Detected ${tech.primaryLabel.toLowerCase()}`} trailing={<Badge tone={STATUS[tech.primary.status].tone}>{STATUS[tech.primary.status].label}</Badge>} />
          </List>
          <ul className="reasons">
            {tech.primary.evidence.map((e) => (
              <li key={e}>
                <InfoIcon size={14} />
                {e}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {tech.reason && <p className="muted">{tech.reason}</p>}

      {others.length > 0 && (
        <>
          <SectionLabel>Also detected</SectionLabel>
          <List label="Also detected">
            {others.map((t) => (
              <Row key={t.id} wrap title={nameOf(t)} meta={t.evidence[0]} trailing={<Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>} />
            ))}
          </List>
        </>
      )}

      {tech.possible.length > 0 && (
        <>
          <SectionLabel>Possible, not confirmed</SectionLabel>
          <List label="Possible, not confirmed">
            {tech.possible.map((t) => (
              <Row key={t.id} wrap title={t.name} meta={t.evidence[0]} trailing={<Badge tone="neutral">Possible</Badge>} />
            ))}
          </List>
        </>
      )}

      {tech.available && (
        <div className="overview-actions">
          <Button size="sm" variant="ghost" icon={<CopyIcon size={14} />} onClick={copy}>
            Copy analysis
          </Button>
        </div>
      )}
    </Card>
  );
}
