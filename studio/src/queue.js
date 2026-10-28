// Booking logic: holds approved posts and keeps Buffer's queue (max 10) topped up.
// Rules: CONTRACT.md "Booking rules" and the skill's "Approval and Buffer".
// Every exported async function returns a plain-object report. All times are Europe/London.
import * as buf from './buffer.js';

export const LIMIT = 10;
export const CRON_CALL_BUDGET = 20;
const WHO = 'queue';
const TZ = 'Europe/London';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MIN_LEAD_MS = 10 * 60 * 1000; // a slot must be at least this far ahead
const DEL = { __delete__: true };

let dbMod;
async function DB(env) {
  return env.__db || (dbMod ||= await import('./db.js'));
}

// ---------------------------------------------------------------- London time

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function londonParts(ms) {
  const p = {};
  for (const x of dtf.formatToParts(new Date(ms))) p[x.type] = x.value;
  const y = +p.year, m = +p.month, d = +p.day;
  return {
    y, m, d, h: +p.hour, mi: +p.minute,
    dow: new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(),
    key: `${p.year}-${p.month}-${p.day}`,
  };
}
export const londonDay = (ms) => londonParts(ms).key;

/** The instant at which London wall-clock reads y-m-d h:mi. */
export function londonInstant(y, m, d, h, mi) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = londonParts(guess);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += wall - shown;
  }
  return guess;
}

/** Deadline -> ms. A bare date means the end of that London day. */
export function deadlineMs(deadline) {
  if (!deadline) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    const [y, m, d] = deadline.split('-').map(Number);
    return londonInstant(y, m, d, 23, 59);
  }
  const t = Date.parse(deadline);
  return Number.isNaN(t) ? null : t;
}

// -------------------------------------------------------------------- slots

/** postingSchedule -> {mon:"20:05",...}. One time a day; paused or empty days are left out. */
export function scheduleToSlots(schedule = []) {
  const out = {};
  for (const s of schedule) if (!s.paused && s.times?.length) out[s.day] = [...s.times].sort()[0];
  return out;
}

/** Slot instants (ms) in (afterMs, untilMs], ascending. */
export function slotInstants(schedule, afterMs, untilMs, maxDays = 120) {
  const slots = scheduleToSlots(schedule);
  const start = londonParts(afterMs);
  const out = [];
  for (let i = 0; i < maxDays; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i, 12));
    const t = slots[DAYS[day.getUTCDay()]];
    if (!t) continue;
    const [h, mi] = t.split(':').map(Number);
    const ms = londonInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi);
    if (ms <= afterMs) continue;
    if (untilMs != null && ms > untilMs) break;
    out.push(ms);
  }
  return out;
}

const isTaken = (taken, ms) => taken.some((t) => Math.abs(t - ms) < 60000);

/**
 * Pick a free slot. mode 'earliest' (default) or 'latest' (needs a deadline).
 * avoidDays: Set of London day keys that are not allowed (same-brief siblings).
 * Returns ms or null.
 */
export function pickSlot({ schedule, taken = [], now, deadline = null, avoidDays = new Set(), after = null, mode = 'earliest' }) {
  const from = Math.max(now + MIN_LEAD_MS, after ?? 0);
  const until = deadline ?? from + 120 * 86400000;
  const free = slotInstants(schedule, from, until).filter((ms) => !isTaken(taken, ms) && !avoidDays.has(londonDay(ms)));
  if (!free.length) return null;
  return mode === 'latest' && deadline != null ? free[free.length - 1] : free[0];
}

// ----------------------------------------------------------- post helpers

const kindToType = (k) => (k === 'carousel' ? 'carousel' : k === 'text' ? 'text' : 'image');
const currentCaption = (d) => d.captionEdit ?? d.caption;
const norm = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();

/** Ordered image/video URLs Buffer must hold for this post. */
export function expectedAssets(d) {
  if (d.kind === 'text') return [];
  if (d.kind === 'carousel') return d.approvedDocument ? [d.approvedDocument] : [];
  return d.approvedImage ? [d.approvedImage] : [];
}

/** Why a post can't be booked yet (null when it can). */
export function bookBlocker(d) {
  if (d.status !== 'approved') return `status is ${d.status}`;
  if (d.bufferId) return 'already in Buffer';
  if (d.approvedVersion == null || d.approvedVersion !== d.version) return 'changed since approval';
  if (d.approvedCaption == null || norm(d.approvedCaption) !== norm(currentCaption(d))) return 'caption changed since approval';
  if (d.kind !== 'text' && !expectedAssets(d).length) return 'no approved media';
  return null;
}

