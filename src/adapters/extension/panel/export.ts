/** Downloads and clipboard helpers for exporting audits from the panel. */

import type { Audit } from '../../../audit';
import { reportFileName } from '../../../report/format';
import { auditToHtml } from '../../../report/html';
import { auditToJson } from '../../../report/json';
import { auditToMarkdown } from '../../../report/markdown';
import type { ClientReportOptions } from '../../../report/branding';
import { auditToPdf, auditToTeaserPdf } from '../../../report/pdf';
import { healthReport } from '../../../insights/health';
import { slug } from '../../../report/format';
import { findingCard } from './finding-card';

export function download(filename: string, content: string | Uint8Array, type: string): void {
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

/** The short version for a first email: summary, three priority fixes, booking button. */
export async function exportTeaserPdf(audit: Audit, context: ClientReportOptions): Promise<void> {
  const bytes = await auditToTeaserPdf(audit, context);
  download(reportFileName(audit.snapshot.url, audit.snapshot.capturedAt, 'pdf').replace('.pdf', '-summary.pdf'), bytes, 'application/pdf');
}

/** The top finding as a 1200×675 image; null when there is no finding worth leading with. */
async function topFindingCard(audit: Audit, context: ClientReportOptions): Promise<Blob | null> {
  const report = healthReport(audit, { clientName: context.clientName, dismissed: context.dismissed });
  const finding = report.top.find((f) => f.shots.length > 0) ?? report.top[0];
  return finding ? findingCard(report, finding, context.branding) : null;
}

export async function exportFindingCard(audit: Audit, context: ClientReportOptions): Promise<boolean> {
  const blob = await topFindingCard(audit, context);
  if (!blob) return false;
  download(`${slug(context.clientName)}-top-finding.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png');
  return true;
}

/** Puts the image on the clipboard, to paste straight into an email or a LinkedIn message. */
export async function copyFindingCard(audit: Audit, context: ClientReportOptions): Promise<boolean> {
  try {
    const blob = await topFindingCard(audit, context);
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
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
