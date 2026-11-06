/**
 * Chrome serialises every function passed to chrome.scripting.executeScript
 * and runs it in the page, where nothing from the extension's scope exists.
 * This mock does the same (rebuilds each function from its source), so a
 * function that leans on an outer variable fails here as it does in Chrome.
 * That exact bug once made every screenshot fail silently.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ChromeBridge } from '../src/adapters/bridge/chrome';

const calls: string[] = [];
const fakeApi = {
  frame: async (_selectors: string[], focus: string) => {
    calls.push(`frame:${focus}`);
    return { targets: [], focusFailed: true, dpr: 1, viewport: { w: 100, h: 100 } };
  },
  endFrame: () => calls.push('endFrame'),
  finishShots: () => calls.push('finish'),
  discoverPages: () => [{ url: 'https://acme.test/pricing', text: 'Pricing', template: '/pricing', where: 'navigation' }],
  listUnreadableSheets: () => [],
  highlight: () => 1,
  clearHighlights: () => calls.push('clear'),
  setInspectMode: () => {},
};

function installChrome() {
  (globalThis as Record<string, unknown>).window = { __dslintCapture: fakeApi };
  (globalThis as Record<string, unknown>).chrome = {
    scripting: {
      executeScript: async ({ func, args = [] }: { func?: (...a: unknown[]) => unknown; args?: unknown[] }) => {
        if (!func) return [];
        // Exactly what Chrome does: only the function's own source travels to the page.
        const rebuilt = new Function(`return (${func.toString()})`)() as (...a: unknown[]) => unknown;
        return [{ result: await rebuilt(...args) }];
      },
    },
    tabs: { captureVisibleTab: async () => null },
  };
}

afterEach(() => {
  calls.length = 0;
  delete (globalThis as Record<string, unknown>).chrome;
  delete (globalThis as Record<string, unknown>).window;
});

describe('Chrome bridge page functions', () => {
  const tab = { id: 1, url: 'https://acme.test/', title: 'Acme', windowId: 1 };

  it('screenshot frames reach the page without relying on the extension’s scope', async () => {
    installChrome();
    const shots = await new ChromeBridge().collectEvidence(tab, ['.a', '.b']);
    expect(shots).toEqual({});
    expect(calls).toEqual(['frame:.a', 'endFrame', 'frame:.b', 'endFrame', 'finish']);
  });

  it('page discovery and highlights reach the page too', async () => {
    installChrome();
    const bridge = new ChromeBridge();
    expect((await bridge.discoverPages(tab)).map((p) => p.url)).toEqual(['https://acme.test/pricing']);
    await bridge.clearHighlights(tab);
    expect(calls).toContain('clear');
  });
});
