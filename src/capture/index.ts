/**
 * The capture API that runs inside the inspected page. It is created against
 * a Document so the same code serves the extension (the tab's isolated world)
 * and the preview page (an iframe), and is exercised by tests under jsdom.
 */

import { inspectElement } from '../inspect';
import type { InspectResult } from '../inspect/types';
import { SNAPSHOT_SCHEMA_VERSION, type PageSnapshot } from '../shared/snapshot';
import { walkAuthored } from './authored';
import { InspectMode } from './inspect-mode';
import { Overlay, pageRect } from './overlay';
import { walkRendered } from './rendered';
import { resolveSelector } from './selector';
import { collectSheets, listUnreadableSheets, type FetchedSheet } from './stylesheets';
import { discoverPages, type PageLink } from './discover';
import { ShotSession, type Frame } from './shots';

export type { Frame, ShotTarget } from './shots';
export type { PageLink } from './discover';

/** Bumped when the API changes so a stale injected copy gets replaced. */
export const CAPTURE_API_VERSION = 2;

/** The snapshot fields capture can know; the panel adds id, favicon and host access. */
export type CapturedPage = Omit<PageSnapshot, 'id' | 'favIconUrl' | 'hostAccess'>;

export interface CaptureApi {
  version: number;
  listUnreadableSheets(): string[];
  capture(fetchedSheets: FetchedSheet[]): CapturedPage;
  /** Outlines every element matching the selectors; returns how many were found. */
  highlight(selectors: string[], label?: string): number;
  clearHighlights(): void;
  setInspectMode(on: boolean): void;
  /** Evidence screenshots: see shots.ts. Call frame() repeatedly, endFrame() after each screenshot, finishShots() at the end. */
  frame(selectors: string[], focus: string): Promise<Frame>;
  endFrame(): void;
  finishShots(): void;
  /** Links to the site's main pages, for capturing several pages in one go. */
  discoverPages(): PageLink[];
}

export interface CaptureCallbacks {
  onInspectPicked: (result: InspectResult) => void;
  onInspectExit: () => void;
}

const MAX_HIGHLIGHTS = 200;

export function createCaptureApi(doc: Document, callbacks: CaptureCallbacks): CaptureApi {
  const win = doc.defaultView!;
  const overlay = new Overlay(doc);
  let lastFetched: FetchedSheet[] = [];
  let shots: ShotSession | null = null;

  const inspectMode = new InspectMode(doc, {
    onPick: (el) => {
      const { shadowRoots, layer } = walkRendered(doc);
      const { sources } = collectSheets(doc, shadowRoots, lastFetched);
      callbacks.onInspectPicked(inspectElement(el, sources, layer.rootCustomProperties));
    },
    onExit: callbacks.onInspectExit,
  });

  return {
    version: CAPTURE_API_VERSION,

    listUnreadableSheets: () => listUnreadableSheets(doc),

    capture(fetchedSheets) {
      lastFetched = fetchedSheets;
      overlay.clear();
      const { layer: rendered, liveElements, shadowRoots } = walkRendered(doc);
      const authored = walkAuthored({ doc, shadowRoots, liveElements, elements: rendered.elements, fetchedSheets });
      return {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        url: doc.location?.href ?? '',
        title: doc.title,
        capturedAt: new Date().toISOString(),
        viewport: { width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio || 1 },
        colorScheme: win.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        rendered,
        authored,
      };
    },

    highlight(selectors, label) {
      const elements = selectors.flatMap((s) => resolveSelector(doc, s)).slice(0, MAX_HIGHLIGHTS);
      elements[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Draw after the scroll settles so rects are final.
      win.setTimeout(() => overlay.draw(elements.map((el, i) => ({ rect: pageRect(el), label: i === 0 ? label : undefined }))), 250);
      return elements.length;
    },

    clearHighlights: () => overlay.clear(),

    setInspectMode: (on) => inspectMode.set(on),

    frame(selectors, focus) {
      overlay.clear();
      shots ??= new ShotSession(doc);
      return shots.frame(selectors, focus);
    },
    endFrame: () => shots?.endFrame(),
    finishShots() {
      shots?.finish();
      shots = null;
    },

    discoverPages: () => discoverPages(doc),
  };
}
