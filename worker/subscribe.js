// POST /api/subscribe: adds an email address to When News Meets Product on beehiiv.
// Needs BEEHIIV_PUBLICATION_ID (var) and BEEHIIV_API_KEY (secret). With TURNSTILE_SECRET set, the
// form's Cloudflare Turnstile token must check out too (unless TURNSTILE_MODE is "log").
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function reply(request, status, body) {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  if (wantsJson) return Response.json(body, { status });
  // Plain form post without JavaScript: send the reader to a page.
  const to = status < 400 ? '/newsletter/thanks/' : '/newsletter/?error=1';
  return Response.redirect(new URL(to, request.url).href, 303);
}

async function human(token, request, env) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', String(token));
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const out = await res.json();
    if (!out.success) console.warn('turnstile failed', JSON.stringify(out['error-codes'] || []));
    return out.success === true;
  } catch (e) {
    console.error('turnstile unreachable', e);
    return false;
  }
}

export async function subscribe(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });

  const form = await request.formData().catch(() => null);
  const email = String(form?.get('email') || '').trim().toLowerCase();
  const source = String(form?.get('source') || '/').slice(0, 200);

  // Honeypot: real people never fill this in. Pretend it worked.
  if (form?.get('website')) return reply(request, 200, { ok: true });
  if (!EMAIL.test(email) || email.length > 254) return reply(request, 400, { error: 'Please enter a valid email address.' });
  if (env.TURNSTILE_SECRET) {
    const ok = await human(form.get('cf-turnstile-response'), request, env);
    // TURNSTILE_MODE "log" checks and records the result without blocking anyone (for trying it out).
    console.log('turnstile', JSON.stringify({ ok, mode: env.TURNSTILE_MODE || 'enforce' }));
    if (!ok && env.TURNSTILE_MODE !== 'log') {
      return reply(request, 403, { error: 'We couldn\'t check you\'re not a bot. Please reload the page and try again.' });
    }
  }
  if (!env.BEEHIIV_API_KEY || !env.BEEHIIV_PUBLICATION_ID) return reply(request, 503, { error: 'Sign-up is not available right now.' });

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUBLICATION_ID}/subscriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.BEEHIIV_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      reactivate_existing: false,
      send_welcome_email: true,
      utm_source: 'nickpetrie.co',
      utm_medium: 'website',
      utm_campaign: source,
      referring_site: new URL(source, 'https://www.nickpetrie.co').href,
    }),
  });

  if (!res.ok) {
    console.error('beehiiv subscribe failed', res.status, await res.text().catch(() => ''));
    return reply(request, 502, { error: 'Something went wrong. Please try again.' });
  }
  return reply(request, 200, { ok: true });
}
