import { useMemo, useState } from 'react';
import type { Opportunity } from '../../../../inference/types';
import { Badge, Button, Card, CopyIcon, EmptyState, EyeOffIcon, List, Menu, Row, Search, Segmented, SparkleIcon, TargetIcon, UndoIcon } from '../ui';
import { SeverityIcon } from '../components/SeverityIcon';
import { copyText } from '../export';
import { useAuditState, useController } from '../use-audit';

type Filter = 'all' | 'high' | 'dismissed';

const AREA_LABELS: Record<Opportunity['area'], string> = {
  color: 'Color',
  typography: 'Typography',
  spacing: 'Spacing',
  shape: 'Shape',
  elevation: 'Elevation',
  motion: 'Motion',
  components: 'Components',
  tokens: 'Tokens',
  interaction: 'Interaction',
  accessibility: 'Accessibility',
};

function OpportunityRow({ opportunity: o, dismissed }: { opportunity: Opportunity; dismissed: boolean }) {
  const controller = useController();
  const [open, setOpen] = useState(false);
  const highlight = () => void controller.highlight(o.selectors, o.title);

  return (
    <Row
      leading={<SeverityIcon severity={o.severity} />}
      title={o.title}
      meta={`${AREA_LABELS[o.area]} · ${o.affected.toLocaleString()} affected`}
      trailing={`~${o.effortHours}h`}
      expanded={open}
      onClick={() => setOpen((v) => !v)}
      actions={
        <Menu
          label={`Actions for ${o.title}`}
          sections={[
            {
              label: 'Opportunity',
              items: [
                ...(o.selectors.length ? [{ label: 'Highlight on page', icon: <TargetIcon />, onSelect: highlight }] : []),
                {
                  label: 'Copy fix',
                  icon: <CopyIcon />,
                  onSelect: () => void copyText(`${o.title}\n${o.fix}`).then((ok) => controller.notify(ok ? 'Fix copied.' : 'Couldn’t copy.')),
                },
              ],
            },
            {
              items: [
                dismissed
                  ? { label: 'Restore', icon: <UndoIcon />, onSelect: () => void controller.setDismissed(o.id, false) }
                  : { label: 'Dismiss', icon: <EyeOffIcon />, danger: true, onSelect: () => void controller.setDismissed(o.id, true) },
              ],
            },
          ]}
        />
      }
    >
      {open && (
        <div className="opportunity-detail">
          <p>{o.detail}</p>
          <p>
            <strong>Fix.</strong> {o.fix}
          </p>
          {o.values && o.values.length > 0 && (
            <div className="chips">
              {o.values.slice(0, 16).map((v) => (
                <Badge key={v}>
                  <span className="mono">{v}</span>
                </Badge>
              ))}
              {o.values.length > 16 && <span className="muted">+{o.values.length - 16}</span>}
            </div>
          )}
          {o.selectors.length > 0 && (
            <Button size="sm" icon={<TargetIcon size={14} />} onClick={highlight}>
              Highlight on page
            </Button>
          )}
        </div>
      )}
    </Row>
  );
}

export function OpportunitiesView() {
  const { audit, dismissed } = useAuditState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const items = useMemo(() => {
    const all = audit?.analysis.opportunities ?? [];
    const q = query.trim().toLowerCase();
    return all.filter((o) => {
      const isDismissed = dismissed.includes(o.id);
      if (filter === 'dismissed' ? !isDismissed : isDismissed) return false;
      if (filter === 'high' && o.severity !== 'high') return false;
      return !q || `${o.title} ${o.detail} ${AREA_LABELS[o.area]}`.toLowerCase().includes(q);
    });
  }, [audit, dismissed, query, filter]);

  if (!audit) return null;
  const totalHours = Math.round(items.reduce((n, o) => n + o.effortHours, 0) * 10) / 10;

  return (
    <div className="stack">
      <div className="toolbar">
        <Search label="Search opportunities" value={query} onChange={setQuery} />
        <Segmented
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'high', label: 'High' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<SparkleIcon size={20} />} title={filter === 'dismissed' ? 'Nothing dismissed' : 'Nothing to fix here'}>
          {query ? 'No opportunity matches your search.' : 'No opportunities in this view.'}
        </EmptyState>
      ) : (
        <Card subtitle={`${items.length} ${items.length === 1 ? 'opportunity' : 'opportunities'} · ~${totalHours}h of work`}>
          <List label="Opportunities">
            {items.map((o) => (
              <OpportunityRow key={o.id} opportunity={o} dismissed={dismissed.includes(o.id)} />
            ))}
          </List>
        </Card>
      )}
    </div>
  );
}
