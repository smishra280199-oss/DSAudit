/**
 * Technology detection: which platform, framework or generator a page was
 * built with, from the raw signals capture records (tech-signals.ts and the
 * runtime probe). Pure and deterministic.
 *
 * Every rule is a clue with a strength:
 *  - definitive: only this technology produces it (a generator tag naming
 *    it, Webflow's data-wf-site, Next.js's __NEXT_DATA__ script).
 *  - strong: very rarely seen without it (assets on framerusercontent.com,
 *    scripts under /_next/static/).
 *  - supporting: consistent with it but seen elsewhere too (a #root div, a
 *    "w-" class prefix).
 *
 * A technology is confirmed by one definitive or two strong clues, probable
 * with one strong clue or two supporting ones, and only possible on a single
 * supporting clue. Possible results are never presented as detected, and
 * finding no platform never means "hand-coded": it means we can't tell.
 */

import type { PageSnapshot, TechSignals } from '../shared/snapshot';

export type TechCategory =
  | 'website-builder'
  | 'ecommerce'
  | 'cms'
  | 'page-builder'
  | 'static-generator'
  | 'meta-framework'
  | 'ui-framework'
  | 'library'
  | 'css-framework';

export type DetectionStatus = 'confirmed' | 'probable' | 'possible';

export interface DetectedTechnology {
  id: string;
  name: string;
  category: TechCategory;
  status: DetectionStatus;
  /** Plain-language evidence, strongest first. */
  evidence: string[];
  version?: string;
  /** Set when the technology is part of another one found, e.g. React under Next.js. */
  impliedBy?: string;
}

export interface TechnologyAnalysis {
  /** The platform or framework the site is primarily built with; null when nothing reliable was found. */
  primary: DetectedTechnology | null;
  /** "Platform", "Framework" or "Generator": how the primary result is labelled. */
  primaryLabel: string;
  confidence: 'high' | 'medium' | 'low';
  /** e.g. "No-code / visual development" or "Custom-developed frontend". */
  websiteType: string;
  /** Why the result is what it is, in one sentence; always set when confidence is low. */
  reason: string | null;
  /** Everything confirmed or probable besides the primary, primary first. */
  technologies: DetectedTechnology[];
  /** Single weak clues, listed so a reader can follow up, never counted as detected. */
  possible: DetectedTechnology[];
  /** Whether the page's own JavaScript could be inspected (globals, framework markers on DOM nodes). */
  runtimeInspected: boolean;
  /** False for snapshots captured before detection existed. */
  available: boolean;
}

type Strength = 'definitive' | 'strong' | 'supporting';
interface Clue {
  strength: Strength;
  evidence: string;
}

interface TechDef {
  id: string;
  name: string;
  category: TechCategory;
  /** Technologies this one is built on, listed as implied (Next.js → React). */
  implies?: string[];
  clues: (s: Signals) => (Clue | null | false | undefined)[];
  version?: (s: Signals) => string | undefined;
}

/** Query helpers over the raw signals, so rules read like the evidence they describe. */
class Signals {
  constructor(
    readonly raw: TechSignals,
    private readonly customProps: string[],
  ) {}

  generator(re: RegExp): string | undefined {
    return this.raw.generators.find((g) => re.test(g));
  }
  /** First script URL matching. */
  script(re: RegExp): string | undefined {
    return this.raw.scripts.find((u) => re.test(u));
  }
  /** First script, stylesheet or asset URL (or asset host) matching. */
  url(re: RegExp): string | undefined {
    return this.raw.scripts.find((u) => re.test(u)) ?? this.raw.links.find((u) => re.test(u)) ?? this.raw.assetHosts.find((h) => re.test(h));
  }
  attr(name: string | RegExp): number {
    if (typeof name === 'string') return this.raw.attrNames[name] ?? 0;
    return Object.entries(this.raw.attrNames).reduce((n, [k, v]) => n + (name.test(k) ? v : 0), 0);
  }
  /** First attribute name matching, for evidence. */
  attrName(re: RegExp): string | undefined {
    return Object.keys(this.raw.attrNames).find((k) => re.test(k));
  }
  classes(prefix: string): number {
    return this.raw.classPrefixes[prefix] ?? 0;
  }
  rootId(id: string): boolean {
    return this.raw.rootIds.includes(id);
  }
  tag(name: string): number {
    return this.raw.customTags[name] ?? 0;
  }
  inline(marker: string | RegExp): string | undefined {
    return this.raw.inlineScripts.find((m) => (typeof marker === 'string' ? m === marker : marker.test(m)));
  }
  runtime(marker: string): boolean {
    return this.raw.runtime?.includes(marker) ?? false;
  }
  runtimeVersion(name: string): string | undefined {
    return this.raw.runtime?.find((m) => m.startsWith(`version:${name}:`))?.slice(`version:${name}:`.length);
  }
  htmlAttr(name: string): string | undefined {
    return this.raw.htmlAttrs[name];
  }
  customProp(prefix: string): string | undefined {
    return this.customProps.find((p) => p.startsWith(prefix));
  }
}

