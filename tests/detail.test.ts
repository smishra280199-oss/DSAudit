import { describe, expect, it } from 'vitest';
import { collectEvidence } from '../src/adapters/bridge/evidence';
import { runAudit } from '../src/audit';
import { analyse } from '../src/inference';
import { foundationDetail, tokenLabel } from '../src/insights/foundation-detail';
import { styleDiff } from '../src/insights/gallery';
import { starterSystem } from '../src/insights/starter-system';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { declaration, makeSnapshot, times } from './helpers';

describe('token status for each value', () => {
  const snap = makeSnapshot({
    elements: [
      ...times(3, { text: 'Body', styles: { color: 'rgb(15, 15, 16)', paddingTop: '8px' } }, 'a'),
      ...times(2, { text: 'Hint', styles: { color: 'rgb(120, 120, 120)', paddingTop: '13px' } }, 'b'),
    ],
    rootCustomProperties: { '--ink': '#0f0f10', '--space-2': '8px' },
    declarations: [
      declaration('color', 'var(--ink)', { selector: '.a' }),
      declaration('padding', '8px', { selector: '.a' }),
      declaration('color', '#787878', { selector: '.b' }),
    ],
  });
  const audit = runAudit(snap, DEFAULT_ASSUMPTIONS);
  const detail = foundationDetail(audit, starterSystem(audit));

  it('recognises a value that comes from a token', () => {
    expect(detail.colours.find((r) => r.value === '#0f0f10')!.token).toEqual({ kind: 'token', name: '--ink' });
  });

  it('flags a raw value typed by hand although a token holds it', () => {
    expect(detail.spacing.find((r) => r.value === '8px')!.token).toMatchObject({ kind: 'typed', name: '--space-2' });
  });

  it('suggests a semantic and a primitive token where there is none', () => {
    const grey = detail.colours.find((r) => r.value === '#787878')!;
    expect(grey.token.kind).toBe('none');
    expect(tokenLabel(grey.token).text).toMatch(/^No token\. Suggest --color-text-muted → --color-gray-\d+$/);
  });

  it('flags spacing off the grid', () => {
    expect(detail.spacing.find((r) => r.value === '13px')).toMatchObject({ flag: 'off-scale' });
  });

  it('groups text into styles of font, size, line height and weight', () => {
    expect(detail.textStyles.map((r) => r.count).reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('component kinds', () => {
  const box = { x: 0, y: 0, w: 32, h: 32 };
  const components = analyse(
    makeSnapshot({
      elements: [
        { tag: 'button', text: 'Save', styles: { backgroundColor: 'rgb(0, 0, 0)' } },
        { tag: 'button', text: '', rect: box, attrs: { 'aria-label': 'Close' } },
        { tag: 'button', text: 'Voices', attrs: { role: 'tab' } },
        { tag: 'a', text: 'Docs', attrs: { href: '', role: 'menuitem' } },
      ],
    }),
  ).components;
  const count = (kind: string) => components.find((c) => c.kind === kind)!.instances;

  it('keeps icon buttons, tabs and menu items apart from labelled buttons', () => {
    expect([count('button'), count('icon-button'), count('tab'), count('link')]).toEqual([1, 1, 2, 0]);
  });
});

describe('near-copies', () => {
  it('say exactly what differs', () => {
    expect(styleDiff({ paddingLeft: '16px', backgroundColor: 'rgb(219, 43, 33)' }, { paddingLeft: '18px', backgroundColor: 'rgb(220, 44, 34)' })).toEqual([
      'fill #db2b21 → #dc2c22',
      'padding (side) 16px → 18px',
    ]);
    expect(styleDiff({ fontSize: '14px' }, { fontSize: '14px' }, 36, 40)).toEqual(['height 36px → 40px']);
  });
});

describe('evidence collection', () => {
  it('keeps going past a failed screenshot and always restores the page', async () => {
    let finished = false;
    const frames: string[] = [];
    const shots = await collectEvidence(
      {
        frame: async (_selectors, focus) => {
          frames.push(focus);
          return { targets: [{ selector: focus, x: 0, y: 0, w: 10, h: 10, textColor: '#000', hasText: false }], focusFailed: false, dpr: 1, viewport: { w: 100, h: 100 } };
        },
        endFrame: async () => {},
        finish: async () => {
          finished = true;
        },
        screenshot: async () => null,
      },
      ['.a', '.b', '.c'],
    );
    expect(frames).toEqual(['.a', '.b', '.c']);
    expect(shots).toEqual({});
    expect(finished).toBe(true);
  });
});
