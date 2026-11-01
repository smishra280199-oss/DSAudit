/**
 * Regression tests for false positives found by auditing pages with known
 * answers (a clean page, a page with planted defects, Bootstrap and Primer).
 * Every case here is something the audit once got wrong in front of a reader.
 */
import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit';
import { buildBusinessCase, maturityGap } from '../src/business';
import { analyse } from '../src/inference';
import { isOnBase } from '../src/inference/foundations/shared';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { declaration, makeSnapshot } from './helpers';

describe('contrast is only reported where WCAG applies', () => {
  const faint = { color: 'rgb(170, 170, 170)' };
  const a11y = analyse(
    makeSnapshot({
      elements: [
        { text: 'Visible hint', styles: faint, selector: '.hint' },
        { tag: 'button', text: 'Locked', attrs: { disabled: '' }, styles: faint, selector: '.locked' },
        { tag: 'span', text: 'Screen reader note', classes: ['sr-only'], rect: { x: 0, y: 0, w: 1, h: 1 }, styles: faint, selector: '.sr' },
        { text: 'Decorative', attrs: { 'aria-hidden': 'true' }, styles: faint, selector: '.deco' },
      ],
    }),
  ).accessibility;

  it('flags visible, enabled text', () => {
    expect(a11y.contrastFailures.map((f) => f.selector)).toEqual(['.hint']);
  });
});

describe('spacing judgements', () => {
  it('treats half a grid step as on the grid', () => {
    expect(isOnBase(4, 8)).toBe(true);
    expect(isOnBase(16, 8)).toBe(true);
    expect(isOnBase(12, 8)).toBe(false);
    expect(isOnBase(13, 8)).toBe(false);
  });

  it('never ranks off-grid spacing as high priority', () => {
    const audit = runAudit(
      makeSnapshot({ elements: Array.from({ length: 12 }, (_, i) => ({ selector: `.s${i}`, styles: { paddingTop: `${5 + i * 3}px` } })) }),
      DEFAULT_ASSUMPTIONS,
    );
    const spacing = audit.analysis.opportunities.find((o) => o.kind === 'off-scale-spacing');
    expect(spacing?.severity).not.toBe('high');
  });

  it('leaves out browser-default padding on form controls the CSS never sets', () => {
    const audit = runAudit(
      makeSnapshot({
        elements: [{ tag: 'button', text: 'Go', styles: { paddingLeft: '6px', paddingTop: '1px' } }, { text: 'a', styles: { paddingTop: '8px' } }],
        declarations: [declaration('padding', '8px')],
      }),
      DEFAULT_ASSUMPTIONS,
    );
    expect(audit.analysis.foundations.spacing.groups[0]!.values.map((v) => v.value)).toEqual(['8']);
  });
});

describe('colours', () => {
  it('keeps deliberate near-white surfaces apart', () => {
    const palette = analyse(
      makeSnapshot({
        elements: [
          { styles: { backgroundColor: 'rgb(255, 255, 255)' } },
          { styles: { backgroundColor: 'rgb(248, 249, 250)' } },
        ],
      }),
    ).foundations.color.palette!;
    expect(palette.every((c) => c.members.length === 1)).toBe(true);
  });
});

describe('components', () => {
  it('spots the same button rebuilt with slightly different padding', () => {
    const button = (selector: string, h: number) => ({
      tag: 'button',
      text: 'Save',
      selector,
      rect: { x: 0, y: 0, w: 100, h },
      styles: { backgroundColor: 'rgb(91, 61, 245)', color: 'rgb(255, 255, 255)', fontSize: '14px', paddingLeft: '16px' },
    });
    const buttons = analyse(makeSnapshot({ elements: [button('.a', 36), button('.b', 36), button('.c', 40)] })).components.find((c) => c.kind === 'button')!;
    expect(buttons.nearDuplicatePairs).toHaveLength(1);
  });
});

describe('business case for a product that already has a system', () => {
  it('claims no new-screen speed-up at a mature score', () => {
    expect(maturityGap(90)).toBe(0);
    expect(maturityGap(25)).toBe(1);
    const tidy = runAudit(makeSnapshot({ elements: [{ text: 'Hello', styles: { paddingTop: '8px' } }] }), DEFAULT_ASSUMPTIONS);
    const b = buildBusinessCase(tidy);
    if (tidy.score.overall >= 85) expect(b.yearly.newScreenHours).toBe(0);
    expect(b.causes.some((c) => c.label === 'Missing focus states')).toBe(false);
  });
});
