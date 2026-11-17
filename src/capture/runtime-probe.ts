/**
 * Reads framework runtime markers that only exist in the page's own
 * JavaScript world: globals like `window.__NUXT__`, and the expando
 * properties frameworks hang on DOM nodes (`__reactFiber$…`, `__vue_app__`).
 * The capture script runs in the extension's isolated world and can't see
 * either, so the Chrome bridge runs this function with `world: 'MAIN'`.
 *
 * Chrome serialises the function and runs it in the page: it must not refer
 * to anything outside itself. It only reads, and returns plain strings such
 * as "global:__NUXT__" or "version:next:14.2.3".
 */
export function probeRuntime(win: Window = window): string[] {
  const found = new Set<string>();
  const w = win as unknown as Record<string, unknown>;
  // Browsers expose element ids as window properties (window.___gatsby is the #___gatsby div):
  // those are markup, not a runtime, and markup is read elsewhere.
  const isNode = (v: unknown) => typeof v === 'object' && v !== null && typeof (v as Node).nodeType === 'number';
  const isCollection = (v: unknown) => typeof v === 'object' && v !== null && typeof (v as HTMLCollection).item === 'function' && typeof (v as HTMLCollection).namedItem === 'function';
  const has = (name: string) => {
    try {
      const v = w[name];
      return v !== undefined && v !== null && !isNode(v) && !isCollection(v);
    } catch {
      return false;
    }
  };
  const version = (name: string, read: () => unknown) => {
    try {
      const v = read();
      if (typeof v === 'string' && v.length > 0 && v.length < 40) found.add(`version:${name}:${v}`);
    } catch {
      // A getter threw or the shape differs: no version, nothing else lost.
    }
  };

  const GLOBALS = [
    '__NEXT_DATA__', '__next_f', '__NUXT__', '$nuxt', '__VUE__', 'Vue', 'React', 'ReactDOM', 'preact',
    'ng', 'getAllAngularRootElements', 'angular', 'Ember', 'Svelte', '__SVELTEKIT_DATA__', '__remixContext',
    '__remixManifest', '___gatsby', '___loader', '__GATSBY', 'Webflow', 'Shopify', 'wixBiSession', 'wixDevelopersAnalytics',
    'Squarespace', 'wp', 'wpApiSettings', 'elementorFrontend', 'jQuery', 'Alpine', 'htmx', 'Stimulus',
    'Turbo', 'Livewire', 'Drupal', 'Joomla', 'HubSpotConversations', '_hsq', 'Framer', '__framer_importFromPackage',
    'Backbone', 'ko', 'Polymer', 'litHtmlVersions', 'Qwik', 'qwikloader', '__ASTRO__', 'Astro', 'bubble_environment',
    'Ghost', 'Docusaurus', '__docusaurus', 'Solid', '_$HY', 'Inertia',
  ];
  for (const name of GLOBALS) if (has(name)) found.add(`global:${name}`);
  // SvelteKit names its global after a per-build hash: __sveltekit_abc123.
  try {
    for (const key of Object.keys(win)) if (/^__sveltekit_/.test(key)) found.add('global:__sveltekit_*');
  } catch {
    // Some pages make window keys throw; skip.
  }

  // Generic names count only with the shape the framework gives them.
  try {
    const next = w.next as { version?: unknown; router?: unknown } | undefined;
    if (next && (typeof next.version === 'string' || next.router)) found.add('global:next');
    if ((w.Static as { SQUARESPACE_CONTEXT?: unknown } | undefined)?.SQUARESPACE_CONTEXT) found.add('global:Static.SQUARESPACE_CONTEXT');
  } catch {
    // A hostile getter; skip.
  }
  version('next', () => (w.next as { version?: string } | undefined)?.version);
  version('jquery', () => (w.jQuery as { fn?: { jquery?: string } } | undefined)?.fn?.jquery);
  version('vue', () => (w.Vue as { version?: string } | undefined)?.version);
  version('angularjs', () => (w.angular as { version?: { full?: string } } | undefined)?.version?.full);
  version('react', () => (w.React as { version?: string } | undefined)?.version);

  // Framework expandos on DOM nodes: look at likely app roots and a sample of the page.
  const doc = win.document;
  const candidates: Element[] = [];
  for (const sel of ['#root', '#__next', '#app', '#__nuxt', '#___gatsby', '#main', 'body > div']) {
    try {
      candidates.push(...[...doc.querySelectorAll(sel)].slice(0, 5));
    } catch {
      // Invalid in an odd document; skip.
    }
  }
  const all = doc.body ? doc.body.getElementsByTagName('*') : [];
  const step = Math.max(1, Math.floor(all.length / 300));
  for (let i = 0; i < all.length && candidates.length < 400; i += step) candidates.push(all[i]!);
  if (doc.body) candidates.push(doc.body);

  for (const el of candidates) {
    let keys: string[];
    try {
      keys = Object.keys(el);
    } catch {
      continue;
    }
    for (const key of keys) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) found.add('dom:react-fiber');
      else if (key.startsWith('__reactContainer$') || key === '_reactRootContainer') found.add('dom:react-root');
      else if (key === '__vue_app__') {
        found.add('dom:vue3-app');
        version('vue', () => ((el as unknown as Record<string, { version?: string }>).__vue_app__)?.version);
      } else if (key === '__vue__') found.add('dom:vue2-instance');
      else if (key === '__k' || key === '_prevVNode' || key === '__P') found.add('dom:preact');
      else if (key === '__svelte_meta' || key.startsWith('__svelte')) found.add('dom:svelte');
      else if (key === '__ngContext__') found.add('dom:angular-context');
      else if (key.startsWith('jQuery')) found.add('dom:jquery-data');
    }
  }
  return [...found].slice(0, 80);
}
