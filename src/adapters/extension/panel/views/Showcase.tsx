/**
 * The three cards that make the audit visible at a glance:
 *  - ComponentGallery: every style of a kind of element, redrawn side by side.
 *  - StarterSystemCard: the design system extracted from the product, ready to download.
 *  - AccessibilityCard: the automated WCAG checks, criterion by criterion.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { componentGallery, replicaCss, type GalleryGroup } from '../../../../insights/gallery';
import { starterSystem } from '../../../../insights/starter-system';
import { accessibilityReport } from '../../../../insights/wcag';
import { slug } from '../../../../report/format';
import { Badge, Button, Card, CopyIcon, DownloadIcon, List, Row, TargetIcon } from '../ui';
import { copyText, download } from '../export';
import { useAuditState, useController } from '../use-audit';

function toReact(css: Record<string, string>): CSSProperties {
  return Object.fromEntries(Object.entries(css).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v])) as CSSProperties;
}

// ── Component gallery ───────────────────────────────────────────────────

function GalleryGroupView({ group }: { group: GalleryGroup }) {
  const controller = useController();
  return (
    <div className="gallery">
      <div className="gallery__head">
        <strong>{group.label}</strong>
        <Badge tone={group.hasProblem ? 'warning' : 'success'}>
          {group.styles} styles · about {group.needed} needed
        </Badge>
      </div>
      <p className="muted small">{group.headline}</p>
      <ul className="gallery__grid">
        {group.items.map((item) => (
          <li key={item.n}>
            <button
              type="button"
              className="gallery__tile"
              onClick={() => void controller.highlight(item.selectors, `${group.label.slice(0, -1)} style ${item.n}`)}
              aria-label={`Style ${item.n}: “${item.label}”, used ${item.count} times${item.copyOf ? `, a near-copy of style ${item.copyOf}` : ''}. Show on page.`}
            >
              <span className="gallery__stage">
                <span className="gallery__replica" style={toReact(replicaCss(group.kind, item.styles))}>
                  {item.label}
                </span>
              </span>
              <span className="gallery__meta">
                <span>
                  #{item.n} · {item.count}×
                </span>
                {item.copyOf !== null && <Badge tone="danger">Copy of #{item.copyOf}</Badge>}
                {item.rare && item.copyOf === null && <Badge tone="warning">Used once</Badge>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComponentGallery() {
  const { audit } = useAuditState();
  const groups = useMemo(() => (audit ? componentGallery(audit) : []), [audit]);
  if (groups.length === 0) return null;
  const problems = groups.filter((g) => g.hasProblem);
  return (
    <Card
      title="Side by side"
      subtitle={
        problems.length
          ? `Every style we found, redrawn from the page. ${problems[0]!.headline} Select one to find it on the page.`
          : 'Every style we found, redrawn from the page. Each is clearly different: no near-copies.'
      }
    >
      <div className="stack">
        {groups.map((g) => (
          <GalleryGroupView key={g.kind} group={g} />
        ))}
      </div>
    </Card>
  );
}

// ── Starter design system ───────────────────────────────────────────────

export function StarterSystemCard() {
  const controller = useController();
  const { audit } = useAuditState();
  const [open, setOpen] = useState(false);
  const name = controller.clientName();
  const system = useMemo(() => (audit ? starterSystem(audit, name) : null), [audit, name]);
  if (!system || system.tokens.length === 0) return null;
  const file = (ext: string) => `${slug(name)}-design-tokens.${ext}`;
  const colours = system.tokens.filter((t) => t.category === 'color' && !t.alias);

  return (
    <Card
      title="Your design system, extracted"
      subtitle={`${system.before} values in use today → ${system.after} tokens. Built from their own colours, sizes and spacing, with near-copies merged. A starting point to review, not a finished system.`}
      action={
        <button type="button" className="link-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Preview'}
        </button>
      }
    >
      <div className="swatch-row" aria-label="Colour tokens">
        {colours.slice(0, 14).map((t) => (
          <span key={t.name} className="token-swatch" style={{ background: t.value }} title={`--${t.name}: ${t.value}${t.replaces.length ? ` (replaces ${t.replaces.join(', ')})` : ''}`} />
        ))}
      </div>
      {open && (
        <div className="stack">
          {system.groups.map((g) => (
            <div key={g.category}>
              <h3 className="ui-section-label">{g.label}</h3>
              <List label={g.label}>
                {g.tokens.map((t) => (
                  <Row
                    key={t.name}
                    wrap
                    leading={
                      t.category === 'color' ? (
                        <span className="token-swatch token-swatch--sm" style={{ background: t.alias ? colours.find((c) => c.name === t.alias)?.value : t.value }} />
                      ) : undefined
                    }
                    title={<span className="mono">--{t.name}</span>}
                    meta={t.replaces.length ? `replaces ${t.replaces.slice(0, 6).join(', ')}${t.replaces.length > 6 ? ` +${t.replaces.length - 6}` : ''}` : t.alias ? `points to --${t.alias}` : `${t.uses} ${t.uses === 1 ? 'use' : 'uses'}`}
                    trailing={
                      t.category === 'font-size' ? (
                        <span style={{ fontSize: `min(${t.value}, 22px)` }}>Aa</span>
                      ) : t.category === 'spacing' ? (
                        <span className="space-bar" style={{ width: t.value }} aria-hidden="true" />
                      ) : t.category === 'radius' ? (
                        <span className="radius-chip" style={{ borderRadius: t.value }} aria-hidden="true" />
                      ) : t.alias ? undefined : (
                        <span className="mono small">{t.value.length > 22 ? `${t.value.slice(0, 22)}…` : t.value}</span>
                      )
                    }
                  />
                ))}
              </List>
            </div>
          ))}
        </div>
      )}
      <div className="overview-actions">
        <Button size="sm" variant="primary" icon={<DownloadIcon size={14} />} onClick={() => download(file('css'), system.css, 'text/css')}>
          CSS variables
        </Button>
        <Button size="sm" icon={<DownloadIcon size={14} />} onClick={() => download(file('json'), system.json, 'application/json')}>
          Tokens JSON
        </Button>
        <Button size="sm" variant="ghost" icon={<CopyIcon size={14} />} onClick={() => void copyText(system.css).then((ok) => controller.notify(ok ? 'CSS variables copied.' : 'Copy failed.'))}>
          Copy
        </Button>
      </div>
    </Card>
  );
}

// ── Accessibility check ─────────────────────────────────────────────────

const STATUS = {
  pass: { tone: 'success', label: 'Pass' },
  fail: { tone: 'danger', label: 'Fails' },
  'not-applicable': { tone: 'neutral', label: 'Nothing to check' },
} as const;

export function AccessibilityCard() {
  const controller = useController();
  const { audit } = useAuditState();
  const [manual, setManual] = useState(false);
  const report = useMemo(() => (audit ? accessibilityReport(audit) : null), [audit]);
  if (!report) return null;
  return (
    <Card title="Accessibility check" subtitle={report.headline}>
      <List label="WCAG checks">
        {report.checks.map((c) => (
          <Row
            key={c.sc}
            wrap
            title={`${c.name}`}
            meta={`WCAG ${c.sc} · level ${c.level}${c.version === '2.2' ? ' (WCAG 2.2)' : ''} · ${c.status === 'fail' ? `${c.failed} of ${c.checked}` : c.checked ? `${c.checked} checked` : 'none on these pages'} · ${c.impact}`}
            trailing={
              <>
                <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                {c.status === 'fail' && c.selectors.length > 0 && <TargetIcon size={14} />}
              </>
            }
            onClick={c.status === 'fail' && c.selectors.length ? () => void controller.highlight(c.selectors, c.name) : undefined}
          />
        ))}
      </List>
      <p className="muted small">{report.regulation}</p>
      <button type="button" className="link-toggle" aria-expanded={manual} onClick={() => setManual((v) => !v)}>
        {manual ? 'Hide what needs a manual review' : 'What needs a manual review'}
      </button>
      {manual && (
        <ul className="reasons">
          {report.manual.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
