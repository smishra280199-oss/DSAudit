/**
 * The inference engine: PageSnapshot in, AuditAnalysis out. Pure and
 * deterministic, so it runs in the panel, the preview page and tests alike.
 */

import type { PageSnapshot } from '../shared/snapshot';
import { analyseAccessibility } from './accessibility';
import { analyseComponents } from './components';
import { assessConfidence } from './confidence';
import { viewElements } from './elements';
import { analyseColor } from './foundations/color';
import { analyseElevation } from './foundations/elevation';
import { analyseMotion } from './foundations/motion';
import { analyseShape } from './foundations/shape';
import { analyseSpacing } from './foundations/spacing';
import { analyseTypography } from './foundations/typography';
import { findOpportunities } from './opportunities';
import { analyseTokens } from './tokens';
import type { AuditAnalysis, InteractionAnalysis } from './types';

export function analyse(snapshot: PageSnapshot): AuditAnalysis {
  const views = viewElements(snapshot);

  const foundations = {
    color: analyseColor(snapshot, views),
    typography: analyseTypography(snapshot, views),
    spacing: analyseSpacing(snapshot, views),
    shape: analyseShape(snapshot, views),
    elevation: analyseElevation(snapshot, views),
    motion: analyseMotion(snapshot, views),
  };
  const components = analyseComponents(views);
  const tokens = analyseTokens(snapshot);
  const { interaction: coverage } = snapshot.authored;
  const interaction: InteractionAnalysis = {
    ...coverage,
    hoverCoverage: coverage.interactiveCount ? coverage.withHover / coverage.interactiveCount : null,
    focusCoverage: coverage.interactiveCount ? coverage.withFocus / coverage.interactiveCount : null,
  };
  const accessibility = analyseAccessibility(views);
  const naming = snapshot.authored.classNaming;

  return {
    foundations,
    components,
    tokens,
    interaction,
    accessibility,
    naming,
    confidence: assessConfidence(snapshot),
    opportunities: findOpportunities({ foundations, components, tokens, interaction, accessibility, naming }),
  };
}

export type * from './types';
