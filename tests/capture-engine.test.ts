// @vitest-environment jsdom
/**
 * The capture side of the audit engine, run for real under jsdom: what the
 * DOM walk records, selector uniqueness on large repetitive pages, and the
 * settle step that waits for client-rendered content.
 */
import { describe, expect, it } from 'vitest';
import { createCaptureApi } from '../src/capture';
import { walkRendered } from '../src/capture/rendered';
import { resolveSelector, SelectorBuilder, shortSelector } from '../src/capture/selector';
import { settle } from '../src/capture/settle';

function page(body: string, head = ''): void {
  document.open();
  document.write(`<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`);
  document.close();
}

const api = () => createCaptureApi(document, { onInspectPicked: () => {}, onInspectExit: () => {} });

describe('what the DOM walk records', () => {
  it('descends into visibility:hidden parents and keeps children that are visible', () => {
    page('<div id="menu" style="visibility:hidden"><a id="shown" href="#" style="visibility:visible">Shown</a><a id="gone" href="#">Gone</a></div>');
    const { elements } = walkRendered(document).layer;
    expect(elements.map((e) => e.attrs.id).filter(Boolean)).toEqual(['shown']);
    // It attaches to the nearest recorded ancestor (the body) and still resolves.
    const shown = elements.find((e) => e.attrs.id === 'shown')!;
    expect(shown.parent).toBe(0);
    expect(resolveSelector(document, shown.selector)).toHaveLength(1);
  });

  it('skips display:none and hidden subtrees entirely', () => {
    page('<div style="display:none"><button>A</button></div><div hidden><button>B</button></div><button>C</button>');
    expect(walkRendered(document).layer.elements.filter((e) => e.tag === 'button').map((e) => e.text)).toEqual(['C']);
  });

  it('records ids and inline click handlers', () => {
    page('<div id="card" onclick="go()">Open</div>');
    const card = walkRendered(document).layer.elements.find((e) => e.tag === 'div')!;
    expect(card.attrs).toMatchObject({ id: 'card', onclick: '' });
  });
});

describe('selectors on large, repetitive pages', () => {
  // Shelves of identical cards: telling two Buy buttons apart takes six levels, past the old five-segment cap.
  const card = '<article class="card"><div class="body"><div class="actions"><a class="btn" href="#">Buy</a><button class="btn">Save</button></div></div></article>';
  const shelves = Array.from({ length: 6 }, () => `<section class="shelf"><div class="grid">${card.repeat(10)}</div></section>`).join('');

  it('every selector matches exactly its own element', () => {
    page(`<main>${shelves}</main>`);
    const { layer, liveElements } = walkRendered(document);
    expect(layer.elements.length).toBeGreaterThan(300);
    for (const [i, el] of layer.elements.entries()) {
      const found = resolveSelector(document, el.selector);
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(liveElements[i]);
    }
  });

  it('prefers short selectors and unique ids', () => {
    page('<nav id="top"><ul><li><a href="/">Home</a></li><li><a href="/x">X</a></li></ul></nav><p class="lead">Hi</p>');
    expect(shortSelector(document.querySelector('.lead')!)).toBe('p.lead');
    expect(shortSelector(document.querySelector('#top')!)).toBe('#top');
    expect(shortSelector(document.querySelectorAll('a')[1]!)).toBe('li:nth-of-type(2) > a');
  });

  it('a duplicated id is not used as an anchor', () => {
    page('<div id="dup"><span>a</span></div><div id="dup"><span>b</span></div>');
    const b = new SelectorBuilder();
    const spans = [...document.querySelectorAll('span')].map((s) => b.build(s));
    expect(new Set(spans).size).toBe(2);
    for (const s of spans) expect(resolveSelector(document, s)).toHaveLength(1);
  });

  it('pierces open shadow roots', () => {
    page('<x-card></x-card><x-card></x-card>');
    for (const host of document.querySelectorAll('x-card')) host.attachShadow({ mode: 'open' }).innerHTML = '<button class="b">Go</button>';
    const { layer } = walkRendered(document);
    const buttons = layer.elements.filter((e) => e.tag === 'button');
    expect(buttons).toHaveLength(2);
    expect(new Set(buttons.map((b) => b.selector)).size).toBe(2);
    for (const b of buttons) expect(resolveSelector(document, b.selector)).toHaveLength(1);
  });
});

describe('waiting for the page to settle', () => {
  const fast = { quietMs: 30, maxQuietWaitMs: 400, maxLoadWaitMs: 200 };

  it('returns quickly on a static page', async () => {
    page('<p>Static</p>');
    const result = await settle(document, fast);
    expect(result).toMatchObject({ settled: true, mutations: 0, scrolled: false });
  });

  it('waits out late rendering and counts it', async () => {
    page('<div id="app"></div>');
    let n = 0;
    const timer = setInterval(() => {
      if (n++ < 3) document.getElementById('app')!.append(document.createElement('p'));
    }, 10);
    const result = await settle(document, fast);
    clearInterval(timer);
    expect(result.settled).toBe(true);
    expect(result.mutations).toBeGreaterThan(0);
  });

  it('gives up on a page that never stops changing, and says so', async () => {
    page('<div id="ticker"></div>');
    const timer = setInterval(() => (document.getElementById('ticker')!.textContent = String(Math.random())), 5);
    const result = await settle(document, { ...fast, maxQuietWaitMs: 120 });
    clearInterval(timer);
    expect(result.settled).toBe(false);
  });
});

describe('the capture API', () => {
  it('puts technology signals and the settle report on the snapshot', async () => {
    page('<div id="__next"><h1>Hi</h1></div>', '<meta name="generator" content="Next.js">');
    const capture = api();
    const settled = await capture.settle({ quietMs: 20, maxQuietWaitMs: 200 });
    const snapshot = capture.capture([], settled);
    expect(snapshot.technology?.rootIds).toContain('__next');
    expect(snapshot.technology?.generators).toEqual(['Next.js']);
    expect(snapshot.settle?.settled).toBe(true);
  });
});
