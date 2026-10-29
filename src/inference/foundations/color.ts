/**
 * Colour foundation: every text, background and border colour in use,
 * grouped by role and clustered perceptually so near-duplicates surface.
 */

import { chroma, deltaE, NEAR_DUPLICATE_DELTA_E, parseColor, toHex, type Rgba } from '../../shared/color';
import type { PageSnapshot } from '../../shared/snapshot';
import { ValueCounter, type ElementView } from '../elements';
import type { ColorCluster, FoundationAnalysis, FoundationGroup, ValueStat } from '../types';
import { tokenCoverage } from './shared';

const ROLES = [
  { key: 'text', label: 'Text', style: 'color' },
  { key: 'background', label: 'Background', style: 'backgroundColor' },
  { key: 'border', label: 'Border', style: 'borderTopColor' },
] as const;

type Role = (typeof ROLES)[number]['key'];

function normalise(value: string): string | null {
  const rgba = parseColor(value);
  return rgba && rgba.a > 0 ? toHex(rgba) : null;
}

export function analyseColor(snapshot: PageSnapshot, views: ElementView[]): FoundationAnalysis {
  const counters = Object.fromEntries(ROLES.map((r) => [r.key, new ValueCounter()])) as Record<Role, ValueCounter>;

  for (const { el, styles } of views) {
    for (const role of ROLES) {
      // Text colour only matters where there is text; it is inherited everywhere else.
      if (role.key === 'text' && !el.text) continue;
      const raw = role.key === 'text' ? styles.color : el.styles[role.style];
      const hex = raw ? normalise(raw) : null;
      if (hex) counters[role.key].add(hex, el.selector);
    }
  }

  const groups: FoundationGroup[] = ROLES.map((role) => ({
    key: role.key,
    label: role.label,
    values: counters[role.key].entries(),
    target: role.key === 'text' ? 8 : role.key === 'background' ? 10 : 6,
  }));

  const palette = clusterPalette(groups);
  const nearDuplicateOf = new Map<string, string>();
  for (const cluster of palette) {
    for (const member of cluster.members.slice(1)) nearDuplicateOf.set(member.value, cluster.hex);
  }
  for (const group of groups) {
    group.values = group.values.map((v) =>
      nearDuplicateOf.has(v.value) ? { ...v, nearDuplicateOf: nearDuplicateOf.get(v.value) } : v,
    );
  }

  return {
    key: 'color',
    label: 'Color',
    groups,
    palette,
    tokenCoverage: tokenCoverage(snapshot, ['color']),
    applicable: palette.length > 0,
  };
}

/** Greedy clustering by ΔE: the most used colour of each cluster is its representative. */
export function clusterPalette(groups: FoundationGroup[]): ColorCluster[] {
  const merged = new Map<string, ValueStat & { roles: ColorCluster['roles'] }>();
  for (const group of groups) {
    for (const v of group.values) {
      const entry = merged.get(v.value) ?? { ...v, count: 0, selectors: [], roles: { text: 0, background: 0, border: 0 } };
      entry.count += v.count;
      entry.selectors = [...entry.selectors, ...v.selectors].slice(0, 40);
      entry.roles[group.key as Role] += v.count;
      merged.set(v.value, entry);
    }
  }

  const clusters: (ColorCluster & { rgba: Rgba })[] = [];
  for (const entry of [...merged.values()].sort((a, b) => b.count - a.count)) {
    const rgba = parseColor(entry.value)!;
    const home = clusters.find((c) => deltaE(c.rgba, rgba) < NEAR_DUPLICATE_DELTA_E);
    const { roles, ...stat } = entry;
    if (home) {
      home.members.push(stat);
      home.count += entry.count;
      home.roles.text += roles.text;
      home.roles.background += roles.background;
      home.roles.border += roles.border;
    } else {
      clusters.push({ hex: entry.value, rgba, count: entry.count, members: [stat], neutral: chroma(rgba) < 8, roles: { ...roles } });
    }
  }
  return clusters.map(({ rgba: _rgba, ...cluster }) => cluster);
}
