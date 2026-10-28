/**
 * Cloudflare Access JWT verification (RS256).
 *   authenticate(request, env) -> {email, admin} | Response (401 JSON)
 * With env.DEV_EMAIL set (local dev only) verification is skipped.
 */
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (o) => JSON.parse(new TextDecoder().decode(b64(o)));
const deny = (message) => new Response(JSON.stringify({ error: message }), { status: 401, headers: { 'content-type': 'application/json' } });

let jwks = null; // {at, keys: Map<kid, CryptoKey>}
const TTL = 60 * 60 * 1000;

async function loadKeys(env) {
  const res = await fetch(`https://${env.ACCESS_TEAM}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  const map = new Map();
  for (const jwk of keys || []) {
    if (jwk.kty !== 'RSA') continue;
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  jwks = { at: Date.now(), keys: map };
  return map;
}

async function keyFor(env, kid) {
  if (jwks && Date.now() - jwks.at < TTL && jwks.keys.has(kid)) return jwks.keys.get(kid);
  // Unknown kid or stale cache: refetch (at most once a minute for unknown kids).
  if (!jwks || Date.now() - jwks.at > 60 * 1000 || Date.now() - jwks.at >= TTL) await loadKeys(env);
  return jwks.keys.get(kid);
}

// Gmail ignores dots in the name part, so nicholas.petrie@ and nicholaspetrie@ are one person.
const canon = (e) => { const [u, d] = String(e || '').toLowerCase().split('@'); return d === 'gmail.com' ? `${u.replace(/\./g, '')}@${d}` : `${u}@${d}`; };
const sameEmail = (a, b) => canon(a) === canon(b);

export async function authenticate(request, env) {
  if (env.DEV_EMAIL) return { email: env.DEV_EMAIL, admin: sameEmail(env.DEV_EMAIL, env.ADMIN_EMAIL) };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return deny('Not signed in');
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return deny('Bad token');
    const header = json(h);
    if (header.alg !== 'RS256') return deny('Bad token');
    const key = await keyFor(env, header.kid);
    if (!key) return deny('Unknown signing key');
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return deny('Bad signature');
    const c = json(p);
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(env.ACCESS_AUD)) return deny('Wrong audience');
    if (c.iss !== `https://${env.ACCESS_TEAM}`) return deny('Wrong issuer');
    const now = Date.now() / 1000;
    if (typeof c.exp !== 'number' || c.exp < now) return deny('Token expired');
    if (typeof c.nbf === 'number' && c.nbf > now + 60) return deny('Token not yet valid');
    if (!c.email) return deny('No email in token');
    const email = String(c.email).toLowerCase();
    return { email, admin: sameEmail(email, env.ADMIN_EMAIL) };
  } catch (e) {
    console.error('auth error', e);
    return deny('Could not verify sign-in');
  }
}
