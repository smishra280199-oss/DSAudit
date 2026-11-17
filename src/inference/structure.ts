/**
 * Page structure: what each recorded element *is*, so the audit counts the
 * interface rather than every DOM node. One pass over the element views,
 * top-down (parents precede children), sets on each view:
 *
 *  - role: control, navigation, form, media, text, container, decorative or
 *    structural (a layout wrapper with nothing of its own to see).
 *  - excluded: why the element is not part of the product's own rendered
 *    interface (a third-party widget, visually hidden, off-screen, or
 *    zero-sized). Excluded elements are left out of foundations and
 *    components; accessibility keeps its own rules.
 *  - merged: why the element is a repeat of something already counted (an
 *    aria-hidden clone, a control nested in a control of the same size, the
 *    inner "skin" of a button). Merged elements are left out of components
 *    so one control is one finding.
 *  - control: the nearest ancestor that is a control, for nesting rules.
 *  - exempt: inside something disabled or aria-hidden (inherited), so
 *    accessibility checks don't walk the ancestors of every element.
 *
 * summariseStructure() turns the result into the explainable counts shown
 * under "About this capture".
 */

import { parseSelector } from '../shared/page-scope';
import type { ElementView } from './elements';
import type { StructureAnalysis } from './types';

export type ElementRole = 'control' | 'navigation' | 'form' | 'media' | 'text' | 'container' | 'decorative' | 'structural';
export type Exclusion = 'third-party' | 'visually-hidden' | 'offscreen' | 'zero-size';
export type MergeReason = 'hidden-clone' | 'nested-control' | 'control-skin';

const NATIVE_CONTROLS = new Set(['button', 'select', 'textarea', 'summary']);
const CONTROL_ROLES = new Set([
  'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'checkbox', 'radio',
  'switch', 'slider', 'combobox', 'textbox', 'searchbox', 'spinbutton', 'treeitem',
]);
const LANDMARK_TAGS = new Set(['nav', 'header', 'footer', 'main', 'aside']);
const LANDMARK_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'main', 'complementary', 'search', 'menubar', 'tablist', 'toolbar', 'dialog']);
const FORM_TAGS = new Set(['form', 'fieldset', 'label', 'legend', 'output', 'datalist', 'optgroup']);
const MEDIA_TAGS = new Set(['img', 'svg', 'video', 'canvas', 'picture', 'iframe', 'audio', 'object', 'embed']);

/**
 * Roots of widgets a product embeds but doesn't design: consent banners,
 * chat launchers, captchas. Matched on id or class at the widget's root.
 */
const THIRD_PARTY = new RegExp(
  [
    '^onetrust-', '^ot-sdk-', '^optanon', '^CybotCookiebot', '^usercentrics', '^uc-', '^didomi-', '^qc-cmp', '^truste',
    '^osano-', '^termly', '^iubenda', '^cky-', '^cmplz-', '^cookiebot', '^cookiefirst', '^klaro', '^cc-window', '^cc_banner',
    '^intercom-', '^hubspot-messages', '^drift-', '^crisp-client', '^tawk', '^zsiq', '^fc_frame', '^freshworks', '^launcher-frame',
    '^gorgias', '^tidio', '^olark', '^livechat', '^chat-widget-container', '^grecaptcha', '^g-recaptcha', '^hcaptcha',
    '^zEWidget', '^webWidget', '^beacon-container', '^userway', '^accessibe', '^acsb-',
  ].join('|'),
  'i',
);

