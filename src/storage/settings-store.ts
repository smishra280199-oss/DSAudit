/** Persists user settings: savings assumptions and report branding. */

import { DEFAULT_ASSUMPTIONS, type SavingsAssumptions } from '../savings';
import { EMPTY_BRANDING, type ReportBranding } from '../report/branding';
import type { KeyValueStore } from './kv';

const KEY = 'settings:assumptions';

export async function loadAssumptions(kv: KeyValueStore): Promise<SavingsAssumptions> {
  return { ...DEFAULT_ASSUMPTIONS, ...((await kv.get<Partial<SavingsAssumptions>>(KEY)) ?? {}) };
}

export async function saveAssumptions(kv: KeyValueStore, assumptions: SavingsAssumptions): Promise<void> {
  await kv.set({ [KEY]: assumptions });
}

const BRANDING_KEY = 'settings:branding';
const CLIENT_NAMES_KEY = 'settings:clientNames';

export async function loadBranding(kv: KeyValueStore): Promise<ReportBranding> {
  return { ...EMPTY_BRANDING, ...((await kv.get<Partial<ReportBranding>>(BRANDING_KEY)) ?? {}) };
}

export async function saveBranding(kv: KeyValueStore, branding: ReportBranding): Promise<void> {
  await kv.set({ [BRANDING_KEY]: branding });
}

/** Client names the user typed, keyed by host. */
export async function loadClientNames(kv: KeyValueStore): Promise<Record<string, string>> {
  return (await kv.get<Record<string, string>>(CLIENT_NAMES_KEY)) ?? {};
}

export async function saveClientNames(kv: KeyValueStore, names: Record<string, string>): Promise<void> {
  await kv.set({ [CLIENT_NAMES_KEY]: names });
}
