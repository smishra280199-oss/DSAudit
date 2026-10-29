/** Persists the editable savings assumptions. */

import { DEFAULT_ASSUMPTIONS, type SavingsAssumptions } from '../savings';
import type { KeyValueStore } from './kv';

const KEY = 'settings:assumptions';

export async function loadAssumptions(kv: KeyValueStore): Promise<SavingsAssumptions> {
  return { ...DEFAULT_ASSUMPTIONS, ...((await kv.get<Partial<SavingsAssumptions>>(KEY)) ?? {}) };
}

export async function saveAssumptions(kv: KeyValueStore, assumptions: SavingsAssumptions): Promise<void> {
  await kv.set({ [KEY]: assumptions });
}
