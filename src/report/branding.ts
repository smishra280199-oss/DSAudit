/**
 * White-label details for client-facing reports: who prepared the audit and
 * who it is for. Agency details are global; the client name is per site.
 */

import { hostOf } from './format';

export interface ReportBranding {
  agencyName: string;
  preparedBy: string;
  email: string;
  website: string;
  /** A short personal note shown on the cover, e.g. why you are reaching out. */
  note: string;
  /** Where prospects book a call (Cal.com, Calendly…); shown as a button on every report. */
  bookingUrl: string;
}

export const DEFAULT_BOOKING_URL = 'https://cal.com/layerone';

export const EMPTY_BRANDING: ReportBranding = { agencyName: '', preparedBy: '', email: '', website: '', note: '', bookingUrl: DEFAULT_BOOKING_URL };

/** "https://cal.com/layerone" → "cal.com/layerone", for printing. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** A link a browser can open, even when typed without https://. */
export function bookingHref(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  return /^https?:\/\//.test(t) ? t : `https://${t}`;
}

/** "Acme Billing · Settings" → "Acme Billing"; falls back to the host. */
export function defaultClientName(title: string, url: string): string {
  const first = title.split(/\s[·|–—-]\s/)[0]?.trim();
  return first && first.length <= 60 ? first : hostOf(url);
}

export function hasContact(b: ReportBranding): boolean {
  return Boolean(b.preparedBy || b.email || b.website);
}

/** What every client-facing report needs besides the audit itself. */
export interface ClientReportOptions {
  branding: ReportBranding;
  clientName: string;
  /** Opportunity ids the user dismissed; they are left out of the report. */
  dismissed?: string[];
}
