import { describe, expect, it } from 'vitest';
import { analyse } from '../src/inference';
import { declaration, makeSnapshot, rootToken, times } from './helpers';

describe('colour foundation', () => {
  it('clusters near-duplicate colours under the most used one', () => {
    const snapshot = makeSnapshot({
      elements: [
        ...times(5, { styles: { backgroundColor: 'rgb(91, 61, 245)' } }, 'a'),
        ...times(1, { styles: { backgroundColor: 'rgb(92, 62, 245)' } }, 'b'),
        ...times(2, { styles: { backgroundColor: 'rgb(229, 72, 77)' } }, 'c'),
      ],
    });
    const { palette, groups } = analyse(snapshot).foundations.color;
    const brand = palette!.find((c) => c.hex === '#5b3df5')!;
    expect(brand.members.map((m) => m.value)).toEqual(['#5b3df5', '#5c3ef5']);
    expect(palette!.find((c) => c.hex === '#e5484d')!.members).toHaveLength(1);
    const background = groups.find((g) => g.key === 'background')!;
    expect(background.values.find((v) => v.value === '#5c3ef5')!.nearDuplicateOf).toBe('#5b3df5');
  });

  it('only counts text colour where there is text', () => {
    const snapshot = makeSnapshot({ elements: [{ styles: { color: 'rgb(255, 0, 0)' } }, { text: 'Hi', styles: { color: 'rgb(0, 0, 255)' } }] });
    const text = analyse(snapshot).foundations.color.groups.find((g) => g.key === 'text')!;
    expect(text.values.map((v) => v.value)).toEqual(['#0000ff']);
  });
});

describe('spacing foundation', () => {
  it('infers the base unit and flags off-grid values', () => {
    const snapshot = makeSnapshot({
      elements: [
        ...times(10, { styles: { paddingTop: '8px', paddingLeft: '16px' } }, 'a'),
        ...times(4, { styles: { marginTop: '24px' } }, 'b'),
        ...times(1, { styles: { marginTop: '13px' } }, 'c'),
      ],
    });
    const [group] = analyse(snapshot).foundations.spacing.groups;
    expect(group!.scale).toMatchObject({ kind: 'base-unit', value: 8 });
    expect(group!.values.find((v) => v.value === '13')!.onScale).toBe(false);
    expect(group!.values.find((v) => v.value === '24')!.onScale).toBe(true);
  });
});

describe('typography foundation', () => {
  it('fits a modular scale and marks near-duplicate sizes', () => {
    const sizes = ['16px', '16px', '16px', '20px', '25px', '15px'];
    const snapshot = makeSnapshot({ elements: sizes.map((fontSize, i) => ({ text: 'Text', selector: `.t${i}`, styles: { fontSize } })) });
    const group = analyse(snapshot).foundations.typography.groups.find((g) => g.key === 'font-size')!;
    expect(group.scale!.value).toBe(1.25);
    expect(group.values.find((v) => v.value === '15')!.nearDuplicateOf).toBe('16');
  });
});

describe('components', () => {
  it('groups buttons into variants and spots drifted near-duplicates', () => {
    const primary = { tag: 'button', text: 'Save', rect: { x: 0, y: 0, w: 100, h: 32 }, styles: { backgroundColor: 'rgb(91, 61, 245)', color: 'rgb(255, 255, 255)', borderTopLeftRadius: '8px', paddingLeft: '16px' } };
    const drifted = { ...primary, text: 'Upgrade', styles: { ...primary.styles, backgroundColor: 'rgb(92, 62, 245)', borderTopLeftRadius: '7px', paddingLeft: '15px' } };
    const danger = { ...primary, text: 'Delete', styles: { ...primary.styles, backgroundColor: 'rgb(229, 72, 77)' } };
    const snapshot = makeSnapshot({ elements: [...times(3, primary, 'p'), drifted, danger] });
    const buttons = analyse(snapshot).components.find((c) => c.kind === 'button')!;
    expect(buttons.instances).toBe(5);
    expect(buttons.variants).toHaveLength(3);
    expect(buttons.variants[0]!.count).toBe(3);
    expect(buttons.nearDuplicatePairs).toEqual([[0, 1]]);
  });

  it('treats a link with a surface and padding as a button', () => {
    const snapshot = makeSnapshot({
      elements: [
        { tag: 'a', text: 'Buy', attrs: { href: '' }, rect: { x: 0, y: 0, w: 80, h: 36 }, styles: { backgroundColor: 'rgb(0, 0, 0)', paddingLeft: '12px' } },
        { tag: 'a', text: 'Docs', attrs: { href: '' }, styles: { color: 'rgb(0, 0, 255)' } },
      ],
    });
    const components = analyse(snapshot).components;
    expect(components.find((c) => c.kind === 'button')!.instances).toBe(1);
    expect(components.find((c) => c.kind === 'link')!.instances).toBe(1);
  });
});

