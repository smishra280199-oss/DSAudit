import { describe, expect, it } from 'vitest';
import { summariseClassNames, classifyClass } from '../src/shared/class-naming';
import { contrastRatio, deltaE, parseColor, toHex } from '../src/shared/color';
import { evaluateContrast } from '../src/shared/contrast';
import { categoryOf, statesIn, stripStates, toMs, toPx, tokensIn, valueKind } from '../src/shared/css-values';
import { capturability } from '../src/shared/restricted';

describe('colour', () => {
  it('parses the forms getComputedStyle and authors use', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)')?.a).toBe(0.5);
    expect(parseColor('rgb(0 0 0 / 50%)')?.a).toBe(0.5);
    expect(toHex(parseColor('#abc')!)).toBe('#aabbcc');
    expect(toHex(parseColor('hsl(0, 100%, 50%)')!)).toBe('#ff0000');
    expect(parseColor('transparent')?.a).toBe(0);
    expect(parseColor('var(--x)')).toBeNull();
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 0);
    expect(contrastRatio(parseColor('#777')!, parseColor('#fff')!)).toBeCloseTo(4.48, 1);
  });

  it('treats a one-step difference as a near-duplicate and a hue change as distinct', () => {
    expect(deltaE(parseColor('#5b3df5')!, parseColor('#5c3ef5')!)).toBeLessThan(2.3);
    expect(deltaE(parseColor('#5b3df5')!, parseColor('#e5484d')!)).toBeGreaterThan(20);
  });

  it('composites translucent backdrops before measuring contrast', () => {
    const result = evaluateContrast('#ffffff', [{ color: 'rgba(0, 0, 0, 0.1)' }, { color: '#ffffff' }], 14, 400)!;
    expect(result.background).toBe('#e6e6e6');
    expect(result.passesAA).toBe(false);
    const large = evaluateContrast('#767676', [{ color: '#ffffff' }], 24, 400)!;
    expect(large.largeText).toBe(true);
    expect(large.passesAA).toBe(true);
    expect(evaluateContrast('#000', [{ hasImage: true }], 14, 400)!.approximate).toBe(true);
  });
});

describe('css values', () => {
  it('maps properties to design categories', () => {
    expect(categoryOf('padding-left')).toBe('spacing');
    expect(categoryOf('border-radius')).toBe('radius');
    expect(categoryOf('display')).toBeNull();
  });

  it('classifies how a value was written', () => {
    expect(valueKind('var(--space-2)')).toBe('token');
    expect(valueKind('calc(var(--a) * 2)')).toBe('token');
    expect(valueKind('12px')).toBe('literal');
    expect(valueKind('inherit')).toBe('keyword');
    expect(tokensIn('var(--a) var(--b, 4px)')).toEqual(['--a', '--b']);
  });

  it('finds and strips interaction states', () => {
    expect(statesIn('.btn:hover, .btn:focus-visible')).toEqual(['hover', 'focus-visible']);
    expect(statesIn('.tab[aria-selected="true"]')).toEqual(['selected']);
    expect(stripStates('.nav a:hover')).toBe('.nav a');
    expect(stripStates(':focus')).toBe('*');
  });

  it('parses lengths and durations', () => {
    expect(toPx('1.5rem')).toBe(24);
    expect(toPx('auto')).toBeNull();
    expect(toMs('0.2s')).toBe(200);
    expect(toMs('150ms, 300ms')).toBe(150);
  });
});

describe('class naming', () => {
  it('recognises the common conventions', () => {
    expect(classifyClass('px-4')).toBe('utility');
    expect(classifyClass('hover:bg-gray-100')).toBe('utility');
    expect(classifyClass('css-1x2y3z')).toBe('css-in-js');
    expect(classifyClass('Button_primary__a1B2c')).toBe('css-modules');
    expect(classifyClass('card__title--large')).toBe('bem');
    expect(classifyClass('header')).toBe('other');
  });

  it('reports namespaced prefixes shared by many classes', () => {
    const names = Array.from({ length: 12 }, (_, i) => `mds-thing${i}`);
    const stats = summariseClassNames([...names, 'flex', 'flex']);
    expect(stats.totalClasses).toBe(13);
    expect(stats.prefixes[0]).toEqual({ prefix: 'mds-', count: 12 });
    expect(stats.counts.namespaced).toBe(12);
  });
});

describe('restricted pages', () => {
  it('blocks pages Chrome does not let extensions script', () => {
    expect(capturability('https://example.com')).toBe('ok');
    expect(capturability('file:///tmp/a.html')).toBe('ok');
    expect(capturability('chrome://settings')).toBe('browser-page');
    expect(capturability('chrome-extension://abc/panel.html')).toBe('extension-page');
    expect(capturability('https://chromewebstore.google.com/detail/x')).toBe('web-store');
    expect(capturability(undefined)).toBe('unsupported-scheme');
    expect(capturability('')).toBe('needs-access');
  });
});
