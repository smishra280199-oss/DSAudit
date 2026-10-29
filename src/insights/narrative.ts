/**
 * Plain-language copy for decision makers. Findings are phrased as business
 * impact (speed, cost, brand, risk), not CSS. Kept apart from the logic so
 * the wording can be tuned without touching any calculation.
 */

import type { AreaKey, OpportunityKind } from '../inference/types';

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

/** Why an opportunity matters, in business terms. */
export const OPPORTUNITY_IMPACT: Record<OpportunityKind, string> = {
  'merge-near-duplicate-colors': 'Near-identical colours look like mistakes and make every colour choice slower.',
  'reduce-palette': 'A smaller palette makes the brand recognisable and design decisions faster.',
  'consolidate-type-scale': 'A defined type scale removes guesswork and keeps hierarchy consistent.',
  'off-scale-spacing': 'A single spacing grid cuts layout debates and review rounds.',
  'reduce-shape-values': 'Fewer corner and border styles make the product feel like one system.',
  'reduce-elevation-values': 'A few defined elevation levels prevent overlap bugs and visual clutter.',
  'unify-motion': 'Shared timing makes interactions feel deliberate and polished.',
  'tokenize-literals': 'Tokens turn rebrands, dark mode and palette changes from weeks of edits into a config change.',
  'adopt-existing-tokens': 'Quick win: these values already have tokens; switching costs little and stops drift.',
  'component-variant-sprawl': 'Fewer, named variants mean less design, build and QA work for every new feature.',
  'merge-near-duplicate-variants': 'Near-identical variants are duplicated effort with no user benefit.',
  'focus-outline-removed': 'Keyboard users can’t see where they are, a common accessibility failure.',
  'missing-focus-style': 'A consistent focus style is required for keyboard accessibility.',
  'missing-hover-style': 'Hover feedback makes the product feel responsive and clickable things obvious.',
  'low-contrast': 'Low-contrast text is hard to read for many users and fails WCAG AA.',
  'missing-accessible-name': 'Screen-reader users can’t tell what these controls do.',
  'mixed-naming-conventions': 'Several styling approaches side by side slow onboarding and make changes riskier.',
};
