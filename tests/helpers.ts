/** Builders for hand-made snapshots, so inference tests state exactly what the page contains. */

import {
  SNAPSHOT_SCHEMA_VERSION,
  type AuthoredDeclaration,
  type CustomPropertyDefinition,
  type PageSnapshot,
  type RenderedElement,
} from '../src/shared/snapshot';
import { categoryOf, tokensIn, valueKind } from '../src/shared/css-values';

export type ElementSpec = Partial<Omit<RenderedElement, 'index'>> & { tag?: string };

export function element(spec: ElementSpec, index = 0): RenderedElement {
  return {
    index,
    parent: spec.parent ?? (index === 0 ? -1 : 0),
    tag: spec.tag ?? 'div',
    selector: spec.selector ?? `#e${index}`,
    classes: spec.classes ?? [],
    attrs: spec.attrs ?? {},
    text: spec.text ?? '',
    rect: spec.rect ?? { x: 0, y: 0, w: 100, h: 20 },
    styles: spec.styles ?? {},
  };
}

export function declaration(property: string, value: string, extra: Partial<AuthoredDeclaration> = {}): AuthoredDeclaration {
  return {
    property,
    value,
    category: categoryOf(property)!,
    kind: valueKind(value),
    tokens: tokensIn(value),
    selector: '.x',
    sheet: 'test.css',
    states: [],
    media: null,
    mediaMatches: true,
    matchCount: 1,
    ...extra,
  };
}

export function rootToken(name: string, value: string): CustomPropertyDefinition {
  return { name, value, selector: ':root', sheet: 'test.css', media: null, isRootScope: true };
}

interface SnapshotSpec {
  /** Elements after the body; each defaults to being a child of the body. */
  elements?: ElementSpec[];
  declarations?: AuthoredDeclaration[];
  customProperties?: CustomPropertyDefinition[];
  rootCustomProperties?: Record<string, string>;
  hostAccess?: boolean;
  unreadableSheets?: string[];
}

export function makeSnapshot(spec: SnapshotSpec = {}): PageSnapshot {
  const body = element({ tag: 'body', selector: 'body', parent: -1, styles: { color: 'rgb(23, 23, 23)', fontSize: '16px' } }, 0);
  const elements = [body, ...(spec.elements ?? []).map((e, i) => element(e, i + 1))];
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    id: 'snap-1',
    url: 'https://example.test/page',
    title: 'Example',
    capturedAt: '2026-10-29T10:00:00.000Z',
    viewport: { width: 1280, height: 800, dpr: 2 },
    colorScheme: 'light',
    hostAccess: spec.hostAccess ?? true,
    rendered: { elements, truncated: false, rootCustomProperties: spec.rootCustomProperties ?? {} },
    authored: {
      declarations: spec.declarations ?? [],
      truncated: false,
      customProperties: spec.customProperties ?? [],
      interaction: { interactiveCount: 0, withHover: 0, withFocus: 0, focusTechniques: {}, outlineRemovedWithoutReplacement: [] },
      classNaming: {
        totalClasses: 0,
        counts: { utility: 0, 'css-in-js': 0, 'css-modules': 0, bem: 0, namespaced: 0, other: 0 },
        prefixes: [],
      },
      sheets: [{ label: 'test.css', origin: 'same-origin', ruleCount: 10 }],
      unreadableSheets: spec.unreadableSheets ?? [],
    },
  };
}

/** n copies of an element spec, with distinct selectors. */
export function times(n: number, spec: ElementSpec, prefix = 'x'): ElementSpec[] {
  return Array.from({ length: n }, (_, i) => ({ ...spec, selector: `.${prefix}-${i}` }));
}
