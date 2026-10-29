/**
 * Plain-language copy for decision makers. Findings are phrased as business
 * impact (speed, cost, brand, risk), not CSS. Kept apart from the logic so
 * the wording can be tuned without touching any calculation.
 */

import type { AreaKey } from '../inference/types';

export type HealthStatus = 'strong' | 'needs-work' | 'at-risk';

export const STATUS_LABELS: Record<HealthStatus, string> = {
  strong: 'Strong',
  'needs-work': 'Needs work',
  'at-risk': 'At risk',
};

/** What each area means for the business, by status. */
export const AREA_IMPACT: Record<AreaKey, Record<HealthStatus, string>> = {
  color: {
    strong: 'A tight, intentional palette that keeps the brand consistent.',
    'needs-work': 'Extra and near-identical colours dilute the brand and slow design decisions.',
    'at-risk': 'Colour has drifted far from any palette: the product looks inconsistent and every screen is a judgement call.',
  },
  typography: {
    strong: 'A clear type scale gives every screen the same hierarchy.',
    'needs-work': 'Off-scale text sizes blur the hierarchy and creep into new work.',
    'at-risk': 'No working type scale: hierarchy is reinvented on every screen.',
  },
  spacing: {
    strong: 'Layouts follow one spacing rhythm.',
    'needs-work': 'Spacing mostly follows a grid, but one-off values cause visual noise and review churn.',
    'at-risk': 'No shared spacing rhythm: layouts feel uneven and take longer to build and review.',
  },
  shape: {
    strong: 'Corners and borders are consistent.',
    'needs-work': 'A few too many corner and border styles make similar elements look unrelated.',
    'at-risk': 'Corner and border styles vary widely, so the UI feels assembled rather than designed.',
  },
  elevation: {
    strong: 'Depth and layering are used consistently.',
    'needs-work': 'Shadow and layering values have started to multiply.',
    'at-risk': 'Ad-hoc shadows and stacking values risk overlap bugs and an inconsistent sense of depth.',
  },
  motion: {
    strong: 'Animation timing is consistent.',
    'needs-work': 'Animation timings vary, so interactions feel slightly different from place to place.',
    'at-risk': 'Motion has no shared timing, which makes the product feel unpolished.',
  },
  components: {
    strong: 'Core components are reused rather than re-styled.',
    'needs-work': 'Components exist in more visual variants than needed, so teams rebuild what already exists.',
    'at-risk': 'Component sprawl: the same button or card is rebuilt many ways, multiplying design and QA effort.',
  },
  tokens: {
    strong: 'Design decisions live in tokens, so changes and themes are cheap.',
    'needs-work': 'Tokens exist but much of the styling is hard-coded, so changes need many manual edits.',
    'at-risk': 'Styling is mostly hard-coded: a rebrand, dark mode or palette change means editing values by hand across the codebase.',
  },
  interaction: {
    strong: 'Interactive elements give consistent hover and focus feedback.',
    'needs-work': 'Hover and focus feedback is patchy, so the product feels less responsive.',
    'at-risk': 'Many controls give no hover or focus feedback, which hurts usability and keyboard access.',
  },
  accessibility: {
    strong: 'Text contrast and control labelling meet the basics.',
    'needs-work': 'Some text and controls fall short of WCAG AA, which excludes users and creates compliance risk.',
    'at-risk': 'Widespread contrast and labelling failures exclude users and expose the product to accessibility complaints.',
  },
};

/** Plain-language definitions for readers who have never seen a design audit. */
export const GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: 'Design system',
    meaning: 'The shared set of colours, text styles, spacing and components a product is built from. When it works, every screen looks like it belongs to the same product.',
  },
  {
    term: 'Design token',
    meaning: 'A named value, like “brand-primary” or “space-medium”, used instead of typing the raw value each time. Change the token once and every screen updates.',
  },
  {
    term: 'Component and variant',
    meaning: 'A reusable building block such as a button or a card. Variants are its intentional versions (primary, secondary…). Unintentional near-copies are what we flag.',
  },
  {
    term: 'Type scale and spacing rhythm',
    meaning: 'A short, fixed set of text sizes and gaps that everything snaps to, so layouts feel calm and consistent.',
  },
  {
    term: 'Contrast ratio (WCAG)',
    meaning: 'How strongly text stands out from its background. The WCAG accessibility standard asks for at least 4.5 to 1 for normal text.',
  },
];

/** How each consolidation line is labelled and explained in the metrics table. */
export const METRIC_LABELS: Record<string, { label: string; explainer: string }> = {
  colors: { label: 'Colours', explainer: 'Every distinct colour used for text, backgrounds and borders' },
  'font-size': { label: 'Text sizes', explainer: 'Every distinct size of text' },
  'font-weight': { label: 'Font weights', explainer: 'How many levels of boldness are used' },
  'line-height': { label: 'Line heights', explainer: 'The spacing between lines of text' },
  'font-family': { label: 'Typefaces', explainer: 'Different fonts in use' },
  spacing: { label: 'Spacing values', explainer: 'Distinct gaps, padding and margins' },
  radius: { label: 'Corner styles', explainer: 'How rounded corners are' },
  'border-width': { label: 'Border thicknesses', explainer: 'Distinct border widths' },
  shadow: { label: 'Shadow styles', explainer: 'Distinct drop shadows' },
  'z-index': { label: 'Layering levels', explainer: 'How elements are stacked on top of each other' },
  duration: { label: 'Animation timings', explainer: 'Distinct animation speeds' },
};
