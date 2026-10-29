/**
 * An in-memory Bridge for tests: it returns a canned page and records every
 * call so tests can assert on what the panel asked the browser to do.
 */

import type { CapturedPage } from '../../capture';
import type { InspectResult } from '../../inspect/types';
import { MemoryStore } from '../../storage/kv';
import type { Bridge, InspectListener, TabInfo } from './types';

export class FakeBridge implements Bridge {
  readonly kind = 'fake';
  readonly storage = new MemoryStore();
  readonly calls: { method: string; args: unknown[] }[] = [];
  hostAccess = false;
  grantOnRequest = true;
  private tab: TabInfo | null;
  private readonly tabListeners = new Set<(tab: TabInfo | null) => void>();
  private readonly inspectListeners = new Set<InspectListener>();

  constructor(
    private readonly page: CapturedPage,
    tab: TabInfo = { id: 1, url: page.url, title: page.title },
  ) {
    this.tab = tab;
  }

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  async activeTab() {
    return this.tab;
  }

  onActiveTabChanged(listener: (tab: TabInfo | null) => void) {
    this.tabListeners.add(listener);
    return () => this.tabListeners.delete(listener);
  }

  /** Test helper: simulate the user switching tabs. */
  switchTab(tab: TabInfo | null) {
    this.tab = tab;
    this.tabListeners.forEach((l) => l(tab));
  }

  async hasHostAccess() {
    return this.hostAccess;
  }

  async requestHostAccess() {
    this.record('requestHostAccess');
    this.hostAccess = this.grantOnRequest;
    return this.hostAccess;
  }

  async capture(tab: TabInfo) {
    this.record('capture', tab.id);
    return { page: structuredClone(this.page), hostAccess: this.hostAccess };
  }

  async captureScreenshot(tab: TabInfo) {
    this.record('captureScreenshot', tab.id);
    return null;
  }

  async highlight(tab: TabInfo, selectors: string[], label?: string) {
    this.record('highlight', tab.id, selectors, label);
    return selectors.length;
  }

  async clearHighlights(tab: TabInfo) {
    this.record('clearHighlights', tab.id);
  }

  async setInspectMode(tab: TabInfo, on: boolean) {
    this.record('setInspectMode', tab.id, on);
  }

  onInspect(listener: InspectListener) {
    this.inspectListeners.add(listener);
    return () => this.inspectListeners.delete(listener);
  }

  /** Test helper: simulate the user picking an element in Inspect mode. */
  pick(result: InspectResult) {
    this.inspectListeners.forEach((l) => l.picked(result));
  }
}
