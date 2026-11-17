/**
 * Pages: build a multi-page audit by clicking through the site and adding
 * each page, then audit them together. Saved audits are listed underneath.
 */

import { useMemo, useState } from 'react';
import { pageName } from '../../../../insights/describe';
import { hostOf, relativeTime } from '../../../../report/format';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
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
import { liveSelection, selectAllState, toggleAll, toggleOne } from '../selection';

function CollectionCard() {
  const controller = useController();
  const { collection, tab, capturability, status } = useAuditState();
  const { go } = useNavigation();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const busy = status === 'capturing';
  const alreadyAdded = collection.some((m) => m.url === tab?.url);

  // Pages can leave the list elsewhere (deleted from Saved audits, a site capture): only live ids count.
  const ids = useMemo(() => collection.map((m) => m.id), [collection]);
  const chosen = liveSelection(selected, ids);
  const allState = selectAllState(selected, ids);

  const removeChosen = () => {
    void controller.removeManyFromCollection(chosen);
    setSelected(new Set());
  };
  const removeAll = () => {
    void controller.clearCollection();
    setSelected(new Set());
  };

  return (
    <Card
      title="Pages in this audit"
      subtitle="Open each page you want in the report, add it here, then audit them together. Findings and the report will cover every page."
    >
      {collection.length === 0 ? (
        <p className="muted">No pages yet. Start with the page that is open now.</p>
      ) : (
        <>
          <div className="collection-toolbar" role="toolbar" aria-label="Select pages">
            <Checkbox
              label={allState === 'all' ? 'Deselect all pages' : 'Select all pages'}
              hideLabel
              checked={allState === 'all'}
              indeterminate={allState === 'some'}
              onChange={() => setSelected(toggleAll(selected, ids))}
            />
            <span className="collection-toolbar__count" aria-live="polite">
              {chosen.length > 0
                ? `${chosen.length} of ${collection.length} selected`
                : `${collection.length} ${collection.length === 1 ? 'page' : 'pages'}`}
            </span>
            {chosen.length > 0 ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" icon={<TrashIcon size={14} />} disabled={busy} onClick={removeChosen}>
                  Remove {chosen.length === collection.length ? 'all' : chosen.length}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={removeAll}>
                Remove all
              </Button>
            )}
          </div>
          <List label="Pages in this audit">
            {collection.map((meta, i) => (
              <Row
                key={meta.id}
                selected={meta.url === tab?.url}
                leading={
                  <span className="ui-row__select">
                    <Checkbox
                      label={`Select ${pageName(meta)}`}
                      hideLabel
                      checked={selected.has(meta.id)}
                      onChange={(on) => setSelected(toggleOne(selected, meta.id, on))}
                    />
                    <Avatar src={meta.favIconUrl} label={meta.title || hostOf(meta.url)} />
                  </span>
                }
                title={pageName(meta)}
                meta={`${meta.title || hostOf(meta.url)} · ${meta.elementCount.toLocaleString()} elements`}
                actions={
                  <Menu
                    label={`Actions for ${pageName(meta)}`}
                    sections={[
                      {
                        label: 'Order',
                        items: [
                          ...(i > 0 ? [{ label: 'Move up', icon: <ArrowUpIcon />, onSelect: () => void controller.moveInCollection(meta.id, -1) }] : []),
                          ...(i < collection.length - 1
                            ? [{ label: 'Move down', icon: <ArrowDownIcon />, onSelect: () => void controller.moveInCollection(meta.id, 1) }]
                            : []),
                        ],
                      },
                      { items: [{ label: 'Remove from audit', icon: <TrashIcon />, danger: true, onSelect: () => void controller.removeFromCollection(meta.id) }] },
                    ].filter((section) => section.items.length > 0)}
                  />
                }
              />
            ))}
          </List>
        </>
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
