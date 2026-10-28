// Studio JSON API. See ../CONTRACT.md for the table of endpoints.
import { authenticate } from './auth.js';
import { HttpError, Conflict, NotFound, getState, getDoc, putDoc, patchDoc, log, latestLog } from './db.js';
import { place, unbook, reorder, makeRoom, runCron } from './queue.js';
import { jpegsToPdf } from './pdf.js';

const COLLECTIONS = new Set(['posts', 'briefs', 'ideas', 'buffer', 'config']);
const UPLOAD_NAME = /^[a-z0-9-]+-v[0-9]+[a-z]?(-s[0-9]+)?\.(png|jpg)$/;
const ID = /^[A-Za-z0-9._-]{1,120}$/;
const MAX_UPLOAD = 8 * 1024 * 1024;

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const bad = (msg) => new HttpError(400, msg);

async function readJson(request) {
  try {
    const b = await request.json();
    if (!b || typeof b !== 'object') throw 0;
    return b;
  } catch {
    throw bad('Body must be a JSON object');
  }
}
const needRev = (b) => {
  if (!Number.isInteger(b.rev)) throw bad('rev (integer) is required');
  return b.rev;
};
const checkColl = (c) => {
  if (!COLLECTIONS.has(c)) throw new NotFound(`Unknown collection: ${c}`);
};
const checkId = (id) => {
  if (!ID.test(id)) throw bad('Bad id');
};

export async function handleApi(request, env, ctx) {
  const auth = await authenticate(request, env);
  if (auth instanceof Response) return auth;
  try {
    return await route(request, env, auth);
  } catch (e) {
    if (e instanceof HttpError) return reply({ error: e.message, ...(e.doc ? { doc: e.doc } : {}) }, e.status);
    console.error('api error', e && e.stack ? e.stack : e);
    return reply({ error: 'Something went wrong on the server' }, 500);
  }
}

async function route(request, env, me) {
  const url = new URL(request.url);
  const m = request.method;
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  const who = me.email;

  if (a === 'me' && m === 'GET' && parts.length === 1) return reply({ email: me.email, admin: me.admin });
  if (a === 'state' && m === 'GET' && parts.length === 1) return reply(await getState(env));

  if (a === 'docs' && b && c && parts.length === 3) {
    checkColl(b);
    checkId(c);
    if (m === 'GET') {
      const d = await getDoc(env, b, c);
      if (!d) throw new NotFound();
      return reply(d);
    }
    if (m === 'PATCH') {
      const body = await readJson(request);
      if (!body.set || typeof body.set !== 'object' || Array.isArray(body.set)) throw bad('set (object) is required');
      return reply(await patchDoc(env, b, c, needRev(body), body.set, who));
    }
    if (m === 'PUT') {
      const body = await readJson(request);
      if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw bad('data (object) is required');
      return reply(await putDoc(env, b, c, body.data, who));
    }
    throw new HttpError(405, 'Method not allowed');
  }

  if (a === 'upload' && m === 'POST' && parts.length === 1) return upload(request, env, url, who);

  if (a === 'posts' && b && c && m === 'POST' && parts.length === 3) {
    checkId(b);
    return postAction(request, env, b, c, who);
  }

  if (a === 'queue' && m === 'POST' && parts.length === 2) {
    const body = await readJson(request);
    if (b === 'order') {
      if (!Array.isArray(body.ids) || !body.ids.every((x) => typeof x === 'string')) throw bad('ids (array of post ids) is required');
      const r = await reorder(env, body.ids);
      await log(env, who, 'queue-order', 'posts', null, { ids: body.ids });
      return reply({ ok: true, ...(r && typeof r === 'object' ? r : {}) });
    }
    if (b === 'make-room') {
      if (typeof body.postId !== 'string' || typeof body.swapOutId !== 'string') throw bad('postId and swapOutId are required');
      const r = await makeRoom(env, body.postId, body.swapOutId);
      await log(env, who, 'make-room', 'posts', body.postId, { swapOutId: body.swapOutId });
      return reply({ ok: true, ...(r && typeof r === 'object' ? r : {}) });
    }
  }


  if (a === 'buffer' && m === 'GET' && parts.length === 1) {
    const d = await getDoc(env, 'buffer', 'status');
    return reply(d ? d.data : { limit: 10, used: 0, free: 10, dueAts: [], slots: {}, waiting: 0, checkedAt: null });
  }

  if (a === 'admin') {
    if (!me.admin) throw new HttpError(403, 'Admins only');
    if (b === 'sync' && m === 'POST' && parts.length === 2) {
      const report = await runCron(env);
      await log(env, who, 'admin-sync', null, null, null);
      return reply(report ?? { ok: true });
    }
    if (b === 'log' && m === 'GET' && parts.length === 2) return reply(await latestLog(env, url.searchParams.get('limit')));
  }

  throw new NotFound('No such endpoint');
}

