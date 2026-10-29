import { describe, expect, it } from 'vitest';
import { FakeBridge } from '../src/adapters/bridge/fake';
import { AuditController } from '../src/adapters/extension/panel/audit-controller';
import { runAudit } from '../src/audit';
import { mergeSnapshots } from '../src/audit/merge';
import type { CapturedPage } from '../src/capture';
import { colourName, describeElement, pageName } from '../src/insights/describe';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { pagesOf, parseSelector, scopeSelector, selectorsForPage } from '../src/shared/page-scope';
import { declaration, makeSnapshot } from './helpers';

const home = { ...makeSnapshot({ elements: [{ tag: 'button', text: 'Sign up', styles: { backgroundColor: 'rgb(91, 61, 245)' } }], declarations: [declaration('color', '#333')] }), id: 'home', url: 'https://acme.test/' };
const pricing = { ...makeSnapshot({ elements: [{ tag: 'button', text: 'Buy', styles: { backgroundColor: 'rgb(92, 62, 245)' } }], declarations: [declaration('color', '#333'), declaration('margin', '13px')] }), id: 'pricing', url: 'https://acme.test/pricing' };

describe('page scoping', () => {
  it('round-trips page-scoped selectors', () => {
    const s = scopeSelector(2, '.btn > span');
    expect(parseSelector(s)).toEqual({ page: 2, selector: '.btn > span' });
    expect(parseSelector('.plain')).toEqual({ page: null, selector: '.plain' });
    expect(selectorsForPage([scopeSelector(0, '.a'), scopeSelector(1, '.b'), '.c'], 1)).toEqual(['.b', '.c']);
    expect(pagesOf([scopeSelector(1, '.a'), scopeSelector(0, '.b'), scopeSelector(1, '.c')])).toEqual([0, 1]);
  });
});

describe('merging pages', () => {
  const merged = mergeSnapshots([home, pricing], 'm', 'Acme · 2 pages');

  it('keeps every element, scoped to its page, with valid parents', () => {
    expect(merged.rendered.elements).toHaveLength(home.rendered.elements.length + pricing.rendered.elements.length);
    expect(merged.rendered.elements.every((e, i) => e.index === i && e.parent < i)).toBe(true);
    expect(merged.rendered.elements.filter((e) => e.text === 'Buy').map((e) => parseSelector(e.selector).page)).toEqual([1]);
    expect(merged.pages!.map((p) => p.url)).toEqual(['https://acme.test/', 'https://acme.test/pricing']);
  });

  it('de-duplicates shared CSS', () => {
    expect(merged.authored.declarations).toHaveLength(2);
  });

  it('finds drift that only shows up across pages', () => {
    const audit = runAudit(merged, DEFAULT_ASSUMPTIONS);
    const colours = audit.analysis.foundations.color.palette!.find((c) => c.hex === '#5b3df5')!;
    expect(colours.members.map((m) => m.value)).toEqual(['#5b3df5', '#5c3ef5']);
  });
});

describe('plain-language descriptions', () => {
  it('names elements and pages the way a reader would', () => {
    const view = (el: object) => ({ el: { tag: 'div', attrs: {}, text: '', ...el }, styles: {}, subtreeHasText: false, subtreeHasLabel: false }) as never;
    expect(describeElement(view({ tag: 'button', text: 'Save changes' }))).toBe('the “Save changes” button');
    expect(describeElement(view({ tag: 'a', text: 'Pricing' }))).toBe('the “Pricing” link');
    expect(describeElement(view({ tag: 'input', attrs: { placeholder: 'Email' } }))).toBe('the “Email” field');
    expect(pageName({ url: 'https://acme.test/', title: '' })).toBe('the home page');
    expect(pageName({ url: 'https://acme.test/settings/billing/', title: '' })).toBe('/settings/billing');
  });

  it('names colours in everyday words', () => {
    expect(colourName('#5b3df5')).toBe('purple');
    expect(colourName('#e5484d')).toBe('red');
    expect(colourName('#b4b4b4')).toBe('light grey');
    expect(colourName('#ffffff')).toBe('white');
  });
});

describe('building a multi-page audit in the panel', () => {
  function page(url: string): CapturedPage {
    const { id: _i, favIconUrl: _f, hostAccess: _h, ...rest } = makeSnapshot({ elements: [{ text: 'Hello' }] });
    return { ...rest, url };
  }

  it('collects pages as you click through and audits them together', async () => {
    const bridge = new FakeBridge(page('https://acme.test/'));
    const controller = new AuditController(bridge);
    await controller.init();

    await controller.captureAndAddPage();
    bridge.setPage(page('https://acme.test/pricing'));
    bridge.switchTab({ id: 1, url: 'https://acme.test/pricing', title: 'Pricing' });
    await new Promise((r) => setTimeout(r, 0));
    await controller.captureAndAddPage();
    await controller.captureAndAddPage(); // a recapture replaces, not duplicates
    expect(controller.getState().collection.map((m) => m.url)).toEqual(['https://acme.test/', 'https://acme.test/pricing']);

    await controller.auditCollection();
    const { audit, history } = controller.getState();
    expect(audit?.snapshot.pages).toHaveLength(2);
    expect(history[0]!.pageCount).toBe(2);

    // Highlighting only targets the page that is open.
    await controller.highlight(audit!.snapshot.rendered.elements.map((e) => e.selector));
    const last = bridge.calls.filter((c) => c.method === 'highlight').at(-1);
    expect((last?.args[1] as string[]).every((s) => !s.includes('::'))).toBe(true);
  });
});
