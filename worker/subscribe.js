// POST /api/subscribe: adds an email address to When News Meets Product on beehiiv.
// Needs BEEHIIV_PUBLICATION_ID (var) and BEEHIIV_API_KEY (secret).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function reply(request, status, body) {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  if (wantsJson) return Response.json(body, { status });
  // Plain form post without JavaScript: send the reader to a page.
  const to = status < 400 ? '/newsletter/thanks/' : '/newsletter/?error=1';
  return Response.redirect(new URL(to, request.url).href, 303);
}

export async function subscribe(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });

  const form = await request.formData().catch(() => null);
  const email = String(form?.get('email') || '').trim().toLowerCase();
  const source = String(form?.get('source') || '/').slice(0, 200);

  // Honeypot: real people never fill this in. Pretend it worked.
  if (form?.get('website')) return reply(request, 200, { ok: true });
  if (!EMAIL.test(email) || email.length > 254) return reply(request, 400, { error: 'Please enter a valid email address.' });
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
