/**
 * Which elements to photograph after a capture, so the report can show the
 * real thing instead of describing it: one example of every component style,
 * text that may fail contrast (to check it against real pixels), the
 * accessibility failures, where near-copy colours are used, and one example
 * of each text size. In page order, so the page scrolls down once.
 */

import type { Audit } from '../audit';
import { foundationDetail, foundationEvidence } from './foundation-detail';
import { starterSystem } from './starter-system';

const PER_KIND = 12;

export function planEvidence(audit: Audit): string[] {
  const { analysis, snapshot } = audit;
  const picks: string[] = [];
  const add = (selectors: (string | undefined)[], limit: number) => {
    let n = 0;
    for (const s of selectors) {
      if (!s || n >= limit) continue;
      picks.push(s);
      n += 1;
    }
  };

  for (const c of analysis.components) {
    if (c.kind === 'avatar') continue;
    add(c.variants.map((v) => v.selectors[0]), PER_KIND);
  }
  const a = analysis.accessibility;
  add([...a.contrastFailures.map((f) => f.selector), ...a.contrastCandidates], 40);
  add(a.smallTargets.map((t) => t.selector), 8);
  add(a.unlabelledFields.map((f) => f.selector), 8);
  add(a.imagesWithoutAlt.map((i) => i.selector), 6);
  for (const cluster of analysis.foundations.color.palette ?? []) {
    if (cluster.members.length > 1) add(cluster.members.map((m) => m.selectors[0]), cluster.members.length);
  }
  const sizes = analysis.foundations.typography.groups.find((g) => g.key === 'font-size');
  add((sizes?.values ?? []).map((v) => v.selectors[0]), 14);

  // Examples for the foundation tables: where each colour, text style, spacing value and radius is used.
  add(foundationEvidence(foundationDetail(audit, starterSystem(audit))), 120);

  // Page order: the elements' captured positions.
  const top = new Map(snapshot.rendered.elements.map((e) => [e.selector, e.rect.y]));
  return [...new Set(picks)].slice(0, 220).sort((x, y) => (top.get(x) ?? 0) - (top.get(y) ?? 0));
}
