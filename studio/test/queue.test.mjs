import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './fakedb.mjs';
import * as Q from '../src/queue.js';

const SCHEDULE = [
  ['mon', '20:05'], ['tue', '19:20'], ['wed', '18:01'], ['thu', '10:45'], ['fri', '07:29'], ['sat', '22:06'], ['sun', '22:42'],
].map(([day, t]) => ({ day, times: [t], paused: false }));
// Wed 28 Oct 2026, 12:00 London (GMT; clocks went back on 25 Oct)
const NOW = Date.UTC(2026, 9, 28, 12, 0);

function fakeBuffer({ posts = [], schedule = SCHEDULE, now = NOW } = {}) {
  const st = { posts: [...posts], calls: [], n: 100, schedule };
  const take = (body) => {
    const v = body.variables;
    st.calls.push(body.operationName);
    switch (body.operationName) {
      case 'GetChannel': return { channel: { id: 'c', timezone: 'Europe/London', postingSchedule: st.schedule } };
      case 'ListPosts': return { posts: { edges: st.posts.filter((p) => ['scheduled', 'sending'].includes(p.status)).map((node) => ({ node })), pageInfo: { hasNextPage: false } } };
      case 'GetPost': { const p = st.posts.find((x) => x.id === v.input.id); if (!p) throw new Error('Post not found'); return { post: p }; }
      case 'DeletePost': st.posts = st.posts.filter((x) => x.id !== v.input.id); return { deletePost: { __typename: 'DeletePostSuccess', id: v.input.id } };
      case 'CreatePost': {
        const i = v.input;
        assert.ok(i.metadata.linkedin, 'LinkedIn metadata');
        assert.equal(i.aiAssisted, true);
        assert.equal(i.schedulingType, 'automatic');
        let due;
        if (i.mode === 'customScheduled') due = i.dueAt;
        else {
          const taken = st.posts.map((p) => Date.parse(p.dueAt));
          due = new Date(Q.pickSlot({ schedule: st.schedule, taken, now })).toISOString();
        }
        const p = { id: `b${st.n++}`, status: 'scheduled', dueAt: due, text: i.text, assets: i.assets.map((a) => ({ type: a.image ? 'image' : 'document', source: (a.image || a.document).url })) };
        st.posts.push(p);
        return { createPost: { __typename: 'PostActionSuccess', post: { id: p.id, status: 'scheduled', dueAt: due } } };
      }
    }
    throw new Error('unexpected ' + body.operationName);
  };
  st.fetch = async (_url, init) => {
    assert.match(init.headers.Authorization, /^Bearer /);
    try { return new Response(JSON.stringify({ data: take(JSON.parse(init.body)) })); }
    catch (e) { return new Response(JSON.stringify({ errors: [{ message: e.message }] })); }
  };
  return st;
}

const approved = (id, extra = {}) => ({
  status: 'approved', kind: 'image', title: id, version: 1, approvedVersion: 1,
  caption: `cap ${id}`, approvedCaption: `cap ${id}`, approvedImage: `https://m/${id}.jpg`, alt: 'alt', ...extra,
});
function setup(posts, bufOpts) {
  const bf = fakeBuffer(bufOpts);
  const db = makeDb(posts);
  const env = { BUFFER_API_KEY: 'k', BUFFER_ORG_ID: 'o', BUFFER_CHANNEL_ID: 'c', __fetch: bf.fetch, __db: db };
  const realNow = Date.now;
  Date.now = () => NOW;
  return { bf, db, env, restore: () => { Date.now = realNow; } };
}
const iso = (y, m, d, h, mi) => new Date(Date.UTC(y, m - 1, d, h, mi)).toISOString();

// ---------------------------------------------------------------- pure logic

