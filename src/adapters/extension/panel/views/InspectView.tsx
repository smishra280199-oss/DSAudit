import { bestToken, normaliseValue, roleOf, tokenRoles, type TokenRole } from '../../../../inference/tokens';
import { parseColor, toHex } from '../../../../shared/color';
import type { InspectedProperty, InspectResult } from '../../../../inspect/types';
import { Badge, Card, CursorIcon, EmptyState, List, Row, Swatch, Toggle } from '../ui';
import { useAuditState, useController } from '../use-audit';

type Roles = Map<string, Set<TokenRole>>;

/** Colours read better as hex than as rgb(). */
function displayValue(p: InspectedProperty): string {
  const color = p.category === 'color' ? parseColor(p.computed) : null;
  return color ? toHex(color) : p.computed;
}

function SourceLine({ property, suggestion }: { property: InspectedProperty; suggestion: ReturnType<typeof bestToken> }) {
  const { winner } = property;
  if (!winner) return <span>Browser default or unreadable stylesheet</span>;
  const where = winner.inheritedFrom ? `inherited from ${winner.inheritedFrom}` : winner.selector;
  return (
    <span className="value-flags">
      {winner.kind === 'token' && <Badge tone="success">Token</Badge>}
      {winner.kind === 'literal' && <Badge tone="warning">Literal</Badge>}
      {winner.kind === 'keyword' && <Badge>Keyword</Badge>}
      {winner.important && <Badge tone="danger">!important</Badge>}
      {suggestion && (
        <Badge tone={suggestion.confidence === 'role-match' ? 'accent' : 'neutral'}>
          use var({suggestion.token}){suggestion.confidence === 'value-only' ? '?' : ''}
        </Badge>
      )}
      <span className="mono" title={`${winner.property}: ${winner.value} · ${winner.sheet}`}>
        {where}
      </span>
    </span>
  );
}

function Properties({ result, roles }: { result: InspectResult; roles: Roles }) {
  const tokens = Object.entries(result.rootCustomProperties);
  const visible = result.properties.filter((p) => p.winner || !['0px', 'none', 'normal', 'auto', '0s', 'rgba(0, 0, 0, 0)'].includes(p.computed));
  return (
    <List label="Properties">
      {visible.map((p) => {
        const literal = p.winner?.kind === 'literal' ? normaliseValue(p.winner.value, p.category) : null;
        const suggestion = literal ? bestToken(literal, p.category, roleOf(p.property, p.category), tokens, roles) : null;
        return (
          <Row
            key={p.property}
            leading={p.category === 'color' ? <Swatch color={p.computed} /> : undefined}
            title={p.label}
            meta={<SourceLine property={p} suggestion={suggestion} />}
            trailing={<span className="mono inspect-value" title={p.computed}>{displayValue(p)}</span>}
          />
        );
      })}
    </List>
  );
}

export function InspectView() {
  const controller = useController();
  const { inspect, audit, capturability } = useAuditState();
  const { result } = inspect;

  // Token roles come from the latest capture, when there is one.
  const roles: Roles = tokenRoles(audit?.snapshot.authored.declarations ?? []);

  return (
    <div className="stack">
      <Card>
        <Toggle
          label="Inspect mode"
          description={
            inspect.active ? 'Hover the page and click an element. Press Esc to stop.' : 'Pick any element to see where each of its styles comes from.'
          }
          checked={inspect.active}
          onChange={(on) => void controller.setInspectMode(on)}
        />
      </Card>

      {capturability !== 'ok' ? null : !result ? (
        <EmptyState icon={<CursorIcon size={20} />} title="No element picked yet">
          Turn on Inspect mode, then click something on the page. Hover and focus rules are ignored while picking.
        </EmptyState>
      ) : (
        <>
          <Card
            title={
              <span className="inspect-title">
                <Badge tone="accent">{result.tag}</Badge>
                <span className="mono">{result.selector}</span>
              </span>
            }
            subtitle={`${result.rect.w}×${result.rect.h}${result.text ? ` · “${result.text}”` : ''}`}
          >
            {result.contrast ? (
              <div className="contrast">
                <span className="contrast__sample" style={{ color: result.contrast.foreground, background: result.contrast.background }}>
                  Aa
                </span>
                <div className="contrast__text">
                  <strong>{result.contrast.ratio}:1 contrast</strong>
                  <span className="muted">
                    {result.contrast.foreground} on {result.contrast.background}
                    {result.contrast.approximate ? ' · approximate (background image)' : ''}
                  </span>
                </div>
                <Badge tone={result.contrast.passesAA ? 'success' : 'danger'}>{result.contrast.passesAA ? 'AA pass' : 'AA fail'}</Badge>
              </div>
            ) : (
              <p className="muted">No text, so no contrast check.</p>
            )}
          </Card>
          <Card title="Styles" subtitle="Computed value and the rule that wins (approximate cascade).">
            <Properties result={result} roles={roles} />
          </Card>
        </>
      )}
    </div>
  );
}
