import { useState } from 'react';
import { hostOf, relativeTime } from '../../../../report/format';
import { Avatar, Badge, ClockIcon, CompareIcon, DownloadIcon, EmptyState, List, Menu, Row, Search, TrashIcon, Card } from '../ui';
import { exportHtml } from '../export';
import { useNavigation } from '../navigation';
import { useAuditState, useController } from '../use-audit';

export function HistoryView() {
  const controller = useController();
  const { history, audit, baseline } = useAuditState();
  const { go } = useNavigation();
  const [query, setQuery] = useState('');

  if (history.length === 0) {
    return (
      <EmptyState icon={<ClockIcon size={20} />} title="No snapshots yet">
        Every capture is saved on this device, so you can reopen and compare audits later.
      </EmptyState>
    );
  }

  const q = query.trim().toLowerCase();
  const items = history.filter((m) => !q || `${m.title} ${m.url}`.toLowerCase().includes(q));
  const currentId = audit?.snapshot.id;

  return (
    <div className="stack">
      <Search label="Search snapshots" value={query} onChange={setQuery} placeholder="Search snapshots…" />
      <Card subtitle={`${history.length} ${history.length === 1 ? 'snapshot' : 'snapshots'} stored on this device`}>
        <List label="Snapshots">
          {items.map((meta) => (
            <Row
              key={meta.id}
              selected={meta.id === currentId}
              leading={<Avatar src={meta.favIconUrl} label={meta.title || hostOf(meta.url)} />}
              title={meta.title || hostOf(meta.url)}
              meta={`${hostOf(meta.url)} · ${relativeTime(meta.capturedAt)}`}
              trailing={
                <>
                  {baseline?.snapshot.id === meta.id && <Badge tone="info">Baseline</Badge>}
                  <span className="area-score">{meta.score}</span>
                </>
              }
              onClick={() => void controller.open(meta.id).then(() => go('overview'))}
              actions={
                <Menu
                  label={`Actions for ${meta.title}`}
                  sections={[
                    {
                      label: 'Snapshot',
                      items: [
                        ...(currentId && meta.id !== currentId
                          ? [
                              {
                                label: 'Compare with current',
                                icon: <CompareIcon />,
                                onSelect: () => void controller.compareWith(meta.id).then(() => go('overview')),
                              },
                            ]
                          : []),
                        {
                          label: 'Export report',
                          icon: <DownloadIcon />,
                          onSelect: () =>
                            void controller.open(meta.id).then(() => {
                              const opened = controller.getState().audit;
                              if (opened) exportHtml(opened);
                            }),
                        },
                      ],
                    },
                    { items: [{ label: 'Delete', icon: <TrashIcon />, danger: true, onSelect: () => void controller.remove(meta.id) }] },
                  ]}
                />
              }
            />
          ))}
        </List>
      </Card>
    </div>
  );
}