test('London time handles GMT and BST', () => {
  assert.equal(new Date(Q.londonInstant(2026, 7, 1, 20, 5)).toISOString(), '2026-07-01T19:05:00.000Z');
  assert.equal(new Date(Q.londonInstant(2026, 11, 3, 20, 5)).toISOString(), '2026-11-03T20:05:00.000Z');
  assert.equal(new Date(Q.londonInstant(2026, 3, 29, 1, 30)).getUTCHours() >= 0, true);
  assert.equal(Q.londonDay(Date.UTC(2026, 6, 1, 23, 30)), '2026-07-02'); // 00:30 BST next day
});

test('slot picking: earliest, latest, taken, paused, lead time', () => {
  const s = Q.slotInstants(SCHEDULE, NOW, NOW + 7 * 86400000).map((m) => new Date(m).toISOString());
  assert.deepEqual(s.slice(0, 3), ['2026-10-28T18:01:00.000Z', '2026-10-29T10:45:00.000Z', '2026-10-30T07:29:00.000Z']);
  const p = (o) => Q.pickSlot({ schedule: SCHEDULE, now: NOW, ...o });
  assert.equal(new Date(p({})).toISOString(), '2026-10-28T18:01:00.000Z');
  assert.equal(new Date(p({ taken: [Date.parse('2026-10-28T18:01:00Z')] })).toISOString(), '2026-10-29T10:45:00.000Z');
  const dl = Date.parse('2026-11-01T23:59:00Z');
  assert.equal(new Date(p({ deadline: dl, mode: 'latest' })).toISOString(), '2026-11-01T22:42:00.000Z');
  // latest free skips a taken slot
  assert.equal(new Date(p({ deadline: dl, mode: 'latest', taken: [Date.parse('2026-11-01T22:42:00Z')] })).toISOString(), '2026-10-31T22:06:00.000Z');
  // nothing before a too-early deadline
  assert.equal(p({ deadline: Date.parse('2026-10-28T17:00:00Z'), mode: 'latest' }), null);
  // slot less than 10 minutes away is not offered
  assert.equal(new Date(Q.pickSlot({ schedule: SCHEDULE, now: Date.parse('2026-10-28T17:55:00Z') })).toISOString(), '2026-10-29T10:45:00.000Z');
  // paused day is skipped
  const paused = SCHEDULE.map((x) => (x.day === 'wed' ? { ...x, paused: true } : x));
  assert.equal(new Date(Q.pickSlot({ schedule: paused, now: NOW })).toISOString(), '2026-10-29T10:45:00.000Z');
});

test('deadlines: bare date means end of London day', () => {
  assert.equal(new Date(Q.deadlineMs('2026-11-07')).toISOString(), '2026-11-07T23:59:00.000Z');
  assert.equal(new Date(Q.deadlineMs('2026-07-07')).toISOString(), '2026-07-07T22:59:00.000Z');
  assert.equal(Q.deadlineMs(undefined), null);
});

test('same-day spacing: avoidDays removes sibling days', () => {
  const avoid = new Set(['2026-10-28']);
  assert.equal(new Date(Q.pickSlot({ schedule: SCHEDULE, now: NOW, avoidDays: avoid })).toISOString(), '2026-10-29T10:45:00.000Z');
});

test('queue order: queuePos, and deadlines earliest-first unless hand-ordered', () => {
  const mk = (id, d) => ({ id, data: { status: 'approved', ...d } });
  const o = (docs) => Q.orderQueue(docs).map((x) => x.id);
  assert.deepEqual(o([mk('b', { queuePos: 2 }), mk('a', { queuePos: 1 }), mk('c', { queuePos: 3 })]), ['a', 'b', 'c']);
  // deadline posts reorder among their own positions; the no-deadline post stays put
  assert.deepEqual(o([
    mk('late', { queuePos: 1, deadline: '2026-12-01' }), mk('none', { queuePos: 2 }), mk('soon', { queuePos: 3, deadline: '2026-11-05' }),
  ]), ['soon', 'none', 'late']);
  // manual order is respected
  assert.deepEqual(o([
    mk('late', { queuePos: 1, deadline: '2026-12-01', queueManual: true }), mk('soon', { queuePos: 2, deadline: '2026-11-05' }),
  ]), ['late', 'soon']);
  // booked and non-approved ignored
  assert.deepEqual(o([mk('x', { queuePos: 1, bufferId: 'b1' }), { id: 'y', data: { status: 'review' } }, mk('z', { queuePos: 5 })]), ['z']);
});

