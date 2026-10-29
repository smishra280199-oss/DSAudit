import { CATEGORY_LABELS } from '../../../../shared/css-values';
import { percent } from '../../../../report/format';
import type { DeclarationCategory } from '../../../../shared/snapshot';
import type { TokenRole } from '../../../../inference/types';
import { Badge, Card, List, Meter, Row } from '../ui';
import { Stat, StatStrip } from '../components/Stat';
import { useAuditState, useController } from '../use-audit';

const ROLE_LABELS: Partial<Record<TokenRole, string>> = {
  'color-text': 'Text colour',
  'color-background': 'Background colour',
  'color-border': 'Border colour',
};

/** Token coverage by category, theme scopes and suggested token swaps. */
export function TokensSection() {
  const controller = useController();
  const { audit } = useAuditState();
  if (!audit) return null;
  const { tokens } = audit.analysis;
  const categories = Object.entries(tokens.coverageByCategory) as [DeclarationCategory, { token: number; literal: number; coverage: number }][];

  return (
    <>
      <Card>
        <StatStrip>
          <Stat value={tokens.definedCount} label="Tokens defined" />
          <Stat value={percent(tokens.coverage)} label="Coverage" />
          <Stat value={tokens.themeScopes.length} label="Theme scopes" />
          <Stat value={tokens.unusedTokens.length} label="Unused" />
        </StatStrip>
      </Card>

      <Card title="Coverage by category" subtitle="Share of authored declarations written with var(--token).">
        {categories.length === 0 ? (
          <p className="muted">No readable authored CSS.</p>
        ) : (
          <List label="Coverage by category">
            {categories
              .sort((a, b) => b[1].token + b[1].literal - (a[1].token + a[1].literal))
              .map(([category, c]) => (
                <Row
                  key={category}
                  title={CATEGORY_LABELS[category]}
                  meta={`${c.token.toLocaleString()} tokens · ${c.literal.toLocaleString()} literals`}
                  trailing={
                    <>
                      <div className="area-meter">
                        <Meter value={c.coverage * 100} tone="accent" label={`${CATEGORY_LABELS[category]} coverage`} />
                      </div>
                      <span className="area-score">{percent(c.coverage)}</span>
                    </>
                  }
                />
              ))}
          </List>
        )}
      </Card>

      {tokens.themeScopes.length > 0 && (
        <Card title="Theme scopes" subtitle="Selectors that redefine root tokens.">
          <List label="Theme scopes">
            {tokens.themeScopes.map((s) => (
              <Row key={s.scope} title={<span className="mono">{s.scope}</span>} trailing={`${s.redefinitions} tokens`} />
            ))}
          </List>
        </Card>
      )}

      <Card
        title="Suggested swaps"
        subtitle="Literal values that equal an existing token. Value-only matches may be meant for a different job."
      >
        {tokens.suggestions.length === 0 ? (
          <p className="muted">No literal matches an existing token.</p>
        ) : (
          <List label="Suggested token swaps">
            {tokens.suggestions.slice(0, 40).map((s) => (
              <Row
                key={`${s.role}:${s.literal}`}
                title={
                  <span className="mono">
                    {s.literal} → var({s.token})
                  </span>
                }
                meta={
                  <span className="value-flags">
                    <Badge tone={s.confidence === 'role-match' ? 'success' : 'neutral'}>
                      {s.confidence === 'role-match' ? 'Role match' : 'Value only'}
                    </Badge>
                    {ROLE_LABELS[s.role] ?? CATEGORY_LABELS[s.category]}
                  </span>
                }
                trailing={`${s.occurrences}×`}
                onClick={() => void controller.highlight(s.selectors, `var(${s.token})`)}
              />
            ))}
          </List>
        )}
      </Card>

      {tokens.unusedTokens.length > 0 && (
        <Card title="Unused tokens" subtitle="Defined but never referenced by readable CSS.">
          <div className="chips">
            {tokens.unusedTokens.slice(0, 60).map((t) => (
              <Badge key={t}>
                <span className="mono">{t}</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
