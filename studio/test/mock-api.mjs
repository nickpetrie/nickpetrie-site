// Local stand-in for the Studio worker: serves web/ and the /api endpoints in CONTRACT.md from
// in-memory copies of the JSON files in the scratchpad's chk3/ folder (real posts, briefs, ideas).
//
//   node studio/test/mock-api.mjs [--port 8123] [--data <dir>] [--room]
//
// By default six extra booked posts fill Buffer (10 of 10) and a few extra posts show the other
// states (waiting with a deadline warning, Claude is on it, posted with numbers, saved, removed).
// --room leaves Buffer with free space instead. POST /__mock/touch/<postId> bumps a post's rev, as if
// Claude had changed it, so the 409 handling can be tried. POST /__mock/reset puts the data back.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, '..', 'web');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const PORT = Number(opt('--port', 8123));
const DATA = opt('--data', '/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/chk3');
const ROOM = args.includes('--room');
const LIMIT = 10;
const DEL = '__delete__';

let db, media, logRows;
const load = (c) => {
  const dir = join(DATA, c);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.slice(0, -5), data: JSON.parse(readFileSync(join(dir, f), 'utf8')) })) : [];
};
const doc = (id, data) => ({ id, rev: 1, updatedAt: Date.now(), data });

function reset() {
  media = new Map(); logRows = [];
  db = { posts: new Map(), briefs: new Map(), ideas: new Map(), buffer: new Map(), config: new Map() };
  for (const c of ['posts', 'briefs', 'ideas']) for (const x of load(c)) db[c].set(x.id, doc(x.id, x.data));
  const P = (id) => db.posts.get(id).data;
  const clone = (id, newId, over) => {
    const d = JSON.parse(JSON.stringify(P(id)));
    db.posts.set(newId, doc(newId, { ...d, ...over }));
  };
  // Waiting in the holding queue: one with a deadline Buffer can't meet, one without.
  Object.assign(P('2026-11-10-birth-partner'), { status: 'approved', queuePos: 2, approvedVersion: 1, approvedImage: P('2026-11-10-birth-partner').imageUrl, approvedCaption: P('2026-11-10-birth-partner').caption });
  clone('2026-11-05-look-forward', '2026-11-05-last-chance-tickets', {
    title: 'Last chance for brunch tickets', status: 'approved', queuePos: 1, briefId: '6lkuqgtdzd6uy76jm1sw', deadline: '2026-11-07T23:59:00+00:00', version: 1, history: [], changeNote: undefined,
    approvedVersion: 1, approvedImage: P('2026-11-05-look-forward').imageUrl, approvedCaption: P('2026-11-05-look-forward').caption,
    fitWarning: { deadline: '2026-11-07T23:59:00+00:00', reason: "Won't go out before Sat 7 Nov: no free Buffer slot" },
  });
  // Asked for changes.
  Object.assign(P('2026-10-31-website-e-story'), { status: 'changes', feedback: { picks: ['Different colours'], note: 'Try the peach one', at: Date.now() - 600000, version: 1 }, reviewedAt: Date.now() - 600000 });
  // Posted, with and without numbers.
  clone('2026-11-12-review-amy', '2026-10-23-breathe-in-for-four', { title: 'Breathe in for four', kind: 'reel', status: 'posted', scheduledFor: '2026-10-23T18:00:00+00:00', metrics: { at: Date.now() - 86400000, reach: 280, views: 312, reactions: 14, comments: 2, shares: 3, saves: 5 }, briefId: undefined, deadline: undefined, changeNote: undefined, version: 1 });
  clone('2026-11-03-feel-calm', '2026-10-20-example-post', { title: 'Example post', status: 'posted', scheduledFor: '2026-10-20T19:30:00+00:00', changeNote: undefined, version: 1 });
  clone('2026-11-08-relaxation-classes', '2026-10-15-saved-classes', { title: 'Classes, the evening version', status: 'saved', changeNote: undefined, version: 1 });
  clone('2026-11-06-mum-club-d-story', '2026-11-01-brunch-option-d', { title: 'Brunch option D: reel', status: 'removed', kind: 'reel', changeNote: undefined, version: 1 });
  if (!ROOM) {
    const fill = [['2026-11-01T22:42:00+00:00', '2026-11-12-review-amy'], ['2026-11-02T20:05:00+00:00', '2026-11-05-look-forward'], ['2026-11-03T19:20:00+00:00', '2026-11-03-feel-calm'],
      ['2026-11-05T10:45:00+00:00', '2026-11-08-relaxation-classes'], ['2026-11-06T07:29:00+00:00', '2026-11-04-mum-club-reminder'], ['2026-11-07T22:06:00+00:00', '2026-11-12-review-amy']];
    fill.forEach(([t, from], i) => clone(from, `2026-10-31-booked-${i + 1}`, { status: 'scheduled', scheduledFor: t, bufferId: `b${i}`, title: P(from).title + (i === 5 ? ' (again)' : ''), briefId: undefined, deadline: undefined, changeNote: undefined, version: 1, approvedVersion: 1, approvedImage: P(from).imageUrl, approvedCaption: P(from).caption }));
  }
  for (const d of db.posts.values()) if (d.data.status === 'scheduled' && !d.data.bufferId) d.data.bufferId = 'b-' + d.id;
  refreshBuffer();
}