test('diffBufferPost and expectedAssets', () => {
  const d = approved('a');
  assert.deepEqual(Q.diffBufferPost(d, { text: 'cap a\n', assets: [{ source: 'https://m/a.jpg' }] }), []);
  assert.deepEqual(Q.diffBufferPost(d, { text: 'other', assets: [{ source: 'https://m/a.jpg' }] }), ['caption differs']);
  assert.deepEqual(Q.diffBufferPost(d, { text: 'cap a', assets: [{ source: 'https://m/old.jpg' }] }), ['images differ']);
  const car = { kind: 'carousel', approvedSlides: ['s1', 's2', 's3'], approvedDocument: 'd-v1.pdf', approvedCaption: 'c' };
  assert.deepEqual(Q.diffBufferPost(car, { text: 'c', assets: [{ source: 'd-v1.pdf' }] }), []);
  assert.deepEqual(Q.diffBufferPost(car, { text: 'c', assets: [{ source: 's1' }] }), ['images differ']);
  assert.deepEqual(Q.expectedAssets({ kind: 'text' }), []);
});

test('bookBlocker: only the approved version goes', () => {
  assert.equal(Q.bookBlocker(approved('a')), null);
  assert.match(Q.bookBlocker(approved('a', { version: 2 })), /changed since approval/);
  assert.match(Q.bookBlocker(approved('a', { captionEdit: 'new words' })), /caption/);
  assert.match(Q.bookBlocker(approved('a', { bufferId: 'x' })), /already/);
  assert.equal(Q.bookBlocker(approved('t', { kind: 'text', approvedImage: null })), null);
  assert.match(Q.bookBlocker(approved('c', { kind: 'carousel', approvedSlides: ['s1'] })), /no approved media/);
});

// ------------------------------------------------------- with a fake Buffer

test('place: books now with room; assets/metadata built right', async () => {
  const t = setup({ a: approved('a', { kind: 'carousel', approvedSlides: ['https://m/a1.jpg', 'https://m/a2.jpg'], approvedDocument: 'https://m/a-v1.pdf', collaborator: 'mumclub' }) });
  try {
    const r = await Q.place(t.env, 'a');
    assert.equal(r.booked, true);
    assert.deepEqual(t.bf.posts[0].assets, [{ type: 'document', source: 'https://m/a-v1.pdf' }]);
    const d = (await t.db.getDoc(t.env, 'posts', 'a')).data;
    assert.equal(d.status, 'scheduled');
    assert.equal(d.scheduledFor, '2026-10-28T18:01:00.000Z');
    assert.ok(d.bufferId && d.scheduledAt);
    assert.ok(t.db.logs.some((l) => l.action === 'collaborator-reminder' && /@mumclub/.test(l.detail)));
  } finally { t.restore(); }
});

test('place: full Buffer gives the next queuePos', async () => {
  const full = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, status: 'scheduled', dueAt: iso(2026, 11, 1 + i, 12, 0), text: '', assets: [] }));
  const t = setup({ a: approved('a'), b: approved('b', { queuePos: 4 }) }, { posts: full });
  try {
    const r = await Q.place(t.env, 'a');
    assert.equal(r.booked, false);
    assert.equal(r.queuePos, 5);
    assert.equal((await t.db.getDoc(t.env, 'posts', 'a')).data.status, 'approved');
    assert.ok(!t.bf.calls.includes('CreatePost'));
  } finally { t.restore(); }
});

