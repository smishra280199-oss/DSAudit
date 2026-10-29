import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit';
import { relativeTime, reportFileName } from '../src/report/format';
import { auditToHtml } from '../src/report/html';
import { auditToMarkdown } from '../src/report/markdown';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { makeSnapshot } from './helpers';

describe('reports', () => {
  const audit = runAudit({ ...makeSnapshot({ elements: [{ text: 'Hi' }] }), title: '<script>alert(1)</script>' }, DEFAULT_ASSUMPTIONS);

  it('escapes page content in the HTML report', () => {
    const html = auditToHtml(audit);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain(`<div class="big">${audit.score.overall}</div>`);
  });

  it('summarises the score in Markdown', () => {
    expect(auditToMarkdown(audit)).toContain(`**Score: ${audit.score.overall}/100`);
  });

  it('names files after the host and date', () => {
    expect(reportFileName('https://app.acme.test/x', '2026-10-29T10:00:00Z', 'html')).toBe('system-audit-app-acme-test-2026-10-29.html');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(relativeTime('2026-10-29T11:58:00Z', now)).toBe('2m ago');
    expect(relativeTime('2026-10-29T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-10-28T09:00:00Z', now)).toBe('Yesterday');
  });
});
