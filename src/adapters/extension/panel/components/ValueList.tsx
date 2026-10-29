import { useState } from 'react';
import type { ValueStat } from '../../../../inference/types';
import { Badge, Button, List, Row, Swatch } from '../ui';
import { useController } from '../use-audit';

interface ValueListProps {
  label: string;
  values: ValueStat[];
  /** Render colour swatches as the leading visual. */
  swatches?: boolean;
  initialCount?: number;
}

/** Distinct values with usage counts; selecting one highlights where it is used. */
export function ValueList({ label, values, swatches, initialCount = 10 }: ValueListProps) {
  const controller = useController();
  const [expanded, setExpanded] = useState(false);
  const total = values.reduce((n, v) => n + v.count, 0);
  const shown = expanded ? values : values.slice(0, initialCount);

  if (values.length === 0) return <p className="muted">None on this page.</p>;
  return (
    <>
      <List label={label}>
        {shown.map((v) => (
          <Row
            key={v.value}
            leading={swatches ? <Swatch color={v.value} size={20} /> : undefined}
            title={<span className="mono">{v.display}</span>}
            meta={
              <span className="value-flags">
                {v.onScale === false && <Badge tone="warning">Off scale</Badge>}
                {v.nearDuplicateOf && <Badge tone="danger">≈ {v.nearDuplicateOf}</Badge>}
                {v.onScale && !v.nearDuplicateOf && <span>On scale</span>}
                {v.onScale === undefined && !v.nearDuplicateOf && <span>{Math.round((v.count / total) * 100)}% of uses</span>}
              </span>
            }
            trailing={<span>{v.count.toLocaleString()}</span>}
            onClick={() => void controller.highlight(v.selectors, v.display)}
          />
        ))}
      </List>
      {values.length > initialCount && (
        <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show fewer' : `Show all ${values.length}`}
        </Button>
      )}
    </>
  );
}