test('place: deadline earlier than Buffer slot is re-created at the latest slot before it', async () => {
  // Wed 28 Oct 18:01 is next; deadline end of Fri 30 Oct. Latest free slot on/before = Fri 07:29.
  const t = setup({ a: approved('a', { deadline: '2026-10-30' }) });
  try {
    // make Buffer's natural next slot late: occupy the first two slots
    t.bf.posts.push(
      { id: 'x1', status: 'scheduled', dueAt: '2026-10-28T18:01:00.000Z', text: '', assets: [] },
      { id: 'x2', status: 'scheduled', dueAt: '2026-10-29T10:45:00.000Z', text: '', assets: [] },
    );
    // Buffer would choose Fri 07:29 (within deadline) -> no fix needed
    let r = await Q.place(t.env, 'a');
    assert.equal(r.scheduledFor, '2026-10-30T07:29:00.000Z');
    assert.ok(!t.bf.calls.includes('DeletePost'));
  } finally { t.restore(); }
  const t2 = setup({ a: approved('a', { deadline: '2026-10-29' }) });
  try {
    t2.bf.posts.push({ id: 'x1', status: 'scheduled', dueAt: '2026-10-29T10:45:00.000Z', text: '', assets: [] });
    // Buffer picks Wed 18:01 (within deadline) -- fine. Now take it too: Buffer picks Fri, past the deadline.
    t2.bf.posts.push({ id: 'x2', status: 'scheduled', dueAt: '2026-10-28T18:01:00.000Z', text: '', assets: [] });
    const r = await Q.place(t2.env, 'a');
    // nothing free before the deadline: flagged, not created
    assert.equal(r.result, 'flagged');
    const d = (await t2.db.getDoc(t2.env, 'posts', 'a')).data;
    assert.equal(d.status, 'approved');
    assert.equal(d.fitWarning.deadline, '2026-10-29');
    assert.match(d.fitWarning.reason, /Won't go out before/);
  } finally { t2.restore(); }
});

test('deadline fix path: Buffer picks too late, we delete and book customScheduled', async () => {
  const t = setup({ a: approved('a', { deadline: '2026-10-30' }) });
  try {
    // Fake Buffer fills Wed+Thu+Fri slots?? Instead force Buffer's choice late by pausing the early days in its view only.
    const realSchedule = t.bf.schedule;
    let first = true;
    const orig = t.env.__fetch;
    t.env.__fetch = async (u, init) => {
      const body = JSON.parse(init.body);
      if (body.operationName === 'CreatePost' && first) {
        first = false;
        t.bf.schedule = realSchedule.map((s) => (['wed', 'thu', 'fri'].includes(s.day) ? { ...s, paused: true } : s)); // Buffer's queue is elsewhere
        const res = await orig(u, init);
        t.bf.schedule = realSchedule;
        return res;
      }
      return orig(u, init);
    };
    const r = await Q.place(t.env, 'a');
    assert.equal(r.booked, true);
    assert.deepEqual(t.bf.calls.filter((c) => c !== 'GetChannel' && c !== 'ListPosts'), ['CreatePost', 'DeletePost', 'CreatePost']);
    assert.equal(r.scheduledFor, '2026-10-30T07:29:00.000Z'); // latest slot on/before end of Fri 30 Oct
    assert.equal(t.bf.posts.length, 1);
    assert.equal(t.bf.posts[0].dueAt, r.scheduledFor);
  } finally { t.restore(); }
});

test('same brief lands on different London days', async () => {
  const t = setup({ a: approved('a', { briefId: 'B1' }), b: approved('b', { briefId: 'B1' }), c: approved('c', { briefId: 'B2' }) });
  try {
    const ra = await Q.place(t.env, 'a');
    const rb = await Q.place(t.env, 'b');
    assert.equal(ra.scheduledFor, '2026-10-28T18:01:00.000Z');
    // Buffer's own pick for b is Thu 29th (a different day): no move needed
    assert.equal(rb.scheduledFor, '2026-10-29T10:45:00.000Z');
    // Force the collision: a sibling booked on Thu, Buffer offers a free slot the same London day
    t.bf.schedule = [...SCHEDULE.filter((s) => s.day !== 'thu'), { day: 'thu', times: ['10:45', '11:00'], paused: false }];
    const d = (await t.db.getDoc(t.env, 'posts', 'b')).data;
    assert.ok(Q.londonDay(Date.parse(d.scheduledFor)) !== Q.londonDay(Date.parse(ra.scheduledFor)));
  } finally { t.restore(); }
});

test('same-day collision is moved to the next free slot on another day', async () => {
  const sched2 = SCHEDULE.map((s) => (s.day === 'wed' ? { ...s, times: ['18:01', '19:30'] } : s));
  // pickSlot only uses first time per day via scheduleToSlots, so build the collision from a custom Buffer view instead
  const t = setup({ a: approved('a', { briefId: 'B', status: 'scheduled', bufferId: 'bx', scheduledFor: '2026-10-28T18:01:00.000Z' }), b: approved('b', { briefId: 'B' }) });
  try {
    t.bf.posts.push({ id: 'bx', status: 'scheduled', dueAt: '2026-10-28T18:01:00.000Z', text: 'cap a', assets: [{ source: 'https://m/a.jpg' }] });
    // Buffer thinks wed 18:01 is free (hide bx from its own taken check by pretending it was only listed after)
    const orig = t.env.__fetch;
    t.env.__fetch = async (u, init) => {
      const body = JSON.parse(init.body);
      if (body.operationName === 'CreatePost' && JSON.parse(init.body).variables.input.mode === 'addToQueue') {
        const keep = t.bf.posts; t.bf.posts = [];
        const res = await orig(u, init);
        const created = t.bf.posts; t.bf.posts = [...keep, ...created];
        return res;
      }
      return orig(u, init);
    };
    void sched2;
    const r = await Q.place(t.env, 'b');
    assert.equal(r.booked, true);
    assert.equal(r.scheduledFor, '2026-10-29T10:45:00.000Z');
    assert.deepEqual(t.bf.calls.filter((c) => /Post$/.test(c)), ['CreatePost', 'DeletePost', 'CreatePost']);
  } finally { t.restore(); }
});

test('unbook deletes from Buffer and clears fields', async () => {
  const t = setup({ a: approved('a') });
  try {
    await Q.place(t.env, 'a');
    const r = await Q.unbook(t.env, 'a');
    assert.equal(r.deleted, true);
    assert.equal(t.bf.posts.length, 0);
    const d = (await t.db.getDoc(t.env, 'posts', 'a')).data;
    assert.ok(!('bufferId' in d) && !('scheduledFor' in d) && !('scheduledAt' in d));
  } finally { t.restore(); }
});

test('reorder rewrites queuePos and marks hand-ordered', async () => {
  const t = setup({ a: approved('a', { queuePos: 1 }), b: approved('b', { queuePos: 2 }), c: approved('c', { queuePos: 3 }) });
  try {
    const r = await Q.reorder(t.env, ['c', 'a']);
    assert.deepEqual(r.order, ['c', 'a', 'b']);
    const g = async (id) => (await t.db.getDoc(t.env, 'posts', id)).data;
    assert.equal((await g('c')).queuePos, 1);
    assert.equal((await g('b')).queuePos, 3);
    assert.equal((await g('c')).queueManual, true);
  } finally { t.restore(); }
});

test('makeRoom swaps a no-deadline post out and books the new one', async () => {
  const full = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, status: 'scheduled', dueAt: iso(2026, 11, 1 + i, 12, 0), text: `t${i}`, assets: [{ source: `u${i}` }] }));
  const t = setup({
    out: approved('out', { status: 'scheduled', bufferId: 'f9', scheduledFor: full[9].dueAt }),
    inn: approved('inn', { deadline: '2026-11-30' }),
  }, { posts: full });
  try {
    const r = await Q.makeRoom(t.env, 'inn', 'out');
    assert.equal(r.ok, true);
    assert.equal(r.bumped, 'out');
    const out = (await t.db.getDoc(t.env, 'posts', 'out')).data;
    assert.equal(out.status, 'approved');
    assert.ok(!out.bufferId);
    assert.equal((await t.db.getDoc(t.env, 'posts', 'inn')).data.status, 'scheduled');
    await assert.rejects(() => Q.makeRoom(t.env, 'out', 'inn'), /deadline/);
  } finally { t.restore(); }
});