describe('tokens', () => {
  const tokens = { '--color-surface': '#ffffff', '--color-text-inverse': '#ffffff', '--space-4': '16px' };

  it('measures coverage and suggests swaps by role, not just value', () => {
    const snapshot = makeSnapshot({
      rootCustomProperties: tokens,
      customProperties: Object.entries(tokens).map(([n, v]) => rootToken(n, v)),
      declarations: [
        declaration('background', 'var(--color-surface)'),
        declaration('padding', 'var(--space-4)'),
        declaration('color', '#fff'),
        declaration('margin-top', '16px'),
        declaration('margin-bottom', '1rem'),
      ],
    });
    const analysis = analyse(snapshot).tokens;
    expect(analysis.coverage).toBeCloseTo(2 / 5);
    const text = analysis.suggestions.find((s) => s.role === 'color-text')!;
    expect(text.token).toBe('--color-text-inverse');
    expect(text.confidence).toBe('role-match');
    const spacing = analysis.suggestions.find((s) => s.category === 'spacing')!;
    expect(spacing).toMatchObject({ token: '--space-4', occurrences: 2, confidence: 'role-match' });
  });

  it('does not call a token used for backgrounds a role match for text', () => {
    const snapshot = makeSnapshot({
      rootCustomProperties: { '--surface': '#ffffff' },
      declarations: [declaration('background-color', 'var(--surface)'), declaration('color', '#ffffff')],
    });
    const [suggestion] = analyse(snapshot).tokens.suggestions;
    expect(suggestion).toMatchObject({ token: '--surface', confidence: 'value-only' });
  });

  it('finds theme scopes and unused tokens', () => {
    const snapshot = makeSnapshot({
      customProperties: [
        rootToken('--a', '#000'),
        rootToken('--b', '#111'),
        rootToken('--c', '#222'),
        rootToken('--unused', '#333'),
        ...['--a', '--b', '--c'].map((name) => ({ ...rootToken(name, '#fff'), selector: '[data-theme="dark"]', isRootScope: false })),
      ],
      declarations: [declaration('color', 'var(--a)'), declaration('color', 'var(--b)'), declaration('color', 'var(--c)')],
    });
    const analysis = analyse(snapshot).tokens;
    expect(analysis.themeScopes).toEqual([{ scope: '[data-theme="dark"]', redefinitions: 3 }]);
    expect(analysis.unusedTokens).toEqual(['--unused']);
  });
});

describe('accessibility', () => {
  it('flags low-contrast text and unnamed icon buttons', () => {
    const snapshot = makeSnapshot({
      elements: [
        { text: 'Faint', styles: { color: 'rgb(200, 200, 200)' } },
        { text: 'Fine', styles: { color: 'rgb(20, 20, 20)' } },
        { tag: 'button', selector: '.icon' },
        { tag: 'button', selector: '.labelled', attrs: { 'aria-label': 'Close' } },
      ],
    });
    const a11y = analyse(snapshot).accessibility;
    expect(a11y.contrastFailures.map((f) => f.text)).toEqual(['Faint']);
    expect(a11y.unnamedControls).toEqual([{ selector: '.icon', tag: 'button' }]);
  });
});

describe('confidence and opportunities', () => {
  it('lowers confidence for what the capture could not see', () => {
    const snapshot = makeSnapshot({ hostAccess: false, unreadableSheets: ['https://cdn.test/a.css', 'https://cdn.test/b.css', 'https://cdn.test/c.css'] });
    const { confidence } = analyse(snapshot);
    expect(confidence.level).toBe('low');
    expect(confidence.reasons.join(' ')).toMatch(/3 stylesheets/);
  });

  it('ranks opportunities by severity', () => {
    const snapshot = makeSnapshot({
      elements: [
        { text: 'Faint', styles: { color: 'rgb(210, 210, 210)' } },
        ...times(3, { styles: { backgroundColor: 'rgb(91, 61, 245)' } }, 'a'),
        { styles: { backgroundColor: 'rgb(92, 62, 245)' } },
      ],
    });
    const { opportunities } = analyse(snapshot);
    const kinds = opportunities.map((o) => o.kind);
    expect(kinds).toContain('low-contrast');
    expect(kinds).toContain('merge-near-duplicate-colors');
    const rank = { high: 3, medium: 2, low: 1 };
    expect(opportunities.every((o, i) => i === 0 || rank[opportunities[i - 1]!.severity] >= rank[o.severity])).toBe(true);
  });
});
