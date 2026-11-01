import { useEffect, useMemo, useState } from 'react';
import { impactEffortMatrix, rankOpportunities, type EffortSize, type Impact, type RankedOpportunity } from '../../../../business';
import { AREA_NAMES, opportunityTask } from '../../../../report/business';
import { Badge, Button, Card, CopyIcon, EmptyState, EyeOffIcon, List, Row, Search, Segmented, SparkleIcon, TargetIcon, UndoIcon, cx, type Tone } from '../ui';
import { SeverityIcon } from '../components/SeverityIcon';
import { copyText } from '../export';
import { useNavigation } from '../navigation';
import { useAuditState, useController } from '../use-audit';

type ImpactFilter = 'all' | Impact;

const IMPACT_TONE: Record<Impact, Tone> = { high: 'danger', medium: 'warning', low: 'neutral' };
const IMPACT_LABEL: Record<Impact, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const EFFORT_LABEL: Record<EffortSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const IMPACTS: Impact[] = ['high', 'medium', 'low'];
const EFFORTS: EffortSize[] = ['small', 'medium', 'large'];

function OpportunityRow({ ranked: r, dismissed, open, onToggle }: { ranked: RankedOpportunity; dismissed: boolean; open: boolean; onToggle: () => void }) {
  const controller = useController();
  const { audit } = useAuditState();
  const o = r.opportunity;
  const highlight = (selectors = o.selectors) => void controller.highlight(selectors, o.title);

  return (
      <Row
        id={rowId(o.id)}
        wrap
        leading={<SeverityIcon severity={o.severity} />}
        title={<span className={dismissed ? 'row-dimmed' : undefined}>{o.title}</span>}
        meta={
          <span className="value-flags">
            <span>
              {AREA_NAMES[o.area]} · {EFFORT_LABEL[r.effort].toLowerCase()} effort · {o.affected.toLocaleString()} affected
            </span>
            {r.quickWin && <Badge tone="success">Quick win</Badge>}
          </span>
        }
        trailing={<Badge tone={IMPACT_TONE[r.impact]}>{IMPACT_LABEL[r.impact]}</Badge>}
        expanded={open}
        onClick={onToggle}
      >
        {open && (
          <div className="opportunity-detail">
            <p>
              <strong>Why it matters.</strong> {o.detail}
            </p>
            <p>
              <strong>Benefit:</strong> {r.benefit}
            </p>
            <dl className="glance">
              <dt>Type of change</dt>
              <dd>{r.changeType}</dd>
              <dt>Impact</dt>
              <dd>
                <Badge tone={IMPACT_TONE[r.impact]}>{IMPACT_LABEL[r.impact]}</Badge>
              </dd>
              <dt>Effort</dt>
              <dd>
                {EFFORT_LABEL[r.effort]} · about {r.hours} h
              </dd>
              <dt>Affected</dt>
              <dd>{o.affected.toLocaleString()}</dd>
              <dt>Confidence</dt>
              <dd>
                <span tabIndex={0} title="How sure the analysis is that this change is right">
                  {r.confidence}%
                </span>
              </dd>
              <dt>Based on</dt>
              <dd>
                <Badge>{r.basis}</Badge>
              </dd>
            </dl>
            <p>
              <strong>Proposed change.</strong> {o.fix}
            </p>
            {o.values && o.values.length > 0 && (
              <div className="chips" aria-label="Values it replaces">
                {o.values.slice(0, 16).map((v) => (
                  <Badge key={v}>
                    <span className="mono">{v}</span>
                  </Badge>
                ))}
                {o.values.length > 16 && <span className="muted">First 16 of {o.values.length}</span>}
              </div>
            )}
            {o.selectors.length > 0 && (
              <>
                <strong>Where it happens</strong>
                <List label="Where it happens">
                  {o.selectors.slice(0, 5).map((s) => (
                    <Row key={s} title={<span className="mono">{s}</span>} trailing={<TargetIcon size={14} />} onClick={() => highlight([s])} />
                  ))}
                </List>
                {o.selectors.length > 5 && <span className="muted small">+ {o.selectors.length - 5} more</span>}
              </>
            )}
            <div className="overview-actions">
              <Button
                size="sm"
                icon={<CopyIcon size={14} />}
                onClick={() =>
                  void copyText(opportunityTask(r, audit!)).then((ok) => controller.notify(ok ? 'Copied as a task. Paste it into a ticket or an AI agent.' : 'Copy failed.'))
                }
              >
                Copy as task
              </Button>
              {o.selectors.length > 0 && (
                <Button size="sm" variant="ghost" icon={<TargetIcon size={14} />} onClick={() => highlight()}>
                  Show on page
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={dismissed ? <UndoIcon size={14} /> : <EyeOffIcon size={14} />}
                onClick={() => void controller.setDismissed(o.id, !dismissed)}
              >
                {dismissed ? 'Put back in the report' : 'Leave out of the report'}
              </Button>
            </div>
          </div>
        )}
      </Row>
  );
}

const rowId = (id: string) => `opportunity-${id}`;

/** Opportunity counts by impact and effort. Quick wins (high or medium impact, small effort) are outlined. */
export function ImpactEffortMatrix({ ranked }: { ranked: RankedOpportunity[] }) {
  const m = impactEffortMatrix(ranked);
  const max = Math.max(1, ...IMPACTS.flatMap((i) => EFFORTS.map((e) => m[i][e])));
  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <caption className="visually-hidden">Opportunities by impact and effort</caption>
        <thead>
          <tr>
            <th scope="col">Impact ↓ Effort →</th>
            {EFFORTS.map((e) => (
              <th key={e} scope="col">
                {EFFORT_LABEL[e]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {IMPACTS.map((i) => (
            <tr key={i}>
              <th scope="row">{IMPACT_LABEL[i]}</th>
              {EFFORTS.map((e) => {
                const n = m[i][e];
                const quick = i !== 'low' && e === 'small';
                return (
                  <td key={e}>
                    <span
                      className={cx('matrix__cell', quick && 'matrix__cell--quick')}
                      style={quick ? undefined : { background: n ? `color-mix(in srgb, var(--accent) ${Math.round(6 + (n / max) * 18)}%, var(--surface))` : undefined }}
                    >
                      {n || '–'}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        <span className="matrix__key" aria-hidden="true" /> Quick wins: high or medium impact for small effort.
      </p>
    </div>
  );
}

export function OpportunitiesView() {
  const { audit, dismissed } = useAuditState();
  const { focusedOpportunity } = useNavigation();
  const [query, setQuery] = useState('');
  const [impact, setImpact] = useState<ImpactFilter>('all');
  const [areas, setAreas] = useState<string[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusedOpportunity ? [focusedOpportunity] : []));

  useEffect(() => {
    if (!focusedOpportunity) return;
    setQuery('');
    setImpact('all');
    setAreas([]);
    setOpen((s) => new Set([...s, focusedOpportunity]));
    requestAnimationFrame(() => {
      const el = document.getElementById(rowId(focusedOpportunity));
      if (!el) return;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      el.querySelector<HTMLElement>('[role="button"]')?.focus({ preventScroll: true });
    });
  }, [focusedOpportunity]);

  const all = useMemo(() => (audit ? rankOpportunities(audit) : []), [audit]);
  const active = useMemo(() => all.filter((r) => !dismissed.includes(r.opportunity.id)), [all, dismissed]);
  const areaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of active) counts.set(AREA_NAMES[r.opportunity.area], (counts.get(AREA_NAMES[r.opportunity.area]) ?? 0) + 1);
    return [...counts.entries()];
  }, [active]);

  const pool = showDismissed ? all.filter((r) => dismissed.includes(r.opportunity.id)) : active;
  const items = pool.filter((r) => {
    if (impact !== 'all' && r.impact !== impact) return false;
    if (areas.length && !areas.includes(AREA_NAMES[r.opportunity.area])) return false;
    const q = query.trim().toLowerCase();
    return !q || `${r.opportunity.title} ${r.opportunity.detail} ${AREA_NAMES[r.opportunity.area]}`.toLowerCase().includes(q);
  });

  if (!audit) return null;
  if (all.length === 0) {
    return (
      <EmptyState icon={<SparkleIcon size={20} />} title="No opportunities found">
        The captured pages are consistent. Capture more of the product to be sure.
      </EmptyState>
    );
  }

  const high = active.filter((r) => r.impact === 'high').length;
  const quick = active.filter((r) => r.quickWin).length;
  const toggleArea = (a: string) => setAreas((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));

  return (
    <div className="stack">
      <Card
        title="What to change"
        subtitle={`${active.length} ${active.length === 1 ? 'change' : 'changes'} would make the product more consistent; ${high} ${high === 1 ? 'has' : 'have'} high impact and ${quick} quick ${quick === 1 ? 'win needs' : 'wins need'} only small effort.`}
      >
        <ImpactEffortMatrix ranked={active} />
      </Card>

      <Card title="All opportunities" subtitle="Ordered by impact. Open one for why it matters, the proposed change and where it happens.">
        <div className="form-stack">
          <Search label="Search opportunities" value={query} onChange={setQuery} />
          <div className="chips" role="group" aria-label="Area">
            {areaCounts.map(([a, n]) => (
              <button key={a} type="button" className="filter-chip" aria-pressed={areas.includes(a)} onClick={() => toggleArea(a)}>
                {a} <span className="muted">{n}</span>
              </button>
            ))}
          </div>
          <Segmented<ImpactFilter>
            label="Impact"
            fill
            value={impact}
            onChange={(v) => setImpact(v === impact ? 'all' : v)}
            options={[
              { value: 'all', label: 'All impact' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <div className="toolbar">
            <p className="muted small" role="status" aria-live="polite">
              Showing {items.length} of {pool.length}
              {showDismissed ? ' left out' : ''}, ordered by impact
            </p>
            {dismissed.length > 0 && (
              <button type="button" className="link-toggle" aria-pressed={showDismissed} onClick={() => setShowDismissed((v) => !v)}>
                {showDismissed ? 'Back to the report’s list' : `Left out (${dismissed.length})`}
              </button>
            )}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="muted">Nothing matches these filters.</p>
        ) : (
          <List label="Opportunities">
            {items.map((r) => (
              <OpportunityRow
                key={r.opportunity.id}
                ranked={r}
                dismissed={dismissed.includes(r.opportunity.id)}
                open={open.has(r.opportunity.id)}
                onToggle={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(r.opportunity.id)) next.delete(r.opportunity.id);
                    else next.add(r.opportunity.id);
                    return next;
                  })
                }
              />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
