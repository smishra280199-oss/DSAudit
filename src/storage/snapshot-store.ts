/**
 * Persists snapshots as one key per snapshot plus an index key holding
 * lightweight metadata, so history renders without loading every snapshot.
 * With the unlimitedStorage permission an audit survives across sessions.
 */

import { SNAPSHOT_SCHEMA_VERSION, type PageSnapshot, type SnapshotMeta } from '../shared/snapshot';
import type { KeyValueStore } from './kv';

const INDEX_KEY = 'snapshots:index';
const snapshotKey = (id: string) => `snapshot:${id}`;
const dismissedKey = (id: string) => `dismissed:${id}`;

export class SnapshotStore {
  constructor(private readonly kv: KeyValueStore) {}

  /** Newest first. */
  async list(): Promise<SnapshotMeta[]> {
    return (await this.kv.get<SnapshotMeta[]>(INDEX_KEY)) ?? [];
  }

  async load(id: string): Promise<PageSnapshot | null> {
    const snapshot = await this.kv.get<PageSnapshot>(snapshotKey(id));
    return snapshot && snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION ? snapshot : null;
  }

  async save(snapshot: PageSnapshot, score: number): Promise<SnapshotMeta> {
    const meta: SnapshotMeta = {
      id: snapshot.id,
      url: snapshot.url,
      title: snapshot.title,
      favIconUrl: snapshot.favIconUrl,
      capturedAt: snapshot.capturedAt,
      score,
      elementCount: snapshot.rendered.elements.length,
      ...(snapshot.pages ? { pageCount: snapshot.pages.length } : {}),
    };
    const index = (await this.list()).filter((m) => m.id !== snapshot.id);
    await this.kv.set({ [snapshotKey(snapshot.id)]: snapshot, [INDEX_KEY]: [meta, ...index] });
    return meta;
  }

  async remove(id: string): Promise<void> {
    const index = (await this.list()).filter((m) => m.id !== id);
    await this.kv.set({ [INDEX_KEY]: index });
    await this.kv.remove([snapshotKey(id), dismissedKey(id)]);
  }

  async dismissed(id: string): Promise<string[]> {
    return (await this.kv.get<string[]>(dismissedKey(id))) ?? [];
  }

  async setDismissed(id: string, opportunityIds: string[]): Promise<void> {
    await this.kv.set({ [dismissedKey(id)]: opportunityIds });
  }
}
