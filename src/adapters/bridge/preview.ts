/**
 * A Bridge for the preview page: it audits a same-origin iframe by running
 * the capture code directly against the iframe's document. This exercises
 * the real capture and inspect code without installing the extension.
 */

import { createCaptureApi, type CaptureApi } from '../../capture';
import { MemoryStore } from '../../storage/kv';
import type { Bridge, InspectListener, TabInfo } from './types';

export class PreviewBridge implements Bridge {
  readonly kind = 'preview';
  readonly storage = new MemoryStore();
  private api: CaptureApi | null = null;
  private readonly inspectListeners = new Set<InspectListener>();
  private readonly tabListeners = new Set<(tab: TabInfo | null) => void>();

  constructor(private readonly frame: HTMLIFrameElement) {
    frame.addEventListener('load', () => {
      this.api = null;
      void this.activeTab().then((tab) => this.tabListeners.forEach((l) => l(tab)));
    });
  }

  private captureApi(): CaptureApi {
    const doc = this.frame.contentDocument;
    if (!doc) throw new Error('Preview frame is not ready.');
    this.api ??= createCaptureApi(doc, {
      onInspectPicked: (result) => this.inspectListeners.forEach((l) => l.picked(result)),
      onInspectExit: () => this.inspectListeners.forEach((l) => l.exited()),
    });
    return this.api;
  }

  async activeTab(): Promise<TabInfo | null> {
    const doc = this.frame.contentDocument;
    if (!doc) return null;
    return { id: 1, url: doc.location.href, title: doc.title || 'Preview page' };
  }

  onActiveTabChanged(listener: (tab: TabInfo | null) => void) {
    this.tabListeners.add(listener);
    return () => this.tabListeners.delete(listener);
  }

  async hasHostAccess() {
    return true;
  }

  async requestHostAccess() {
    return true;
  }

  async capture() {
    return { page: this.captureApi().capture([]), hostAccess: true };
  }

  /** An iframe can't be screenshotted from script; reports simply omit the cover image. */
  async captureScreenshot() {
    return null;
  }

  async highlight(_tab: TabInfo, selectors: string[], label?: string) {
    return this.captureApi().highlight(selectors, label);
  }

  async clearHighlights() {
    this.captureApi().clearHighlights();
  }

  async setInspectMode(_tab: TabInfo, on: boolean) {
    this.captureApi().setInspectMode(on);
  }

  /** An iframe can't be screenshotted from script: reports fall back to redrawn replicas. */
  async collectEvidence() {
    return {};
  }

  async discoverPages() {
    return this.captureApi().discoverPages();
  }

  /** Loads another page of the demo site into the frame. */
  navigate(_tab: TabInfo, url: string): Promise<TabInfo | null> {
    return new Promise((resolve) => {
      this.frame.addEventListener('load', () => void this.activeTab().then(resolve), { once: true });
      this.frame.src = url;
    });
  }

  onInspect(listener: InspectListener) {
    this.inspectListeners.add(listener);
    return () => this.inspectListeners.delete(listener);
  }
}
