/**
 * Panel state and behaviour, independent of React so it can be tested with
 * the FakeBridge. Views read state through useAudit() and call methods here;
 * nothing else in the panel talks to the Bridge.
 */

import { compareAudits, runAudit, withAssumptions, type Audit } from '../../../audit';
import type { InspectResult } from '../../../inspect/types';
import type { SavingsAssumptions } from '../../../savings';
import { capturability, type CapturabilityReason } from '../../../shared/restricted';
import type { PageSnapshot, SnapshotMeta } from '../../../shared/snapshot';
import { loadAssumptions, saveAssumptions } from '../../../storage/settings-store';
import { SnapshotStore } from '../../../storage/snapshot-store';
import type { Bridge, TabInfo } from '../../bridge/types';

const HOST_ACCESS_ASKED_KEY = 'settings:hostAccessAsked';

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
  dismissed: string[];
  assumptions: SavingsAssumptions | null;
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
    dismissed: [],
    assumptions: null,
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
    const [tab, history, assumptions, hostAccess, asked] = await Promise.all([
      this.bridge.activeTab(),
      this.store.list(),
      loadAssumptions(this.bridge.storage),
      this.bridge.hasHostAccess(),
      this.bridge.storage.get<boolean>(HOST_ACCESS_ASKED_KEY),
    ]);
    this.hostAccessAsked = asked === true;
    this.set({ ready: true, history, assumptions, hostAccess });
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
    const latest = tab ? this.state.history.find((m) => m.url === tab.url) : undefined;
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
      const snapshot: PageSnapshot = { ...page, id: newId(), favIconUrl: tab.favIconUrl, hostAccess };
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
    try {
      this.highlighted = true;
      const found = await this.bridge.highlight(tab, selectors, label);
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

  // ── Feedback ───────────────────────────────────────────────────────────

  notify(message: string): void {
    clearTimeout(this.toastTimer);
    this.set({ toast: message });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 2600);
  }
}
