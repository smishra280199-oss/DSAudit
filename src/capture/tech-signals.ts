/**
 * Collects the raw facts technology detection works from: generator tags,
 * script and asset URLs, attribute and class-name census, app-root ids,
 * custom elements and inline script markers. Generic on purpose: nothing
 * here knows about any framework. See inference/technology.ts.
 *
 * Runs in the extension's isolated world, which sees the DOM but not the
 * page's JavaScript globals; those come from runtime-probe.ts.
 */

import type { TechSignals } from '../shared/snapshot';

const MAX_URLS = 80;
const MAX_HOSTS = 30;
const MAX_PREFIXES = 80;
const MAX_ATTR_NAMES = 150;
const MAX_SCANNED = 20_000;
const ROOT_ID_DEPTH = 4;

/** host + path, without query or hash; data: and blob: URLs are dropped. */
function urlKey(raw: string | null, base: string): string | null {
  if (!raw || /^(data|blob|javascript):/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    return `${url.host}${url.pathname}`.slice(0, 160);
  } catch {
    return null;
  }
}

function hostOf(raw: string | null, base: string): string | null {
  if (!raw || /^(data|blob):/i.test(raw)) return null;
  try {
    return new URL(raw, base).host || null;
  } catch {
    return null;
  }
}

/** data-v-7ba5bd90 → data-v-*, _ngcontent-ng-c3 → _ngcontent-*, data-astro-cid-x7k2 → data-astro-cid-*. */
export function foldAttrName(name: string): string {
  const m = /^(.*?[-_])([a-z0-9]{1,12})$/i.exec(name);
  if (m && /\d/.test(m[2]!) && m[1]!.length >= 2) return `${m[1]}*`;
  return name;
}

/** "framer-1x2y3z" → "framer-", "w-nav" → "w-", "et_pb_row" → "et_"; classes without a separator are skipped. */
export function classPrefix(name: string): string | null {
  const m = /^([A-Za-z][A-Za-z0-9]*[-_])/.exec(name);
  return m ? m[1]!.toLowerCase() : null;
}

function attrsOf(el: Element | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!el) return out;
  for (const attr of el.attributes) out[attr.name] = attr.value.slice(0, 120);
  return out;
}

function top<T extends string>(counts: Map<T, number>, n: number): Record<string, number> {
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).slice(0, n));
}

function add<T>(map: Map<T, number>, key: T): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Markers like `self.__next_f` or `window.__NUXT__` near the start of inline scripts. */
const INLINE_GLOBAL = /\b(?:self|window|globalThis)\.([A-Za-z_$][\w$]{2,40})|\b(__[A-Za-z][\w$]{2,40})\b/g;

export function collectTechSignals(doc: Document): TechSignals {
  const base = doc.baseURI || doc.location?.href || 'about:blank';
  const generators = [...doc.querySelectorAll('meta[name="generator" i]')]
    .map((m) => (m.getAttribute('content') ?? '').trim().slice(0, 120))
    .filter(Boolean);

  const scripts = new Set<string>();
  const inlineScripts = new Set<string>();
  for (const script of doc.querySelectorAll('script')) {
    const src = urlKey(script.getAttribute('src'), base);
    if (src) {
      if (scripts.size < MAX_URLS) scripts.add(src);
      continue;
    }
    if (script.id) inlineScripts.add(`id:${script.id}`);
    const type = script.getAttribute('type');
    if (type && type !== 'text/javascript' && type !== 'module') inlineScripts.add(`type:${type.toLowerCase()}`);
    const text = (script.textContent ?? '').slice(0, 2_000);
    for (const m of text.matchAll(INLINE_GLOBAL)) {
      if (inlineScripts.size >= 60) break;
      inlineScripts.add(`global:${m[1] ?? m[2]}`);
    }
  }

  const links = new Set<string>();
  for (const link of doc.querySelectorAll('link[href]')) {
    const key = urlKey(link.getAttribute('href'), base);
    if (key && links.size < MAX_URLS) links.add(key);
  }

  const assetHosts = new Set<string>();
  const attrNames = new Map<string, number>();
  const prefixes = new Map<string, number>();
  const customTags = new Map<string, number>();
  const all = doc.getElementsByTagName('*');
  const scanned = Math.min(all.length, MAX_SCANNED);
  for (let i = 0; i < scanned; i += 1) {
    const el = all[i]!;
    const tag = el.localName;
    if (tag.includes('-')) add(customTags, tag);
    for (const attr of el.attributes) {
      if (attr.name !== 'class' && attr.name !== 'style') add(attrNames, foldAttrName(attr.name));
    }
    for (const c of el.classList) {
      const p = classPrefix(c);
      if (p) add(prefixes, p);
    }
    if (assetHosts.size < MAX_HOSTS && (tag === 'img' || tag === 'source' || tag === 'video')) {
      const host = hostOf(el.getAttribute('src') ?? el.getAttribute('srcset')?.split(/[\s,]/)[0] ?? null, base);
      if (host) assetHosts.add(host);
    }
  }

  // App roots (#root, #__next, #__nuxt, #___gatsby…) sit in the first few levels.
  const rootIds: string[] = [];
  const visit = (el: Element, depth: number) => {
    if (el.id && rootIds.length < 20) rootIds.push(el.id.slice(0, 60));
    if (depth < ROOT_ID_DEPTH) for (const child of el.children) visit(child, depth + 1);
  };
  if (doc.body) visit(doc.body, 0);

  return {
    generators,
    scripts: [...scripts],
    links: [...links],
    assetHosts: [...assetHosts],
    htmlAttrs: attrsOf(doc.documentElement),
    bodyAttrs: attrsOf(doc.body),
    attrNames: top(attrNames, MAX_ATTR_NAMES),
    classPrefixes: top(prefixes, MAX_PREFIXES),
    rootIds,
    customTags: top(customTags, 40),
    inlineScripts: [...inlineScripts],
    scanned,
    truncated: all.length > MAX_SCANNED,
  };
}
