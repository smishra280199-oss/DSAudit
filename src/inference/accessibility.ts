/**
 * Accessibility checks that fall out of the snapshot for free: text contrast
 * against the composited backdrop, and controls without an accessible name.
 */

import { evaluateContrast, type BackdropLayer } from '../shared/contrast';
import { isVisuallyHidden, px, type ElementView } from './elements';
import type { AccessibilityAnalysis, ContrastIssue } from './types';

const MAX_TEXT_CHECKS = 2_000;

function backdrop(views: ElementView[], index: number): BackdropLayer[] {
  const layers: BackdropLayer[] = [];
  for (let i = index; i >= 0; i = views[i]!.el.parent) {
    const { styles } = views[i]!.el;
    layers.push({ color: styles.backgroundColor, hasImage: Boolean(styles.backgroundImage) });
  }
  return layers;
}

/** WCAG 1.4.3 exempts inactive controls; text nobody can see can't fail contrast. */
function exemptFromContrast(views: ElementView[], index: number): boolean {
  for (let i = index; i >= 0; i = views[i]!.el.parent) {
    const { attrs } = views[i]!.el;
    if (attrs.disabled !== undefined || attrs['aria-disabled'] === 'true' || attrs['aria-hidden'] === 'true') return true;
  }
  return isVisuallyHidden(views[index]!);
}

function isControl({ el }: ElementView): boolean {
  return el.tag === 'button' || el.attrs.role === 'button' || (el.tag === 'a' && el.attrs.href !== undefined);
}

export function analyseAccessibility(views: ElementView[]): AccessibilityAnalysis {
  const failures: ContrastIssue[] = [];
  let textChecked = 0;

  for (const view of views) {
    if (!view.el.text || textChecked >= MAX_TEXT_CHECKS) continue;
    const { color, fontSize, fontWeight } = view.styles;
    if (!color || exemptFromContrast(views, view.el.index)) continue;
    textChecked += 1;
    const result = evaluateContrast(color, backdrop(views, view.el.index), px(fontSize) ?? 16, parseInt(fontWeight ?? '400', 10));
    if (result && !result.passesAA) failures.push({ ...result, selector: view.el.selector, text: view.el.text });
  }

  const controls = views.filter(isControl);
  const unnamed = controls
    .filter((v) => !v.subtreeHasText && !v.subtreeHasLabel)
    .map((v) => ({ selector: v.el.selector, tag: v.el.tag }));

  return {
    textChecked,
    contrastFailures: failures.sort((a, b) => a.ratio - b.ratio),
    unnamedControls: unnamed,
    controlsChecked: controls.length,
  };
}
