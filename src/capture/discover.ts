/**
 * Finds the site's main pages from the links on the current one, so several
 * pages can be captured in one go. Navigation and footer links rank first;
 * pages that share a template (two product pages, two blog posts) collapse
 * into one, because a second copy of the same template adds little.
 */

export interface PageLink {
  url: string;
  /** The link's text, for the picker. */
  text: string;
  /** Path with ids replaced, e.g. "/product/:id"; pages with the same template are alternatives. */
  template: string;
  where: 'navigation' | 'footer' | 'page';
}

const SKIP_PATH = /\b(log-?out|sign-?out|delete|remove|unsubscribe)\b/i;
const FILE = /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|docx?|xlsx?|csv)$/i;
const MAX_LINKS = 40;

/** "/product/12345" and "/product/blue-tractor-9" are the same template: "/product/:id". */
export function templateOf(pathname: string): string {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) || /^[0-9a-f-]{16,}$/i.test(s) || (/\d/.test(s) && s.length > 12) ? ':id' : s.toLowerCase()));
  return `/${segments.join('/')}`;
}

function areaOf(a: Element): PageLink['where'] {
  if (a.closest('nav, header, [role="navigation"], [role="banner"]')) return 'navigation';
  if (a.closest('footer, [role="contentinfo"]')) return 'footer';
  return 'page';
}

const RANK: Record<PageLink['where'], number> = { navigation: 0, page: 1, footer: 2 };

export function discoverPages(doc: Document): PageLink[] {
  const here = new URL(doc.location.href);
  const seen = new Map<string, PageLink>();
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let url: URL;
    try {
      url = new URL(a.getAttribute('href')!, here);
    } catch {
      continue;
    }
    if (url.origin !== here.origin || !/^https?:$/.test(url.protocol)) continue;
    if (FILE.test(url.pathname) || SKIP_PATH.test(url.pathname)) continue;
    url.hash = '';
    // Tracking parameters make the same page look different; keep only the path.
    url.search = '';
    if (url.pathname === here.pathname) continue;
    const template = templateOf(url.pathname);
    const text = (a.textContent ?? a.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || url.pathname;
    const where = areaOf(a);
    const existing = seen.get(template);
    if (!existing || RANK[where] < RANK[existing.where]) seen.set(template, { url: url.href, text, template, where });
  }
  return [...seen.values()]
    .sort((x, y) => RANK[x.where] - RANK[y.where] || x.template.split('/').length - y.template.split('/').length)
    .slice(0, MAX_LINKS);
}

/** Suggests up to `limit` pages: different templates, navigation first. */
export function suggestPages(links: PageLink[], limit: number): PageLink[] {
  return links.slice(0, limit);
}
