import { describe, expect, it } from 'vitest';
import { FakeBridge } from '../src/adapters/bridge/fake';
import { AuditController } from '../src/adapters/extension/panel/audit-controller';
import type { CapturedPage } from '../src/capture';
import { MemoryStore } from '../src/storage/kv';
import { SnapshotStore } from '../src/storage/snapshot-store';
import { makeSnapshot } from './helpers';

function page(url = 'https://example.test/page'): CapturedPage {
  const { id: _id, favIconUrl: _f, hostAccess: _h, ...rest } = makeSnapshot({ elements: [{ text: 'Hello', styles: { color: 'rgb(200, 200, 200)' } }] });
  return { ...rest, url };
}

async function setup() {
  const bridge = new FakeBridge(page());
  const controller = new AuditController(bridge);
  await controller.init();
  return { bridge, controller };
}

describe('snapshot store', () => {
  it('keeps an index newest-first plus one key per snapshot', async () => {
    const kv = new MemoryStore();
    const store = new SnapshotStore(kv);
    await store.save({ ...makeSnapshot(), id: 'a' }, 50);
    await store.save({ ...makeSnapshot(), id: 'b' }, 60);
    expect((await store.list()).map((m) => m.id)).toEqual(['b', 'a']);
    expect(await kv.get('snapshot:a')).toBeDefined();
    await store.remove('a');
    expect((await store.list()).map((m) => m.id)).toEqual(['b']);
    expect(await store.load('a')).toBeNull();
  });
});

describe('audit controller', () => {
  it('asks for host access on the first capture only', async () => {
    const { bridge, controller } = await setup();
    await controller.capture();
    await controller.capture();
    expect(bridge.calls.filter((c) => c.method === 'requestHostAccess')).toHaveLength(1);
    expect(bridge.calls.filter((c) => c.method === 'capture')).toHaveLength(2);
  });

  it('saves each capture and shows its audit', async () => {
    const { controller } = await setup();
    await controller.capture();
    const state = controller.getState();
    expect(state.audit?.snapshot.hostAccess).toBe(true);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.score).toBe(state.audit!.score.overall);
  });

  it('records a declined permission and still captures', async () => {
    const bridge = new FakeBridge(page());
    bridge.grantOnRequest = false;
    const controller = new AuditController(bridge);
    await controller.init();
    await controller.capture();
    expect(controller.getState().audit?.snapshot.hostAccess).toBe(false);
    expect(controller.getState().audit?.analysis.confidence.reasons.join(' ')).toMatch(/cross-origin/);
  });

  it('refuses to capture restricted pages', async () => {
    const { bridge, controller } = await setup();
    bridge.switchTab({ id: 2, url: 'chrome://settings', title: 'Settings' });
    await controller.capture();
    expect(controller.getState().capturability).toBe('browser-page');
    expect(bridge.calls.some((c) => c.method === 'capture')).toBe(false);
  });

  it('reopens the latest audit when returning to a tab', async () => {
    const { bridge, controller } = await setup();
    await controller.capture();
    const id = controller.getState().audit!.snapshot.id;
    bridge.switchTab({ id: 2, url: 'https://other.test/', title: 'Other' });
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getState().audit).toBeNull();
    bridge.switchTab({ id: 1, url: 'https://example.test/page', title: 'Example' });
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getState().audit?.snapshot.id).toBe(id);
  });

  it('persists dismissed opportunities per snapshot', async () => {
    const { controller } = await setup();
    await controller.capture();
    const [first] = controller.getState().audit!.analysis.opportunities;
    await controller.setDismissed(first!.id, true);
    const id = controller.getState().audit!.snapshot.id;
    await controller.open(id);
    expect(controller.getState().dismissed).toEqual([first!.id]);
  });

  it('forwards highlights and inspect picks through the bridge', async () => {
    const { bridge, controller } = await setup();
    await controller.highlight(['.a', '.b'], 'Label');
    expect(bridge.calls.at(-1)).toEqual({ method: 'highlight', args: [1, ['.a', '.b'], 'Label'] });
    await controller.setInspectMode(true);
    bridge.pick({ selector: 'button', tag: 'button', text: '', classes: [], rect: { x: 0, y: 0, w: 1, h: 1 }, properties: [], contrast: null, rootCustomProperties: {} });
    expect(controller.getState().inspect.result?.selector).toBe('button');
  });

  it('recomputes savings when assumptions change, without re-analysing', async () => {
    const { controller } = await setup();
    await controller.capture();
    const before = controller.getState().audit!;
    await controller.updateAssumptions({ ...before.assumptions, hourlyRate: before.assumptions.hourlyRate * 2 });
    const after = controller.getState().audit!;
    expect(after.analysis).toBe(before.analysis);
    expect(after.savings.cleanupCost).toBe(Math.round(after.savings.cleanupHours * before.assumptions.hourlyRate * 2));
  });
});
