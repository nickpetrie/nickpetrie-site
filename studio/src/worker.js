// Studio worker entry: /api/* -> api.js; /p/<file> -> public post images and PDFs (Buffer fetches these, so
// Cloudflare Access lets /p/ through); everything else -> the screens in R2 (studio-web/, uploaded by
// deploy.mjs); cron -> queue.js runCron.
import { handleApi } from './api.js';

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json',
  svg: 'image/svg+xml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

// Pages, scripts and styles are re-checked on every load so a deploy shows at once; fonts and photos are cached.
async function serveWeb(pathname, env) {
  const path = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  if (path.includes('..')) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get('studio-web/' + path);
  if (!obj) return new Response('Not found', { status: 404 });
  const ext = path.split('.').pop().toLowerCase();
  const fresh = ['html', 'js', 'css', 'json'].includes(ext);
  return new Response(obj.body, { headers: {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': fresh ? 'no-cache' : 'public, max-age=86400',
    'x-robots-tag': 'noindex',
  } });
}

// Names are never reused, so these are cached for a year.
const MEDIA_NAME = /^[a-z0-9-]+-v[0-9]+[a-z]?(-s[0-9]+)?\.(png|jpg|pdf)$/;
async function serveMedia(name, request, env) {
  if (!MEDIA_NAME.test(name) || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(name);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: {
    'content-type': obj.httpMetadata?.contentType || TYPES[name.split('.').pop()] || 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-robots-tag': 'noindex',
  } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/p/')) return serveMedia(decodeURIComponent(url.pathname.slice(3)), request, env);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    return serveWeb(url.pathname, env);
  },

  async scheduled(event, env, ctx) {
    try {
      const { runCron } = await import('./queue.js');
      const { weeklyBackup } = await import('./backup.js');
      const saved = await weeklyBackup(env, event.scheduledTime).catch((e) => ({ error: e.message }));
      if (saved) console.log('backup', JSON.stringify(saved));
      const report = await runCron(env);
      console.log('cron ok', JSON.stringify(report));
    } catch (e) {
      console.error('cron failed', e && e.stack ? e.stack : e);
    }
  },
};