export function toBufferInput(d) {
  const urls = expectedAssets(d);
  const type = kindToType(d.kind);
  const alt = d.alt || d.title || '';
  const assets = buf.buildAssets({
    type,
    images: urls.map((url) => ({ url, alt })),
    document: d.kind === 'carousel' ? { url: d.approvedDocument, title: d.documentTitle || d.title || 'Slides', thumbnailUrl: (d.approvedSlides || [])[0] } : undefined,
  });
  return { text: d.approvedCaption, assets, type, firstComment: d.firstComment || undefined };
}

/** Differences between a Buffer post and what was approved. [] means they match. */
export function diffBufferPost(d, bp) {
  const why = [];
  if (norm(bp.text) !== norm(d.approvedCaption)) why.push('caption differs');
  const have = (bp.assets || []).map((a) => a.source);
  const want = expectedAssets(d);
  if (have.length !== want.length || have.some((u, i) => u !== want[i])) why.push('images differ');
  return why;
}

/**
 * Queue order for approved posts not yet in Buffer. Lower queuePos first; among posts Shannon has
 * not hand-ordered (queueManual), those with a deadline fill the deadline posts' own positions
 * earliest-deadline-first.
 */
export function orderQueue(docs) {
  const list = docs
    .filter((x) => x.data.status === 'approved' && !x.data.bufferId)
    .sort((a, b) => (a.data.queuePos ?? Infinity) - (b.data.queuePos ?? Infinity) || (a.id < b.id ? -1 : 1));
  const idx = [];
  list.forEach((x, i) => { if (!x.data.queueManual && deadlineMs(x.data.deadline) != null) idx.push(i); });
  const byDeadline = idx.map((i) => list[i]).sort((a, b) => deadlineMs(a.data.deadline) - deadlineMs(b.data.deadline));
  idx.forEach((i, n) => { list[i] = byDeadline[n]; });
  return list;
}

const dateText = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

// ----------------------------------------------------------- context

async function loadCtx(env, { withPosts = true } = {}) {
  const db = await DB(env);
  const [channel, bufferPosts, state] = await Promise.all([
    buf.getChannel(env),
    buf.listPosts(env, ['scheduled', 'sending']),
    withPosts ? db.getState(env) : { posts: [] },
  ]);
  return {
    env, db, now: Date.now(), channel, schedule: channel.postingSchedule || [],
    bufferPosts: bufferPosts.map((p) => ({ id: p.id, dueAt: p.dueAt, status: p.status, text: p.text, assets: p.assets })),
    posts: state.posts,
    errors: [],
  };
}
const takenOf = (ctx, exceptId) => ctx.bufferPosts.filter((p) => p.id !== exceptId && p.dueAt).map((p) => Date.parse(p.dueAt));

async function patch(ctx, id, set) {
  const r = await ctx.db.patchDoc(ctx.env, 'posts', id, null, set, WHO);
  const i = ctx.posts.findIndex((x) => x.id === id);
  if (i >= 0) ctx.posts[i] = r; else ctx.posts.push(r);
  return r;
}
const note = (ctx, action, id, detail) => ctx.db.log(ctx.env, WHO, action, 'posts', id, detail);
const dropFromCtx = (ctx, bufferId) => { ctx.bufferPosts = ctx.bufferPosts.filter((p) => p.id !== bufferId); };

async function flag(ctx, doc, reason) {
  const d = doc.data;
  const cur = d.fitWarning;
  if (!cur || cur.reason !== reason || cur.deadline !== d.deadline) {
    await patch(ctx, doc.id, { fitWarning: { deadline: d.deadline, reason } });
    await note(ctx, 'fit-warning', doc.id, reason);
  }
  return { id: doc.id, result: 'flagged', reason };
}

// ------------------------------------------------------------ booking

