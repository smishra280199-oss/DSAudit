/**
 * Chrome refuses to run extension scripts on its own pages, other
 * extensions' pages and the Web Store. We detect these up front so the panel
 * can explain why a capture is unavailable instead of failing.
 */

export type CapturabilityReason = 'ok' | 'needs-access' | 'browser-page' | 'extension-page' | 'web-store' | 'unsupported-scheme';

const WEB_STORE_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

/**
 * @param url the tab's URL; an empty string means Chrome hid it because the
 * extension has no access to that tab yet.
 */
export function capturability(url: string | undefined): CapturabilityReason {
  if (url === '') return 'needs-access';
  if (!url) return 'unsupported-scheme';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unsupported-scheme';
  }
  const { protocol, hostname, pathname } = parsed;
  if (['chrome:', 'edge:', 'about:', 'devtools:', 'view-source:'].includes(protocol)) return 'browser-page';
  if (protocol === 'chrome-extension:') return 'extension-page';
  if (!['http:', 'https:', 'file:'].includes(protocol)) return 'unsupported-scheme';
  if (hostname === WEB_STORE_HOSTS[0] || (hostname === WEB_STORE_HOSTS[1] && pathname.startsWith('/webstore'))) {
    return 'web-store';
  }
  return 'ok';
}

export const CAPTURABILITY_MESSAGES: Record<Exclude<CapturabilityReason, 'ok'>, string> = {
  'needs-access': 'System Audit can only read the tab it was opened on. Click its toolbar icon on this tab, or allow access to all sites.',
  'browser-page': 'Chrome doesn’t let extensions read its own pages. Open a website to audit it.',
  'extension-page': 'Pages that belong to an extension can’t be captured.',
  'web-store': 'Chrome blocks extensions on the Chrome Web Store.',
  'unsupported-scheme': 'Only http, https and file pages can be captured.',
};
