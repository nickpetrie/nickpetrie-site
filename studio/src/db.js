/**
 * D1 helpers over the `docs` and `log` tables.
 *
 * A "doc" as returned to clients and other modules is `{id, rev, updatedAt, data}`.
 *
 *   getState(env)                          -> {posts:[doc], briefs:[doc], ideas:[doc], buffer:{...status data}}
 *   listDocs(env, collection)              -> [doc]
 *   getDoc(env, collection, id)            -> doc | null
 *   putDoc(env, collection, id, data, who) -> doc            (create only; throws Conflict if it exists)
 *   patchDoc(env, collection, id, rev, set, who)
 *                                          -> doc            (merges `set` into data; a value of
 *                                             {"__delete__":true} removes the key; nested objects are
 *                                             REPLACED, not deep-merged. Conditional on `rev`: throws
 *                                             Conflict (err.status 409, err.doc = current doc) if stale.
 *                                             Pass rev = null/undefined to use whatever rev is stored
 *                                             (server-side writers such as queue.js). Throws NotFound.)
 *   log(env, who, action, collection, docId, detail) -> void (detail may be a string or object; never throws)
 *
 * Errors: HttpError(status, message) -- Conflict and NotFound extend it. api.js turns them into JSON.
 */

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}
export class Conflict extends HttpError {
  constructor(doc, message = 'Conflict: the document changed') {
    super(409, message, { doc });
  }
}
export class NotFound extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

const toDoc = (r) => (r ? { id: r.id, rev: r.rev, updatedAt: r.updated_at, data: JSON.parse(r.data) } : null);

export async function listDocs(env, collection) {
  const { results } = await env.DB.prepare('SELECT id, data, rev, updated_at FROM docs WHERE collection = ? ORDER BY id').bind(collection).all();
  return results.map(toDoc);
}

export async function getState(env) {
  const [posts, briefs, ideas, buffer] = await Promise.all([
    listDocs(env, 'posts'),
    listDocs(env, 'briefs'),
    listDocs(env, 'ideas'),
    getDoc(env, 'buffer', 'status'),
  ]);
  return { posts, briefs, ideas, buffer: buffer ? buffer.data : {}, now: Date.now() };
}

export async function getDoc(env, collection, id) {
  const r = await env.DB.prepare('SELECT id, data, rev, updated_at FROM docs WHERE collection = ? AND id = ?').bind(collection, id).first();
  return toDoc(r);
}

export async function putDoc(env, collection, id, data, who) {
  const now = Date.now();
  try {
    await env.DB.prepare('INSERT INTO docs (collection, id, data, rev, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(collection, id, JSON.stringify(data), now, who || null)
      .run();
  } catch (e) {
    if (/UNIQUE|PRIMARY|constraint/i.test(String(e && (e.message || e)))) {
      throw new Conflict(await getDoc(env, collection, id), 'Already exists');
    }
    throw e;
  }
  await log(env, who, 'create', collection, id, null);
  return { id, rev: 1, updatedAt: now, data };
}

export async function patchDoc(env, collection, id, rev, set, who) {
  const cur = await getDoc(env, collection, id);
  if (!cur) throw new NotFound(`No such document: ${collection}/${id}`);
  if (rev != null && cur.rev !== rev) throw new Conflict(cur);
  const data = { ...cur.data };
  const changed = [];
  for (const [k, v] of Object.entries(set || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.__delete__ === true) delete data[k];
    else data[k] = v;
    changed.push(k);
  }
  const now = Date.now();
  const res = await env.DB.prepare('UPDATE docs SET data = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE collection = ? AND id = ? AND rev = ?')
    .bind(JSON.stringify(data), now, who || null, collection, id, cur.rev)
    .run();
  if (!res.meta || res.meta.changes !== 1) {
    // Lost a race (or rev was stale): report the current document.
    throw new Conflict(await getDoc(env, collection, id));
  }
  await log(env, who, 'patch', collection, id, { fields: changed, rev: cur.rev + 1 });
  return { id, rev: cur.rev + 1, updatedAt: now, data };
}

export async function log(env, who, action, collection, docId, detail) {
  try {
    const d = detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail);
    await env.DB.prepare('INSERT INTO log (at, who, action, collection, doc_id, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), who || null, action, collection || null, docId || null, d)
      .run();
  } catch (e) {
    console.error('log failed', e);
  }
}

export async function latestLog(env, limit = 100) {
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  const { results } = await env.DB.prepare('SELECT at, who, action, collection, doc_id AS docId, detail FROM log ORDER BY at DESC, rowid DESC LIMIT ?').bind(n).all();
  return results;
}