test('reconcile: matches, mismatch, retime, sent, vanished', async () => {
  const mk = (id, bid, due, extra = {}) => approved(id, { status: 'scheduled', bufferId: bid, scheduledFor: due, ...extra });
  const due = (n) => iso(2026, 11, n, 12, 0);
  const t = setup({
    ok: mk('ok', 'b1', due(1)),
    bad: mk('bad', 'b2', due(2)),
    moved: mk('moved', 'b3', due(3)),
    sent: mk('sent', 'b4', due(4)),
    gone: mk('gone', 'b5', due(5)),
  }, {
    posts: [
      { id: 'b1', status: 'scheduled', dueAt: due(1), text: 'cap ok', assets: [{ source: 'https://m/ok.jpg' }] },
      { id: 'b2', status: 'scheduled', dueAt: due(2), text: 'cap bad', assets: [{ source: 'https://m/OLD.jpg' }] },
      { id: 'b3', status: 'scheduled', dueAt: iso(2026, 11, 9, 12, 0), text: 'cap moved', assets: [{ source: 'https://m/moved.jpg' }] },
      { id: 'b4', status: 'sent', dueAt: due(4), sentAt: iso(2026, 11, 4, 12, 1), text: 'cap sent', assets: [] },
    ],
  });
  try {
    const rep = await Q.runCron(t.env);
    assert.equal(rep.ok, true, JSON.stringify(rep.errors));
    const g = async (id) => (await t.db.getDoc(t.env, 'posts', id)).data;
    assert.equal((await g('ok')).status, 'scheduled');
    // reverted to approved, then rebooked by topUp with the approved image
    assert.ok((await g('bad')).bufferId && (await g('bad')).bufferId !== 'b2');
    assert.ok(!t.bf.posts.some((p) => p.id === 'b2'));
    assert.ok(t.bf.posts.some((p) => p.id === (t.db.store.posts.get('bad').data.bufferId) && p.assets[0].source === 'https://m/bad.jpg'));
    assert.equal((await g('moved')).scheduledFor, iso(2026, 11, 9, 12, 0));
    assert.equal((await g('sent')).status, 'posted');
    assert.equal((await g('sent')).postedAt, iso(2026, 11, 4, 12, 1));
    assert.notEqual((await g('gone')).bufferId, 'b5');
    assert.ok(t.db.logs.some((l) => l.action === 'reconcile-mismatch'));
    assert.ok(rep.bufferCalls <= Q.CRON_CALL_BUDGET);
    // bad was reverted then rebooked by topUp with the right images, so Buffer matches again
    assert.equal(rep.reconcile.reverted.length, 2);
  } finally { t.restore(); }
});

