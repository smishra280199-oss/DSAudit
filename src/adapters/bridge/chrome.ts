/**
 * The real Bridge, built on chrome.sidePanel's host page APIs: scripting
 * (inject capture.js on demand into the tab's isolated world), permissions,
 * tabs, storage and runtime messaging.
 */

import type { CaptureApi } from '../../capture';
import type { FetchedSheet } from '../../capture/stylesheets';
import { RUNTIME_MESSAGES, type RuntimeMessage } from '../../shared/messages';
import type { KeyValueStore } from '../../storage/kv';
import { MAX_FETCHED_SHEETS, MAX_SHEET_CHARS, type Bridge, type InspectListener, type TabInfo } from './types';

const ALL_URLS = { origins: ['<all_urls>'] };
const CAPTURE_SCRIPT = 'capture.js';

type CaptureGlobal = Window & { __dslintCapture: CaptureApi };

class ChromeStorage implements KeyValueStore {
  async get<T>(key: string): Promise<T | undefined> {
    return (await chrome.storage.local.get(key))[key] as T | undefined;
  }
  set(entries: Record<string, unknown>): Promise<void> {
    return chrome.storage.local.set(entries);
  }
  remove(keys: string[]): Promise<void> {
    return chrome.storage.local.remove(keys);
  }
}

/** Chrome omits url and title for tabs the extension can't access; they come through as ''. */
function toTabInfo(tab: chrome.tabs.Tab | undefined): TabInfo | null {
  if (!tab?.id) return null;
  return { id: tab.id, url: tab.url ?? '', title: tab.title ?? '', favIconUrl: tab.favIconUrl, windowId: tab.windowId };
}

async function fetchSheet(href: string): Promise<FetchedSheet | null> {
  try {
    const response = await fetch(href, { credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) return null;
    return { href, text: (await response.text()).slice(0, MAX_SHEET_CHARS) };
  } catch {
    return null;
  }
}

export class ChromeBridge implements Bridge {
  readonly kind = 'chrome';
  readonly storage = new ChromeStorage();

  async activeTab(): Promise<TabInfo | null> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return toTabInfo(tab);
  }

  onActiveTabChanged(listener: (tab: TabInfo | null) => void) {
    const onActivated = () => void this.activeTab().then(listener);
    const onUpdated = (_id: number, change: { status?: string }, tab: chrome.tabs.Tab) => {
      if (tab.active && change.status === 'complete') listener(toTabInfo(tab));
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }

  hasHostAccess(): Promise<boolean> {
    return chrome.permissions.contains(ALL_URLS);
  }

  requestHostAccess(): Promise<boolean> {
    return chrome.permissions.request(ALL_URLS);
  }

  /** Injects capture.js (idempotent thanks to its versioned global) and runs one API call. */
  private async run<A extends unknown[], R>(tab: TabInfo, func: (...args: A) => R, args: A): Promise<Awaited<R>> {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CAPTURE_SCRIPT] });
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
    return result?.result as Awaited<R>;
  }

  async capture(tab: TabInfo) {
    const hostAccess = await this.hasHostAccess();
    const unreadable = await this.run(tab, () => (window as unknown as CaptureGlobal).__dslintCapture.listUnreadableSheets(), []);
    const fetched = hostAccess
      ? (await Promise.all(unreadable.slice(0, MAX_FETCHED_SHEETS).map(fetchSheet))).filter((s): s is FetchedSheet => s !== null)
      : [];
    const page = await this.run(
      tab,
      (sheets: FetchedSheet[]) => (window as unknown as CaptureGlobal).__dslintCapture.capture(sheets),
      [fetched],
    );
    return { page, hostAccess };
  }

  async captureScreenshot(tab: TabInfo): Promise<string | null> {
    if (tab.windowId === undefined) return null;
    try {
      return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
    } catch {
      return null;
    }
  }

  highlight(tab: TabInfo, selectors: string[], label?: string) {
    return this.run(
      tab,
      (s: string[], l: string | null) => (window as unknown as CaptureGlobal).__dslintCapture.highlight(s, l ?? undefined),
      [selectors, label ?? null],
    );
  }

  async clearHighlights(tab: TabInfo) {
    await this.run(tab, () => (window as unknown as CaptureGlobal).__dslintCapture.clearHighlights(), []);
  }

  async setInspectMode(tab: TabInfo, on: boolean) {
    await this.run(tab, (value: boolean) => (window as unknown as CaptureGlobal).__dslintCapture.setInspectMode(value), [on]);
  }

  onInspect(listener: InspectListener) {
    const onMessage = (message: RuntimeMessage) => {
      if (message.type === RUNTIME_MESSAGES.inspectPicked) listener.picked(message.result);
      if (message.type === RUNTIME_MESSAGES.inspectExited) listener.exited();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }
}
