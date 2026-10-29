/** Formatting helpers shared by the panel and the report. */

export function hostOf(url: string): string {
  try {
    const { host, protocol } = new URL(url);
    return protocol === 'file:' ? 'Local file' : host;
  } catch {
    return url;
  }
}

export function percent(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "2m ago", "3h ago", "Yesterday", or a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
}

export function reportFileName(url: string, capturedAt: string, extension: string): string {
  return `system-audit-${slug(hostOf(url))}-${capturedAt.slice(0, 10)}.${extension}`;
}