const slots = { fri: '07:29', mon: '20:05', sat: '22:06', sun: '22:42', thu: '10:45', tue: '19:20', wed: '18:01' };
function refreshBuffer() {
  const dueAts = [...db.posts.values()].filter((d) => d.data.status === 'scheduled' && d.data.scheduledFor).map((d) => new Date(d.data.scheduledFor).toISOString()).sort();
  const waiting = [...db.posts.values()].filter((d) => d.data.status === 'approved' && !d.data.bufferId).length;
  const used = dueAts.length;
  db.buffer.set('status', doc('status', { limit: LIMIT, used, free: Math.max(0, LIMIT - used), dueAts, slots, waiting, checkedAt: new Date().toISOString() }));
}
function orderQueue() {
  const list = [...db.posts.values()].filter((x) => x.data.status === 'approved' && !x.data.bufferId).sort((a, b) => (a.data.queuePos ?? 1e9) - (b.data.queuePos ?? 1e9));
  return list;
}
function nextFreeSlot() {
  const taken = new Set([...db.posts.values()].filter((d) => d.data.status === 'scheduled').map((d) => new Date(d.data.scheduledFor).getTime()));
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  for (let i = 0; i < 60; i++) {
    const day = new Date(Date.now() + i * 864e5);
    const t = slots[days[day.getUTCDay()]]; if (!t) continue;
    const at = new Date(`${day.toISOString().slice(0, 10)}T${t}:00Z`).getTime();
    if (at > Date.now() && !taken.has(at)) return new Date(at).toISOString();
  }
}
function place(id) {
  const d = db.posts.get(id);
  const used = [...db.posts.values()].filter((x) => x.data.status === 'scheduled').length;
  if (used < LIMIT) { Object.assign(d.data, { status: 'scheduled', bufferId: 'b-' + id, scheduledFor: nextFreeSlot() }); delete d.data.queuePos; }
  else if (d.data.queuePos == null) d.data.queuePos = Math.max(0, ...orderQueue().map((x) => x.data.queuePos ?? 0)) + 1;
  bump(d);
  refreshBuffer();
}
const bump = (d) => { d.rev += 1; d.updatedAt = Date.now(); };
const apply = (data, set) => { for (const [k, v] of Object.entries(set)) { if (v && typeof v === 'object' && v[DEL] === true) delete data[k]; else data[k] = v; } };

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => ok(Buffer.concat(c))); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2' };

