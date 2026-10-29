import type { InspectResult } from '../inspect/types';

/** Messages the injected capture script sends to the panel via chrome.runtime. */
export const RUNTIME_MESSAGES = {
  inspectPicked: 'dslint:inspect-picked',
  inspectExited: 'dslint:inspect-exited',
} as const;

export type RuntimeMessage =
  | { type: typeof RUNTIME_MESSAGES.inspectPicked; result: InspectResult }
  | { type: typeof RUNTIME_MESSAGES.inspectExited };
