/** Downloads and clipboard helpers for exporting audits from the panel. */

import type { Audit } from '../../../audit';
import { reportFileName } from '../../../report/format';
import { auditToHtml } from '../../../report/html';
import { auditToJson } from '../../../report/json';
import { auditToMarkdown } from '../../../report/markdown';
import type { ClientReportOptions } from '../../../report/branding';
import { auditToPdf } from '../../../report/pdf';

function download(filename: string, content: string | Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** The client-facing PDF: executive summary, plan, findings and method. */
export async function exportPdf(audit: Audit, context: ClientReportOptions): Promise<void> {
  const bytes = await auditToPdf(audit, context);
  download(reportFileName(audit.snapshot.url, audit.snapshot.capturedAt, 'pdf'), bytes, 'application/pdf');
}

export function exportHtml(audit: Audit, context: ClientReportOptions): void {
  download(reportFileName(audit.snapshot.url, audit.snapshot.capturedAt, 'html'), auditToHtml(audit, context), 'text/html');
}

export function exportJson(audit: Audit): void {
  download(reportFileName(audit.snapshot.url, audit.snapshot.capturedAt, 'json'), auditToJson(audit), 'application/json');
}

export async function copyMarkdown(audit: Audit, options: ClientReportOptions): Promise<boolean> {
  return copyText(auditToMarkdown(audit, options));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
