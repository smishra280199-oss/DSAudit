import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit';
import { defaultClientName, EMPTY_BRANDING, type ClientReportOptions } from '../src/report/branding';
import { relativeTime, reportFileName } from '../src/report/format';
import { auditToHtml } from '../src/report/html';
import { auditToMarkdown } from '../src/report/markdown';
import { auditToPdf } from '../src/report/pdf';
import { pdfSafe } from '../src/report/pdf/layout';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { makeSnapshot, times } from './helpers';

const messy = makeSnapshot({
  elements: [
    { text: 'Faint', styles: { color: 'rgb(210, 210, 210)' } },
    ...times(3, { styles: { backgroundColor: 'rgb(91, 61, 245)' } }, 'a'),
    { styles: { backgroundColor: 'rgb(92, 62, 245)' } },
    ...Array.from({ length: 20 }, (_, i) => ({ selector: `.s${i}`, styles: { paddingTop: `${10 + i * 3}px` } })),
  ],
});

const options: ClientReportOptions = {
  branding: { ...EMPTY_BRANDING, agencyName: 'Northbeam Studio', preparedBy: 'Sam', email: 'sam@northbeam.test' },
  clientName: 'Acme & Co',
};

describe('client reports', () => {
  const audit = runAudit({ ...messy, title: '<script>alert(1)</script>' }, DEFAULT_ASSUMPTIONS);

  it('escapes page content and leads with the cost in the HTML report', () => {
    const html = auditToHtml(audit, options);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Acme &amp; Co');
    expect(html).toContain('We estimate inconsistency is costing your team');
    expect(html).toContain('Where the cost comes from');
    expect(html).toMatch(/Part 1<\/p><h2>The problems[\s\S]*Part 2<\/p><h2>The fixes[\s\S]*Part 3<\/p><h2>What’s working well/);
    expect(html).not.toMatch(/payback|one-time cleanup|cleanup cost/i);
    expect(html).toContain('How Northbeam Studio can help');
    expect(html).toContain('sam@northbeam.test');
  });

  it('writes a valid, multi-page PDF with metadata', async () => {
    const bytes = await auditToPdf(audit, options);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(pdf.getTitle()).toBe('Design System Audit: Acme & Co');
    expect(pdf.getAuthor()).toBe('Northbeam Studio');
  });

  it('still produces a PDF without branding or findings', async () => {
    const tidy = runAudit(makeSnapshot({ elements: [{ text: 'Hi' }] }), DEFAULT_ASSUMPTIONS);
    const bytes = await auditToPdf(tidy, { branding: EMPTY_BRANDING, clientName: 'Tidy' });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('summarises the findings in Markdown for an email', () => {
    const md = auditToMarkdown(audit, options);
    expect(md).toContain('# Design system audit: Acme & Co');
    expect(md).toContain('| Spacing values | 20 | about 12 |');
  });

  it('keeps PDF text within the standard font encoding', () => {
    expect(pdfSafe('27 → 15 ≈ ΔE ≤ 2 “ok” – fine')).toBe('27 to 15 ~ dE <= 2 “ok” – fine');
  });
});

describe('report helpers', () => {
  it('derives a client name from the page title', () => {
    expect(defaultClientName('Acme Billing · Settings', 'https://acme.test')).toBe('Acme Billing');
    expect(defaultClientName('Dashboard | Globex', 'https://globex.test')).toBe('Dashboard');
    expect(defaultClientName('', 'https://app.globex.test/x')).toBe('app.globex.test');
  });

  it('names files after the host and date', () => {
    expect(reportFileName('https://app.acme.test/x', '2026-10-29T10:00:00Z', 'pdf')).toBe('system-audit-app-acme-test-2026-10-29.pdf');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(relativeTime('2026-10-29T11:58:00Z', now)).toBe('2m ago');
    expect(relativeTime('2026-10-29T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-10-28T09:00:00Z', now)).toBe('Yesterday');
  });
});