/** Book one approved post into Buffer, applying the deadline and same-brief rules. */
export async function bookOne(ctx, doc) {
  const d = doc.data;
  const blocker = bookBlocker(d);
  if (blocker) return { id: doc.id, result: 'skipped', reason: blocker };

  const dl = deadlineMs(d.deadline);
  if (dl != null && dl < ctx.now) return flag(ctx, doc, `Won't go out before ${d.deadline}: the deadline has passed`);

  const avoid = new Set(
    ctx.posts.filter((x) => x.id !== doc.id && d.briefId && x.data.briefId === d.briefId && x.data.status === 'scheduled' && x.data.scheduledFor)
      .map((x) => londonDay(Date.parse(x.data.scheduledFor))),
  );
  const slotArgs = { schedule: ctx.schedule, now: ctx.now, deadline: dl, avoidDays: avoid };

  // Cheap pre-check: no free slot at all before the deadline, so don't touch Buffer.
  if (dl != null && pickSlot({ ...slotArgs, taken: takenOf(ctx), mode: 'latest' }) == null) {
    return flag(ctx, doc, `Won't go out before ${dateText(dl)}: no free Buffer slot`);
  }

  const input = toBufferInput(d);
  let created = await buf.createPost(ctx.env, { ...input, mode: 'addToQueue' });
  let dueMs = Date.parse(created.dueAt);

  const late = dl != null && dueMs > dl;
  const sameDay = avoid.has(londonDay(dueMs));
  if (late || sameDay) {
    const target = late
      ? pickSlot({ ...slotArgs, taken: takenOf(ctx), mode: 'latest' })
      : pickSlot({ ...slotArgs, taken: takenOf(ctx), after: dueMs });
    await buf.deletePost(ctx.env, created.id);
    if (target == null) {
      return flag(ctx, doc, late ? `Won't go out before ${dateText(dl)}: no free Buffer slot` : 'Same brief already goes out that day and no other free slot fits');
    }
    created = await buf.createPost(ctx.env, { ...input, mode: 'customScheduled', dueAt: new Date(target).toISOString() });
    dueMs = Date.parse(created.dueAt);
  }

  const set = { status: 'scheduled', bufferId: created.id, scheduledFor: created.dueAt, scheduledAt: new Date().toISOString(), queuePos: DEL, queueManual: DEL };
  if (d.fitWarning) set.fitWarning = DEL;
  try {
    await patch(ctx, doc.id, set);
  } catch (e) {
    // Never leave an orphan in Buffer that the database doesn't know about.
    await buf.deletePost(ctx.env, created.id).catch(() => {});
    throw e;
  }
  ctx.bufferPosts.push({ id: created.id, dueAt: created.dueAt, status: 'scheduled' });
  await note(ctx, 'booked', doc.id, { bufferId: created.id, dueAt: created.dueAt });
  const rep = { id: doc.id, result: 'scheduled', bufferId: created.id, scheduledFor: created.dueAt };
  if (d.collaborator) {
    const msg = `Add @${d.collaborator} as a collaborator on "${d.title || doc.id}" in Buffer, before ${dateText(dueMs)}`;
    await note(ctx, 'collaborator-reminder', doc.id, msg);
    rep.reminder = msg;
  }
  return rep;
}

const queuePosMax = (posts) => Math.max(0, ...posts.filter((x) => x.data.status === 'approved' && !x.data.bufferId).map((x) => x.data.queuePos ?? 0));

/** Book now if Buffer has room, otherwise join the holding queue. */
// Until Buffer is connected (no key or channel), approved posts wait in Studio's own queue.
const bufferReady = (env) => Boolean(env.BUFFER_API_KEY && env.BUFFER_ORG_ID && env.BUFFER_CHANNEL_ID);

export async function place(env, postId) {
  if (!bufferReady(env)) {
    const db = await DB(env);
    const { posts } = await db.getState(env);
    const doc = posts.find((x) => x.id === postId);
    if (!doc) throw new Error(`No such post: ${postId}`);
    if (doc.data.queuePos == null) await db.patchDoc(env, 'posts', postId, doc.rev, { queuePos: queuePosMax(posts) + 1 }, WHO);
    return { ok: true, booked: false, id: postId, result: 'queued', reason: 'Buffer is not connected yet' };
  }
  const ctx = await loadCtx(env);
  const doc = ctx.posts.find((x) => x.id === postId);
  if (!doc) throw new Error(`No such post: ${postId}`);
  const blocker = bookBlocker(doc.data);
  if (blocker) return { ok: false, id: postId, booked: false, reason: blocker };
  if (ctx.bufferPosts.length < LIMIT) {
    const r = await bookOne(ctx, doc);
    if (r.result === 'scheduled') return { ok: true, booked: true, ...r };
    // flagged or skipped: stays approved, holds a place in the queue
    if (doc.data.queuePos == null) await patch(ctx, postId, { queuePos: queuePosMax(ctx.posts) + 1 });
    return { ok: true, booked: false, ...r };
  }
  const queuePos = doc.data.queuePos ?? queuePosMax(ctx.posts) + 1;
  if (doc.data.queuePos == null) await patch(ctx, postId, { queuePos });
  return { ok: true, booked: false, id: postId, result: 'queued', queuePos, bufferUsed: ctx.bufferPosts.length };
}

