/**
 * Combines several page snapshots into one, so a multi-page audit runs
 * through exactly the same inference as a single page.
 *
 *  - Rendered elements are concatenated with page-scoped selectors.
 *  - Authored CSS is mostly shared between pages, so declarations, custom
 *    properties and sheets are de-duplicated (keeping the highest match count).
 *  - Interaction coverage counts are summed across pages.
 */

import { summariseClassNames } from '../shared/class-naming';
import { scopeSelector } from '../shared/page-scope';
import { SNAPSHOT_SCHEMA_VERSION, type AuthoredDeclaration, type PageSnapshot, type RenderedElement } from '../shared/snapshot';

function uniqueBy<T>(items: T[], key: (item: T) => string, prefer?: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    const existing = map.get(k);
    map.set(k, existing && prefer ? prefer(existing, item) : (existing ?? item));
  }
  return [...map.values()];
}

export function mergeSnapshots(snapshots: PageSnapshot[], id: string, title: string): PageSnapshot {
  if (snapshots.length === 0) throw new Error('Nothing to merge.');
  const pages = snapshots.map((s) => ({
    snapshotId: s.id,
    url: s.url,
    title: s.title,
    capturedAt: s.capturedAt,
    elementCount: s.rendered.elements.length,
  }));

  const elements: RenderedElement[] = [];
  snapshots.forEach((s, page) => {
    const offset = elements.length;
    for (const el of s.rendered.elements) {
      elements.push({
        ...el,
        index: el.index + offset,
        parent: el.parent < 0 ? -1 : el.parent + offset,
        selector: scopeSelector(page, el.selector),
      });
    }
  });

  const declarations = uniqueBy(
    snapshots.flatMap((s) => s.authored.declarations),
    (d: AuthoredDeclaration) => [d.selector, d.property, d.value, d.sheet, d.media ?? ''].join('\u0000'),
    (a, b) => (b.matchCount > a.matchCount ? b : a),
  );
  const interactions = snapshots.map((s) => s.authored.interaction);
  const focusTechniques: PageSnapshot['authored']['interaction']['focusTechniques'] = {};
  for (const i of interactions) {
    for (const [k, v] of Object.entries(i.focusTechniques)) {
      focusTechniques[k as keyof typeof focusTechniques] = Math.max(focusTechniques[k as keyof typeof focusTechniques] ?? 0, v ?? 0);
    }
  }

  const first = snapshots[0]!;
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    id,
    url: first.url,
    title,
    favIconUrl: first.favIconUrl,
    capturedAt: snapshots.map((s) => s.capturedAt).sort().at(-1)!,
    viewport: first.viewport,
    colorScheme: first.colorScheme,
    hostAccess: snapshots.every((s) => s.hostAccess),
    screenshot: first.screenshot,
    pages,
    rendered: {
      elements,
      truncated: snapshots.some((s) => s.rendered.truncated),
      rootCustomProperties: Object.assign({}, ...snapshots.map((s) => s.rendered.rootCustomProperties)),
    },
    authored: {
      declarations,
      truncated: snapshots.some((s) => s.authored.truncated),
      customProperties: uniqueBy(
        snapshots.flatMap((s) => s.authored.customProperties),
        (c) => [c.name, c.selector, c.value, c.media ?? ''].join('\u0000'),
      ),
      interaction: {
        interactiveCount: interactions.reduce((n, i) => n + i.interactiveCount, 0),
        withHover: interactions.reduce((n, i) => n + i.withHover, 0),
        withFocus: interactions.reduce((n, i) => n + i.withFocus, 0),
        focusTechniques,
        outlineRemovedWithoutReplacement: uniqueBy(
          interactions.flatMap((i) => i.outlineRemovedWithoutReplacement),
          (r) => `${r.selector}\u0000${r.sheet}`,
        ),
      },
      classNaming: summariseClassNames(elements.flatMap((e) => e.classes)),
      sheets: uniqueBy(snapshots.flatMap((s) => s.authored.sheets), (s) => s.label),
      unreadableSheets: [...new Set(snapshots.flatMap((s) => s.authored.unreadableSheets))],
    },
  };
}
