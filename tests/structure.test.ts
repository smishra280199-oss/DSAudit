/**
 * Intelligent element selection: what the audit counts, what it leaves out
 * and how nested elements are read so one thing on screen is one finding.
 * Each case builds the page the way a browser would report it (with real
 * geometry), so the size and position rules apply.
 */
import { describe, expect, it } from 'vitest';
import { analyse } from '../src/inference';
import { viewElements } from '../src/inference/elements';
import type { ComponentKind } from '../src/inference/types';
import { makeSnapshot, type ElementSpec } from './helpers';

const BUTTON = { backgroundColor: 'rgb(91, 33, 182)', color: 'rgb(255, 255, 255)', paddingLeft: '14px', borderTopLeftRadius: '8px' };
const CARD = { backgroundColor: 'rgb(255, 255, 255)', borderTopLeftRadius: '12px', boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 3px 0px' };
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** Elements are numbered from 1 (0 is the body); `parent` refers to those numbers. */
function audit(elements: ElementSpec[]) {
  const snapshot = makeSnapshot({ elements });
  return { analysis: analyse(snapshot), views: viewElements(snapshot) };
}

function instances(elements: ElementSpec[], kind: ComponentKind): number {
  return audit(elements).analysis.components.find((c) => c.kind === kind)!.instances;
}

describe('real controls versus things that look like them', () => {
  it('an <a> without href styled as a button is decoration, not a button', () => {
    expect(instances([{ tag: 'a', text: 'Buy', styles: BUTTON, rect: rect(0, 0, 80, 36) }], 'button')).toBe(0);
    expect(instances([{ tag: 'a', text: 'Buy', attrs: { href: '' }, styles: BUTTON, rect: rect(0, 0, 80, 36) }], 'button')).toBe(1);
  });

  it('a clickable div styled as a button counts as a button and is listed as lacking a role', () => {
    const { analysis } = audit([
      { tag: 'div', text: 'Continue', attrs: { tabindex: '0' }, styles: { ...BUTTON, cursor: 'pointer' }, rect: rect(0, 0, 100, 40), selector: '.fake-btn' },
      { tag: 'div', text: 'Just a coloured box', styles: BUTTON, rect: rect(0, 50, 100, 40), selector: '.box' },
    ]);
    expect(analysis.components.find((c) => c.kind === 'button')!.variants.flatMap((v) => v.selectors)).toEqual(['.fake-btn']);
    expect(analysis.structure.customControls).toEqual(['.fake-btn']);
  });

  it('an icon-only clickable div with no name fails the named-controls check', () => {
    const { analysis } = audit([{ tag: 'div', attrs: { onclick: '' }, styles: { cursor: 'pointer' }, rect: rect(0, 0, 32, 32), selector: '.x' }]);
    expect(analysis.accessibility.unnamedControls.map((c) => c.selector)).toEqual(['.x']);
  });
});

describe('nested elements are one finding', () => {
  it('a button inside a link of the same size is one control', () => {
    const { analysis, views } = audit([
      { tag: 'a', attrs: { href: '' }, rect: rect(0, 0, 120, 40), selector: '.wrap' },
      { tag: 'button', text: 'Sign up', parent: 1, styles: BUTTON, rect: rect(0, 0, 120, 40), selector: '.btn' },
    ]);
    expect(views[1]!.merged).toBe('nested-control');
    const buttons = analysis.components.find((c) => c.kind === 'button')!;
    const links = analysis.components.find((c) => c.kind === 'link')!;
    expect(buttons.instances + links.instances).toBe(1);
    expect(buttons.variants[0]!.selectors).toEqual(['.btn']);
  });

  it('the span that paints a button is the button, not a badge', () => {
    const { analysis } = audit([
      { tag: 'button', rect: rect(0, 0, 90, 28), selector: '.btn' },
      { tag: 'span', text: 'Save', parent: 1, styles: { backgroundColor: 'rgb(238, 238, 255)', borderTopLeftRadius: '999px' }, rect: rect(0, 0, 90, 28), selector: '.skin' },
    ]);
    expect(analysis.components.find((c) => c.kind === 'badge')!.instances).toBe(0);
    // The button is recorded with the look its skin gives it, and its text.
    const button = analysis.components.find((c) => c.kind === 'button')!.variants[0]!;
    expect(button).toMatchObject({ selectors: ['.btn'], sampleText: 'Save' });
    expect(button.styles.backgroundColor).toBe('rgb(238, 238, 255)');
  });

  it('a count badge inside a button is still a badge', () => {
    const { analysis } = audit([
      { tag: 'button', text: 'Inbox', styles: BUTTON, rect: rect(0, 0, 110, 36) },
      { tag: 'span', text: '3', parent: 1, styles: { backgroundColor: 'rgb(229, 72, 77)', borderTopLeftRadius: '999px' }, rect: rect(80, 8, 20, 20) },
    ]);
    expect(analysis.components.find((c) => c.kind === 'badge')!.instances).toBe(1);
  });

  it('a button inside a card inside a section: one card, one button', () => {
    const { analysis } = audit([
      { tag: 'section', styles: CARD, rect: rect(0, 0, 1280, 600), selector: 'section' },
      { tag: 'article', parent: 1, styles: CARD, rect: rect(20, 20, 360, 240), selector: '.card-a' },
      { tag: 'div', parent: 2, styles: CARD, rect: rect(28, 28, 344, 224), selector: '.card-a-inner' },
      { tag: 'button', text: 'Buy', parent: 3, styles: BUTTON, rect: rect(40, 200, 80, 36) },
      { tag: 'article', parent: 1, styles: CARD, rect: rect(400, 20, 360, 240), selector: '.card-b' },
      { tag: 'button', text: 'Buy', parent: 5, styles: BUTTON, rect: rect(420, 200, 80, 36) },
    ]);
    const cards = analysis.components.find((c) => c.kind === 'card')!;
    // The full-width section holds two cards, so it's a section; the inner box fills card A, so it's card A.
    expect(cards.variants.flatMap((v) => v.selectors).sort()).toEqual(['.card-a', '.card-b']);
    expect(analysis.components.find((c) => c.kind === 'button')!.instances).toBe(2);
  });

  it('a narrower rounded panel holding cards is a surface style of its own', () => {
    const { analysis } = audit([
      { tag: 'section', styles: { ...CARD, borderTopLeftRadius: '10px' }, rect: rect(200, 0, 860, 300), selector: '.panel' },
      { tag: 'div', parent: 1, styles: CARD, rect: rect(220, 20, 262, 104), selector: '.tile-a' },
      { tag: 'div', parent: 1, styles: CARD, rect: rect(500, 20, 262, 104), selector: '.tile-b' },
    ]);
    expect(analysis.components.find((c) => c.kind === 'card')!.variants.flatMap((v) => v.selectors).sort()).toEqual(['.panel', '.tile-a', '.tile-b']);
  });

  it('a link around a heading and image is a clickable card, not a text link', () => {
    const { analysis } = audit([
      { tag: 'a', attrs: { href: '' }, styles: CARD, rect: rect(0, 0, 300, 220), selector: '.post' },
      { tag: 'img', parent: 1, attrs: { alt: 'Cover' }, rect: rect(0, 0, 300, 150) },
      { tag: 'h3', text: 'Release notes', parent: 1, rect: rect(12, 160, 276, 24) },
      { tag: 'a', text: 'Read the docs', attrs: { href: '' }, rect: rect(0, 240, 120, 20), selector: '.text-link' },
    ]);
    expect(analysis.components.find((c) => c.kind === 'link')!.variants.flatMap((v) => v.selectors)).toEqual(['.text-link']);
    expect(analysis.components.find((c) => c.kind === 'card')!.instances).toBe(1);
  });
});

describe('what is left out, and why', () => {
  it('cookie banners and chat widgets are not the product’s design system', () => {
    const { analysis, views } = audit([
      { tag: 'div', attrs: { id: 'onetrust-consent-sdk' }, rect: rect(0, 700, 1280, 100) },
      { tag: 'button', text: 'Accept all', parent: 1, styles: { ...BUTTON, backgroundColor: 'rgb(0, 128, 0)' }, rect: rect(1000, 720, 120, 40) },
      { tag: 'button', text: 'Save', styles: BUTTON, rect: rect(0, 0, 80, 36) },
    ]);
    expect(views[2]!.excluded).toBe('third-party');
    expect(analysis.components.find((c) => c.kind === 'button')!.instances).toBe(1);
    const backgrounds = analysis.foundations.color.groups.find((g) => g.key === 'background')!.values.map((v) => v.value);
    expect(backgrounds).not.toContain('#008000');
    expect(analysis.structure.excluded[0]).toMatchObject({ key: 'third-party', count: 2 });
  });

  it('aria-hidden marquee clones are not counted twice', () => {
    const logo = (parent: number, x: number): ElementSpec => ({ tag: 'a', text: 'Acme', attrs: { href: '' }, parent, rect: rect(x, 0, 80, 20) });
    const { analysis } = audit([
      { tag: 'div', rect: rect(0, 0, 400, 20) },
      logo(1, 0),
      logo(1, 100),
      { tag: 'div', attrs: { 'aria-hidden': 'true' }, rect: rect(400, 0, 400, 20) },
      logo(4, 400),
      logo(4, 500),
    ]);
    expect(analysis.components.find((c) => c.kind === 'link')!.instances).toBe(2);
    expect(analysis.structure.merged).toEqual([expect.objectContaining({ key: 'hidden-clone', count: 2 })]);
  });

  it('an off-screen drawer duplicating the navigation is left out, with its contents', () => {
    const { analysis, views } = audit([
      { tag: 'nav', rect: rect(0, 0, 1280, 60) },
      { tag: 'a', text: 'Pricing', attrs: { href: '' }, parent: 1, rect: rect(100, 20, 60, 20) },
      { tag: 'nav', rect: rect(-320, 0, 320, 800), selector: '.drawer' },
      { tag: 'a', text: 'Pricing', attrs: { href: '' }, parent: 3, rect: rect(-300, 20, 60, 20) },
    ]);
    expect(views[3]!.excluded).toBe('offscreen');
    expect(views[4]!.excluded).toBe('offscreen');
    expect(analysis.components.find((c) => c.kind === 'link')!.instances).toBe(1);
  });

  it('collapsed elements don’t add colours nobody can see', () => {
    const { analysis } = audit([{ tag: 'div', styles: { backgroundColor: 'rgb(255, 0, 0)' }, rect: rect(0, 0, 400, 0) }]);
    expect(analysis.foundations.color.groups.find((g) => g.key === 'background')!.values).toEqual([]);
  });

  it('without geometry (old captures, jsdom) size and position rules stand down', () => {
    const snapshot = makeSnapshot({ elements: [{ tag: 'button', text: 'Go' }, { tag: 'div', styles: { backgroundColor: 'rgb(255, 0, 0)' } }] });
    for (const el of snapshot.rendered.elements) el.rect = rect(0, 0, 0, 0);
    expect(viewElements(snapshot).every((v) => v.excluded === null)).toBe(true);
    expect(analyse(snapshot).components.find((c) => c.kind === 'button')!.instances).toBe(1);
  });
});

describe('classification summary', () => {
  it('names what it recognised', () => {
    const { analysis, views } = audit([
      { tag: 'header', rect: rect(0, 0, 1280, 60) },
      { tag: 'a', text: 'Home', attrs: { href: '' }, parent: 1, rect: rect(0, 0, 60, 20) },
      { tag: 'main', rect: rect(0, 60, 1280, 600) },
      { tag: 'h1', text: 'Welcome', parent: 3, rect: rect(0, 60, 400, 40) },
      { tag: 'div', parent: 3, rect: rect(0, 100, 400, 200) },
      { tag: 'img', attrs: { alt: 'x' }, parent: 5, rect: rect(0, 100, 400, 200) },
      { tag: 'form', parent: 3, rect: rect(0, 300, 400, 100) },
      { tag: 'input', attrs: { type: 'email' }, parent: 7, rect: rect(0, 300, 300, 36) },
      { tag: 'hr', styles: { borderTopWidth: '1px' }, parent: 3, rect: rect(0, 420, 400, 1) },
    ]);
    expect(views.map((v) => v.role)).toEqual(['structural', 'navigation', 'control', 'navigation', 'text', 'structural', 'media', 'form', 'control', 'decorative']);
    expect(analysis.structure.roles.find((r) => r.key === 'control')?.count).toBe(2);
    expect(analysis.structure.layout).toBe(true);
    expect(views[2]!.control).toBe(-1);
  });

  it('records the nearest control ancestor for nested content', () => {
    const { views } = audit([
      { tag: 'button', rect: rect(0, 0, 100, 40) },
      { tag: 'span', text: 'Go', parent: 1, rect: rect(10, 10, 20, 20) },
    ]);
    expect(views[2]!.control).toBe(1);
  });
});
