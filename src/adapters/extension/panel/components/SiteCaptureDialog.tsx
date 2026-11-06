import { useEffect, useState } from 'react';
import type { PageLink } from '../../../../capture';
import { Button, Dialog, DialogSection, Spinner, TextField } from '../ui';
import { useAuditState, useController } from '../use-audit';

const DEFAULT_PAGES = 5;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

/**
 * Capture site: the open page plus up to five more of the site's main pages,
 * one per page type (found in its navigation), visited and captured in turn
 * in this tab, with screenshots, then audited together.
 */
export function SiteCaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const controller = useController();
  const { tab } = useAuditState();
  const [links, setLinks] = useState<PageLink[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [extra, setExtra] = useState('');

  useEffect(() => {
    if (!open) return;
    setLinks(null);
    setExtra('');
    void controller.suggestPages().then((found) => {
      setLinks(found);
      setChosen(found.slice(0, DEFAULT_PAGES).map((l) => l.url));
    });
  }, [open, controller]);

  const toggle = (url: string) => setChosen((c) => (c.includes(url) ? c.filter((u) => u !== url) : [...c, url]));
  const addExtra = () => {
    if (!tab || !extra.trim()) return;
    try {
      const url = new URL(extra.trim(), tab.url).href;
      setLinks((l) => [{ url, text: pathOf(url), template: pathOf(url), where: 'page' }, ...(l ?? [])]);
      setChosen((c) => [...new Set([...c, url])]);
      setExtra('');
    } catch {
      controller.notify('That doesn’t look like an address on this site.');
    }
  };
  const start = () => {
    // Must start inside the click: the first capture may ask for site access.
    void controller.captureSite(chosen);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Capture site"
      subtitle={`This page plus the pages you pick, one after another in this tab, with screenshots. About 20 seconds a page. ${tab ? `Starts from ${pathOf(tab.url)}.` : ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!links} onClick={start}>
            Capture {chosen.length + 1} {chosen.length === 0 ? 'page' : 'pages'}
          </Button>
        </>
      }
    >
      <DialogSection>
        {links === null ? (
          <p className="muted">
            <Spinner label="Finding pages" /> Finding the site’s main pages…
          </p>
        ) : links.length === 0 ? (
          <p className="muted">No other pages found in this page’s navigation. Add addresses below.</p>
        ) : (
          <ul className="page-picker">
            {links.map((l) => (
              <li key={l.url}>
                <label>
                  <input type="checkbox" checked={chosen.includes(l.url)} onChange={() => toggle(l.url)} />
                  <span>
                    <strong>{l.text}</strong>
                    <span className="muted small">
                      {pathOf(l.url)} · {l.where === 'navigation' ? 'in the navigation' : l.where === 'footer' ? 'in the footer' : 'on the page'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </DialogSection>
      <DialogSection>
        <TextField label="Add a page" value={extra} onChange={setExtra} placeholder="/checkout or a full address" hint="Pages behind a login are captured only if you are logged in in this tab." />
        <Button size="sm" onClick={addExtra} disabled={!extra.trim()}>
          Add
        </Button>
      </DialogSection>
    </Dialog>
  );
}
