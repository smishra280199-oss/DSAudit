/**
 * The authored layer: a CSS inventory built by walking the CSSOM of every
 * readable stylesheet plus inline style attributes. Where the rendered layer
 * says what the page looks like, this layer says how it was written.
 */

import { summariseClassNames } from '../shared/class-naming';
import { categoryOf, statesIn, stripStates, tokensIn, valueKind } from '../shared/css-values';
import {
  MAX_DECLARATIONS,
  type AuthoredDeclaration,
  type AuthoredLayer,
  type CustomPropertyDefinition,
  type FocusTechnique,
  type InteractionCoverage,
  type RenderedElement,
} from '../shared/snapshot';
import {
  collectSheets,
  parseDeclarations,
  sheetInfo,
  walkStyleRules,
  type FetchedSheet,
  type ParsedDeclaration,
  type SheetSource,
} from './stylesheets';

const ROOT_SCOPE = /^(:root|html|body|:host)(\s*,\s*(:root|html|body|:host))*$/;

const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';

interface StateRule {
  base: string;
  declarations: ParsedDeclaration[];
  selector: string;
  sheet: string;
  isFocus: boolean;
  isHover: boolean;
}

export interface AuthoredInput {
  doc: Document;
  shadowRoots: ShadowRoot[];
  liveElements: Element[];
  elements: RenderedElement[];
  fetchedSheets: FetchedSheet[];
}

export function walkAuthored({ doc, shadowRoots, liveElements, elements, fetchedSheets }: AuthoredInput): AuthoredLayer {
  const win = doc.defaultView!;
  const { sources, unreadable } = collectSheets(doc, shadowRoots, fetchedSheets);
  const declarations: AuthoredDeclaration[] = [];
  const customProperties: CustomPropertyDefinition[] = [];
  const stateRules: StateRule[] = [];
  let truncated = false;

  const matchCache = new Map<string, number>();
  const countMatches = (selector: string, scope: Document | ShadowRoot): number => {
    const base = stripStates(selector);
    const key = `${scope === doc ? '' : 'shadow:'}${base}`;
    let count = matchCache.get(key);
    if (count === undefined) {
      try {
        count = scope.querySelectorAll(base).length;
      } catch {
        count = 0;
      }
      matchCache.set(key, count);
    }
    return count;
  };

  const mediaCache = new Map<string, boolean>();
  const mediaMatches = (media: string | null): boolean => {
    if (!media) return true;
    let matches = mediaCache.get(media);
    if (matches === undefined) {
      matches = win.matchMedia ? win.matchMedia(media).matches : true;
      mediaCache.set(media, matches);
    }
    return matches;
  };

  const record = (
    parsed: ParsedDeclaration[],
    selector: string,
    sheet: string,
    media: string | null,
    matchCount: number,
  ) => {
    const states = statesIn(selector);
    for (const { property, value } of parsed) {
      if (property.startsWith('--')) {
        customProperties.push({ name: property, value, selector, sheet, media, isRootScope: ROOT_SCOPE.test(selector.trim()) });
        continue;
      }
      const category = categoryOf(property);
      if (!category) continue;
      if (declarations.length >= MAX_DECLARATIONS) {
        truncated = true;
        return;
      }
      declarations.push({
        property,
        value,
        category,
        kind: valueKind(value),
        tokens: tokensIn(value),
        selector,
        sheet,
        states,
        media,
        mediaMatches: mediaMatches(media),
        matchCount,
      });
    }
  };

  for (const source of sources) {
    visitSource(source, (rule, media) => {
      const parsed = parseDeclarations(rule.style.cssText);
      if (parsed.length === 0) return;
      const selector = rule.selectorText;
      record(parsed, selector, source.label, media, countMatches(selector, source.scope));
      const states = statesIn(selector);
      if (states.length > 0) {
        stateRules.push({
          base: stripStates(selector),
          declarations: parsed,
          selector,
          sheet: source.label,
          isHover: states.includes('hover'),
          isFocus: states.includes('focus') || states.includes('focus-visible'),
        });
      }
    });
  }

  // Inline style attributes, attributed to the element's short selector.
  elements.forEach((element, i) => {
    if (element.attrs.style === undefined) return;
    const live = liveElements[i] as HTMLElement | undefined;
    if (live?.style) record(parseDeclarations(live.style.cssText), element.selector, 'style attribute', null, 1);
  });

  return {
    declarations,
    truncated,
    customProperties,
    interaction: interactionCoverage(liveElements, stateRules),
    classNaming: summariseClassNames(elements.flatMap((e) => e.classes)),
    sheets: sources.map(sheetInfo),
    unreadableSheets: unreadable,
  };
}

