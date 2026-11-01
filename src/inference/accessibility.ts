/**
 * Accessibility checks that fall out of the snapshot for free: text contrast
 * against the composited backdrop, and controls without an accessible name.
 */

import { evaluateContrast, type BackdropLayer } from '../shared/contrast';
import { isVisuallyHidden, px, type ElementView } from './elements';
import { parseSelector } from '../shared/page-scope';
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

const TARGET_MIN = 24;
const TARGET_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'switch', 'option']);
/** Native checkboxes, radios and similar keep their browser size: WCAG exempts user-agent controls. */
const UA_SIZED_INPUTS = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'image']);
const FIELD_EXEMPT_INPUTS = new Set(['submit', 'button', 'reset', 'hidden', 'image']);

function isTarget({ el }: ElementView): boolean {
  if (el.tag === 'button' || el.tag === 'select' || el.tag === 'textarea') return true;
  if (el.tag === 'a') return el.attrs.href !== undefined;
  if (el.tag === 'input') return !UA_SIZED_INPUTS.has(el.attrs.type ?? 'text');
  return TARGET_ROLES.has(el.attrs.role ?? '');
}

function circleHitsRect(cx: number, cy: number, r: number, rect: { x: number; y: number; w: number; h: number }): boolean {
  const dx = cx - Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const dy = cy - Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return dx * dx + dy * dy < r * r;
}

/**
 * WCAG 2.2 SC 2.5.8 (AA). A target smaller than 24×24 px passes when a 24px
 * circle centred on it touches no other target and no other small target's
 * circle. Links inside a sentence are exempt, as are elements we can't measure.
 */
function smallTargets(views: ElementView[]): { failures: AccessibilityAnalysis['smallTargets']; checked: number } {
  const targets = views.filter((v, i) => isTarget(v) && (v.el.rect.w > 0 || v.el.rect.h > 0) && !exemptFromContrast(views, i));
  const pageOf = (v: ElementView) => parseSelector(v.el.selector).page;
  const failures: AccessibilityAnalysis['smallTargets'] = [];
  for (const t of targets) {
    const { rect } = t.el;
    if (rect.w >= TARGET_MIN && rect.h >= TARGET_MIN) continue;
    const parent = t.el.parent >= 0 ? views[t.el.parent] : undefined;
    if (t.el.tag === 'a' && parent?.el.text) continue; // inline link in a sentence
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const crowded = targets.some((o) => {
      if (o === t || pageOf(o) !== pageOf(t)) return false;
      // Nested targets (an icon inside a button) are one target.
      if (o.el.index === t.el.parent || t.el.index === o.el.parent) return false;
      const small = o.el.rect.w < TARGET_MIN || o.el.rect.h < TARGET_MIN;
      if (small) {
        const ox = o.el.rect.x + o.el.rect.w / 2;
        const oy = o.el.rect.y + o.el.rect.h / 2;
        if (Math.hypot(ox - cx, oy - cy) < TARGET_MIN) return true;
      }
      return circleHitsRect(cx, cy, TARGET_MIN / 2, o.el.rect);
    });
    if (crowded) failures.push({ selector: t.el.selector, text: t.el.text || t.el.attrs['aria-label'] || `<${t.el.tag}>`, w: rect.w, h: rect.h });
  }
  return { failures, checked: targets.length };
}

function unlabelledFields(views: ElementView[]): { failures: AccessibilityAnalysis['unlabelledFields']; checked: number } {
  const fields = views.filter(
    (v, i) =>
      (v.el.tag === 'select' || v.el.tag === 'textarea' || (v.el.tag === 'input' && !FIELD_EXEMPT_INPUTS.has(v.el.attrs.type ?? 'text'))) &&
      !exemptFromContrast(views, i),
  );
  const failures = fields
    .filter(({ el }) => {
      const a = el.attrs;
      return a['data-labelled'] === undefined && !(a['aria-label'] ?? '').trim() && !(a['aria-labelledby'] ?? '').trim() && !(a.title ?? '').trim();
    })
    .map(({ el }) => ({ selector: el.selector, tag: el.tag, placeholderOnly: Boolean((el.attrs.placeholder ?? '').trim()) }));
  return { failures, checked: fields.length };
}

function imagesWithoutAlt(views: ElementView[]): { failures: AccessibilityAnalysis['imagesWithoutAlt']; checked: number } {
  const images = views.filter(
    (v, i) => v.el.tag === 'img' && !['presentation', 'none'].includes(v.el.attrs.role ?? '') && !exemptFromContrast(views, i),
  );
  const failures = images.filter(({ el }) => el.attrs.alt === undefined && !(el.attrs['aria-label'] ?? '').trim()).map(({ el }) => ({ selector: el.selector }));
  return { failures, checked: images.length };
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

  const targets = smallTargets(views);
  const fields = unlabelledFields(views);
  const images = imagesWithoutAlt(views);
  return {
    textChecked,
    contrastFailures: failures.sort((a, b) => a.ratio - b.ratio),
    unnamedControls: unnamed,
    controlsChecked: controls.length,
    smallTargets: targets.failures,
    targetsChecked: targets.checked,
    unlabelledFields: fields.failures,
    fieldsChecked: fields.checked,
    imagesWithoutAlt: images.failures,
    imagesChecked: images.checked,
  };
}
