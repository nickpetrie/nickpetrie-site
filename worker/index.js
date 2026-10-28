// Runs in front of the static site: redirects, the sign-up endpoint, and a few rewrites.
import { resolveRedirect, gonePatterns, rewrites } from './routes.js';
import { subscribe } from './subscribe.js';

const CANONICAL_HOST = 'www.nickpetrie.co';

const redirect = (url, pathname) => {
  const to = new URL(pathname, url);
  to.search = url.search;
  return Response.redirect(to.href, 301);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (url.hostname === 'nickpetrie.co') {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.href, 301);
    }

    if (pathname === '/api/subscribe') return subscribe(request, env);

    if (gonePatterns.some((p) => p.test(pathname))) {
      return new Response('Gone', { status: 410, headers: { 'content-type': 'text/plain' } });
    }

    const target = resolveRedirect(pathname);
    if (target) return redirect(url, target);

    // Pages always end in a slash; anything without a file extension gets one, permanently.
    if (!pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(pathname)) {
      const withSlash = `${pathname}/`;
      return redirect(url, resolveRedirect(withSlash) ?? withSlash);
    }

    if (rewrites[pathname]) {
      const res = await env.ASSETS.fetch(new URL(rewrites[pathname], url));
      const headers = new Headers(res.headers);
      if (pathname === '/rss/') headers.set('content-type', 'application/rss+xml; charset=utf-8');
      return new Response(res.body, { status: res.status, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
