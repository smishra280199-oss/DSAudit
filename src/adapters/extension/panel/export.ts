/** Downloads and clipboard helpers for exporting audits from the panel. */

import type { Audit } from '../../../audit';
import { reportFileName } from '../../../report/format';
import { auditToHtml } from '../../../report/html';
import { auditToJson } from '../../../report/json';
import { auditToMarkdown } from '../../../report/markdown';

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function exportHtml(audit: Audit): void {
  download(reportFileName(audit.snapshot.url, audit.snapshot.capturedAt, 'html'), auditToHtml(audit), 'text/html');
}

export function exportJson(audit: Audit): void {
  download(reportFileName(audit.snapshot.url, audit.snapshot.capturedAt, 'json'), auditToJson(audit), 'application/json');
}

export async function copyMarkdown(audit: Audit): Promise<boolean> {
  return copyText(auditToMarkdown(audit));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
