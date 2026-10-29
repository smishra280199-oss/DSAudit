/**
 * Pure helpers for classifying authored CSS: which properties matter for a
 * design system, how a value was written, and which interaction states a
 * selector targets. Shared by capture.js and the inference engine.
 */

import type { DeclarationCategory, InteractionState, ValueKind } from './snapshot';
import { INTERACTION_STATES } from './snapshot';

const CATEGORY_BY_PROPERTY: Record<string, DeclarationCategory> = {
  color: 'color',
  background: 'color',
  'background-color': 'color',
  'border-color': 'color',
  'border-top-color': 'color',
  'border-right-color': 'color',
  'border-bottom-color': 'color',
  'border-left-color': 'color',
  'outline-color': 'color',
  fill: 'color',
  stroke: 'color',
  'caret-color': 'color',
  'text-decoration-color': 'color',

  padding: 'spacing',
  'padding-top': 'spacing',
  'padding-right': 'spacing',
  'padding-bottom': 'spacing',
  'padding-left': 'spacing',
  'padding-inline': 'spacing',
  'padding-block': 'spacing',
  margin: 'spacing',
  'margin-top': 'spacing',
  'margin-right': 'spacing',
  'margin-bottom': 'spacing',
  'margin-left': 'spacing',
  'margin-inline': 'spacing',
  'margin-block': 'spacing',
  gap: 'spacing',
  'row-gap': 'spacing',
  'column-gap': 'spacing',

  'font-size': 'font-size',
  'font-weight': 'font-weight',
  'line-height': 'line-height',
  'font-family': 'font-family',
  'letter-spacing': 'letter-spacing',

  'border-radius': 'radius',
  'border-top-left-radius': 'radius',
  'border-top-right-radius': 'radius',
  'border-bottom-left-radius': 'radius',
  'border-bottom-right-radius': 'radius',

  'box-shadow': 'shadow',
  'text-shadow': 'shadow',

  'border-width': 'border-width',
  'border-top-width': 'border-width',
  'border-right-width': 'border-width',
  'border-bottom-width': 'border-width',
  'border-left-width': 'border-width',
  'outline-width': 'border-width',

  'z-index': 'z-index',

  transition: 'motion',
  'transition-duration': 'motion',
  'transition-timing-function': 'motion',
  animation: 'motion',
  'animation-duration': 'motion',
  'animation-timing-function': 'motion',
};

export function categoryOf(property: string): DeclarationCategory | null {
  return CATEGORY_BY_PROPERTY[property] ?? null;
}

export const CATEGORY_LABELS: Record<DeclarationCategory, string> = {
  color: 'Color',
  spacing: 'Spacing',
  'font-size': 'Font size',
  'font-weight': 'Font weight',
  'line-height': 'Line height',
  'font-family': 'Font family',
  'letter-spacing': 'Letter spacing',
  radius: 'Radius',
  shadow: 'Shadow',
  'border-width': 'Border width',
  'z-index': 'Z-index',
  motion: 'Motion',
};

const KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'auto',
  'none',
  'normal',
  'transparent',
  'currentcolor',
  '0',
  '0px',
  'bold',
  'bolder',
  'lighter',
  'medium',
  'thin',
  'thick',
  'small',
  'large',
  'smaller',
  'larger',
]);

const VAR_PATTERN = /var\(\s*(--[\w-]+)/g;

export function tokensIn(value: string): string[] {
  return [...value.matchAll(VAR_PATTERN)].map((m) => m[1]!);
}

export function valueKind(value: string): ValueKind {
  if (tokensIn(value).length > 0) return 'token';
  return KEYWORDS.has(value.trim().toLowerCase()) ? 'keyword' : 'literal';
}

const STATE_PATTERNS: [InteractionState, RegExp][] = [
  ['hover', /:hover\b/],
  ['focus-visible', /:focus-visible\b/],
  ['focus', /:focus(?![-\w])|:focus-within\b/],
  ['active', /:active\b/],
  ['disabled', /:disabled\b|\[disabled\]|\[aria-disabled(=["']?true["']?)?\]/],
  ['checked', /:checked\b|\[aria-checked(=["']?true["']?)?\]/],
  ['invalid', /:invalid\b|:user-invalid\b|\[aria-invalid(=["']?true["']?)?\]/],
  ['selected', /\[aria-selected(=["']?true["']?)?\]|\[aria-current[^\]]*\]/],
  ['expanded', /\[aria-expanded(=["']?true["']?)?\]|\[open\]/],
];

export function statesIn(selector: string): InteractionState[] {
  const found = STATE_PATTERNS.filter(([, re]) => re.test(selector)).map(([state]) => state);
  return INTERACTION_STATES.filter((s) => found.includes(s));
}

/**
 * Removes state pseudo-classes so the selector can be matched against the
 * page as it is now (no element is hovered or focused during a capture).
 */
export function stripStates(selector: string): string {
  const stripped = selector
    .replace(/:(hover|focus-visible|focus-within|focus|active|checked|disabled|invalid|user-invalid|visited|target)\b/g, '')
    .replace(/::?(before|after|placeholder|selection|marker|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)\b/g, '')
    .replace(/:not\(\s*\)/g, '')
    .trim();
  return stripped === '' || /[>+~,]\s*$/.test(stripped) ? '*' : stripped;
}

/** Parses a length to CSS pixels. Returns null for anything that is not a plain length. */
export function toPx(value: string, rootFontSize = 16): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (m[2] === 'rem' || m[2] === 'em') return n * rootFontSize;
  return n;
}

/** Parses durations such as "150ms" or "0.2s, 0.3s" and returns the first in ms. */
export function toMs(value: string): number | null {
  const m = /(-?\d*\.?\d+)(ms|s)\b/.exec(value);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return m[2] === 's' ? n * 1000 : n;
}

/** Rounds to at most two decimals and strips trailing zeros: 13.3333 → "13.33". */
export function roundPx(n: number): string {
  return `${Math.round(n * 100) / 100}`;
}