/** Pull from Buffer (if booked) and clear its booking fields. The caller sets the status. */
export async function unbook(env, postId) {
  const db = await DB(env);
  const doc = await db.getDoc(env, 'posts', postId);
  if (!doc) throw new Error(`No such post: ${postId}`);
  const bufferId = doc.data.bufferId;
  if (!bufferId) return { ok: true, id: postId, bufferId: null, deleted: false, noop: true };
  let deleted = false;
  if (bufferId) {
    try {
      await buf.deletePost(env, bufferId);
      deleted = true;
    } catch (e) {
      if (!/not ?found|does not exist/i.test(e.message)) throw e;
    }
  }
  await db.patchDoc(env, 'posts', postId, null, { bufferId: DEL, scheduledFor: DEL, scheduledAt: DEL }, WHO);
  await db.log(env, WHO, 'unbook', 'posts', postId, { bufferId, deleted });
  return { ok: true, id: postId, bufferId: bufferId || null, deleted };
}

/** Rewrite queuePos to the given order (ids not named keep their relative order after). */
export async function reorder(env, ids) {
  const db = await DB(env);
  const { posts } = await db.getState(env);
  const queue = orderQueue(posts);
  const inQueue = new Map(queue.map((x) => [x.id, x]));
  const named = ids.filter((id, i) => inQueue.has(id) && ids.indexOf(id) === i);
  const rest = queue.filter((x) => !named.includes(x.id)).map((x) => x.id);
  const order = [...named, ...rest];
  const changed = [];
  for (let i = 0; i < order.length; i++) {
    const d = inQueue.get(order[i]).data;
    const manual = named.includes(order[i]) || d.queueManual;
    if (d.queuePos !== i + 1 || !!d.queueManual !== !!manual) {
      const set = { queuePos: i + 1 };
      if (manual) set.queueManual = true;
      await db.patchDoc(env, 'posts', order[i], null, set, WHO);
      changed.push(order[i]);
    }
  }
  return { ok: true, order, changed };
}

/** Bump swapOutId (booked, no deadline) back to the front of the queue and book postId in its place. */
export async function makeRoom(env, postId, swapOutId) {
  const ctx = await loadCtx(env);
  const inc = ctx.posts.find((x) => x.id === postId);
  const out = ctx.posts.find((x) => x.id === swapOutId);
  if (!inc || !out) throw new Error('Unknown post');
  if (!out.data.bufferId || out.data.status !== 'scheduled') throw new Error(`${swapOutId} is not booked in Buffer`);
  if (out.data.deadline) throw new Error(`${swapOutId} has a deadline, so it can't be bumped`);
  const blocker = bookBlocker(inc.data);
  if (blocker) throw new Error(`${postId} can't be booked: ${blocker}`);
  const front = Math.min(1, ...ctx.posts.filter((x) => x.data.status === 'approved' && x.data.queuePos != null).map((x) => x.data.queuePos)) - 1;
  await buf.deletePost(env, out.data.bufferId);
  dropFromCtx(ctx, out.data.bufferId);
  await patch(ctx, swapOutId, { status: 'approved', bufferId: DEL, scheduledFor: DEL, scheduledAt: DEL, queuePos: front, queueManual: true });
  await note(ctx, 'bumped', swapOutId, `Made room for ${postId}`);
  const booked = await bookOne(ctx, ctx.posts.find((x) => x.id === postId));
  return { ok: booked.result === 'scheduled', booked, bumped: swapOutId };
}

// ------------------------------------------------------------ cron

