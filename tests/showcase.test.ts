import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit';
import { analyse } from '../src/inference';
import { componentGallery, replicaCss } from '../src/insights/gallery';
import { starterSystem } from '../src/insights/starter-system';
import { accessibilityReport } from '../src/insights/wcag';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { makeSnapshot, times } from './helpers';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('accessibility checks', () => {
  it('flags small targets only when they are crowded (WCAG 2.5.8)', () => {
    const a11y = analyse(
      makeSnapshot({
        elements: [
          { tag: 'button', text: 'x', selector: '.crowded-a', rect: box(0, 0, 16, 16) },
          { tag: 'button', text: 'y', selector: '.crowded-b', rect: box(18, 0, 16, 16) },
          { tag: 'button', text: 'z', selector: '.alone', rect: box(400, 400, 16, 16) },
          { tag: 'button', text: 'Big', selector: '.big', rect: box(0, 100, 80, 32) },
        ],
      }),
    ).accessibility;
    expect(a11y.smallTargets.map((t) => t.selector).sort()).toEqual(['.crowded-a', '.crowded-b']);
    expect(a11y.targetsChecked).toBe(4);
  });

  it('exempts links inside a sentence', () => {
    const a11y = analyse(
      makeSnapshot({
        elements: [
          { tag: 'p', text: 'Read our', selector: 'p', rect: box(0, 0, 300, 18) },
          { tag: 'a', text: 'terms', attrs: { href: '' }, parent: 1, selector: 'p a', rect: box(60, 0, 40, 18) },
          { tag: 'a', text: 'privacy', attrs: { href: '' }, parent: 1, selector: 'p a + a', rect: box(104, 0, 50, 18) },
        ],
      }),
    ).accessibility;
    expect(a11y.smallTargets).toEqual([]);
  });

  it('finds form fields without a label, and notes placeholder-only ones', () => {
    const a11y = analyse(
      makeSnapshot({
        elements: [
          { tag: 'input', selector: '.labelled', attrs: { 'data-labelled': '' } },
          { tag: 'input', selector: '.aria', attrs: { 'aria-label': 'Email' } },
          { tag: 'input', selector: '.placeholder', attrs: { placeholder: 'Email' } },
          { tag: 'input', selector: '.submit', attrs: { type: 'submit' } },
          { tag: 'select', selector: '.bare' },
        ],
      }),
    ).accessibility;
    expect(a11y.unlabelledFields).toEqual([
      { selector: '.placeholder', tag: 'input', placeholderOnly: true },
      { selector: '.bare', tag: 'select', placeholderOnly: false },
    ]);
    expect(a11y.fieldsChecked).toBe(4);
  });

  it('accepts alt="" and role="presentation" as decorative images', () => {
    const a11y = analyse(
      makeSnapshot({
        elements: [
          { tag: 'img', selector: '.missing' },
          { tag: 'img', selector: '.decorative', attrs: { alt: '' } },
          { tag: 'img', selector: '.presentation', attrs: { role: 'presentation' } },
          { tag: 'img', selector: '.described', attrs: { alt: 'Team photo' } },
        ],
      }),
    ).accessibility;
    expect(a11y.imagesWithoutAlt).toEqual([{ selector: '.missing' }]);
    expect(a11y.imagesChecked).toBe(3);
  });

  it('maps the checks to WCAG criteria and never claims a full audit', () => {
    const audit = runAudit(makeSnapshot({ elements: [{ tag: 'img', selector: '.missing' }, { text: 'Hello' }] }), DEFAULT_ASSUMPTIONS);
    const report = accessibilityReport(audit);
    expect(report.checks.find((c) => c.sc === '1.1.1')).toMatchObject({ status: 'fail', failed: 1 });
    expect(report.checks.find((c) => c.sc === '1.3.1')!.status).toBe('not-applicable');
    expect(report.regulation).toMatch(/not a certificate/);
    expect(report.manual.length).toBeGreaterThan(0);
    expect(audit.analysis.opportunities.some((o) => o.kind === 'missing-alt-text')).toBe(true);
  });
});

const purple = 'rgb(91, 61, 245)';
const messy = makeSnapshot({
  elements: [
    ...times(4, { tag: 'button', text: 'Save', rect: box(0, 0, 90, 36), styles: { backgroundColor: purple, color: 'rgb(255, 255, 255)', fontSize: '14px', paddingLeft: '16px', paddingTop: '8px' } }, 'p'),
    { tag: 'button', text: 'Update', selector: '.cta', rect: box(0, 0, 90, 40), styles: { backgroundColor: purple, color: 'rgb(255, 255, 255)', fontSize: '14px', paddingLeft: '16px', paddingTop: '10px' } },
    { tag: 'button', text: 'Cancel', selector: '.ghost', rect: box(0, 0, 90, 36), styles: { color: purple, fontSize: '14px', paddingLeft: '16px' } },
    { text: 'Body', styles: { color: 'rgb(26, 26, 26)', backgroundColor: 'rgb(255, 255, 255)' } },
    { text: 'Hint', styles: { color: 'rgb(110, 110, 110)' } },
    { styles: { backgroundColor: 'rgb(92, 62, 245)' } },
  ],
});

describe('component gallery', () => {
  const audit = runAudit(messy, DEFAULT_ASSUMPTIONS);
  const buttons = componentGallery(audit).find((g) => g.kind === 'button')!;

  it('shows every button style, numbered, with near-copies marked', () => {
    expect(buttons.items.map((i) => i.label)).toEqual(['Save', 'Update', 'Cancel']);
    expect(buttons.items[1]!.copyOf).toBe(1);
    expect(buttons.hasProblem).toBe(true);
  });

  it('redraws a replica from the captured look, capped to fit a tile', () => {
    const css = replicaCss('button', { backgroundColor: purple, fontSize: '40px', paddingLeft: '60px', paddingTop: '8px' });
    expect(css).toMatchObject({ 'background-color': purple, 'font-size': '16px', padding: '8px 24px' });
  });
});

describe('starter design system', () => {
  const audit = runAudit(messy, DEFAULT_ASSUMPTIONS);
  const system = starterSystem(audit, 'Acme');

  it('names the most used accent colour as the brand and folds its near-copies into it', () => {
    const brand = system.tokens.find((t) => t.name === 'color-brand')!;
    expect(brand.value).toBe('#5b3df5');
    expect(brand.replaces).toContain('#5c3ef5');
  });

  it('never picks white as the muted text colour', () => {
    const muted = system.tokens.find((t) => t.name === 'color-text-muted');
    expect(muted?.alias).not.toBe('color-white');
  });

  it('has fewer tokens than values in use, and exports valid CSS and JSON', () => {
    expect(system.after).toBeLessThanOrEqual(system.before);
    expect(system.css).toMatch(/^\/\* Starter design tokens for Acme/);
    expect(system.css).toContain('--color-brand: #5b3df5;');
    const json = JSON.parse(system.json);
    expect(json.color.brand).toMatchObject({ $type: 'color', $value: '#5b3df5' });
  });

  it('keeps see-through colours as overlays instead of merging them into black', () => {
    const s = starterSystem(runAudit(makeSnapshot({ elements: [{ styles: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } }, { styles: { backgroundColor: 'rgb(0, 0, 0)' } }] }), DEFAULT_ASSUMPTIONS));
    expect(s.tokens.some((t) => t.name.startsWith('color-overlay'))).toBe(true);
  });
});
