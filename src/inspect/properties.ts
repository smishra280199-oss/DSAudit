/**
 * The properties Inspect reports for a picked element. To inspect another
 * property, add an entry here: `sources` lists the authored properties that
 * can set it, most specific first (longhand before shorthand).
 */

import type { DeclarationCategory } from '../shared/snapshot';

export interface InspectedPropertyDefinition {
  /** CSS property name as reported by getComputedStyle. */
  property: string;
  label: string;
  category: DeclarationCategory;
  sources: string[];
  inherited: boolean;
}

export const INSPECTED_PROPERTIES: InspectedPropertyDefinition[] = [
  { property: 'color', label: 'Text color', category: 'color', sources: ['color'], inherited: true },
  {
    property: 'background-color',
    label: 'Background',
    category: 'color',
    sources: ['background-color', 'background'],
    inherited: false,
  },
  {
    property: 'border-top-color',
    label: 'Border color',
    category: 'color',
    sources: ['border-top-color', 'border-color', 'border-top', 'border'],
    inherited: false,
  },
  {
    property: 'border-top-width',
    label: 'Border width',
    category: 'border-width',
    sources: ['border-top-width', 'border-width', 'border-top', 'border'],
    inherited: false,
  },
  {
    property: 'border-top-left-radius',
    label: 'Radius',
    category: 'radius',
    sources: ['border-top-left-radius', 'border-radius'],
    inherited: false,
  },
  { property: 'box-shadow', label: 'Shadow', category: 'shadow', sources: ['box-shadow'], inherited: false },
  { property: 'font-family', label: 'Font family', category: 'font-family', sources: ['font-family', 'font'], inherited: true },
  { property: 'font-size', label: 'Font size', category: 'font-size', sources: ['font-size', 'font'], inherited: true },
  { property: 'font-weight', label: 'Font weight', category: 'font-weight', sources: ['font-weight', 'font'], inherited: true },
  { property: 'line-height', label: 'Line height', category: 'line-height', sources: ['line-height', 'font'], inherited: true },
  {
    property: 'letter-spacing',
    label: 'Letter spacing',
    category: 'letter-spacing',
    sources: ['letter-spacing'],
    inherited: true,
  },
  {
    property: 'padding-top',
    label: 'Padding top',
    category: 'spacing',
    sources: ['padding-top', 'padding-block-start', 'padding-block', 'padding'],
    inherited: false,
  },
  {
    property: 'padding-right',
    label: 'Padding right',
    category: 'spacing',
    sources: ['padding-right', 'padding-inline-end', 'padding-inline', 'padding'],
    inherited: false,
  },
  {
    property: 'padding-bottom',
    label: 'Padding bottom',
    category: 'spacing',
    sources: ['padding-bottom', 'padding-block-end', 'padding-block', 'padding'],
    inherited: false,
  },
  {
    property: 'padding-left',
    label: 'Padding left',
    category: 'spacing',
    sources: ['padding-left', 'padding-inline-start', 'padding-inline', 'padding'],
    inherited: false,
  },
  {
    property: 'margin-top',
    label: 'Margin top',
    category: 'spacing',
    sources: ['margin-top', 'margin-block-start', 'margin-block', 'margin'],
    inherited: false,
  },
  {
    property: 'margin-bottom',
    label: 'Margin bottom',
    category: 'spacing',
    sources: ['margin-bottom', 'margin-block-end', 'margin-block', 'margin'],
    inherited: false,
  },
  { property: 'row-gap', label: 'Gap', category: 'spacing', sources: ['row-gap', 'gap'], inherited: false },
  { property: 'z-index', label: 'Z-index', category: 'z-index', sources: ['z-index'], inherited: false },
  {
    property: 'transition-duration',
    label: 'Transition',
    category: 'motion',
    sources: ['transition-duration', 'transition'],
    inherited: false,
  },
];
