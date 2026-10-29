/**
 * Token analysis: which custom properties exist, which scopes redefine them
 * (theming), how much of the authored CSS goes through them, and which
 * literal values could use an existing token instead.
 *
 * Suggestions match on value and then rank by role: a token already used for
 * the same kind of property, or named for it, is a "role-match"; a token
 * that merely shares the value is "value-only" and may be meant for a
 * different job. Colours have finer roles (text, background, border), so a
 * white surface token is not suggested for white text.
 */

import { parseColor, toHex } from '../shared/color';
import { toPx } from '../shared/css-values';
import type { AuthoredDeclaration, DeclarationCategory, PageSnapshot } from '../shared/snapshot';
import { liveDeclarations } from './foundations/shared';
import type { SuggestionConfidence, TokenAnalysis, TokenRole, TokenSuggestion } from './types';

export type { TokenRole };

export function roleOf(property: string, category: DeclarationCategory): TokenRole {
  if (category !== 'color') return category;
  if (/^(background|fill)/.test(property)) return 'color-background';
  if (/^(border|outline|stroke)/.test(property)) return 'color-border';
  return 'color-text';
}

const NAME_HINTS: Record<TokenRole, RegExp> = {
  'color-text': /text|fg|foreground|ink|content|heading|body|link|on-/i,
  'color-background': /bg|background|surface|canvas|fill|layer|base|backdrop/i,
  'color-border': /border|stroke|divider|outline|line|separator/i,
  spacing: /space|spacing|gap|gutter|inset|padding|margin|size-\d|^--s-\d/i,
  'font-size': /font-size|text-size|fs-|type|size/i,
  'font-weight': /weight|fw-/i,
  'line-height': /line-height|leading|lh-/i,
  'font-family': /font|family|typeface/i,
  'letter-spacing': /tracking|letter/i,
  radius: /radius|rounded|corner/i,
  shadow: /shadow|elevation|depth/i,
  'border-width': /border|stroke|width/i,
  'z-index': /z-|layer|index|z$/i,
  motion: /duration|ease|motion|transition|timing/i,
};

const COLOR_IN_VALUE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i;

/** Normalises a value so that equal values written differently compare equal. */
export function normaliseValue(value: string, category: DeclarationCategory): string | null {
  const v = value.trim().toLowerCase();
  if (category === 'color') {
    const color = parseColor(v) ?? parseColor(COLOR_IN_VALUE.exec(v)?.[0] ?? '');
    return color ? toHex(color) : null;
  }
  const n = toPx(v);
  if (n !== null && ['spacing', 'font-size', 'radius', 'border-width', 'letter-spacing'].includes(category)) {
    return `${Math.round(n * 100) / 100}px`;
  }
  return v.replace(/\s+/g, ' ');
}

/** For each token, the roles of the declarations that reference it. */
export function tokenRoles(declarations: AuthoredDeclaration[]): Map<string, Set<TokenRole>> {
  const roles = new Map<string, Set<TokenRole>>();
  for (const d of declarations) {
    for (const token of d.tokens) {
      if (!roles.has(token)) roles.set(token, new Set());
      roles.get(token)!.add(roleOf(d.property, d.category));
    }
  }
  return roles;
}

function suggestionsFor(snapshot: PageSnapshot, declarations: AuthoredDeclaration[]): TokenSuggestion[] {
  const roles = tokenRoles(snapshot.authored.declarations);
  const tokens = Object.entries(snapshot.rendered.rootCustomProperties);

  const byKey = new Map<string, TokenSuggestion>();
  for (const d of declarations) {
    if (d.kind !== 'literal') continue;
    const literal = normaliseValue(d.value, d.category);
    if (!literal) continue;
    const role = roleOf(d.property, d.category);
    const key = `${role}:${literal}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (existing.selectors.length < 20 && !existing.selectors.includes(d.selector)) existing.selectors.push(d.selector);
      continue;
    }
    const match = bestToken(literal, d.category, role, tokens, roles);
    if (match) {
      byKey.set(key, { literal, category: d.category, role, token: match.token, confidence: match.confidence, occurrences: 1, selectors: [d.selector] });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => Number(b.confidence === 'role-match') - Number(a.confidence === 'role-match') || b.occurrences - a.occurrences,
  );
}

/**
 * The token whose value equals `literal`, preferring one with the same role.
 * A token used elsewhere for a different role is never a role match, even
 * when its name looks right.
 */
export function bestToken(
  literal: string,
  category: DeclarationCategory,
  role: TokenRole,
  tokens: [string, string][],
  roles: Map<string, Set<TokenRole>>,
): { token: string; confidence: SuggestionConfidence } | null {
  let fallback: string | null = null;
  for (const [name, value] of tokens) {
    if (normaliseValue(value, category) !== literal) continue;
    const usedFor = roles.get(name);
    if (usedFor ? usedFor.has(role) : NAME_HINTS[role].test(name)) return { token: name, confidence: 'role-match' };
    fallback ??= name;
  }
  return fallback ? { token: fallback, confidence: 'value-only' } : null;
}

export function analyseTokens(snapshot: PageSnapshot): TokenAnalysis {
  const { customProperties } = snapshot.authored;
  const declarations = liveDeclarations(snapshot);

  const names = new Set(customProperties.map((c) => c.name));
  const rootNames = new Set(customProperties.filter((c) => c.isRootScope).map((c) => c.name));

  const scopes = new Map<string, number>();
  for (const def of customProperties) {
    if (def.isRootScope && !def.media) continue;
    if (!rootNames.has(def.name)) continue;
    const scope = def.media ? `@media ${def.media} ${def.selector}` : def.selector;
    scopes.set(scope, (scopes.get(scope) ?? 0) + 1);
  }
  const themeScopes = [...scopes]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([scope, redefinitions]) => ({ scope, redefinitions }));

  const coverageByCategory: TokenAnalysis['coverageByCategory'] = {};
  let token = 0;
  let literal = 0;
  for (const d of declarations) {
    if (d.kind === 'keyword') continue;
    const entry = (coverageByCategory[d.category] ??= { token: 0, literal: 0, coverage: 0 });
    if (d.kind === 'token') {
      entry.token += 1;
      token += 1;
    } else {
      entry.literal += 1;
      literal += 1;
    }
  }
  for (const entry of Object.values(coverageByCategory)) entry.coverage = entry.token / (entry.token + entry.literal);

  // Tokens referenced by declarations or by other tokens count as used.
  const referenced = new Set(snapshot.authored.declarations.flatMap((d) => d.tokens));
  for (const def of customProperties) for (const m of def.value.matchAll(/var\(\s*(--[\w-]+)/g)) referenced.add(m[1]!);

  return {
    definedCount: names.size,
    rootDefinedCount: rootNames.size,
    themeScopes,
    coverage: token + literal === 0 ? null : token / (token + literal),
    coverageByCategory,
    suggestions: suggestionsFor(snapshot, declarations),
    unusedTokens: [...names].filter((n) => !referenced.has(n)),
    literalDeclarations: literal,
    distinctLiteralValues: new Set(
      declarations.filter((d) => d.kind === 'literal').map((d) => `${d.category}:${normaliseValue(d.value, d.category) ?? d.value}`),
    ).size,
  };
}
