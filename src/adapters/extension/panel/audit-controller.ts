/**
 * Panel state and behaviour, independent of React so it can be tested with
 * the FakeBridge. Views read state through useAudit() and call methods here;
 * nothing else in the panel talks to the Bridge.
 */

import { compareAudits, runAudit, withAssumptions, type Audit } from '../../../audit';
import { mergeSnapshots } from '../../../audit/merge';
import { selectorsForPage } from '../../../shared/page-scope';
import type { InspectResult } from '../../../inspect/types';
import type { SavingsAssumptions } from '../../../savings';
import { capturability, type CapturabilityReason } from '../../../shared/restricted';
import type { PageSnapshot, SnapshotMeta } from '../../../shared/snapshot';
import { defaultClientName, EMPTY_BRANDING, type ClientReportOptions, type ReportBranding } from '../../../report/branding';
import { hostOf } from '../../../report/format';
import {
  loadAssumptions,
  loadBranding,
  loadClientNames,
  saveAssumptions,
  saveBranding,
  saveClientNames,
} from '../../../storage/settings-store';
import { SnapshotStore } from '../../../storage/snapshot-store';
import type { Bridge, TabInfo } from '../../bridge/types';

const HOST_ACCESS_ASKED_KEY = 'settings:hostAccessAsked';
const COLLECTION_KEY = 'collection:pages';

export type CaptureStatus = 'idle' | 'capturing' | 'error';

export interface AuditState {
  ready: boolean;
  tab: TabInfo | null;
  capturability: CapturabilityReason;
  status: CaptureStatus;
  error: string | null;
  audit: Audit | null;
  /** The audit being compared against the current one, if any. */
  baseline: Audit | null;
  history: SnapshotMeta[];
  /** Pages collected for a multi-page audit, in the order they were added. */
  collection: SnapshotMeta[];
  dismissed: string[];
  assumptions: SavingsAssumptions | null;
  /** Agency details printed on client reports. */
  branding: ReportBranding;
  /** Client names the user set, keyed by host. */
  clientNames: Record<string, string>;
  hostAccess: boolean;
  inspect: { active: boolean; result: InspectResult | null };
  toast: string | null;
}

