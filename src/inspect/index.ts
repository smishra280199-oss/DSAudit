/**
 * Inspect: explains where each design-relevant value on one element comes
 * from. It resolves the winning declaration with an approximate cascade
 * (!important, inline style, specificity, then source order).
 *
 * Known simplifications: hover/focus rules are ignored (the pointer is always
 * on the element while picking), cascade layers are not modelled, and
 * specificity is approximate.
 */

import { evaluateContrast, type BackdropLayer } from '../shared/contrast';
import { statesIn, tokensIn, valueKind } from '../shared/css-values';
import { composedParent } from '../capture/dom';
import { shortSelector } from '../capture/selector';
import { parseDeclarations, walkStyleRules, type SheetSource } from '../capture/stylesheets';
import { INSPECTED_PROPERTIES } from './properties';
import { compareSpecificity, matchingSpecificity, type Specificity } from './specificity';
import type { InspectedProperty, InspectResult, WinningDeclaration } from './types';

interface Candidate {
  property: string;
  value: string;
  important: boolean;
  inline: boolean;
  specificity: Specificity;
  order: number;
  selector: string;
  sheet: string;
}

function outranks(a: Candidate, b: Candidate): boolean {
  if (a.important !== b.important) return a.important;
  if (a.inline !== b.inline) return a.inline;
  const bySpecificity = compareSpecificity(a.specificity, b.specificity);
  if (bySpecificity !== 0) return bySpecificity > 0;
  return a.order > b.order;
}

/** Every declaration that applies to the element in its current (unhovered) state. */
function candidatesFor(el: Element, sources: SheetSource[]): Candidate[] {
  const win = el.ownerDocument.defaultView!;
  const candidates: Candidate[] = [];
  let order = 0;
  const root = el.getRootNode();

  for (const source of sources) {
    if (source.scope !== root) continue;
    try {
      walkStyleRules(source.sheet.cssRules, (rule, media) => {
        order += 1;
        if (statesIn(rule.selectorText).length > 0) return;
        if (media && win.matchMedia && !win.matchMedia(media).matches) return;
        const spec = matchingSpecificity(el, rule.selectorText);
        if (!spec) return;
        for (const d of parseDeclarations(rule.style.cssText)) {
          candidates.push({ ...d, inline: false, specificity: spec, order, selector: rule.selectorText, sheet: source.label });
        }
      });
    } catch {
      // Unreadable sheet: its declarations simply can't be attributed.
    }
  }

  const inline = (el as HTMLElement).style;
  if (inline) {
    for (const d of parseDeclarations(inline.cssText)) {
      candidates.push({ ...d, inline: true, specificity: [1, 0, 0], order: ++order, selector: 'style attribute', sheet: 'inline' });
    }
  }
  return candidates;
}

function winnerAmong(candidates: Candidate[], sources: string[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!sources.includes(c.property)) continue;
    if (!best || outranks(c, best)) best = c;
  }
  return best;
}

function toWinner(c: Candidate, inheritedFrom?: string): WinningDeclaration {
  return {
    property: c.property,
    value: c.value,
    kind: valueKind(c.value),
    tokens: tokensIn(c.value),
    selector: c.selector,
    sheet: c.sheet,
    important: c.important,
    ...(inheritedFrom ? { inheritedFrom } : {}),
  };
}

function backdropLayers(el: Element): BackdropLayer[] {
  const win = el.ownerDocument.defaultView!;
  const layers: BackdropLayer[] = [];
  let current: Element | null = el;
  while (current) {
    const cs = win.getComputedStyle(current);
    layers.push({ color: cs.backgroundColor, hasImage: cs.backgroundImage !== 'none' && cs.backgroundImage !== '' });
    current = composedParent(current);
  }
  return layers;
}

export function inspectElement(el: Element, sources: SheetSource[], rootCustomProperties: Record<string, string>): InspectResult {
  const win = el.ownerDocument.defaultView!;
  const computed = win.getComputedStyle(el);
  const own = candidatesFor(el, sources);
  const ancestorCandidates = new Map<Element, Candidate[]>();

  const properties: InspectedProperty[] = INSPECTED_PROPERTIES.map((def) => {
    let winner: WinningDeclaration | null = null;
    const direct = winnerAmong(own, def.sources);
    if (direct) {
      winner = toWinner(direct);
    } else if (def.inherited) {
      // Walk up until an ancestor declares the property.
      for (let a = el.parentElement; a && !winner; a = a.parentElement) {
        if (!ancestorCandidates.has(a)) ancestorCandidates.set(a, candidatesFor(a, sources));
        const found = winnerAmong(ancestorCandidates.get(a)!, def.sources);
        if (found) winner = toWinner(found, shortSelector(a));
      }
    }
    return {
      property: def.property,
      label: def.label,
      category: def.category,
      computed: computed.getPropertyValue(def.property).trim(),
      winner,
    };
  });

  const box = el.getBoundingClientRect();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    selector: shortSelector(el),
    tag: el.tagName.toLowerCase(),
    text,
    classes: [...el.classList],
    rect: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
    properties,
    contrast: text
      ? evaluateContrast(computed.color, backdropLayers(el), parseFloat(computed.fontSize), parseInt(computed.fontWeight, 10))
      : null,
    rootCustomProperties,
  };
}
