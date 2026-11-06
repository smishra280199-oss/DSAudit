/**
 * The Bridge is the only way the panel touches the browser. Every browser
 * capability sits behind it, with three implementations: Chrome (the real
 * extension), Fake (tests) and Preview (a dev page that audits an iframe).
 * New browser capabilities go here first, then into all three.
 */

import type { CapturedPage, PageLink } from '../../capture';
import type { EvidenceShot } from '../../shared/snapshot';
import type { InspectResult } from '../../inspect/types';
import type { KeyValueStore } from '../../storage/kv';

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  windowId?: number;
}

export interface CaptureOutcome {
  page: CapturedPage;
  hostAccess: boolean;
}

export interface InspectListener {
  picked: (result: InspectResult) => void;
  exited: () => void;
}

export type Unsubscribe = () => void;

export interface Bridge {
  readonly kind: 'chrome' | 'fake' | 'preview';
  readonly storage: KeyValueStore;

  activeTab(): Promise<TabInfo | null>;
  onActiveTabChanged(listener: (tab: TabInfo | null) => void): Unsubscribe;

  hasHostAccess(): Promise<boolean>;
  /**
   * Asks for the optional all-URLs host permission. Chrome only shows the
   * prompt inside a user gesture, so call this first thing in a click
   * handler, before any other await.
   */
  requestHostAccess(): Promise<boolean>;

  capture(tab: TabInfo): Promise<CaptureOutcome>;
  /** JPEG data URL of the tab's visible area, or null when it can't be taken. */
  captureScreenshot(tab: TabInfo): Promise<string | null>;
  highlight(tab: TabInfo, selectors: string[], label?: string): Promise<number>;
  clearHighlights(tab: TabInfo): Promise<void>;
  setInspectMode(tab: TabInfo, on: boolean): Promise<void>;
  onInspect(listener: InspectListener): Unsubscribe;

  /**
   * Real screenshots of the given elements, keyed by selector. Scrolls the
   * page and restores it afterwards. Elements that can't be shown are left
   * out; an empty result means screenshots aren't available here.
   */
  collectEvidence(tab: TabInfo, selectors: string[], onProgress?: (done: number, total: number) => void): Promise<Record<string, EvidenceShot>>;
  /** Links to the site's other main pages, one per page template. */
  discoverPages(tab: TabInfo): Promise<PageLink[]>;
  /** Loads a URL in the tab and resolves once it has finished loading (and settled). */
  navigate(tab: TabInfo, url: string): Promise<TabInfo | null>;
}

/** Limits for stylesheets the panel fetches on the page's behalf. */
export const MAX_FETCHED_SHEETS = 40;
export const MAX_SHEET_CHARS = 4_000_000;
