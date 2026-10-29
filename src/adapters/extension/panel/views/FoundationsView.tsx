import type { ColorCluster, FoundationAnalysis, FoundationGroup } from '../../../../inference/types';
import { percent } from '../../../../report/format';
import { Card, Segmented } from '../ui';
import { Stat, StatStrip } from '../components/Stat';
import { ValueList } from '../components/ValueList';
import { useNavigation, type FoundationSegment } from '../navigation';
import { useAuditState, useController } from '../use-audit';
import { TokensSection } from './TokensSection';

const SEGMENTS: { value: FoundationSegment; label: string }[] = [
  { value: 'color', label: 'Color' },
  { value: 'typography', label: 'Type' },
  { value: 'spacing', label: 'Spacing' },
  { value: 'shape', label: 'Shape' },
  { value: 'elevation', label: 'Elevation' },
  { value: 'motion', label: 'Motion' },
  { value: 'tokens', label: 'Tokens' },
];

export function FoundationsView() {
  const { audit } = useAuditState();
  const { foundation, go } = useNavigation();
  if (!audit) return null;

  return (
    <div className="stack">
      <Segmented fill label="Foundation" options={SEGMENTS} value={foundation} onChange={(f) => go('foundations', f)} />
      {foundation === 'tokens' ? <TokensSection /> : <Foundation foundation={audit.analysis.foundations[foundation]} />}
    </div>
  );
}

function scaleCaption(group: FoundationGroup): string | null {
  if (!group.scale) return null;
  const fit = `${Math.round(group.scale.fit * 100)}% fit`;
  return group.scale.kind === 'base-unit' ? `${group.scale.value}px grid · ${fit}` : `Ratio ${group.scale.value} · ${fit}`;
}

function Foundation({ foundation }: { foundation: FoundationAnalysis }) {
  const distinct = foundation.groups.reduce((n, g) => n + g.values.length, 0);
  const primaryScale = foundation.groups.find((g) => g.scale);
  return (
    <>
      <Card>
        <StatStrip>
          <Stat value={distinct} label="Distinct values" />
          {foundation.palette && <Stat value={foundation.palette.length} label="Perceptual colours" />}
          {primaryScale?.scale && <Stat value={`${Math.round(primaryScale.scale.fit * 100)}%`} label="On inferred scale" />}
          <Stat value={percent(foundation.tokenCoverage)} label="Written with tokens" />
        </StatStrip>
      </Card>
      {foundation.palette && foundation.palette.length > 0 && <Palette clusters={foundation.palette} />}
      {foundation.groups.map((group) => (
        <Card
          key={group.key}
          title={group.label}
          subtitle={[`${group.values.length} distinct · target ≤ ${group.target}`, scaleCaption(group)].filter(Boolean).join(' · ')}
        >
          <ValueList label={group.label} values={group.values} swatches={foundation.key === 'color'} />
        </Card>
      ))}
    </>
  );
}

function Palette({ clusters }: { clusters: ColorCluster[] }) {
  const controller = useController();
  const neutrals = clusters.filter((c) => c.neutral);
  const hues = clusters.filter((c) => !c.neutral);
  return (
    <Card title="Palette" subtitle="Perceptual clusters (ΔE < 2.3). Stacked swatches are near-duplicates.">
      {[
        { label: 'Neutrals', items: neutrals },
        { label: 'Colours', items: hues },
      ]
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.label} className="palette">
            <h3 className="ui-section-label">{g.label}</h3>
            <div className="palette__grid">
              {g.items.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className="palette__chip"
                  title={`${c.hex} · ${c.count} uses${c.members.length > 1 ? ` · ${c.members.length} near-duplicates` : ''}`}
                  onClick={() => void controller.highlight(c.members.flatMap((m) => m.selectors), c.hex)}
                >
                  <span className="palette__swatch" style={{ background: c.hex }}>
                    {c.members.length > 1 && <span className="palette__stack">{c.members.length}</span>}
                  </span>
                  <span className="palette__hex mono">{c.hex}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
    </Card>
  );
}
