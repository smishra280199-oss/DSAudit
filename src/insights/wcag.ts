/**
 * The accessibility check: the automated findings mapped to the WCAG success
 * criteria they test, in plain language, with the regulations that point at
 * WCAG. Only checks we can run exactly from the page are listed as passing or
 * failing; everything else is named as "needs a manual review", so the report
 * never implies a full conformance audit.
 */

import type { Audit } from '../audit';

export type CheckStatus = 'pass' | 'fail' | 'not-applicable';

export interface WcagCheck {
  /** Success criterion number, e.g. "1.4.3". */
  sc: string;
  name: string;
  level: 'A' | 'AA';
  /** The WCAG version that introduced it: 2.5.8 is new in 2.2. */
  version: '2.0' | '2.1' | '2.2';
  status: CheckStatus;
  failed: number;
  checked: number;
  /** What we checked, in one line. */
  test: string;
  /** Who it affects and how, in one line. */
  impact: string;
  selectors: string[];
}

export interface AccessibilityReport {
  checks: WcagCheck[];
  failing: number;
  passing: number;
  /** Total problem instances across failing checks. */
  issues: number;
  headline: string;
  /** Where this matters legally, stated carefully. */
  regulation: string;
  /** Criteria an automated check can't settle. */
  manual: string[];
}

export const REGULATION_NOTE =
  'WCAG 2.1 level AA is the reference standard behind the European Accessibility Act (applying since 28 June 2025, through EN 301 549) and the usual benchmark in US ADA cases; WCAG 2.2 adds the target-size check. Automated checks catch a part of WCAG only: treat this as a screening, not a certificate.';

export const MANUAL_CHECKS = [
  'Keyboard: every action reachable and nothing traps the focus (2.1.1, 2.1.2)',
  'Meaningful order of content and focus (1.3.2, 2.4.3)',
  'Error messages and form instructions (3.3.1, 3.3.3)',
  'Captions and transcripts for audio and video (1.2.x)',
  'Content that reflows at 320 px and 200% zoom (1.4.4, 1.4.10)',
];

function check(
  sc: string,
  name: string,
  level: WcagCheck['level'],
  version: WcagCheck['version'],
  failed: number,
  checked: number,
  test: string,
  impact: string,
  selectors: string[],
): WcagCheck {
  return { sc, name, level, version, status: checked === 0 ? 'not-applicable' : failed > 0 ? 'fail' : 'pass', failed, checked, test, impact, selectors: selectors.slice(0, 60) };
}

export function accessibilityReport(audit: Audit): AccessibilityReport {
  const a = audit.analysis.accessibility;
  const i = audit.analysis.interaction;
  const focusRemoved = i.outlineRemovedWithoutReplacement.length;
  const checks = [
    check('1.4.3', 'Text contrast', 'AA', '2.0', a.contrastFailures.length, a.textChecked, 'Every piece of visible text against its real background, 4.5:1 (3:1 for large text)', 'People with low vision, and everyone on a phone in sunlight', a.contrastFailures.map((f) => f.selector)),
    check('2.4.7', 'Visible keyboard focus', 'AA', '2.0', focusRemoved, i.interactiveCount, 'Styles that switch off the focus outline without drawing another', 'Keyboard users, who lose track of where they are', []),
    check('4.1.2', 'Buttons and links have a name', 'A', '2.0', a.unnamedControls.length, a.controlsChecked, 'Icon-only buttons and links without text or a label', 'Screen-reader users, who hear only “button”', a.unnamedControls.map((u) => u.selector)),
    check('1.3.1', 'Form fields have labels', 'A', '2.0', a.unlabelledFields.length, a.fieldsChecked, 'Inputs, selects and text areas without a label, aria-label or title', 'Screen-reader users, who hear only “edit text”', a.unlabelledFields.map((f) => f.selector)),
    check('1.1.1', 'Images have alt text', 'A', '2.0', a.imagesWithoutAlt.length, a.imagesChecked, 'Images with no alt attribute (alt="" for decoration is fine)', 'Screen-reader users, who miss what the image shows', a.imagesWithoutAlt.map((x) => x.selector)),
    check('2.5.8', 'Tap targets of at least 24 px', 'AA', '2.2', a.smallTargets.length, a.targetsChecked, 'Buttons and links under 24×24 px that are crowded by other targets', 'Anyone on a phone, and people with tremors or limited dexterity', a.smallTargets.map((t) => t.selector)),
  ];
  const failing = checks.filter((c) => c.status === 'fail');
  const passing = checks.filter((c) => c.status === 'pass');
  const issues = failing.reduce((n, c) => n + c.failed, 0);
  return {
    checks,
    failing: failing.length,
    passing: passing.length,
    issues,
    headline:
      failing.length === 0
        ? `All ${passing.length} automated accessibility checks pass.`
        : `${failing.length} of ${passing.length + failing.length} automated accessibility checks fail, with ${issues} ${issues === 1 ? 'issue' : 'issues'} to fix.`,
    regulation: REGULATION_NOTE,
    manual: MANUAL_CHECKS,
  };
}
