// @vitest-environment jsdom
/**
 * Technology detection against fixtures modelled on what each platform and
 * framework really emits (fixtures/tech), plus hand-made signals for the
 * edge cases: hybrids, weak evidence and nothing at all. jsdom doesn't run
 * page scripts, so runtime markers are planted the way frameworks set them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeSnapshots } from '../src/audit/merge';
import { probeRuntime } from '../src/capture/runtime-probe';
import { classPrefix, collectTechSignals, foldAttrName } from '../src/capture/tech-signals';
import { detectTechnology, shortenUrls, technologySummary, type TechnologyAnalysis } from '../src/inference/technology';
import type { TechSignals } from '../src/shared/snapshot';
import { makeSnapshot, rootToken } from './helpers';

function load(name: string): void {
  const html = readFileSync(resolve(__dirname, '../fixtures/tech', name), 'utf8');
  document.open();
  document.write(html);
  document.close();
}

function detect(name: string, runtime?: () => void): TechnologyAnalysis {
  load(name);
  runtime?.();
  const technology = collectTechSignals(document);
  if (runtime) technology.runtime = probeRuntime(window);
  return detectTechnology({ ...makeSnapshot(), technology });
}

const names = (t: TechnologyAnalysis) => t.technologies.map((x) => x.name);

afterEach(() => {
  const w = window as unknown as Record<string, unknown>;
  for (const key of ['__NUXT__', 'jQuery', 'Webflow', 'Shopify']) delete w[key];
});

describe('signal collection', () => {
  it('folds generated attribute suffixes and reads class prefixes', () => {
    expect(foldAttrName('data-v-7ba5bd90')).toBe('data-v-*');
    expect(foldAttrName('_ngcontent-ng-c2846113950')).toBe('_ngcontent-ng-*');
    expect(foldAttrName('data-wf-page')).toBe('data-wf-page');
    expect(foldAttrName('aria-labelledby')).toBe('aria-labelledby');
    expect(classPrefix('framer-1u8l9a')).toBe('framer-');
    expect(classPrefix('et_pb_row')).toBe('et_');
    expect(classPrefix('container')).toBeNull();
  });

  it('records URLs without queries and the page’s generator, roots and inline payloads', () => {
    load('nextjs-pages-router.html');
    const s = collectTechSignals(document);
    expect(s.scripts.some((u) => u.endsWith('/_next/static/chunks/pages/_app-3c4d5e.js'))).toBe(true);
    expect(s.scripts.every((u) => !u.includes('?'))).toBe(true);
    expect(s.rootIds).toContain('__next');
    expect(s.inlineScripts).toContain('id:__NEXT_DATA__');
  });
});

describe('platforms and frameworks', () => {
  it('Framer: platform, confirmed, with React as part of its runtime', () => {
    const t = detect('framer.html');
    expect(t.primary).toMatchObject({ name: 'Framer', status: 'confirmed', category: 'website-builder' });
    expect(t.primary!.version).toBeUndefined();
    expect(t.websiteType).toBe('No-code / visual development');
    expect(t.confidence).toBe('high');
    expect(t.primary!.evidence[0]).toMatch(/Generator tag/);
    expect(t.technologies.find((x) => x.id === 'react')?.impliedBy).toBe('Framer');
  });

  it('Webflow: platform from its <html> ids, with jQuery listed separately', () => {
    const t = detect('webflow.html');
    expect(t.primary).toMatchObject({ name: 'Webflow', status: 'confirmed' });
    expect(t.primaryLabel).toBe('Platform');
    expect(t.primary!.evidence.join(' ')).toMatch(/data-wf-site/);
    expect(names(t)).toContain('jQuery');
  });

  it('Webflow with an embedded React app: Webflow stays primary, React is listed on its own', () => {
    const t = detect('webflow.html', () => {
      (document.getElementById('react-pricing-root') as unknown as Record<string, unknown>)['__reactContainer$x1y2'] = {};
    });
    expect(t.primary?.name).toBe('Webflow');
    const react = t.technologies.find((x) => x.id === 'react');
    expect(react).toMatchObject({ status: 'confirmed' });
    expect(react?.impliedBy).toBeUndefined();
  });

  it('WordPress with Elementor: the CMS is primary, the builder and version are named', () => {
    const t = detect('wordpress-elementor.html');
    expect(t.primary).toMatchObject({ name: 'WordPress', version: '6.5.2', status: 'confirmed' });
    expect(t.websiteType).toBe('Content management system with a visual page builder');
    expect(t.technologies.find((x) => x.id === 'elementor')).toMatchObject({ status: 'confirmed', version: '3.21.4' });
  });

  it('Next.js App Router: framework from the __next_f payload, React implied', () => {
    const t = detect('nextjs-app-router.html');
    expect(t.primary).toMatchObject({ name: 'Next.js', status: 'confirmed' });
    expect(t.primaryLabel).toBe('Framework');
    expect(t.websiteType).toBe('Custom-developed frontend');
    expect(t.technologies.find((x) => x.id === 'react')).toMatchObject({ impliedBy: 'Next.js' });
  });

  it('Next.js Pages Router: from __NEXT_DATA__ and #__next', () => {
    const t = detect('nextjs-pages-router.html');
    expect(t.primary).toMatchObject({ name: 'Next.js', status: 'confirmed' });
    expect(t.primary!.evidence.join(' ')).toMatch(/__NEXT_DATA__/);
  });

  it('Nuxt: framework, with Vue implied (and seen in scoped-style attributes)', () => {
    const t = detect('nuxt.html');
    expect(t.primary?.name).toBe('Nuxt');
    expect(t.technologies.find((x) => x.id === 'vue')).toMatchObject({ status: 'confirmed', impliedBy: 'Nuxt' });
  });

  it('Angular, SvelteKit, Gatsby and Astro', () => {
    expect(detect('angular.html').primary).toMatchObject({ name: 'Angular', status: 'confirmed' });
    const svelte = detect('sveltekit.html');
    expect(svelte.primary).toMatchObject({ name: 'SvelteKit', status: 'confirmed' });
    expect(names(svelte)).toContain('Svelte');
    expect(detect('gatsby.html').primary).toMatchObject({ name: 'Gatsby', version: '5.13.3' });
    const astro = detect('astro.html');
    expect(astro.primary).toMatchObject({ name: 'Astro', status: 'confirmed', version: '4.8.2' });
  });

  it('Wix, Squarespace and Shopify', () => {
    const wix = detect('wix.html');
    expect(wix.primary).toMatchObject({ name: 'Wix', status: 'confirmed' });
    expect(wix.technologies.find((x) => x.id === 'react')?.impliedBy).toBe('Wix');
    expect(detect('squarespace.html').primary).toMatchObject({ name: 'Squarespace', status: 'confirmed' });
    const shop = detect('shopify.html');
    expect(shop.primary).toMatchObject({ name: 'Shopify', status: 'confirmed' });
    expect(shop.websiteType).toBe('Hosted e-commerce platform');
  });

  it('a client-rendered Vue app is confirmed from its mount attribute', () => {
    const t = detect('vue-spa.html');
    expect(t.primary).toMatchObject({ name: 'Vue', status: 'confirmed' });
  });
});

describe('runtime markers', () => {
  it('a React SPA is only a #root div in the markup: possible, never confirmed, without its runtime', () => {
    const t = detect('react-spa.html');
    expect(t.primary).toBeNull();
    expect(t.possible.map((p) => p.name)).toContain('React');
    expect(t.confidence).toBe('low');
    expect(t.reason).toMatch(/couldn’t be inspected/);
  });

  it('the same app is confirmed once React’s fiber data is visible on its elements', () => {
    const t = detect('react-spa.html', () => {
      const root = document.getElementById('root') as unknown as Record<string, unknown>;
      root['__reactContainer$abc123'] = {};
      (document.querySelector('main') as unknown as Record<string, unknown>)['__reactFiber$abc123'] = {};
    });
    expect(t.primary).toMatchObject({ name: 'React', status: 'confirmed' });
    expect(t.primary!.evidence[0]).toMatch(/fiber/);
    expect(t.runtimeInspected).toBe(true);
  });

  it('reads globals and versions the way frameworks expose them', () => {
    const w = window as unknown as Record<string, unknown>;
    w.jQuery = { fn: { jquery: '3.7.1' } };
    w.__NUXT__ = {};
    const markers = probeRuntime(window);
    expect(markers).toContain('global:jQuery');
    expect(markers).toContain('version:jquery:3.7.1');
    expect(markers).toContain('global:__NUXT__');
  });

  it('ignores element ids that browsers expose as window properties', () => {
    load('gatsby.html');
    // Browsers make the #___gatsby div available as window.___gatsby; jsdom doesn't, so plant it.
    const w = window as unknown as Record<string, unknown>;
    w.___gatsby = document.getElementById('___gatsby');
    w.__NEXT_DATA__ = document.getElementsByTagName('div');
    const markers = probeRuntime(window);
    delete w.___gatsby;
    delete w.__NEXT_DATA__;
    expect(markers).not.toContain('global:___gatsby');
    expect(markers).not.toContain('global:__NEXT_DATA__');
  });

  it('a hostile getter on window doesn’t break the probe', () => {
    Object.defineProperty(window, 'Webflow', { configurable: true, get: () => { throw new Error('nope'); } });
    expect(() => probeRuntime(window)).not.toThrow();
  });
});

describe('weak and missing evidence', () => {
  it('a hand-coded page is unknown with low confidence, not “hand-coded”', () => {
    const t = detect('handcoded.html', () => {});
    expect(t.primary).toBeNull();
    expect(t.confidence).toBe('low');
    expect(t.websiteType).toBe('Unknown / custom implementation suspected');
    expect(t.reason).toMatch(/No reliable platform or framework indicators/);
    expect(t.technologies).toEqual([]);
  });

  it('jQuery and Bootstrap alone are tools, not a platform', () => {
    const t = detect('jquery-site.html');
    expect(t.primary).toBeNull();
    expect(names(t)).toEqual(expect.arrayContaining(['jQuery', 'Bootstrap']));
    expect(t.reason).toMatch(/general-purpose tools/);
  });

  it('a single weak clue is listed as possible and never as detected', () => {
    const signals = collectTechSignalsFrom('<div class="w-full w-1/2 w-4 w-8 w-12">x</div>');
    const t = detectTechnology({ ...makeSnapshot(), technology: signals });
    expect(t.technologies.find((x) => x.id === 'webflow')).toBeUndefined();
    expect(t.possible.find((x) => x.id === 'webflow')?.status).toBe('possible');
  });

  it('one strong clue is probable with medium confidence', () => {
    const technology: TechSignals = { ...collectTechSignalsFrom('<p>x</p>'), scripts: ['example.test/_nuxt/entry.js'] };
    const t = detectTechnology({ ...makeSnapshot(), technology });
    expect(t.primary).toMatchObject({ name: 'Nuxt', status: 'probable' });
    expect(t.confidence).toBe('medium');
    expect(t.reason).toMatch(/One strong indicator/);
  });

  it('Tailwind is detected from its custom properties, as an additional tool', () => {
    const technology = collectTechSignalsFrom('<p>x</p>');
    const t = detectTechnology({ ...makeSnapshot({ customProperties: [rootToken('--tw-ring-color', 'blue')] }), technology });
    expect(t.technologies.find((x) => x.id === 'tailwind')?.status).toBe('probable');
    expect(t.primary).toBeNull();
  });

  it('snapshots from before detection say so instead of guessing', () => {
    const t = detectTechnology(makeSnapshot());
    expect(t.available).toBe(false);
    expect(t.reason).toMatch(/predates/);
  });
});

describe('multi-page and output', () => {
  it('merging pages combines their signals', () => {
    load('handcoded.html');
    const a = { ...makeSnapshot(), id: 'a', technology: collectTechSignals(document) };
    load('nextjs-pages-router.html');
    const b = { ...makeSnapshot(), id: 'b', technology: collectTechSignals(document) };
    const merged = mergeSnapshots([a, b], 'm', 'Two pages');
    expect(detectTechnology(merged).primary?.name).toBe('Next.js');
  });

  it('shortens long URLs in evidence', () => {
    expect(shortenUrls('Webflow’s runtime script (cdn.prod.website-files.com/65a1f0c2e4b0d1a2b3c4d5e0/js/webflow.8a2c1f.js).')).toBe(
      'Webflow’s runtime script (cdn.prod.website-files.com/…/webflow.8a2c1f.js).',
    );
    expect(shortenUrls('Short (a.com/x.js).')).toBe('Short (a.com/x.js).');
  });

  it('summarises in the expected shape', () => {
    const text = technologySummary(detect('webflow.html'));
    expect(text).toMatch(/^Website Technology Analysis\nDetected Platform: Webflow\nDetection Confidence: High\nWebsite Type: No-code \/ visual development\nEvidence:\n- /);
    expect(technologySummary(detect('handcoded.html'))).toMatch(/Platform: Unknown \/ custom implementation suspected\nDetection Confidence: Low/);
  });
});

function collectTechSignalsFrom(body: string): TechSignals {
  document.open();
  document.write(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`);
  document.close();
  return collectTechSignals(document);
}
