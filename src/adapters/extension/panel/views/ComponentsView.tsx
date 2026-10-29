import { useState, type CSSProperties } from 'react';
import type { ComponentAnalysis, ComponentKind, ComponentVariant } from '../../../../inference/types';
import { Badge, Card, ChevronDownIcon, ChevronRightIcon, EmptyState, ComponentsIcon, List, Row } from '../ui';
import { useAuditState, useController } from '../use-audit';

/** Recreates a variant from its captured styles so it can be compared at a glance. */
function previewStyle(kind: ComponentKind, v: ComponentVariant): CSSProperties {
  const s = v.styles;
  const base: CSSProperties = {
    color: s.color,
    background: s.backgroundColor,
    borderRadius: s.borderTopLeftRadius,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontFamily: s.fontFamily,
    lineHeight: s.lineHeight,
    boxShadow: s.boxShadow,
    border: s.borderTopWidth ? `${s.borderTopWidth} solid ${s.borderTopColor ?? 'currentColor'}` : undefined,
  };
  if (kind === 'avatar') return { ...base, width: 24, height: 24, background: 'var(--surface-sunken)', border: '1px solid var(--border-strong)' };
  if (kind === 'card') return { ...base, width: 56, height: 36, borderColor: s.borderTopColor };
  if (kind === 'button' || kind === 'badge' || kind === 'input') {
    return { ...base, padding: `2px ${s.paddingLeft ?? '8px'}`, maxWidth: 140 };
  }
  return base;
}

function VariantPreview({ kind, variant }: { kind: ComponentKind; variant: ComponentVariant }) {
  const text = kind === 'card' || kind === 'avatar' ? '' : variant.sampleText || 'Aa';
  return (
    <span className="variant-preview" aria-hidden="true">
      <span className="variant-preview__sample" style={previewStyle(kind, variant)}>
        {text}
      </span>
    </span>
  );
}

function ComponentGroup({ component }: { component: ComponentAnalysis }) {
  const controller = useController();
  const [open, setOpen] = useState(component.variants.length > component.target);
  const nearDuplicates = new Set(component.nearDuplicatePairs.flatMap(([, j]) => [j]));
  const over = component.variants.length > component.target;

  return (
    <Card>
      <List label={component.label}>
        <Row
          leading={open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          title={component.label}
          meta={`${component.instances.toLocaleString()} instances`}
          expanded={open}
          onClick={() => setOpen((o) => !o)}
          trailing={
            <Badge tone={over ? 'warning' : 'success'}>
              {component.variants.length} / {component.target} variants
            </Badge>
          }
        />
      </List>
      {open && (
        <div className="variants">
          <List label={`${component.label} variants`}>
            {component.variants.slice(0, 30).map((v, i) => (
              <Row
                key={v.signature}
                leading={<VariantPreview kind={component.kind} variant={v} />}
                title={v.sampleText || `<${v.tag}>`}
                meta={
                  <span className="value-flags">
                    {i >= component.target && <Badge tone="warning">Rare</Badge>}
                    {nearDuplicates.has(i) && <Badge tone="danger">Near-duplicate</Badge>}
                    <span className="mono">{[v.styles.backgroundColor, v.styles.fontSize, v.styles.borderTopLeftRadius].filter(Boolean).join(' · ')}</span>
                  </span>
                }
                trailing={`${v.count}×`}
                onClick={() => void controller.highlight(v.selectors, `${component.label.slice(0, -1)} · variant ${i + 1}`)}
              />
            ))}
          </List>
        </div>
      )}
    </Card>
  );
}

export function ComponentsView() {
  const { audit } = useAuditState();
  if (!audit) return null;
  const present = audit.analysis.components.filter((c) => c.instances > 0);
  if (present.length === 0) {
    return (
      <EmptyState icon={<ComponentsIcon size={20} />} title="No components recognised">
        Buttons, inputs, links, headings, cards, badges and avatars are recognised by tag, role and shape.
      </EmptyState>
    );
  }
  return (
    <div className="stack">
      <p className="muted intro">Instances are grouped into variants by the properties that define their look. Select a variant to find it on the page.</p>
      {present.map((c) => (
        <ComponentGroup key={c.kind} component={c} />
      ))}
    </div>
  );
}
