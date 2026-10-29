/**
 * capture.js — injected into the tab's isolated world on demand by the panel
 * (chrome.scripting.executeScript). It installs a versioned global, so
 * injecting it twice is harmless.
 */

import { CAPTURE_API_VERSION, createCaptureApi, type CaptureApi } from './index';
import { RUNTIME_MESSAGES } from '../shared/messages';

declare global {
  interface Window {
    __dslintCapture?: CaptureApi;
  }
}

if (!window.__dslintCapture || window.__dslintCapture.version < CAPTURE_API_VERSION) {
  window.__dslintCapture = createCaptureApi(document, {
    onInspectPicked: (result) => void chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.inspectPicked, result }),
    onInspectExit: () => void chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.inspectExited }),
  });
}
