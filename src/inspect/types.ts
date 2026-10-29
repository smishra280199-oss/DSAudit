import type { ContrastResult } from '../shared/contrast';
import type { DeclarationCategory, Rect, ValueKind } from '../shared/snapshot';

export type { ContrastResult };

export interface WinningDeclaration {
  /** The authored property that set the value (may be a shorthand). */
  property: string;
  value: string;
  kind: ValueKind;
  tokens: string[];
  selector: string;
  sheet: string;
  important: boolean;
  /** Set when the value was inherited rather than declared on the element. */
  inheritedFrom?: string;
}

export interface InspectedProperty {
  property: string;
  label: string;
  category: DeclarationCategory;
  computed: string;
  /** Null when no readable rule sets the property (browser default or unreadable sheet). */
  winner: WinningDeclaration | null;
}

export interface InspectResult {
  selector: string;
  tag: string;
  text: string;
  classes: string[];
  rect: Rect;
  properties: InspectedProperty[];
  contrast: ContrastResult | null;
  /** Custom properties resolved on the root element, for token suggestions. */
  rootCustomProperties: Record<string, string>;
}