/** Step 1: every scheduled post's Buffer post still exists and matches what was approved. */
export async function reconcile(ctx, maxLookups = 6) {
  const rep = { checked: 0, posted: [], reverted: [], retimed: [], unchecked: [] };
  const byId = new Map(ctx.bufferPosts.map((p) => [p.id, p]));
  let lookups = 0;
  for (const doc of ctx.posts.filter((x) => x.data.status === 'scheduled')) {
    const d = doc.data;
    rep.checked++;
    if (!d.bufferId) {
      await patch(ctx, doc.id, { status: 'approved', scheduledFor: DEL, scheduledAt: DEL });
      await note(ctx, 'reconcile-no-bufferId', doc.id, 'Scheduled but no Buffer id; back to approved');
      rep.reverted.push({ id: doc.id, why: ['no Buffer id'] });
      continue;
    }
    let bp = byId.get(d.bufferId);
    if (!bp) {
      if (lookups >= maxLookups) { rep.unchecked.push(doc.id); continue; }
      lookups++;
      bp = await buf.getPost(ctx.env, d.bufferId);
      if (bp?.status === 'sent') {
        await patch(ctx, doc.id, { status: 'posted', postedAt: bp.sentAt || bp.dueAt, scheduledFor: bp.dueAt || d.scheduledFor });
        await note(ctx, 'posted', doc.id, { bufferId: d.bufferId, sentAt: bp.sentAt });
        rep.posted.push(doc.id);
        continue;
      }
      if (!bp || !['scheduled', 'sending'].includes(bp.status)) {
        if (bp) await buf.deletePost(ctx.env, bp.id).catch(() => {});
        const why = [bp ? `Buffer status ${bp.status}` : 'missing in Buffer'];
        await patch(ctx, doc.id, { status: 'approved', bufferId: DEL, scheduledFor: DEL, scheduledAt: DEL });
        await note(ctx, 'reconcile-revert', doc.id, why.join('; '));
        rep.reverted.push({ id: doc.id, why });
        continue;
      }
    }
    const why = diffBufferPost(d, bp);
    if (why.length) {
      await buf.deletePost(ctx.env, bp.id);
      dropFromCtx(ctx, bp.id);
      await patch(ctx, doc.id, { status: 'approved', bufferId: DEL, scheduledFor: DEL, scheduledAt: DEL });
      await note(ctx, 'reconcile-mismatch', doc.id, why.join('; '));
      rep.reverted.push({ id: doc.id, why });
      continue;
    }
    if (bp.dueAt && (!d.scheduledFor || Math.abs(Date.parse(bp.dueAt) - Date.parse(d.scheduledFor)) >= 1000)) {
      await patch(ctx, doc.id, { scheduledFor: bp.dueAt });
      rep.retimed.push(doc.id);
    }
  }
  return rep;
}

/** Step 2: while Buffer has room, book the next queued posts. */
export async function topUp(ctx) {
  const rep = { booked: [], flagged: [], skipped: [], reminders: [] };
  for (const doc of orderQueue(ctx.posts)) {
    if (ctx.bufferPosts.length >= LIMIT) break;
    if (buf.callsUsed(ctx.env) + 3 > CRON_CALL_BUDGET) { rep.stoppedForBudget = true; break; }
    const r = await bookOne(ctx, doc);
    if (r.result === 'scheduled') { rep.booked.push(r.id); if (r.reminder) rep.reminders.push(r.reminder); }
    else if (r.result === 'flagged') rep.flagged.push({ id: r.id, reason: r.reason });
    else rep.skipped.push({ id: r.id, reason: r.reason });
  }
  return rep;
}

/** Step 3: refresh buffer/status for the page. */
export async function refreshStatus(ctx) {
  const dueAts = ctx.bufferPosts.map((p) => p.dueAt).filter(Boolean).sort();
  const waiting = ctx.posts.filter((x) => x.data.status === 'approved' && !x.data.bufferId).length;
  const data = {
    limit: LIMIT, used: ctx.bufferPosts.length, free: Math.max(0, LIMIT - ctx.bufferPosts.length),
    dueAts, slots: scheduleToSlots(ctx.schedule), waiting, checkedAt: new Date().toISOString(),
  };
  const cur = await ctx.db.getDoc(ctx.env, 'buffer', 'status');
  if (cur) await ctx.db.patchDoc(ctx.env, 'buffer', 'status', null, data, WHO);
  else await ctx.db.putDoc(ctx.env, 'buffer', 'status', data, WHO);
  return data;
}

export async function runCron(env) {
  if (!bufferReady(env)) return { ok: true, skipped: 'Buffer is not connected yet' };
  const cenv = Object.create(env);
  buf.startBudget(cenv, CRON_CALL_BUDGET);
  const db = await DB(cenv);
  const report = { ok: true, errors: [] };
  const ctx = await loadCtx(cenv);
  const step = async (name, fn) => {
    try {
      report[name] = await fn();
      await db.log(cenv, WHO, `cron-${name}`, null, null, report[name]);
    } catch (e) {
      report.ok = false;
      report.errors.push({ step: name, message: e.message });
      await db.log(cenv, WHO, `cron-${name}-failed`, null, null, e.message);
    }
  };
  await step('reconcile', () => reconcile(ctx));
  await step('topUp', () => topUp(ctx));
  await step('status', () => refreshStatus(ctx));
  report.bufferCalls = buf.callsUsed(cenv) ;
  if (report.errors.length) {
    try {
      const cur = await db.getDoc(cenv, 'config', 'diagnostics');
      const data = { at: new Date().toISOString(), errors: report.errors };
      if (cur) await db.patchDoc(cenv, 'config', 'diagnostics', null, data, WHO);
      else await db.putDoc(cenv, 'config', 'diagnostics', data, WHO);
    } catch { /* diagnostics are best effort */ }
  }
  return report;
}