function visitSource(source: SheetSource, visit: (rule: CSSStyleRule, media: string | null) => void): void {
  try {
    walkStyleRules(source.sheet.cssRules, visit);
  } catch {
    // A sheet can become unreadable mid-walk (e.g. replaced by the page); skip it.
  }
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function focusTechnique(declarations: ParsedDeclaration[]): FocusTechnique {
  const has = (re: RegExp, reject?: RegExp) =>
    declarations.some((d) => re.test(d.property) && !(reject && reject.test(d.value)));
  if (has(/^outline(-style|-width|-color)?$/, /^(none|0|0px)$/)) return 'outline';
  if (has(/^box-shadow$/, /^none$/)) return 'box-shadow';
  if (has(/^border/)) return 'border';
  if (has(/^background/)) return 'background';
  return 'none';
}

function removesOutline(declarations: ParsedDeclaration[]): boolean {
  return declarations.some((d) => /^outline(-style|-width)?$/.test(d.property) && /^(none|0|0px)$/.test(d.value));
}

function interactionCoverage(liveElements: Element[], stateRules: StateRule[]): InteractionCoverage {
  const interactive = liveElements.filter((el) => safeMatches(el, INTERACTIVE_SELECTOR));
  const hoverBases = stateRules.filter((r) => r.isHover).map((r) => r.base);
  const focusRules = stateRules.filter((r) => r.isFocus);
  const focusBases = focusRules.map((r) => r.base);

  const focusTechniques: InteractionCoverage['focusTechniques'] = {};
  const outlineRemovedWithoutReplacement: InteractionCoverage['outlineRemovedWithoutReplacement'] = [];

  const drawing = focusRules.filter((r) => focusTechnique(r.declarations) !== 'none');
  for (const rule of focusRules) {
    const technique = focusTechnique(rule.declarations);
    focusTechniques[technique] = (focusTechniques[technique] ?? 0) + 1;
    if (!removesOutline(rule.declarations) || technique !== 'none') continue;
    // `:focus:not(:focus-visible)` hides the ring for mouse users only: the recommended pattern, not a removal.
    if (/:not\(\s*:focus-visible\s*\)/.test(rule.selector)) continue;
    // Only rules that reach an element on this page count, and only where nothing else draws focus on it.
    const hit = interactive.filter((el) => rule.base !== '*' && safeMatches(el, rule.base));
    if (hit.length === 0) continue;
    const unreplaced = hit.filter((el) => !drawing.some((other) => other !== rule && other.base !== '*' && safeMatches(el, other.base)));
    if (unreplaced.length > 0) outlineRemovedWithoutReplacement.push({ selector: rule.selector, sheet: rule.sheet });
  }

  const coveredBy = (el: Element, bases: string[]) => bases.some((base) => base !== '*' && safeMatches(el, base));
  return {
    interactiveCount: interactive.length,
    withHover: interactive.filter((el) => coveredBy(el, hoverBases)).length,
    withFocus: interactive.filter((el) => coveredBy(el, focusBases)).length,
    focusTechniques,
    outlineRemovedWithoutReplacement: outlineRemovedWithoutReplacement.slice(0, 50),
  };
}