async function api(req, res, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts, m = req.method;
  const delay = Number(opt('--delay', 0)); if (delay) await new Promise((r) => setTimeout(r, delay));
  if (a === 'me') return json(res, 200, { email: 'shannon@birthbyyou.com', admin: false });
  if (a === 'state') {
    const all = (c) => [...db[c].values()];
    return json(res, 200, { posts: all('posts'), briefs: all('briefs'), ideas: all('ideas'), buffer: db.buffer.get('status').data, now: Date.now() });
  }
  if (a === 'buffer') return json(res, 200, db.buffer.get('status').data);
  if (a === 'docs' && parts.length === 3) {
    const coll = db[b]; if (!coll) return json(res, 404, { error: 'Unknown collection' });
    const cur = coll.get(c);
    if (m === 'GET') return cur ? json(res, 200, cur) : json(res, 404, { error: 'Not found' });
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (m === 'PUT') {
      if (cur) return json(res, 409, { error: 'Exists', doc: cur });
      const d = doc(c, body.data); coll.set(c, d); return json(res, 200, d);
    }
    if (m === 'PATCH') {
      if (!cur) return json(res, 404, { error: 'Not found' });
      if (cur.rev !== body.rev) return json(res, 409, { error: 'Changed since you read it', doc: cur });
      apply(cur.data, body.set); bump(cur); refreshBuffer(); return json(res, 200, cur);
    }
  }
  if (a === 'upload' && m === 'POST') {
    const name = url.searchParams.get('name') || '';
    if (!/^[a-z0-9-]+-v[0-9]+[a-z]?(-s[0-9]+)?\.(png|jpg)$/.test(name)) return json(res, 400, { error: 'Bad file name' });
    if (media.has(name)) return json(res, 409, { error: 'A file with that name already exists' });
    const type = (req.headers['content-type'] || '').split(';')[0];
    media.set(name, { bytes: await readBody(req), type });
    return json(res, 200, { url: `http://localhost:${PORT}/mockmedia/${name}` });
  }
  if (a === 'posts' && parts.length === 3 && m === 'POST') {
    const d = db.posts.get(b); if (!d) return json(res, 404, { error: 'No such post' });
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (d.rev !== body.rev) return json(res, 409, { error: 'Changed since you read it', doc: d });
    if (c === 'approve') {
      if (body.version !== d.data.version) return json(res, 409, { error: 'Version is no longer current', doc: d });
      Object.assign(d.data, { status: 'approved', approvedAt: Date.now(), approvedVersion: d.data.version, approvedImage: d.data.imageUrl, approvedCaption: d.data.captionEdit || d.data.caption || '', reviewedAt: Date.now() });
      if (d.data.kind === 'carousel') d.data.approvedSlides = d.data.slideUrls;
      bump(d); place(b); return json(res, 200, d);
    }
    if (c === 'unapprove' || c === 'pull') {
      Object.assign(d.data, { status: 'review', reviewedAt: Date.now() });
      for (const k of ['queuePos', 'bufferId', 'scheduledFor', 'scheduledAt']) delete d.data[k];
      bump(d); refreshBuffer(); return json(res, 200, d);
    }
  }
  if (a === 'queue' && m === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (b === 'order') { body.ids.forEach((id, i) => { const d = db.posts.get(id); if (d) { d.data.queuePos = i + 1; d.data.queueManual = true; bump(d); } }); return json(res, 200, { ok: true }); }
    if (b === 'make-room') {
      const out = db.posts.get(body.swapOutId), inn = db.posts.get(body.postId);
      if (!out || !inn) return json(res, 404, { error: 'No such post' });
      const when = out.data.scheduledFor;
      Object.assign(out.data, { status: 'approved', queuePos: 0, queueManual: true }); delete out.data.bufferId; delete out.data.scheduledFor; bump(out);
      Object.assign(inn.data, { status: 'scheduled', bufferId: 'b-' + inn.id, scheduledFor: when }); delete inn.data.queuePos; delete inn.data.fitWarning; bump(inn);
      refreshBuffer(); return json(res, 200, { ok: true, booked: { id: inn.id, scheduledFor: when }, bumped: out.id });
    }
  }
  if (a === 'share' && m === 'POST') return json(res, 200, { url: 'https://birthbyyou.com/preview/mock-token.signature', expires: Date.now() + 3 * 864e5 });
  return json(res, 404, { error: 'No such endpoint' });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/__mock/reset') { reset(); return json(res, 200, { ok: true }); }
    if (url.pathname.startsWith('/__mock/touch/')) { const d = db.posts.get(url.pathname.split('/').pop()); d.data.changeNote = 'Claude tweaked this a moment ago.'; bump(d); return json(res, 200, d); }
    if (url.pathname.startsWith('/__mock/media')) return json(res, 200, [...media.keys()]);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/mockmedia/')) {
      const f = media.get(url.pathname.split('/').pop()); if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': f.type, 'access-control-allow-origin': '*' }); return res.end(f.bytes);
    }
    let path = join(WEB, decodeURIComponent(url.pathname));
    if (!path.startsWith(WEB)) { res.writeHead(403); return res.end(); }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(path));
  } catch (e) { console.error(e); json(res, 500, { error: String(e) }); }
}).listen(PORT, () => console.log(`Studio mock on http://localhost:${PORT}`));
reset();
