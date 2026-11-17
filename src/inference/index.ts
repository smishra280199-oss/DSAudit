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
import { summariseStructure } from './structure';
import { detectTechnology } from './technology';
import { analyseTokens } from './tokens';
import type { AuditAnalysis, InteractionAnalysis } from './types';

export function analyse(snapshot: PageSnapshot): AuditAnalysis {
  const views = viewElements(snapshot);
  // Foundations measure the product's own interface: not cookie banners, screen-reader text or closed drawers.
  const interfaceViews = views.filter((v) => !v.excluded);

  const foundations = {
    color: analyseColor(snapshot, interfaceViews),
    typography: analyseTypography(snapshot, interfaceViews),
    spacing: analyseSpacing(snapshot, interfaceViews),
    shape: analyseShape(snapshot, interfaceViews),
    elevation: analyseElevation(snapshot, interfaceViews),
    motion: analyseMotion(snapshot, interfaceViews),
  };
  const components = analyseComponents(views, snapshot.viewport.width);
  const tokens = analyseTokens(snapshot);
  const { interaction: coverage } = snapshot.authored;
  const interaction: InteractionAnalysis = {
    ...coverage,
    hoverCoverage: coverage.interactiveCount ? coverage.withHover / coverage.interactiveCount : null,
    focusCoverage: coverage.interactiveCount ? coverage.withFocus / coverage.interactiveCount : null,
  };
  const backdrops = Object.fromEntries(
    Object.entries(snapshot.evidence ?? {})
      .filter(([, shot]) => shot.backdrop)
      .map(([selector, shot]) => [selector, shot.backdrop!]),
  );
  const accessibility = analyseAccessibility(views, backdrops);
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
    structure: summariseStructure(views),
    technology: detectTechnology(snapshot),
  };
}

export type * from './types';