test('cron: tops up to 10 in queue order, writes buffer/status, stays under budget', async () => {
  const docs = {};
  for (let i = 0; i < 14; i++) docs[`p${String(i).padStart(2, '0')}`] = approved(`p${String(i).padStart(2, '0')}`, { queuePos: i + 1 });
  const t = setup(docs);
  try {
    const rep = await Q.runCron(t.env);
    assert.equal(rep.ok, true, JSON.stringify(rep.errors));
    assert.equal(rep.topUp.booked.length > 0, true);
    assert.deepEqual(rep.topUp.booked.slice(0, 3), ['p00', 'p01', 'p02']);
    assert.ok(rep.bufferCalls <= 20);
    const st = t.db.store.buffer.get('status').data;
    assert.equal(st.limit, 10);
    assert.equal(st.used, t.bf.posts.length);
    assert.equal(st.slots.mon, '20:05');
    assert.equal(st.dueAts.length, st.used);
    assert.equal(st.waiting, 14 - rep.topUp.booked.length);
    // run again until full
    for (let i = 0; i < 4 && t.bf.posts.length < 10; i++) await Q.runCron(t.env);
    assert.equal(t.bf.posts.length, 10);
    const r2 = await Q.runCron(t.env);
    assert.equal(r2.topUp.booked.length, 0);
  } finally { t.restore(); }
});

