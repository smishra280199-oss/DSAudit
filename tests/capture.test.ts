// @vitest-environment jsdom
/**
 * Runs the real capture code against the demo page under jsdom. jsdom has no
 * layout (every rect is 0×0), so this checks structure and the authored
 * layer rather than geometry.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCaptureApi, type CapturedPage } from '../src/capture';
import { resolveSelector } from '../src/capture/selector';
import { parseDeclarations } from '../src/capture/stylesheets';
import { specificity } from '../src/inspect/specificity';

let page: CapturedPage;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../fixtures/demo-page.html'), 'utf8');
  document.open();
  document.write(html);
  document.close();
  page = createCaptureApi(document, { onInspectPicked: () => {}, onInspectExit: () => {} }).capture([]);
});

describe('capture against the demo page', () => {
  it('walks the rendered DOM depth-first from the body', () => {
    const { elements } = page.rendered;
    expect(elements[0]!.tag).toBe('body');
    expect(elements.every((e, i) => e.index === i && e.parent < i)).toBe(true);
    expect(elements.some((e) => e.tag === 'style' || e.tag === 'script')).toBe(false);
    expect(elements.find((e) => e.text === 'Save changes')?.tag).toBe('button');
  });

  it('records selectors that resolve back to the element', () => {
    const save = page.rendered.elements.find((e) => e.text === 'Save changes')!;
    expect(resolveSelector(document, save.selector)).toHaveLength(1);
  });

  it('inventories authored declarations with their kind', () => {
    const { declarations } = page.authored;
    const brand = declarations.find((d) => d.selector === '.btn--primary' && d.property === 'background')!;
    expect(brand).toMatchObject({ kind: 'token', tokens: ['--color-brand'], category: 'color' });
    expect(declarations.find((d) => d.selector === '.btn-old' && d.property === 'background')).toMatchObject({ kind: 'literal' });
    expect(declarations.find((d) => d.selector === '.btn--primary:hover')!.states).toEqual(['hover']);
  });

  it('collects custom properties and their theme scopes', () => {
    const { customProperties } = page.authored;
    expect(customProperties.find((c) => c.name === '--color-brand')!.isRootScope).toBe(true);
    expect(customProperties.filter((c) => c.selector === "[data-theme='dark']" || c.selector === '[data-theme="dark"]')).toHaveLength(4);
  });

  it('finds focus outlines removed without a replacement', () => {
    expect(page.authored.interaction.outlineRemovedWithoutReplacement.map((r) => r.selector)).toEqual(['.field input:focus']);
    expect(page.authored.interaction.focusTechniques['box-shadow']).toBe(1);
  });

  it('records inline style attributes', () => {
    expect(page.authored.declarations.some((d) => d.sheet === 'style attribute' && d.property === 'margin-top')).toBe(true);
  });
});

describe('CSS helpers', () => {
  it('splits declarations without breaking on semicolons inside values', () => {
    expect(parseDeclarations('background: url("a;b.png"); color: red !important')).toEqual([
      { property: 'background', value: 'url("a;b.png")', important: false },
      { property: 'color', value: 'red', important: true },
    ]);
  });

  it('approximates specificity', () => {
    expect(specificity('#a .b c')).toEqual([1, 1, 1]);
    expect(specificity(':where(.a) .b:hover')).toEqual([0, 2, 0]);
    expect(specificity('a::before')).toEqual([0, 0, 2]);
  });
});