async function upload(request, env, url, who) {
  const name = url.searchParams.get('name') || '';
  if (!UPLOAD_NAME.test(name)) throw bad('Bad file name. Use e.g. feel-calm-v2.jpg, feel-calm-v2-s1.png');
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'image/png' && type !== 'image/jpeg') throw bad('Content type must be image/png or image/jpeg');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD) throw new HttpError(413, 'Image is over 8 MB');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw bad('Empty body');
  if (bytes.byteLength > MAX_UPLOAD) throw new HttpError(413, 'Image is over 8 MB');
  if (await env.MEDIA.head(name)) throw new HttpError(409, 'A file with that name already exists; names are never reused');
  // Stored as sent (no PNG to JPEG conversion in the worker).
  await env.MEDIA.put(name, bytes, { httpMetadata: { contentType: type } });
  await log(env, who, 'upload', null, null, { name, bytes: bytes.byteLength });
  return reply({ url: env.MEDIA_BASE + name });
}

async function postAction(request, env, id, action, who) {
  if (!['approve', 'unapprove', 'pull'].includes(action)) throw new NotFound('No such endpoint');
  const body = await readJson(request);
  const rev = needRev(body);
  const doc = await getDoc(env, 'posts', id);
  if (!doc) throw new NotFound('No such post');
  if (doc.rev !== rev) throw new Conflict(doc);
  const d = doc.data;

  if (action === 'approve') {
    if (!Number.isInteger(body.version)) throw bad('version (integer) is required');
    if (body.version !== d.version) throw new Conflict(doc, `Version ${body.version} is no longer current (now ${d.version})`);
    if (d.status === 'removed' || d.status === 'posted') throw bad(`Can't approve a post that is ${d.status}`);
    if (d.kind !== 'text' && !d.imageUrl) throw bad('Post has no image yet');
    const now = Date.now();
    const set = {
      status: 'approved',
      approvedAt: now,
      approvedVersion: d.version,
      approvedImage: d.imageUrl || null,
      approvedCaption: d.captionEdit || d.caption || '',
      reviewedAt: now,
      reviewedBy: who,
    };
    if (d.kind === 'carousel') {
      if (!Array.isArray(d.slideUrls) || !d.slideUrls.length) throw bad('Carousel has no slides yet');
      set.approvedSlides = d.slideUrls;
      set.approvedDocument = await carouselPdf(env, id, d.version, d.slideUrls);
    }
    await patchDoc(env, 'posts', id, rev, set, who);
    const result = await place(env, id);
    await log(env, who, 'approve', 'posts', id, { version: d.version, result });
    return reply(await getDoc(env, 'posts', id));
  }

  // unapprove / pull: take it out of Buffer if booked, then back to review.
  const result = await unbook(env, id);
  const del = { __delete__: true };
  const fresh = await getDoc(env, 'posts', id); // unbook may have changed the doc
  const out = await patchDoc(env, 'posts', id, fresh.rev, { status: 'review', reviewedAt: Date.now(), reviewedBy: who, queuePos: del, bufferId: del, scheduledFor: del, scheduledAt: del }, who);
  await log(env, who, action, 'posts', id, result);
  return reply(out);
}

/** The approved slides as one PDF in the media bucket (LinkedIn takes a carousel as a document). */
async function carouselPdf(env, id, version, slideUrls) {
  const name = `${id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-v${version}.pdf`;
  if (await env.MEDIA.head(name)) return env.MEDIA_BASE + name;
  const jpegs = [];
  for (const url of slideUrls) {
    const key = String(url).startsWith(env.MEDIA_BASE) ? url.slice(env.MEDIA_BASE.length) : String(url).split('/').pop();
    const obj = await env.MEDIA.get(key);
    if (!obj) throw bad(`Slide ${key} is missing from the media bucket`);
    jpegs.push(new Uint8Array(await obj.arrayBuffer()));
  }
  await env.MEDIA.put(name, jpegsToPdf(jpegs), { httpMetadata: { contentType: 'application/pdf' } });
  return env.MEDIA_BASE + name;
}