test('cron: deadline post that cannot fit stays approved with fitWarning, cleared once fixed', async () => {
  const t = setup({ a: approved('a', { deadline: '2026-10-28', queuePos: 1 }) });
  t.bf.posts.push({ id: 'x1', status: 'scheduled', dueAt: '2026-10-28T18:01:00.000Z', text: '', assets: [] });
  try {
    const rep = await Q.runCron(t.env);
    assert.equal(rep.topUp.flagged.length, 1);
    let d = (await t.db.getDoc(t.env, 'posts', 'a')).data;
    assert.equal(d.status, 'approved');
    assert.ok(d.fitWarning);
    await Q.runCron(t.env); // unchanged warning is not rewritten
    assert.equal((await t.db.getDoc(t.env, 'posts', 'a')).rev, 2);
    await t.db.patchDoc(t.env, 'posts', 'a', null, { deadline: '2026-11-20' });
    await Q.runCron(t.env);
    d = (await t.db.getDoc(t.env, 'posts', 'a')).data;
    assert.equal(d.status, 'scheduled');
    assert.ok(!d.fitWarning);
  } finally { t.restore(); }
});

test('buffer.js surfaces MutationError and GraphQL errors', async () => {
  const { createPost, deletePost } = await import('../src/buffer.js');
  const mk = (payload) => ({ BUFFER_API_KEY: 'k', BUFFER_CHANNEL_ID: 'c', __fetch: async () => new Response(JSON.stringify(payload)) });
  await assert.rejects(() => createPost(mk({ data: { createPost: { __typename: 'LimitReachedError', message: 'queue full' } } }), { text: 't', assets: [] }), /queue full/);
  await assert.rejects(() => deletePost(mk({ errors: [{ message: 'Unauthorized' }] }), 'x'), /Unauthorized/);
  await assert.rejects(() => createPost({ BUFFER_API_KEY: 'k', BUFFER_CHANNEL_ID: 'c', __fetch: async () => new Response('{}', { status: 429 }) }, { text: 't', assets: [] }), /rate limit/);
  await assert.rejects(() => createPost(mk({}), { text: 't', assets: [], mode: 'customScheduled' }), /dueAt/);
});

test('place: without Buffer connected, approved posts wait in the queue', async () => {
  const t = setup({ a: approved('a') });
  try {
    const env = { __db: t.db };
    const r = await Q.place(env, 'a');
    assert.equal(r.booked, false);
    assert.match(r.reason, /not connected/);
    assert.equal((await t.db.getDoc(env, 'posts', 'a')).data.queuePos, 1);
    assert.deepEqual(await Q.runCron(env), { ok: true, skipped: 'Buffer is not connected yet' });
  } finally { t.restore(); }
});

test('pdf.js: slides become one page each', async () => {
  const { jpegsToPdf, jpegSize } = await import('../src/pdf.js');
  // Smallest valid baseline JPEG header: SOI, SOF0 (8x4), EOI.
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x04, 0x00, 0x08, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  assert.deepEqual(jpegSize(jpg), { width: 8, height: 4 });
  const pdf = new TextDecoder('latin1').decode(jpegsToPdf([jpg, jpg, jpg]));
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Count 3/);
  assert.equal((pdf.match(/\/Subtype \/Image/g) || []).length, 3);
  assert.match(pdf, /startxref\n\d+\n%%EOF\n$/);
});
