/**
 * The Bridge is the only way the panel touches the browser. Every browser
 * capability sits behind it, with three implementations: Chrome (the real
 * extension), Fake (tests) and Preview (a dev page that audits an iframe).
 * New browser capabilities go here first, then into all three.
 */

import type { CapturedPage } from '../../capture';
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
}

/** Limits for stylesheets the panel fetches on the page's behalf. */
export const MAX_FETCHED_SHEETS = 40;
export const MAX_SHEET_CHARS = 4_000_000;
