import { describe, expect, it } from 'vitest';
import { FakeBridge } from '../src/adapters/bridge/fake';
import { dominantBackdrop } from '../src/adapters/bridge/evidence';
import { AuditController } from '../src/adapters/extension/panel/audit-controller';
import { runAudit } from '../src/audit';
import { mergeSnapshots } from '../src/audit/merge';
import type { CapturedPage } from '../src/capture';
import { templateOf } from '../src/capture/discover';
import { planEvidence } from '../src/insights/evidence-plan';
import { healthReport, layerOf } from '../src/insights/health';
import { summarise } from '../src/insights';
import { DEFAULT_ASSUMPTIONS } from '../src/savings';
import { makeSnapshot, times } from './helpers';

const purple = 'rgb(91, 61, 245)';
const messy = makeSnapshot({
  elements: [
    ...times(3, { tag: 'button', text: 'Save', rect: { x: 0, y: 400, w: 90, h: 36 }, styles: { backgroundColor: purple, color: 'rgb(255, 255, 255)', fontSize: '14px', paddingLeft: '16px' } }, 'b'),
    { tag: 'button', text: 'Go', selector: '.go', rect: { x: 0, y: 100, w: 90, h: 40 }, styles: { backgroundColor: purple, color: 'rgb(255, 255, 255)', fontSize: '14px', paddingLeft: '16px' } },
    { text: 'Faint', selector: '.faint', rect: { x: 0, y: 50, w: 60, h: 18 }, styles: { color: 'rgb(170, 170, 170)' } },
    { tag: 'img', selector: '.photo', rect: { x: 0, y: 900, w: 100, h: 100 } },
  ],
});

describe('page discovery', () => {
  it('treats pages with ids in the path as one template', () => {
    expect(templateOf('/product/12345')).toBe('/product/:id');
    expect(templateOf('/product/blue-tractor-2024-x')).toBe('/product/:id');
    expect(templateOf('/pricing/')).toBe('/pricing');
  });
});

describe('evidence plan', () => {
  it('photographs component styles and accessibility failures, in page order', () => {
    const plan = planEvidence(runAudit(messy, DEFAULT_ASSUMPTIONS));
    expect(plan).toContain('.go');
    expect(plan).toContain('.faint');
    expect(plan).toContain('.photo');
    expect(plan.indexOf('.faint')).toBeLessThan(plan.indexOf('.go'));
    expect(plan.indexOf('.go')).toBeLessThan(plan.indexOf('.photo'));
  });
});

describe('reading the real background from pixels', () => {
  it('finds the most common colour that is not the text colour', () => {
    const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
    const data = new Uint8ClampedArray([...px(255, 255, 255, 30), ...px(20, 40, 60, 200), ...px(250, 250, 250, 10)]);
    expect(dominantBackdrop(data, 'rgb(255, 255, 255)')).toBe('#14283c');
  });
});

describe('health report', () => {
  const shot = { src: 'data:image/jpeg;base64,AAAA', w: 90, h: 40 };
  const audit = runAudit({ ...messy, evidence: { '.go': shot, '.faint': { ...shot, backdrop: '#ffffff' } } }, DEFAULT_ASSUMPTIONS);
  const report = healthReport(audit, { clientName: 'Acme' });

  it('scores three layers: foundations, components, accessibility', () => {
    expect(report.layers.map((l) => l.key)).toEqual(['foundations', 'components', 'accessibility']);
    for (const l of report.layers) expect(l.score).toBeGreaterThanOrEqual(0);
  });

  it('never calls accessibility "consistent", and failing checks pull its score down', () => {
    const a11y = report.layers.find((l) => l.key === 'accessibility')!;
    expect(a11y.level).not.toMatch(/consistent/i);
    expect(a11y.score).toBeLessThan(100);
  });

  it('files every finding under one layer', () => {
    for (const p of summarise(audit, { clientName: 'Acme' }).painPoints) expect(['foundations', 'components', 'accessibility']).toContain(layerOf(p));
  });

  it('attaches the real screenshots to components and accessibility examples', () => {
    const buttons = report.components.find((g) => g.kind === 'button');
    expect(buttons?.items.some((i) => i.shot?.src === shot.src)).toBe(true);
    expect(report.accessibility.examples.find((e) => e.title === 'Text too faint to read')?.shots[0]?.flag).toMatch(/:1, needs 4.5$/);
  });

  it('leads with at most three findings', () => {
    expect(report.top.length).toBeLessThanOrEqual(3);
    expect(report.top.length).toBeGreaterThan(0);
  });
});

describe('multi-page audits', () => {
  it('keeps each page’s screenshots, scoped to that page', () => {
    const shot = { src: 'data:x', w: 1, h: 1 };
    const merged = mergeSnapshots([{ ...messy, id: 'a', evidence: { '.go': shot } }, { ...messy, id: 'b', evidence: { '.faint': shot } }], 'm', 'Acme');
    expect(Object.keys(merged.evidence ?? {})).toEqual(['0::.go', '1::.faint']);
  });
});

describe('capture site', () => {
  function page(url: string): CapturedPage {
    const { id: _id, favIconUrl: _f, hostAccess: _h, ...rest } = messy;
    return { ...rest, url };
  }

  it('captures each page with screenshots, audits them together and returns to the start', async () => {
    const bridge = new FakeBridge(page('https://acme.test/'));
    bridge.evidence = { '.go': { src: 'data:x', w: 1, h: 1 } };
    const controller = new AuditController(bridge);
    await controller.init();
    await controller.captureSite(['https://acme.test/pricing', 'https://acme.test/about']);
    const state = controller.getState();
    expect(state.audit?.snapshot.pages?.map((p) => p.url)).toEqual(['https://acme.test/', 'https://acme.test/pricing', 'https://acme.test/about']);
    expect(Object.keys(state.audit?.snapshot.evidence ?? {})).toContain('1::.go');
    expect(bridge.calls.filter((c) => c.method === 'collectEvidence')).toHaveLength(3);
    expect(bridge.calls.filter((c) => c.method === 'navigate').at(-1)?.args[1]).toBe('https://acme.test/');
    expect(state.status).toBe('idle');
    expect(state.progress).toBeNull();
  });
});
