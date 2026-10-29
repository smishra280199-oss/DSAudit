/**
 * Minimal async key-value store. chrome.storage.local implements it in the
 * extension; an in-memory map does in tests and the preview page.
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(entries: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.data.get(key);
    // Round-trip through JSON to mimic chrome.storage's structured copy.
    return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T);
  }

  async set(entries: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) this.data.set(key, JSON.parse(JSON.stringify(value)));
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.data.delete(key);
  }
}