const definitive = (evidence: string): Clue => ({ strength: 'definitive', evidence });
const strong = (evidence: string): Clue => ({ strength: 'strong', evidence });
const supporting = (evidence: string): Clue => ({ strength: 'supporting', evidence });

/** A clue when `value` is truthy, with the value spliced into the evidence. */
function when<T>(value: T | undefined | null | false | 0, make: (v: T) => Clue): Clue | null {
  return value ? make(value) : null;
}

const gen = (s: Signals, re: RegExp) => when(s.generator(re), (g) => definitive(`Generator tag says “${g}”.`));
const versionFrom = (re: RegExp) => (s: Signals) => s.generator(re)?.match(/(\d+(?:\.\d+){0,2})/)?.[1];

const TECHNOLOGIES: TechDef[] = [
  // ── No-code and visual builders ─────────────────────────────────────
  {
    id: 'framer',
    name: 'Framer',
    category: 'website-builder',
    implies: ['react'],
    clues: (s) => [
      gen(s, /^framer\b/i),
      when(s.attrName(/^data-framer-(name|component-type|hydrate-v2|appear-id|page-optimized-at)$/), (a) => definitive(`Framer-specific attributes on page elements (${a}).`)),
      when(s.url(/framerusercontent\.com|framerstatic\.com|framer\.com\/m\//), (u) => strong(`Assets loaded from Framer’s servers (${u}).`)),
      when(s.classes('framer-') >= 5, () => strong(`${s.classes('framer-')} elements use Framer’s generated “framer-” classes.`)),
      when(s.runtime('global:__framer_importFromPackage'), () => strong('Framer’s runtime is loaded in the page.')),
    ],
    // Framer's generator tag carries a build hash ("Framer 6a0c2f1"), not a version.
  },
  {
    id: 'webflow',
    name: 'Webflow',
    category: 'website-builder',
    clues: (s) => [
      gen(s, /webflow/i),
      when(s.htmlAttr('data-wf-site') ?? s.htmlAttr('data-wf-page'), () => definitive('Webflow site and page ids on <html> (data-wf-site, data-wf-page).')),
      when(s.url(/website-files\.com|webflow\.(com|io)\/|uploads-ssl\.webflow\.com/), (u) => strong(`Assets hosted on Webflow’s CDN (${u}).`)),
      when(s.script(/webflow[\w.-]*\.js$/i), (u) => strong(`Webflow’s runtime script (${u}).`)),
      when(s.runtime('global:Webflow'), () => strong('The Webflow runtime object is present.')),
      when(/\bw-mod-/.test(s.htmlAttr('class') ?? ''), () => strong('Webflow’s w-mod- classes on <html>.')),
      when(s.classes('w-') >= 5, () => supporting('Many “w-” classes (Webflow’s component classes, though Tailwind uses the prefix too).')),
    ],
  },
  {
    id: 'wix',
    name: 'Wix',
    category: 'website-builder',
    implies: ['react'],
    clues: (s) => [
      gen(s, /wix\.com/i),
      when(s.url(/wixstatic\.com|parastorage\.com|wix-code|wixsite\.com/), (u) => strong(`Assets loaded from Wix servers (${u}).`)),
      when(s.runtime('global:wixBiSession') || s.runtime('global:wixDevelopersAnalytics'), () => strong('Wix’s runtime objects are present.')),
      when(s.attr('data-mesh-id') > 0, () => supporting('Wix layout attributes (data-mesh-id).')),
    ],
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    category: 'website-builder',
    clues: (s) => [
      gen(s, /squarespace/i),
      when(s.runtime('global:Static.SQUARESPACE_CONTEXT'), () => definitive('Squarespace’s page context object is present.')),
      when(s.url(/squarespace(-cdn)?\.com/), (u) => strong(`Assets loaded from Squarespace (${u}).`)),
      when(s.classes('sqs-') >= 3, () => strong(`${s.classes('sqs-')} elements use Squarespace’s “sqs-” classes.`)),
    ],
  },
  {
    id: 'bubble',
    name: 'Bubble',
    category: 'website-builder',
    clues: (s) => [
      when(s.classes('bubble-') >= 5, () => strong(`${s.classes('bubble-')} elements use Bubble’s “bubble-element” classes.`)),
      when(s.url(/bubble\.io|bubbleapps\.io/), (u) => strong(`Resources loaded from Bubble (${u}).`)),
      when(s.runtime('global:bubble_environment'), () => supporting('A Bubble environment global is present.')),
    ],
  },
  {
    id: 'tilda',
    name: 'Tilda',
    category: 'website-builder',
    clues: (s) => [gen(s, /tilda/i), when(s.url(/tildacdn\.(com|net)|tilda\.ws/), (u) => strong(`Assets loaded from Tilda (${u}).`))],
  },
  {
    id: 'weebly',
    name: 'Weebly / Square Online',
    category: 'website-builder',
    clues: (s) => [gen(s, /weebly/i), when(s.url(/editmysite\.com|weebly\.com/), (u) => strong(`Assets loaded from Weebly (${u}).`))],
  },
  {
    id: 'godaddy',
    name: 'GoDaddy Website Builder',
    category: 'website-builder',
    clues: (s) => [gen(s, /godaddy|starfield/i), when(s.url(/img\d*\.wsimg\.com/), (u) => strong(`Assets loaded from GoDaddy’s builder CDN (${u}).`))],
  },
  {
    id: 'jimdo',
    name: 'Jimdo',
    category: 'website-builder',
    clues: (s) => [gen(s, /jimdo/i), when(s.url(/jimstatic\.com|jimdo(site|free)?\.com/), (u) => strong(`Assets loaded from Jimdo (${u}).`))],
  },
  {
    id: 'carrd',
    name: 'Carrd',
    category: 'website-builder',
    clues: (s) => [gen(s, /carrd/i)],
  },

  // ── E-commerce ──────────────────────────────────────────────────────
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'ecommerce',
    clues: (s) => [
      gen(s, /shopify/i),
      when(s.url(/cdn\.shopify\.com|myshopify\.com|shopifycdn/), (u) => strong(`Assets loaded from Shopify’s CDN (${u}).`)),
      when(s.runtime('global:Shopify'), () => strong('The Shopify storefront object is present.')),
      when(s.classes('shopify-') >= 2, () => strong('Shopify theme sections (“shopify-section”).')),
    ],
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    category: 'ecommerce',
    implies: ['wordpress'],
    clues: (s) => [
      gen(s, /woocommerce/i),
      when(s.url(/\/plugins\/woocommerce\//), (u) => strong(`WooCommerce plugin files (${u}).`)),
      when(s.classes('woocommerce-') >= 2, () => strong('WooCommerce classes on page elements.')),
    ],
  },
  {
    id: 'bigcommerce',
    name: 'BigCommerce',
    category: 'ecommerce',
    clues: (s) => [gen(s, /bigcommerce/i), when(s.url(/bigcommerce\.com/), (u) => strong(`Assets loaded from BigCommerce (${u}).`))],
  },
  {
    id: 'magento',
    name: 'Magento / Adobe Commerce',
    category: 'ecommerce',
    clues: (s) => [
      gen(s, /magento/i),
      when(s.url(/\/static\/version\d+\/frontend\//), (u) => strong(`Magento’s static asset paths (${u}).`)),
      when(s.inline('type:text/x-magento-init'), () => definitive('Magento initialisation scripts (text/x-magento-init).')),
    ],
  },

  // ── Content management systems and their visual builders ───────────
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'cms',
    clues: (s) => [
      gen(s, /^wordpress/i),
      when(s.url(/\/wp-content\//), (u) => strong(`Theme or plugin files under /wp-content/ (${u}).`)),
      when(s.url(/\/wp-includes\//), (u) => strong(`WordPress core files under /wp-includes/ (${u}).`)),
      when(s.url(/\/wp-json\//), () => strong('The WordPress REST API is linked (/wp-json/).')),
      when(s.classes('wp-') >= 3, () => supporting('WordPress block and image classes (“wp-”).')),
      when(s.runtime('global:wp') || s.runtime('global:wpApiSettings'), () => supporting('WordPress’s wp JavaScript object is present.')),
    ],
    version: versionFrom(/^wordpress/i),
  },
  {
    id: 'elementor',
    name: 'Elementor',
    category: 'page-builder',
    implies: ['wordpress'],
    clues: (s) => [
      gen(s, /elementor/i),
      when(s.classes('elementor-') >= 5, () => strong(`${s.classes('elementor-')} elements use Elementor’s classes.`)),
      when(s.url(/\/plugins\/elementor(-pro)?\//), (u) => strong(`Elementor plugin files (${u}).`)),
      when(s.runtime('global:elementorFrontend'), () => strong('Elementor’s front-end runtime is present.')),
    ],
    version: versionFrom(/elementor/i),
  },
  {
    id: 'divi',
    name: 'Divi',
    category: 'page-builder',
    implies: ['wordpress'],
    clues: (s) => [
      when(s.classes('et_') >= 5, () => strong('Divi builder classes (“et_pb_”).')),
      when(s.url(/\/themes\/Divi\/|\/plugins\/divi-builder\//i), (u) => strong(`Divi theme files (${u}).`)),
    ],
  },
  {
    id: 'wpbakery',
    name: 'WPBakery',
    category: 'page-builder',
    implies: ['wordpress'],
    clues: (s) => [gen(s, /wpbakery|visual composer/i), when(s.classes('vc_') >= 5, () => strong('WPBakery row and column classes (“vc_”).'))],
  },
  {
    id: 'beaver',
    name: 'Beaver Builder',
    category: 'page-builder',
    implies: ['wordpress'],
    clues: (s) => [
      when(s.url(/\/bb-plugin\/|\/beaver-builder/), (u) => strong(`Beaver Builder files (${u}).`)),
      when(s.classes('fl-') >= 10, () => supporting('Many “fl-” layout classes (Beaver Builder).')),
    ],
  },
  {
    id: 'bricks',
    name: 'Bricks',
    category: 'page-builder',
    implies: ['wordpress'],
    clues: (s) => [
      when(s.classes('brxe-') >= 3, () => strong('Bricks element classes (“brxe-”).')),
      when(s.url(/\/themes\/bricks\//), (u) => strong(`Bricks theme files (${u}).`)),
    ],
  },
  {
    id: 'oxygen',
    name: 'Oxygen',
    category: 'page-builder',
    implies: ['wordpress'],
    clues: (s) => [when(s.classes('oxy-') >= 3, () => strong('Oxygen builder classes (“oxy-”).')), when(s.url(/\/plugins\/oxygen\//), (u) => strong(`Oxygen plugin files (${u}).`))],
  },
  {
    id: 'drupal',
    name: 'Drupal',
    category: 'cms',
    clues: (s) => [
      gen(s, /drupal/i),
      when(s.attrName(/^data-drupal-/), (a) => strong(`Drupal attributes (${a}).`)),
      when(s.url(/\/sites\/(default|all)\/(files|themes|modules)\/|\/core\/misc\/drupal/), (u) => strong(`Drupal file paths (${u}).`)),
      when(s.runtime('global:Drupal'), () => strong('Drupal’s JavaScript object is present.')),
    ],
    version: versionFrom(/drupal/i),
  },
  {
    id: 'joomla',
    name: 'Joomla',
    category: 'cms',
    clues: (s) => [gen(s, /joomla/i), when(s.url(/\/media\/(jui|system)\/js\//), (u) => strong(`Joomla media paths (${u}).`))],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    category: 'cms',
    clues: (s) => [gen(s, /^ghost/i), when(s.url(/ghost\.io|\/ghost\/api\//), (u) => strong(`Ghost resources (${u}).`))],
    version: versionFrom(/^ghost/i),
  },
  {
    id: 'hubspot-cms',
    name: 'HubSpot CMS',
    category: 'cms',
    clues: (s) => [gen(s, /hubspot/i), when(s.url(/\/hubfs\/|hubspotusercontent/), (u) => strong(`Files hosted by HubSpot CMS (${u}).`))],
  },

  // ── Static site generators ──────────────────────────────────────────
  ...(
    [
      ['hugo', 'Hugo', /^hugo/i],
      ['jekyll', 'Jekyll', /^jekyll/i],
      ['eleventy', 'Eleventy', /^eleventy/i],
      ['hexo', 'Hexo', /^hexo/i],
      ['mkdocs', 'MkDocs', /mkdocs/i],
      ['vitepress', 'VitePress', /^vitepress/i],
      ['vuepress', 'VuePress', /^vuepress/i],
    ] as const
  ).map(
    ([id, name, re]): TechDef => ({
      id,
      name,
      category: 'static-generator',
      implies: id === 'vitepress' || id === 'vuepress' ? ['vue'] : undefined,
      clues: (s) => [gen(s, re)],
      version: versionFrom(re),
    }),
  ),
  {
    id: 'docusaurus',
    name: 'Docusaurus',
    category: 'static-generator',
    implies: ['react'],
    clues: (s) => [gen(s, /docusaurus/i), when(s.runtime('global:__docusaurus') || s.runtime('global:Docusaurus'), () => strong('Docusaurus runtime is present.'))],
    version: versionFrom(/docusaurus/i),
  },

  // ── Application frameworks ──────────────────────────────────────────
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'meta-framework',
    implies: ['react'],
    clues: (s) => [
      when(s.inline('id:__NEXT_DATA__'), () => definitive('Next.js page data script (__NEXT_DATA__).')),
      when(s.inline('global:__next_f') || s.runtime('global:__next_f'), () => definitive('Next.js App Router streaming payload (self.__next_f).')),
      when(s.runtime('global:next') || s.runtime('global:__NEXT_DATA__'), () => definitive('The Next.js runtime is loaded in the page.')),
      when(s.url(/\/_next\/static\//), (u) => strong(`Bundles served from /_next/static/ (${u}).`)),
      when(s.rootId('__next'), () => strong('The page renders into a #__next root.')),
      when(s.tag('next-route-announcer'), () => strong('Next.js route announcer element.')),
    ],
    version: (s) => s.runtimeVersion('next'),
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'meta-framework',
    implies: ['vue'],
    clues: (s) => [
      when(s.inline('id:__NUXT_DATA__') || s.inline('global:__NUXT__'), () => definitive('Nuxt page payload (__NUXT__).')),
      when(s.runtime('global:__NUXT__') || s.runtime('global:$nuxt'), () => definitive('The Nuxt runtime is loaded in the page.')),
      when(s.url(/\/_nuxt\//), (u) => strong(`Bundles served from /_nuxt/ (${u}).`)),
      when(s.rootId('__nuxt'), () => strong('The page renders into a #__nuxt root.')),
    ],
  },
  {
    id: 'gatsby',
    name: 'Gatsby',
    category: 'meta-framework',
    implies: ['react'],
    clues: (s) => [
      gen(s, /^gatsby/i),
      when(s.rootId('___gatsby'), () => definitive('The page renders into Gatsby’s #___gatsby root.')),
      when(s.url(/\/page-data\//), (u) => strong(`Gatsby page data (${u}).`)),
      when(s.runtime('global:___loader') || s.runtime('global:___gatsby'), () => strong('Gatsby’s loader is present.')),
    ],
    version: versionFrom(/^gatsby/i),
  },
  {
    id: 'remix',
    name: 'Remix / React Router',
    category: 'meta-framework',
    implies: ['react'],
    clues: (s) => [
      when(s.inline('global:__remixContext') || s.runtime('global:__remixContext'), () => definitive('Remix route context (__remixContext).')),
      when(s.inline('global:__reactRouterContext'), () => definitive('React Router framework context (__reactRouterContext).')),
      when(s.runtime('global:__remixManifest'), () => strong('Remix route manifest is present.')),
    ],
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    category: 'meta-framework',
    implies: ['svelte'],
    clues: (s) => [
      when(s.inline(/^global:__sveltekit_/) || s.runtime('global:__sveltekit_*'), () => definitive('SvelteKit’s runtime global (__sveltekit_…).')),
      when(s.attrName(/^data-sveltekit-/), (a) => strong(`SvelteKit attributes (${a}).`)),
      when(s.url(/\/_app\/immutable\//), (u) => strong(`Bundles served from /_app/immutable/ (${u}).`)),
    ],
  },
  {
    id: 'astro',
    name: 'Astro',
    category: 'meta-framework',
    clues: (s) => [
      gen(s, /^astro/i),
      when(s.tag('astro-island'), () => definitive('Astro islands (<astro-island>).')),
      when(s.attr('data-astro-cid-*') > 0 || s.attrName(/^data-astro-/), () => strong('Astro scoped-style attributes (data-astro-cid-…).')),
      when(s.url(/\/_astro\//), (u) => strong(`Bundles served from /_astro/ (${u}).`)),
    ],
    version: versionFrom(/^astro/i),
  },
  {
    id: 'qwik',
    name: 'Qwik',
    category: 'meta-framework',
    clues: (s) => [
      when(s.attr('q:container') > 0, () => definitive('Qwik container attribute (q:container).')),
      when(s.runtime('global:qwikloader') || s.runtime('global:Qwik'), () => strong('The Qwik loader is present.')),
    ],
  },
  {
    id: 'react',
    name: 'React',
    category: 'ui-framework',
    clues: (s) => [
      when(s.runtime('dom:react-fiber') || s.runtime('dom:react-root'), () => definitive('React’s internal fiber data is attached to page elements.')),
      when(s.attr('data-reactroot') > 0 || s.attr('data-reactid') > 0, () => definitive('React root markers in the markup (data-reactroot).')),
      when(s.script(/\breact(-dom)?([.-][\w.]*)?\.js$/i), (u) => strong(`React library script (${u}).`)),
      when(s.runtime('global:React') || s.runtime('global:ReactDOM'), () => strong('A global React object is present.')),
      when(s.rootId('root') && !s.raw.runtime, () => supporting('The page renders into a #root element, the default for React apps.')),
    ],
    version: (s) => s.runtimeVersion('react'),
  },
  {
    id: 'vue',
    name: 'Vue',
    category: 'ui-framework',
    clues: (s) => [
      when(s.runtime('dom:vue3-app') || s.runtime('dom:vue2-instance'), () => definitive('A Vue app instance is attached to the page.')),
      when(s.attr('data-v-app') > 0, () => definitive('Vue 3 mount point (data-v-app).')),
      when(s.attr('data-v-*') >= 3, () => strong(`${s.attr('data-v-*')} elements carry Vue scoped-style attributes (data-v-…).`)),
      when(s.runtime('global:__VUE__') || s.runtime('global:Vue'), () => strong('A global Vue object is present.')),
      when(s.script(/\bvue([.-][\w.]*)?\.js$/i), (u) => strong(`Vue library script (${u}).`)),
    ],
    version: (s) => s.runtimeVersion('vue'),
  },
  {
    id: 'angular',
    name: 'Angular',
    category: 'ui-framework',
    clues: (s) => [
      when(s.attr('ng-version') > 0, () => definitive('Angular version attribute on the app root (ng-version).')),
      when(s.attr(/^_ng(content|host)-/) >= 3, () => strong('Angular view-encapsulation attributes (_ngcontent-…).')),
      when(s.runtime('global:getAllAngularRootElements') || s.runtime('dom:angular-context'), () => strong('Angular’s runtime is present.')),
    ],
  },
  {
    id: 'angularjs',
    name: 'AngularJS (1.x)',
    category: 'ui-framework',
    clues: (s) => [
      when(s.attr('ng-app') > 0, () => definitive('AngularJS application attribute (ng-app).')),
      when(s.attr(/^ng-(controller|model|repeat|click|if|show)$/) >= 2, () => strong('AngularJS directives (ng-controller, ng-model…).')),
      when(s.runtime('global:angular'), () => strong('A global angular object is present.')),
    ],
    version: (s) => s.runtimeVersion('angularjs'),
  },
  {
    id: 'svelte',
    name: 'Svelte',
    category: 'ui-framework',
    clues: (s) => [
      when(s.runtime('dom:svelte'), () => definitive('Svelte component data is attached to page elements.')),
      when(s.classes('svelte-') >= 3, () => strong(`${s.classes('svelte-')} elements use Svelte’s scoped “svelte-” classes.`)),
    ],
  },
  {
    id: 'preact',
    name: 'Preact',
    category: 'ui-framework',
    clues: (s) => [when(s.runtime('global:preact'), () => strong('A global preact object is present.')), when(s.runtime('dom:preact'), () => strong('Preact’s virtual DOM data is attached to page elements.'))],
  },
  {
    id: 'solid',
    name: 'Solid',
    category: 'ui-framework',
    clues: (s) => [when(s.runtime('global:_$HY'), () => strong('Solid’s hydration global (_$HY).')), when(s.attr('data-hk') >= 3, () => strong('Solid hydration keys (data-hk).'))],
  },
  {
    id: 'ember',
    name: 'Ember',
    category: 'ui-framework',
    clues: (s) => [when(s.runtime('global:Ember'), () => definitive('The Ember runtime is present.')), when(s.classes('ember-') >= 3, () => strong('Ember view classes (ember-view).'))],
  },
  {
    id: 'lit',
    name: 'Lit / Web Components',
    category: 'ui-framework',
    clues: (s) => [when(s.runtime('global:litHtmlVersions'), () => strong('Lit is loaded in the page.'))],
  },
  {
    id: 'alpine',
    name: 'Alpine.js',
    category: 'library',
    clues: (s) => [when(s.runtime('global:Alpine'), () => definitive('The Alpine.js runtime is present.')), when(s.attr('x-data') >= 2, () => strong('Alpine.js component attributes (x-data).'))],
  },
  {
    id: 'htmx',
    name: 'htmx',
    category: 'library',
    clues: (s) => [when(s.runtime('global:htmx'), () => definitive('The htmx runtime is present.')), when(s.attr(/^hx-(get|post|put|delete|target|swap|trigger)$/) >= 2, () => strong('htmx attributes (hx-get, hx-target…).'))],
  },
  {
    id: 'hotwire',
    name: 'Hotwire (Turbo / Stimulus)',
    category: 'library',
    clues: (s) => [
      when(s.runtime('global:Turbo') || s.tag('turbo-frame'), () => strong('Turbo is present (Turbo global or <turbo-frame>).')),
      when(s.runtime('global:Stimulus'), () => strong('Stimulus is present.')),
      when(s.attr('data-controller') >= 3, () => supporting('Stimulus-style data-controller attributes.')),
    ],
  },
  {
    id: 'livewire',
    name: 'Laravel Livewire',
    category: 'library',
    clues: (s) => [when(s.runtime('global:Livewire'), () => definitive('The Livewire runtime is present.')), when(s.attrName(/^wire:/), (a) => strong(`Livewire attributes (${a}).`))],
  },
  {
    id: 'jquery',
    name: 'jQuery',
    category: 'library',
    clues: (s) => [
      when(s.runtimeVersion('jquery'), (v) => definitive(`jQuery ${v} is loaded in the page.`)),
      when(s.script(/jquery[\w.-]*\.js$/i), (u) => strong(`jQuery script (${u}).`)),
    ],
    version: (s) => s.runtimeVersion('jquery'),
  },

  // ── CSS frameworks ──────────────────────────────────────────────────
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'css-framework',
    clues: (s) => [
      when(s.customProp('--tw-'), () => strong('Tailwind’s internal custom properties (--tw-…).')),
      when(s.url(/tailwind[\w.-]*\.(css|js)$/i), (u) => strong(`Tailwind file (${u}).`)),
    ],
  },
  {
    id: 'bootstrap',
    name: 'Bootstrap',
    category: 'css-framework',
    clues: (s) => [
      when(s.url(/bootstrap[\w.-]*\.(css|js)$/i), (u) => strong(`Bootstrap file (${u}).`)),
      when(s.customProp('--bs-'), () => strong('Bootstrap’s custom properties (--bs-…).')),
    ],
  },
];

/** Most specific first: what the site is built *in* outranks what its pages are rendered *with*. */
const CATEGORY_RANK: Record<TechCategory, number> = {
  'website-builder': 0,
  ecommerce: 1,
  cms: 2,
  'static-generator': 3,
  'meta-framework': 4,
  'ui-framework': 5,
  'page-builder': 6,
  library: 7,
  'css-framework': 8,
};

const STATUS_RANK: Record<DetectionStatus, number> = { confirmed: 0, probable: 1, possible: 2 };

/** Builders whose own runtime is React: React found on their pages is theirs, not a custom app. */
const RUNS_ON_REACT = new Set(['framer', 'wix']);

function statusOf(clues: Clue[]): DetectionStatus | null {
  const n = (s: Strength) => clues.filter((c) => c.strength === s).length;
  if (n('definitive') > 0 || n('strong') >= 2) return 'confirmed';
  if (n('strong') === 1 || n('supporting') >= 2) return 'probable';
  if (n('supporting') === 1) return 'possible';
  return null;
}

const STRENGTH_RANK: Record<Strength, number> = { definitive: 0, strong: 1, supporting: 2 };

/** "cdn.example.com/a/b/c/webflow.8a2c1f.js" → "cdn.example.com/…/webflow.8a2c1f.js": evidence stays readable in a narrow panel. */
export function shortenUrls(text: string): string {
  return text.replace(/\(([^\s()]{40,})\)/g, (_, url: string) => {
    const parts = url.split('/').filter(Boolean);
    return parts.length > 2 ? `(${parts[0]}/…/${parts.at(-1)})` : `(${url})`;
  });
}

function websiteTypeOf(primary: DetectedTechnology | null, all: DetectedTechnology[]): string {
  if (!primary) return 'Unknown';
  switch (primary.category) {
    case 'website-builder':
      return 'No-code / visual development';
    case 'ecommerce':
      return 'Hosted e-commerce platform';
    case 'cms':
      if (all.some((t) => t.category === 'page-builder')) return 'Content management system with a visual page builder';
      return all.some((t) => t.category === 'ecommerce') ? 'Content management system with e-commerce' : 'Content management system';
    case 'static-generator':
      return 'Static site generator';
    case 'meta-framework':
    case 'ui-framework':
      return 'Custom-developed frontend';
    default:
      return 'Custom implementation';
  }
}

function labelOf(primary: DetectedTechnology | null): string {
  if (!primary) return 'Platform';
  if (primary.category === 'static-generator') return 'Generator';
  if (primary.category === 'meta-framework' || primary.category === 'ui-framework' || primary.category === 'library') return 'Framework';
  return 'Platform';
}

export function detectTechnology(snapshot: PageSnapshot): TechnologyAnalysis {
  const raw = snapshot.technology;
  if (!raw) {
    return {
      primary: null,
      primaryLabel: 'Platform',
      confidence: 'low',
      websiteType: 'Unknown',
      reason: 'This capture predates technology detection. Capture the page again to identify it.',
      technologies: [],
      possible: [],
      runtimeInspected: false,
      available: false,
    };
  }

  const customProps = [
    ...Object.keys(snapshot.rendered.rootCustomProperties),
    ...snapshot.authored.customProperties.map((c) => c.name),
  ];
  const signals = new Signals(raw, customProps);

  const found = new Map<string, DetectedTechnology>();
  for (const def of TECHNOLOGIES) {
    const clues = def.clues(signals).filter((c): c is Clue => Boolean(c));
    const status = statusOf(clues);
    if (!status) continue;
    found.set(def.id, {
      id: def.id,
      name: def.name,
      category: def.category,
      status,
      evidence: clues.sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]).map((c) => shortenUrls(c.evidence)),
      version: def.version?.(signals),
    });
  }

  // Implied technologies: React under Next.js, WordPress under Elementor. They inherit the
  // parent's status when they have no stronger evidence of their own.
  const defs = new Map(TECHNOLOGIES.map((d) => [d.id, d]));
  for (const parent of [...found.values()]) {
    if (parent.status === 'possible') continue;
    for (const childId of defs.get(parent.id)?.implies ?? []) {
      const child = found.get(childId);
      const def = defs.get(childId)!;
      const runtimeNote = RUNS_ON_REACT.has(parent.id) && childId === 'react' ? `Part of ${parent.name}’s own runtime, not a separate app.` : `${parent.name} is built on ${def.name}.`;
      if (!child) {
        found.set(childId, { id: childId, name: def.name, category: def.category, status: parent.status, evidence: [runtimeNote], impliedBy: parent.name });
      } else {
        child.impliedBy = parent.name;
        child.evidence = [runtimeNote, ...child.evidence];
        if (STATUS_RANK[parent.status] < STATUS_RANK[child.status]) child.status = parent.status;
      }
    }
  }

  const all = [...found.values()].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.name.localeCompare(b.name),
  );
  const detected = all.filter((t) => t.status !== 'possible');
  const possible = all.filter((t) => t.status === 'possible');

  // The primary result: the most specific category among detected technologies, confirmed beating probable.
  // Libraries, CSS frameworks and page builders describe tooling, not what a site is built with; a store
  // plugin (WooCommerce) yields to the CMS it runs on.
  const candidates = detected.filter((t) => t.category !== 'library' && t.category !== 'css-framework' && t.category !== 'page-builder');
  let primary = [...candidates].sort((a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || STATUS_RANK[a.status] - STATUS_RANK[b.status])[0] ?? null;
  const host = primary && defs.get(primary.id)?.implies?.map((id) => found.get(id)).find((t) => t?.category === 'cms');
  if (host) primary = host;

  const runtimeInspected = raw.runtime !== undefined;
  const technologies = primary ? [primary, ...detected.filter((t) => t !== primary)] : detected;

  let confidence: TechnologyAnalysis['confidence'];
  let reason: string | null = null;
  if (primary) {
    confidence = primary.status === 'confirmed' ? 'high' : 'medium';
    if (primary.status === 'probable') reason = 'One strong indicator was found, but nothing that only this technology produces.';
  } else {
    confidence = 'low';
    const libs = detected.map((t) => t.name);
    reason = [
      'No reliable platform or framework indicators were found.',
      libs.length ? `Only general-purpose tools were detected (${libs.join(', ')}).` : '',
      runtimeInspected ? '' : 'The page’s own scripts couldn’t be inspected, so a client-side framework may have been missed.',
      'The site may be hand-coded or server-rendered, or built with a tool that hides its fingerprints.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    primary,
    primaryLabel: labelOf(primary),
    confidence,
    websiteType: primary ? websiteTypeOf(primary, detected) : 'Unknown / custom implementation suspected',
    reason,
    technologies,
    possible,
    runtimeInspected,
    available: true,
  };
}

/** Plain-text summary in the shape people expect, for reports and copying. */
export function technologySummary(t: TechnologyAnalysis): string {
  const confidence = { high: 'High', medium: 'Medium', low: 'Low' }[t.confidence];
  const lines = ['Website Technology Analysis'];
  if (t.primary) {
    lines.push(`Detected ${t.primaryLabel}: ${t.primary.name}${t.primary.version ? ` ${t.primary.version}` : ''}`);
  } else {
    lines.push('Platform: Unknown / custom implementation suspected');
  }
  lines.push(`Detection Confidence: ${confidence}`, `Website Type: ${t.websiteType}`);
  if (t.primary) {
    lines.push('Evidence:', ...t.primary.evidence.map((e) => `- ${e}`));
  }
  const others = t.technologies.filter((x) => x !== t.primary);
  if (others.length) {
    lines.push('Also detected:', ...others.map((o) => `- ${o.name}${o.version ? ` ${o.version}` : ''} (${o.status}${o.impliedBy ? `, via ${o.impliedBy}` : ''})`));
  }
  if (t.possible.length) lines.push('Possible, not confirmed:', ...t.possible.map((p) => `- ${p.name}: ${p.evidence[0]}`));
  if (t.reason) lines.push(`Reason: ${t.reason}`);
  return lines.join('\n');
}