function isThirdPartyRoot({ el }: ElementView): boolean {
  // Older snapshots don't record ids; a unique id still shows as the whole selector.
  const local = parseSelector(el.selector).selector;
  const id = el.attrs.id ?? (/^#[\w-]+$/.test(local) ? local.slice(1) : '');
  return (id !== '' && THIRD_PARTY.test(id)) || el.classes.some((c) => THIRD_PARTY.test(c));
}

/** Natively or explicitly interactive: what keyboard and assistive-technology users can operate. */
export function isControl(view: ElementView): boolean {
  const { el } = view;
  if (NATIVE_CONTROLS.has(el.tag)) return true;
  if (el.tag === 'a') return el.attrs.href !== undefined || el.attrs.tabindex !== undefined || el.attrs.role !== undefined;
  if (el.tag === 'input') return el.attrs.type !== 'hidden';
  if (CONTROL_ROLES.has(el.attrs.role ?? '')) return true;
  return isCustomControl(view);
}

/**
 * A div or span made clickable without a role: focusable with a pointer
 * cursor, or carrying an inline click handler with one. It works for mouse
 * users, so it is part of the interface, but assistive technology can't tell.
 */
export function isCustomControl({ el, styles }: ElementView): boolean {
  if (el.attrs.role || ['a', 'button', 'input', 'select', 'textarea', 'summary', 'label'].includes(el.tag)) return false;
  const pointer = styles.cursor === 'pointer';
  const focusable = el.attrs.tabindex !== undefined && el.attrs.tabindex !== '-1';
  return pointer && (focusable || el.attrs.onclick !== undefined);
}

function hasSurface({ el }: ElementView): boolean {
  const s = el.styles;
  return Boolean(s.backgroundColor || s.backgroundImage || s.boxShadow || s.borderTopWidth);
}

function roleOf(view: ElementView, hasChildren: boolean): ElementRole {
  const { el } = view;
  if (isControl(view)) return 'control';
  if (LANDMARK_TAGS.has(el.tag) || LANDMARK_ROLES.has(el.attrs.role ?? '')) return 'navigation';
  if (FORM_TAGS.has(el.tag)) return 'form';
  if (MEDIA_TAGS.has(el.tag) || el.attrs.role === 'img') return 'media';
  if (el.text) return 'text';
  if (el.attrs.role === 'presentation' || el.attrs.role === 'none' || el.attrs['aria-hidden'] === 'true') return hasChildren ? 'structural' : 'decorative';
  if (hasSurface(view)) return hasChildren ? 'container' : 'decorative';
  return 'structural';
}

/** Same box within 2px on every side: one visual thing drawn by two elements. */
function sameBox(a: ElementView, b: ElementView): boolean {
  const r = a.el.rect;
  const s = b.el.rect;
  return Math.abs(r.x - s.x) <= 2 && Math.abs(r.y - s.y) <= 2 && Math.abs(r.w - s.w) <= 2 && Math.abs(r.h - s.h) <= 2;
}

/** Whether the snapshot has real geometry: jsdom and old fixtures report 0×0 for everything. */
export function hasLayout(views: ElementView[]): boolean {
  return views.some((v) => v.el.rect.w > 0 && v.el.rect.h > 0);
}

/** Annotates every view in place. `visuallyHidden` is passed in to avoid a cycle with elements.ts. */
export function annotateStructure(views: ElementView[], visuallyHidden: (v: ElementView) => boolean): void {
  const layout = hasLayout(views);
  const childCount = new Array<number>(views.length).fill(0);
  for (const v of views) if (v.el.parent >= 0) childCount[v.el.parent]! += 1;

  for (const view of views) {
    const { el } = view;
    const parent = el.parent >= 0 ? views[el.parent] : undefined;
    view.role = roleOf(view, childCount[el.index]! > 0);
    view.control = parent ? (parent.role === 'control' ? parent.el.index : parent.control) : -1;

    const disabledHere = el.attrs.disabled !== undefined || el.attrs['aria-disabled'] === 'true';
    const hiddenHere = el.attrs['aria-hidden'] === 'true';
    view.ariaHidden = hiddenHere || (parent?.ariaHidden ?? false);
    view.exempt = disabledHere || view.ariaHidden || (parent?.exempt ?? false);

    // Exclusions are inherited: a widget's or an off-screen drawer's contents go with it.
    if (parent?.excluded === 'third-party' || parent?.excluded === 'offscreen') view.excluded = parent.excluded;
    else if (isThirdPartyRoot(view)) view.excluded = 'third-party';
    else if (visuallyHidden(view)) view.excluded = 'visually-hidden';
    else if (layout && el.rect.w > 0 && el.rect.h > 0 && (el.rect.x + el.rect.w <= 0 || el.rect.y + el.rect.h <= 0)) view.excluded = 'offscreen';
    else if (layout && (el.rect.w === 0 || el.rect.h === 0) && el.styles.display !== 'contents' && el.tag !== 'body') view.excluded = 'zero-size';
    else view.excluded = null;

    view.merged = null;
    if (view.excluded) continue;
    if (view.ariaHidden && (view.role === 'control' || view.el.text)) {
      // Marquee and carousel clones are aria-hidden copies of what is already on the page.
      view.merged = 'hidden-clone';
    } else if (layout && view.control >= 0 && sameBox(view, views[view.control]!)) {
      const outer = views[view.control]!;
      if (view.role === 'control') {
        // <a><button>Go</button></a>: one control. Keep whichever draws it; the outer one when both or neither do.
        if (hasSurface(view) && !hasSurface(outer)) outer.merged = 'nested-control';
        else view.merged = 'nested-control';
      } else if (hasSurface(view)) {
        // A span painting the button's background is the button, not a badge or card of its own.
        view.merged = 'control-skin';
        if (outer.skin < 0) outer.skin = view.el.index;
      }
    }
  }
}

const ROLE_LABELS: Record<ElementRole, string> = {
  control: 'interactive controls',
  navigation: 'landmarks and navigation',
  form: 'form structure',
  media: 'images and media',
  text: 'text elements',
  container: 'surfaces and containers',
  decorative: 'decorative shapes',
  structural: 'layout wrappers',
};

const EXCLUSION_LABELS: Record<Exclusion, string> = {
  'third-party': 'in third-party widgets (cookie banners, chat)',
  'visually-hidden': 'visually hidden (screen-reader only)',
  offscreen: 'positioned off-screen (skip links, closed drawers)',
  'zero-size': 'collapsed to zero size',
};

const MERGE_LABELS: Record<MergeReason, string> = {
  'hidden-clone': 'hidden copies (carousel or marquee clones)',
  'nested-control': 'controls nested in a control of the same size',
  'control-skin': 'inner layers that draw a control',
};

export function summariseStructure(views: ElementView[]): StructureAnalysis {
  const roles = Object.fromEntries(Object.keys(ROLE_LABELS).map((k) => [k, 0])) as Record<ElementRole, number>;
  const excluded: Partial<Record<Exclusion, number>> = {};
  const merged: Partial<Record<MergeReason, number>> = {};
  const customControls: string[] = [];
  for (const v of views) {
    roles[v.role] += 1;
    if (v.excluded) excluded[v.excluded] = (excluded[v.excluded] ?? 0) + 1;
    if (v.merged) merged[v.merged] = (merged[v.merged] ?? 0) + 1;
    if (!v.excluded && isCustomControl(v) && customControls.length < 40) customControls.push(v.el.selector);
  }
  const lines = (counts: Partial<Record<string, number>>, labels: Record<string, string>) =>
    Object.entries(counts)
      .filter(([, n]) => (n ?? 0) > 0)
      .sort((a, b) => b[1]! - a[1]!)
      .map(([k, n]) => ({ key: k, label: labels[k]!, count: n! }));
  return {
    total: views.length,
    layout: hasLayout(views),
    roles: lines(roles, ROLE_LABELS),
    excluded: lines(excluded, EXCLUSION_LABELS),
    merged: lines(merged, MERGE_LABELS),
    customControls,
    counted: views.filter((v) => !v.excluded).length,
  };
}
