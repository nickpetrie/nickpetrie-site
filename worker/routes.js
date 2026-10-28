// Every old or alternative URL and where it goes now. Kept in one place so the
// URL check script and the Worker agree. All redirects are permanent (301).
import { pageSlugMap, legacyTagSlugs } from '../scripts/url-map.mjs';

export const exactRedirects = {
  ...Object.fromEntries(Object.entries(pageSlugMap).map(([from, to]) => [`/${from}/`, `/${to}/`])),
  ...Object.fromEntries(legacyTagSlugs.map((t) => [`/tag/${t}/`, '/writing/'])),
  '/sitemap-posts.xml': '/sitemap.xml',
  '/sitemap-pages.xml': '/sitemap.xml',
  '/sitemap-tags.xml': '/sitemap.xml',
  '/sitemap-authors.xml': '/sitemap.xml',
  '/subscribe/': '/newsletter/',
  '/signup/': '/newsletter/',
  '/signin/': '/newsletter/',
  '/feed/': '/rss/',
};

// [pattern, replacement] pairs, tried in order.
export const patternRedirects = [
  [/^\/index\.php\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/, '/$1/'], // the WordPress-era addresses
  [/^\/([^/]+)\/amp\/?$/, '/$1/'],
  [/^\/members\/.*$/, '/newsletter/'],
  [/^\/page\/\d+\/?$/, '/writing/'],
  [/^\/(tag|author)\/([^/]+)\/page\/\d+\/?$/, '/$1/$2/'],
  [/^\/(tag|author)\/[^/]+\/rss\/?$/, '/rss/'],
];

// Ghost-only machinery: tell crawlers it's gone for good.
export const gonePatterns = [/^\/ghost(\/|$)/, /^\/email\//, /^\/r\//, /^\/webmentions\//, /^\/p\/[0-9a-f-]{36}\/?$/, /^\/\.ghost\//];

// Served from a different file without changing the address.
export const rewrites = {
  '/rss/': '/rss.xml',
  '/sitemap.xml': '/sitemap-index.xml',
};

export function resolveRedirect(pathname) {
  if (exactRedirects[pathname]) return exactRedirects[pathname];
  for (const [pattern, to] of patternRedirects) {
    if (pattern.test(pathname)) {
      const target = pathname.replace(pattern, to);
      return exactRedirects[target] ?? target;
    }
  }
  return null;
}
