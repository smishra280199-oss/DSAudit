/**
 * Locating and traversing every stylesheet the page uses: document sheets,
 * adopted (constructed) sheets, sheets inside open shadow roots, and
 * cross-origin sheets the panel fetched on our behalf.
 */

import type { StylesheetInfo } from '../shared/snapshot';

/** A cross-origin sheet the panel fetched (credentials omitted) and handed back. */
export interface FetchedSheet {
  href: string;
  text: string;
}

export interface SheetSource {
  sheet: CSSStyleSheet;
  label: string;
  origin: StylesheetInfo['origin'];
  /** Where selectors from this sheet apply, for match counting. */
  scope: Document | ShadowRoot;
}

export interface ParsedDeclaration {
  property: string;
  value: string;
  important: boolean;
}

function readable(sheet: CSSStyleSheet): boolean {
  try {
    return sheet.cssRules !== null;
  } catch {
    return false;
  }
}

/** Hrefs of linked sheets whose rules the CSSOM refuses to expose (cross-origin without CORS). */
export function listUnreadableSheets(doc: Document): string[] {
  return [...doc.styleSheets]
    .filter((sheet) => sheet.href && !readable(sheet))
    .map((sheet) => sheet.href!)
    .filter((href, i, all) => all.indexOf(href) === i);
}

function adopted(scope: Document | ShadowRoot): CSSStyleSheet[] {
  return [...((scope as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [])];
}

export function collectSheets(
  doc: Document,
  shadowRoots: ShadowRoot[],
  fetched: FetchedSheet[],
): { sources: SheetSource[]; unreadable: string[] } {
  const sources: SheetSource[] = [];
  const unreadable = new Set<string>();
  const fetchedByHref = new Map(fetched.map((f) => [f.href, f.text]));
  let inlineCount = 0;

  for (const sheet of doc.styleSheets) {
    if (readable(sheet)) {
      const label = sheet.href ?? `inline <style> #${(inlineCount += 1)}`;
      sources.push({ sheet, label, origin: sheet.href ? 'same-origin' : 'inline', scope: doc });
      continue;
    }
    const href = sheet.href ?? 'unknown';
    const text = fetchedByHref.get(href);
    const parsed = text === undefined ? null : parseSheetText(doc, text);
    if (parsed) sources.push({ sheet: parsed, label: href, origin: 'cross-origin-fetched', scope: doc });
    else unreadable.add(href);
  }

  adopted(doc).forEach((sheet, i) =>
    sources.push({ sheet, label: `adopted #${i + 1}`, origin: 'adopted', scope: doc }),
  );

  shadowRoots.forEach((root, i) => {
    const host = root.host.tagName.toLowerCase();
    for (const sheet of [...root.styleSheets, ...adopted(root)]) {
      if (readable(sheet)) sources.push({ sheet, label: `shadow <${host}> #${i + 1}`, origin: 'shadow', scope: root });
    }
  });

  return { sources, unreadable: [...unreadable] };
}

/** Parses fetched CSS into a constructed sheet. @import rules are removed: replaceSync rejects them. */
export function parseSheetText(doc: Document, text: string): CSSStyleSheet | null {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win || typeof win.CSSStyleSheet !== 'function') return null;
  try {
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(text.replace(/@import\s[^;]+;/g, ''));
    return sheet;
  } catch {
    return null;
  }
}

export type RuleVisitor = (rule: CSSStyleRule, media: string | null) => void;

/**
 * Visits every style rule, descending through @media, @supports, @layer,
 * @container and readable @import rules. Cascade layers are flattened.
 */
export function walkStyleRules(rules: CSSRuleList, visit: RuleVisitor, media: string | null = null): void {
  for (const rule of rules) {
    const r = rule as CSSRule & {
      selectorText?: string;
      media?: MediaList;
      cssRules?: CSSRuleList;
      styleSheet?: CSSStyleSheet | null;
    };
    if (r.selectorText !== undefined) {
      visit(rule as CSSStyleRule, media);
      if (r.cssRules && r.cssRules.length > 0) walkStyleRules(r.cssRules, visit, media);
    } else if (r.styleSheet) {
      if (readable(r.styleSheet)) walkStyleRules(r.styleSheet.cssRules, visit, media);
    } else if (r.media && r.cssRules) {
      const condition = r.media.mediaText;
      walkStyleRules(r.cssRules, visit, media ? `${media} and ${condition}` : condition);
    } else if (r.cssRules) {
      walkStyleRules(r.cssRules, visit, media);
    }
  }
}

/**
 * Splits a declaration block's cssText into declarations. We read cssText
 * rather than iterating longhands because Chrome keeps shorthands that use
 * var() (e.g. "padding: var(--space-2)") intact only in cssText.
 */
export function parseDeclarations(cssText: string): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  const flush = () => {
    const colon = current.indexOf(':');
    if (colon > 0) {
      const property = current.slice(0, colon).trim().toLowerCase();
      let value = current.slice(colon + 1).trim();
      const important = /!\s*important$/i.test(value);
      if (important) value = value.replace(/!\s*important$/i, '').trim();
      if (property && value && !property.includes('{')) declarations.push({ property, value, important });
    }
    current = '';
  };
  for (const ch of cssText) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
    } else if (ch === ';' && depth === 0) {
      flush();
      continue;
    } else if (ch === '{' || ch === '}') {
      // Nested rules inside cssText: stop at the first block.
      current = '';
      break;
    }
    current += ch;
  }
  flush();
  return declarations;
}

export function sheetInfo(source: SheetSource): StylesheetInfo {
  let ruleCount = 0;
  try {
    ruleCount = source.sheet.cssRules.length;
  } catch {
    ruleCount = 0;
  }
  return { label: source.label, origin: source.origin, ruleCount };
}
