/**
 * Managing the pages of a multi-page audit: bulk selection rules (pure) and
 * the controller's bulk removal, reordering and persistence.
 */
import { describe, expect, it } from 'vitest';
import { FakeBridge } from '../src/adapters/bridge/fake';
import { AuditController } from '../src/adapters/extension/panel/audit-controller';
import { liveSelection, selectAllState, toggleAll, toggleOne } from '../src/adapters/extension/panel/selection';
import type { CapturedPage } from '../src/capture';
import { makeSnapshot } from './helpers';

function page(url: string): CapturedPage {
  const { id: _i, favIconUrl: _f, hostAccess: _h, ...rest } = makeSnapshot({ elements: [{ text: 'Hello' }] });
  return { ...rest, url };
}

/** A controller with `n` pages collected, captured one by one like a user clicking through a site. */
async function withPages(n: number) {
  const bridge = new FakeBridge(page('https://acme.test/p0'));
  const controller = new AuditController(bridge);
  await controller.init();
  for (let i = 0; i < n; i += 1) {
    const url = `https://acme.test/p${i}`;
    bridge.setPage(page(url));
    bridge.switchTab({ id: 1, url, title: `Page ${i}` });
    await new Promise((r) => setTimeout(r, 0));
    await controller.captureAndAddPage();
  }
  const urls = () => controller.getState().collection.map((m) => m.url.replace('https://acme.test/', ''));
  const ids = () => controller.getState().collection.map((m) => m.id);
  return { bridge, controller, urls, ids };
}

describe('selection rules', () => {
  const ids = ['a', 'b', 'c'];

  it('select all selects every page; pressing it again clears', () => {
    const all = toggleAll(new Set(), ids);
    expect([...all]).toEqual(ids);
    expect(selectAllState(all, ids)).toBe('all');
    expect(toggleAll(all, ids).size).toBe(0);
  });

  it('a partial selection shows as "some" and select all completes it', () => {
    const some = toggleOne(new Set(), 'b', true);
    expect(selectAllState(some, ids)).toBe('some');
    expect([...toggleAll(some, ids)]).toEqual(ids);
  });

  it('pages can be selected and deselected one at a time', () => {
    let s = toggleOne(new Set(), 'a', true);
    s = toggleOne(s, 'c', true);
    s = toggleOne(s, 'a', false);
    expect(liveSelection(s, ids)).toEqual(['c']);
  });

  it('ignores selected ids that are no longer in the list, and keeps list order', () => {
    const s = new Set(['gone', 'c', 'a']);
    expect(liveSelection(s, ids)).toEqual(['a', 'c']);
    expect(selectAllState(new Set(['gone']), ids)).toBe('none');
    // A newly added page is not selected, so "all" drops back to "some".
    expect(selectAllState(new Set(ids), [...ids, 'd'])).toBe('some');
    expect(selectAllState(new Set(), [])).toBe('none');
  });
});

describe('bulk page management in the controller', () => {
  it('removes five chosen pages out of fifteen in one operation', async () => {
    const { bridge, controller, urls, ids } = await withPages(15);
    expect(urls()).toHaveLength(15);
    const chosen = [1, 3, 5, 7, 9].map((i) => ids()[i]!);

    await controller.removeManyFromCollection(chosen);

    expect(urls()).toEqual(['p0', 'p2', 'p4', 'p6', 'p8', 'p10', 'p11', 'p12', 'p13', 'p14']);
    expect(controller.getState().toast).toMatch(/5 pages removed/);
    // Persisted: a fresh panel sees the same list.
    const reopened = new AuditController(bridge);
    await reopened.init();
    expect(reopened.getState().collection.map((m) => m.id)).toEqual(ids());
    // The snapshots themselves are kept in Saved audits.
    expect(controller.getState().history.filter((m) => chosen.includes(m.id))).toHaveLength(5);
  });

  it('removes every page at once', async () => {
    const { controller, urls } = await withPages(15);
    await controller.clearCollection();
    expect(urls()).toEqual([]);
    expect(controller.getState().toast).toMatch(/All 15 pages removed/);
  });

  it('ignores unknown ids and an empty selection', async () => {
    const { controller, urls } = await withPages(3);
    await controller.removeManyFromCollection([]);
    await controller.removeManyFromCollection(['not-a-page']);
    expect(urls()).toEqual(['p0', 'p1', 'p2']);
  });

  it('reorders pages and keeps the order after removals', async () => {
    const { controller, urls, ids } = await withPages(4);
    await controller.moveInCollection(ids()[3]!, -1);
    expect(urls()).toEqual(['p0', 'p1', 'p3', 'p2']);
    await controller.moveInCollection(ids()[0]!, -1); // already first: no-op
    await controller.moveInCollection(ids()[3]!, 1); // already last: no-op
    expect(urls()).toEqual(['p0', 'p1', 'p3', 'p2']);
    await controller.removeManyFromCollection([ids()[1]!]);
    expect(urls()).toEqual(['p0', 'p3', 'p2']);
  });

  it('still audits the remaining pages together, in the chosen order', async () => {
    const { controller, ids } = await withPages(5);
    await controller.removeManyFromCollection([ids()[0]!, ids()[2]!]);
    await controller.moveInCollection(ids()[2]!, -1);
    await controller.auditCollection();
    const pages = controller.getState().audit?.snapshot.pages?.map((p) => p.url.replace('https://acme.test/', ''));
    expect(pages).toEqual(['p1', 'p4', 'p3']);
  });

  it('adding a page after a bulk removal appends it', async () => {
    const { bridge, controller, urls, ids } = await withPages(3);
    await controller.removeManyFromCollection(ids().slice(0, 2));
    bridge.setPage(page('https://acme.test/new'));
    bridge.switchTab({ id: 1, url: 'https://acme.test/new', title: 'New' });
    await new Promise((r) => setTimeout(r, 0));
    await controller.captureAndAddPage();
    expect(urls()).toEqual(['p2', 'new']);
  });
});
