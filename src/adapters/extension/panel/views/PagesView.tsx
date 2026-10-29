/**
 * Pages: build a multi-page audit by clicking through the site and adding
 * each page, then audit them together. Saved audits are listed underneath.
 */

import { useState } from 'react';
import { pageName } from '../../../../insights/describe';
import { hostOf, relativeTime } from '../../../../report/format';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CompareIcon,
  DownloadIcon,
  List,
  Menu,
  PlusIcon,
  Row,
  Search,
  Spinner,
  TrashIcon,
} from '../ui';
import { useNavigation } from '../navigation';
import { useAuditState, useController } from '../use-audit';
import { useReports } from '../use-reports';

function CollectionCard() {
  const controller = useController();
  const { collection, tab, capturability, status } = useAuditState();
  const { go } = useNavigation();
  const busy = status === 'capturing';
  const alreadyAdded = collection.some((m) => m.url === tab?.url);

  return (
    <Card
      title="Pages in this audit"
      subtitle="Open each page you want in the report, add it here, then audit them together. Findings and the report will cover every page."
    >
      {collection.length === 0 ? (
        <p className="muted">No pages yet. Start with the page that is open now.</p>
      ) : (
        <List label="Pages in this audit">
          {collection.map((meta) => (
            <Row
              key={meta.id}
              selected={meta.url === tab?.url}
              leading={<Avatar src={meta.favIconUrl} label={meta.title || hostOf(meta.url)} />}
              title={pageName(meta)}
              meta={`${meta.title || hostOf(meta.url)} · ${meta.elementCount.toLocaleString()} elements`}
              actions={
                <Menu
                  label={`Actions for ${pageName(meta)}`}
                  sections={[
                    { items: [{ label: 'Remove from audit', icon: <TrashIcon />, danger: true, onSelect: () => void controller.removeFromCollection(meta.id) }] },
                  ]}
                />
              }
            />
          ))}
        </List>
      )}
      <div className="overview-actions">
        <Button
          variant={collection.length >= 2 ? 'secondary' : 'primary'}
          icon={busy ? <Spinner label="Capturing" /> : <PlusIcon size={14} />}
          disabled={capturability !== 'ok' || busy}
          onClick={() => void controller.captureAndAddPage()}
        >
          {alreadyAdded ? 'Capture this page again' : 'Add this page'}
        </Button>
        {collection.length >= 2 && (
          <Button variant="primary" disabled={busy} onClick={() => void controller.auditCollection().then(() => go('overview'))}>
            Audit {collection.length} pages
          </Button>
        )}
        {collection.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void controller.clearCollection()}>
            Clear
          </Button>
        )}
      </div>
    </Card>
  );
}

export function PagesView() {
  const controller = useController();
  const { history, audit, baseline } = useAuditState();
  const { go } = useNavigation();
  const { downloadPdf } = useReports();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const items = history.filter((m) => !q || `${m.title} ${m.url}`.toLowerCase().includes(q));
  const currentId = audit?.snapshot.id;

  return (
    <div className="stack">
      <CollectionCard />

      {history.length > 0 && (
        <>
          <Search label="Search saved audits" value={query} onChange={setQuery} placeholder="Search saved audits…" />
          <Card title="Saved audits" subtitle={`${history.length} stored on this device`}>
            <List label="Saved audits">
              {items.map((meta) => (
                <Row
                  key={meta.id}
                  selected={meta.id === currentId}
                  leading={<Avatar src={meta.favIconUrl} label={meta.title || hostOf(meta.url)} />}
                  title={meta.title || hostOf(meta.url)}
                  meta={`${meta.pageCount ? `${meta.pageCount} pages` : pageName(meta)} · ${relativeTime(meta.capturedAt)}`}
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
                          label: 'Audit',
                          items: [
                            ...(!meta.pageCount && !controller.getState().collection.some((c) => c.id === meta.id)
                              ? [{ label: 'Add to multi-page audit', icon: <PlusIcon />, onSelect: () => void controller.addToCollection(meta.id) }]
                              : []),
                            ...(currentId && meta.id !== currentId
                              ? [{ label: 'Compare with current', icon: <CompareIcon />, onSelect: () => void controller.compareWith(meta.id).then(() => go('overview')) }]
                              : []),
                            {
                              label: 'Download PDF report',
                              icon: <DownloadIcon />,
                              onSelect: () =>
                                void controller.open(meta.id).then(() => {
                                  const opened = controller.getState().audit;
                                  if (opened) void downloadPdf(opened);
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
        </>
      )}
    </div>
  );
}