type Listener = () => void;

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AuditController {
  private state: AuditState = {
    ready: false,
    tab: null,
    capturability: 'ok',
    status: 'idle',
    error: null,
    audit: null,
    baseline: null,
    history: [],
    collection: [],
    dismissed: [],
    assumptions: null,
    branding: EMPTY_BRANDING,
    clientNames: {},
    hostAccess: false,
    inspect: { active: false, result: null },
    toast: null,
  };
  private readonly listeners = new Set<Listener>();
  private readonly store: SnapshotStore;
  private hostAccessAsked = false;
  /** Whether the page may be showing highlight boxes, so clearing them is worth a round trip. */
  private highlighted = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(private readonly bridge: Bridge) {
    this.store = new SnapshotStore(bridge.storage);
  }

  // ── Store protocol (for useSyncExternalStore) ──────────────────────────

  getState = (): AuditState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<AuditState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const [tab, history, assumptions, branding, clientNames, hostAccess, asked] = await Promise.all([
      this.bridge.activeTab(),
      this.store.list(),
      loadAssumptions(this.bridge.storage),
      loadBranding(this.bridge.storage),
      loadClientNames(this.bridge.storage),
      this.bridge.hasHostAccess(),
      this.bridge.storage.get<boolean>(HOST_ACCESS_ASKED_KEY),
    ]);
    this.hostAccessAsked = asked === true;
    const collectionIds = (await this.bridge.storage.get<string[]>(COLLECTION_KEY)) ?? [];
    const collection = collectionIds.map((id) => history.find((m) => m.id === id)).filter((m): m is SnapshotMeta => m !== undefined);
    this.set({ ready: true, history, collection, assumptions, branding, clientNames, hostAccess });
    await this.onTabChanged(tab);

    this.unsubscribers.push(
      this.bridge.onActiveTabChanged((t) => void this.onTabChanged(t)),
      this.bridge.onInspect({
        picked: (result) => this.set({ inspect: { active: true, result } }),
        exited: () => this.set({ inspect: { ...this.state.inspect, active: false } }),
      }),
    );
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    clearTimeout(this.toastTimer);
  }

  /** Shows the latest audit of the new tab's URL, if there is one. */
  private async onTabChanged(tab: TabInfo | null): Promise<void> {
    const sameUrl = tab?.url === this.state.tab?.url;
    this.set({ tab, capturability: capturability(tab?.url), inspect: { active: false, result: sameUrl ? this.state.inspect.result : null } });
    if (sameUrl && this.state.audit) return;
    // A multi-page audit stays open while you move between the pages it covers.
    if (tab && this.state.audit?.snapshot.pages?.some((p) => p.url === tab.url)) return;
    const latest = tab ? this.state.history.find((m) => m.url === tab.url && !m.pageCount) : undefined;
    if (latest) await this.open(latest.id);
    else this.set({ audit: null, baseline: null, dismissed: [] });
  }

  // ── Capture ────────────────────────────────────────────────────────────

  /**
   * Must be called directly from a click handler: on the first capture the
   * host-permission request has to start inside the user gesture.
   */
  capture(): Promise<void> {
    const { tab } = this.state;
    if (!tab || this.state.capturability !== 'ok' || this.state.status === 'capturing') return Promise.resolve();
    const permission = this.hostAccessAsked ? null : this.bridge.requestHostAccess();
    return this.runCapture(tab, permission);
  }

  /** Captures the open page and adds it to the multi-page audit. Call from a click handler. */
  async captureAndAddPage(): Promise<void> {
    await this.capture();
    const { audit } = this.state;
    if (this.state.status === 'idle' && audit && !audit.snapshot.pages) await this.addToCollection(audit.snapshot.id);
  }

  private async runCapture(tab: TabInfo, permission: Promise<boolean> | null): Promise<void> {
    this.set({ status: 'capturing', error: null });
    try {
      if (permission) {
        const granted = await permission.catch(() => false);
        this.hostAccessAsked = true;
        await this.bridge.storage.set({ [HOST_ACCESS_ASKED_KEY]: true });
        this.set({ hostAccess: granted });
      }
      const { page, hostAccess } = await this.bridge.capture(tab);
      const screenshot = (await this.bridge.captureScreenshot(tab)) ?? undefined;
      const snapshot: PageSnapshot = { ...page, id: newId(), favIconUrl: tab.favIconUrl, hostAccess, screenshot };
      const audit = runAudit(snapshot, this.state.assumptions!);
      await this.store.save(snapshot, audit.score.overall);
      this.set({ status: 'idle', audit, baseline: null, dismissed: [], history: await this.store.list(), hostAccess });
    } catch (error) {
      this.set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Lets the user grant site access later (e.g. from the confidence card). Call from a click handler. */
  async requestHostAccess(): Promise<void> {
    const granted = await this.bridge.requestHostAccess();
    this.hostAccessAsked = true;
    this.set({ hostAccess: granted });
    if (granted) await this.onTabChanged(await this.bridge.activeTab());
    this.notify(granted ? 'Site access granted.' : 'Site access was not granted.');
  }

  // ── Multi-page audits ──────────────────────────────────────────────────

  private async saveCollection(collection: SnapshotMeta[]): Promise<void> {
    this.set({ collection });
    await this.bridge.storage.set({ [COLLECTION_KEY]: collection.map((m) => m.id) });
  }

  /** Adds a captured page; a newer capture of the same address replaces the older one. */
  async addToCollection(id: string): Promise<void> {
    const meta = this.state.history.find((m) => m.id === id);
    if (!meta || meta.pageCount) return;
    const rest = this.state.collection.filter((m) => m.url !== meta.url);
    await this.saveCollection([...rest, meta]);
    this.notify(`Page added. ${rest.length + 1} ${rest.length === 0 ? 'page' : 'pages'} in this audit.`);
  }

  async removeFromCollection(id: string): Promise<void> {
    await this.saveCollection(this.state.collection.filter((m) => m.id !== id));
  }

  async clearCollection(): Promise<void> {
    await this.saveCollection([]);
  }

  /** Audits every collected page together and opens the combined result. */
  async auditCollection(): Promise<void> {
    const snapshots = (await Promise.all(this.state.collection.map((m) => this.store.load(m.id)))).filter(
      (s): s is PageSnapshot => s !== null,
    );
    if (snapshots.length < 2) {
      this.notify('Add at least two pages first.');
      return;
    }
    this.set({ status: 'capturing', error: null });
    try {
      const first = snapshots[0]!;
      const title = `${defaultClientName(first.title, first.url)} · ${snapshots.length} pages`;
      const merged = mergeSnapshots(snapshots, newId(), title);
      const audit = runAudit(merged, this.state.assumptions!);
      await this.store.save(merged, audit.score.overall);
      this.set({ status: 'idle', audit, baseline: null, dismissed: [], history: await this.store.list() });
    } catch (error) {
      this.set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  // ── History ────────────────────────────────────────────────────────────

  async open(id: string): Promise<void> {
    const snapshot = await this.store.load(id);
    if (!snapshot) {
      this.notify('That snapshot could not be loaded.');
      return;
    }
    this.set({ audit: runAudit(snapshot, this.state.assumptions!), baseline: null, dismissed: await this.store.dismissed(id) });
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
    if (this.state.collection.some((m) => m.id === id)) await this.removeFromCollection(id);
    const history = await this.store.list();
    const removingCurrent = this.state.audit?.snapshot.id === id;
    this.set({
      history,
      ...(removingCurrent ? { audit: null, dismissed: [] } : {}),
      ...(this.state.baseline?.snapshot.id === id ? { baseline: null } : {}),
    });
    this.notify('Snapshot deleted.');
  }

  async compareWith(id: string | null): Promise<void> {
    if (!id) {
      this.set({ baseline: null });
      return;
    }
    const snapshot = await this.store.load(id);
    if (snapshot) this.set({ baseline: runAudit(snapshot, this.state.assumptions!) });
  }

  comparison() {
    const { audit, baseline } = this.state;
    return audit && baseline ? compareAudits(baseline, audit) : null;
  }

  // ── Opportunities ──────────────────────────────────────────────────────

  async setDismissed(opportunityId: string, dismissed: boolean): Promise<void> {
    const { audit } = this.state;
    if (!audit) return;
    const next = dismissed
      ? [...new Set([...this.state.dismissed, opportunityId])]
      : this.state.dismissed.filter((id) => id !== opportunityId);
    this.set({ dismissed: next });
    await this.store.setDismissed(audit.snapshot.id, next);
  }

  // ── Page interaction ───────────────────────────────────────────────────

  async highlight(selectors: string[], label?: string): Promise<void> {
    const { tab } = this.state;
    if (!tab || selectors.length === 0 || this.state.capturability !== 'ok') return;
    // Multi-page audits scope selectors by page; only this page's can be highlighted.
    const pages = this.state.audit?.snapshot.pages;
    const page = pages ? pages.findIndex((p) => p.url === tab.url) : null;
    const local = selectorsForPage(selectors, page === -1 ? null : page);
    if (local.length === 0) {
      this.notify(pages ? 'Those elements are on another page of this audit.' : 'Nothing to highlight.');
      return;
    }
    try {
      this.highlighted = true;
      const found = await this.bridge.highlight(tab, local, label);
      if (found === 0) this.notify('Those elements are no longer on the page.');
    } catch {
      this.notify('Couldn’t reach the page. Reload it and try again.');
    }
  }

  async clearHighlights(): Promise<void> {
    if (!this.highlighted || !this.state.tab || this.state.capturability !== 'ok') return;
    this.highlighted = false;
    await this.bridge.clearHighlights(this.state.tab).catch(() => {});
  }

  async setInspectMode(on: boolean): Promise<void> {
    const { tab } = this.state;
    if (!tab || this.state.capturability !== 'ok') return;
    this.set({ inspect: { ...this.state.inspect, active: on } });
    try {
      await this.bridge.setInspectMode(tab, on);
    } catch {
      this.set({ inspect: { ...this.state.inspect, active: false } });
      this.notify('Couldn’t reach the page. Reload it and try again.');
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────

  async updateAssumptions(assumptions: SavingsAssumptions): Promise<void> {
    const audit = this.state.audit ? withAssumptions(this.state.audit, assumptions) : null;
    this.set({ assumptions, audit });
    await saveAssumptions(this.bridge.storage, assumptions);
  }

  // ── Report details ─────────────────────────────────────────────────────

  /** The client name for the current audit: what the user typed for this site, or one derived from the page. */
  clientName(): string {
    const { audit, clientNames } = this.state;
    if (!audit) return '';
    return clientNames[hostOf(audit.snapshot.url)] || defaultClientName(audit.snapshot.title, audit.snapshot.url);
  }

  /** Everything a client report needs besides the audit. */
  reportOptions(): ClientReportOptions {
    return { branding: this.state.branding, clientName: this.clientName(), dismissed: this.state.dismissed };
  }

  async updateReportDetails(branding: ReportBranding, clientName: string): Promise<void> {
    const { audit } = this.state;
    const clientNames = { ...this.state.clientNames };
    if (audit) {
      const host = hostOf(audit.snapshot.url);
      const derived = defaultClientName(audit.snapshot.title, audit.snapshot.url);
      if (clientName.trim() && clientName.trim() !== derived) clientNames[host] = clientName.trim();
      else delete clientNames[host];
    }
    this.set({ branding, clientNames });
    await Promise.all([saveBranding(this.bridge.storage, branding), saveClientNames(this.bridge.storage, clientNames)]);
  }

  // ── Feedback ───────────────────────────────────────────────────────────

  notify(message: string): void {
    clearTimeout(this.toastTimer);
    this.set({ toast: message });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 2600);
  }
}
