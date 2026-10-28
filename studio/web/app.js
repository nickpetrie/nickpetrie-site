'use strict';
/* Studio: Nick's LinkedIn post approval screens. Plain JS, no build step.
   Everything talks to the worker's /api (see CONTRACT.md). Docs arrive as {id, rev, updatedAt, data};
   here each one is flattened to {...data, id, _rev}. */

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEL = { __delete__: true };
const TZ = 'Europe/London';
const LON = { timeZone: TZ };
const wide = () => window.matchMedia('(min-width: 960px)').matches;

/* ---------- dates (all in UK time) ---------- */
function dparts(iso, opts) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { ...LON, ...opts }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}
const fmt = (iso) => { if (!iso) return 'Time to be set'; const p = dparts(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`; };
const dayText = (iso, long) => { const p = dparts(iso, { weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short' }); return `${p.weekday} ${p.day} ${p.month}`; };
const hm = (iso) => { const p = dparts(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}`; };
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', LON);
const todayKey = () => dayKey(new Date().toISOString());
const dateOnly = (ymd) => dayText(ymd + 'T12:00:00Z');
const ordinal = (n) => { const t = n % 100; if (t >= 11 && t <= 13) return n + 'th'; return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
// Weeks run Tuesday to Monday.
function weekStart(iso) { const d = new Date(dayKey(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 5) % 7)); return d; }
// Claude's next check is at quarter past each hour from 08:15 to 22:15 UK time.
function nextPickup(now = Date.now()) {
  for (let i = 0; i < 48 * 4; i++) {
    const t = new Date(Math.ceil((now + 1) / 60000) * 60000 + i * 60000);
    const p = dparts(t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (p.minute === '15' && +p.hour >= 8 && +p.hour <= 22) return (dayKey(t.toISOString()) === todayKey() ? '' : 'tomorrow ') + `${p.hour}:${p.minute}`;
  }
  return 'the next check';
}

/* ---------- state ---------- */
const S = {
  posts: {}, briefs: {}, ideas: {}, buffer: null, me: null, loaded: false, failed: false,
  tab: 'review', openId: null, mode: 'view',
  banner: null, run: {},             // what was just approved, and how many per group this visit
  picking: false, picked: new Set(),
  edit: null,                        // the edit in progress: {id, spec, caption, slide, busy, msg}
  doneFilter: 'posted', q: '', showAllIdeas: false,
  slide: {},                         // carousel slide being looked at, per post
  busyIds: new Set(),
  keyboard: false,                   // was the last input a key press? (for focus rings after a redraw)
  listView: (() => { try { return localStorage.getItem('studio.listView') === 'grid' ? 'grid' : 'list'; } catch { return 'list'; } })(),
};
function setListView(v) { S.listView = v; try { localStorage.setItem('studio.listView', v); } catch { /* private window */ } renderMain(); }
const norm = (d) => ({ ...d.data, id: d.id, _rev: d.rev, _at: d.updatedAt });
function absorb(doc, coll = 'posts') { const p = norm(doc); S[coll][doc.id] = p; return p; }
function loadState(st) {
  const next = (list) => Object.fromEntries((list || []).map((d) => [d.id, norm(d)]));
  S.posts = next(st.posts); S.briefs = next(st.briefs); S.ideas = next(st.ideas);
  S.buffer = st.buffer && typeof st.buffer === 'object' ? (st.buffer.data && st.buffer.rev ? st.buffer.data : st.buffer) : null;
  S.loaded = true; S.failed = false;
}

/* ---------- API ---------- */
class ApiError extends Error {
  constructor(status, body) { super((body && body.error) || `HTTP ${status}`); this.status = status; this.body = body || {}; this.doc = body && body.doc; }
}
async function api(method, path, body, raw) {
  let res;
  try {
    res = await fetch(path, { method, headers: body && !raw ? { 'content-type': 'application/json' } : (raw ? { 'content-type': raw } : undefined), body: raw ? body : (body ? JSON.stringify(body) : undefined), cache: 'no-store', credentials: 'same-origin' });
  } catch { throw new ApiError(0, { error: 'offline' }); }
  let data = null; try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(res.status, data);
  if (data === null) throw new ApiError(0, { error: 'signed-out' });
  return data;
}
const patchPost = (p, set) => api('PATCH', `/api/docs/posts/${encodeURIComponent(p.id)}`, { rev: p._rev, set }).then((d) => absorb(d));
const postAction = (p, action, extra = {}) => api('POST', `/api/posts/${encodeURIComponent(p.id)}/${action}`, { rev: p._rev, ...extra }).then((d) => absorb(d));
// A booked or waiting post has to come out of Buffer before it can be changed.
const needsPull = (p) => p.status === 'scheduled' || p.status === 'approved' || !!p.bufferId;
async function pullIfNeeded(p) { return needsPull(p) ? postAction(p, 'pull') : p; }

function explain(e, p) {
  if (e instanceof ApiError) {
    if (e.status === 409) {
      if (e.doc && p) absorb(e.doc);
      return 'This post was just changed by Claude or on another device, so that didn\'t go through. The latest version is showing now. Please have a look and try again.';
    }
    if (e.status === 0) return e.body.error === 'signed-out' ? 'Your sign-in may have run out. Please reload the page.' : 'Studio can\'t be reached. Check your connection and try again.';
    if (e.status === 413) return 'That picture is too big to send.';
    if (e.status === 403) return 'You can look at this but not change it.';
    return `That didn't work: ${e.message}. Nothing has been lost.`;
  }
  return `That didn't work: ${e.message || e}.`;
}
function fail(e, p) { const t = explain(e, p); toast(t, { error: true }); if (e instanceof ApiError && e.status === 409) render(); return t; }

async function refresh(quiet = true) {
  try {
    const st = await api('GET', '/api/state');
    const before = S.openId && S.posts[S.openId];
    loadState(st);
    renderHeader(); renderTabs();
    if (!busy()) renderMain(); else S.stale = true;
    if (before && S.mode === 'edit' && S.posts[before.id] && S.posts[before.id].version !== before.version) toast('Claude has just made a new version of this post. Save will ask you to look at it first.', { error: true });
  } catch (e) {
    if (!quiet || !S.loaded) { S.failed = !S.loaded; renderAll(); }
  }
}

/* ---------- vocab ---------- */
const KIND = { image: 'Image post', carousel: 'Carousel', text: 'Text post' };
const PICKS = ['Change the wording', 'A different design', 'Shorter', 'Change the day or time'];
const SIZES = { post: [1080, 1350], square: [1080, 1080], story: [1080, 1920], landscape: [1200, 627] };
const TEMPLATE_V = '2026-10-28-studio';
const cap = (p) => p.captionEdit || p.caption || '';
const isCarousel = (p) => p.kind === 'carousel';
const kindOf = (p) => KIND[p.kind] || 'Image post';
const slidesOf = (p) => (Array.isArray(p.slideUrls) && p.slideUrls.length ? p.slideUrls : []);
const ver = (p) => p.version || 1;
const changedSinceApproval = (p) => ['approved', 'scheduled'].includes(p.status) && !p.needsRender && p.approvedVersion != null && (p.approvedVersion !== ver(p) || (p.approvedCaption != null && p.approvedCaption !== cap(p)));
function ratioOf(p) {
  const s = isCarousel(p) ? p.spec && p.spec.slides && p.spec.slides[0] : p.spec;
  const f = s && s.format && SIZES[s.format];
  if (f) return f;
  return SIZES.post;
}
const brief = (id) => (id && S.briefs[id]) || null;
const briefName = (p) => { const b = brief(p.briefId); return b ? (b.what || 'Your brief') : null; };
// When it goes out: Buffer's time once booked, otherwise Buffer picks, before the deadline if there is one.
function whenText(p) {
  if (['scheduled', 'posted'].includes(p.status) && p.scheduledFor) return `${p.status === 'posted' ? 'Posted' : 'Scheduled'} · ${fmt(p.scheduledFor)}`;
  if (p.deadline) return `Buffer picks the time, before ${dayText(p.deadline)}`;
  return 'Buffer picks the time';
}
// What is happening with a post, in plain words: a chip class and its text.
function progress(p) {
  if (p.needsRender) return { cls: 'working', chip: 'Updating, back within the hour' };
  if (p.status === 'changes') return { cls: 'working', chip: 'Claude is on it' };
  if (changedSinceApproval(p)) return { cls: 'working', chip: 'Changed: check it' };
  if (p.status === 'review' && p.renderedAt && p.renderedAt > (p.reviewedAt || 0)) return { cls: 'ready', chip: `Version ${ver(p)} ready` };
  const map = {
    review: { cls: 'ready', chip: 'Ready for review' }, approved: { cls: 'ready', chip: 'Approved' },
    scheduled: { cls: 'sched', chip: `Scheduled · ${fmt(p.scheduledFor)}` }, posted: { cls: 'quiet', chip: `Posted · ${dayText(p.scheduledFor || new Date(p.createdAt || Date.now()).toISOString())}` },
    saved: { cls: 'quiet', chip: 'Saved for later' }, removed: { cls: 'quiet', chip: 'Not posting' },
  };
  return map[p.status] || { cls: 'quiet', chip: p.status };
}
const chip = (p) => { const g = progress(p); return el('span', { class: `chip ${g.cls}`, text: g.chip }); };
const sortBy = (f) => (a, b) => (f(a) || '￿').localeCompare(f(b) || '￿') || a.id.localeCompare(b.id);

/* ---------- Buffer and header ---------- */
const scheduledPosts = () => Object.values(S.posts).filter((p) => p.status === 'scheduled');
const waitingPosts = () => orderQueue();
function bufferInfo() {
  const b = S.buffer || {}, limit = b.limit || 10;
  const now = Date.now();
  const future = scheduledPosts().filter((p) => !p.scheduledFor || Date.parse(p.scheduledFor) > now).length;
  const dues = (b.dueAts || []).filter((t) => Date.parse(t) > now).length;
  const used = Math.min(limit, Math.max(future, dues, S.loaded ? 0 : (b.used || 0)));
  return { limit, used, free: limit - used, waiting: waitingPosts().length };
}
function nextPostTime() {
  const now = Date.now();
  const all = [...(S.buffer?.dueAts || []), ...scheduledPosts().map((p) => p.scheduledFor)].filter((t) => t && Date.parse(t) > now).sort();
  return all[0] || null;
}
const reviewPosts = () => Object.values(S.posts).filter((p) => p.status === 'review');
function renderHeader() {
  const n = reviewPosts().length, nx = nextPostTime();
  $('sub').textContent = S.loaded ? `${n} ready for review${nx ? ` · next post ${fmt(nx)}` : ''}` : (S.failed ? 'Couldn\'t load your posts' : 'Loading your posts…');
  const { limit, used, free, waiting } = bufferInfo();
  const dots = el('span', { class: 'dots', role: 'img', 'aria-label': `Buffer: ${used} of ${limit} slots used` },
    ...Array.from({ length: limit }, (_, i) => el('span', { class: i < used ? 'dot on' : 'dot' })));
  const label = free > 0 ? `Buffer: ${used} of ${limit} used · room for ${free}` : `Buffer: ${used} of ${limit} used${waiting ? ` · ${waiting} waiting` : ''}`;
  $('buffer').replaceChildren(S.loaded ? dots : '', S.loaded ? el('span', { class: 'buffer-text', text: label }) : '');
}
function renderTabs() {
  const nav = $('tabs');
  const comingN = scheduledPosts().length + waitingPosts().length;
  const tabs = [['review', 'Ready for review', S.loaded ? reviewPosts().length : null], ['coming', 'Coming up', S.loaded ? comingN : null], ['done', 'Done', null], ['briefs', 'Briefs', null]];
  if (S.me && S.me.admin) tabs.push(['debug', 'Debug', null]);
  nav.hidden = wide() && S.mode === 'edit';
  nav.replaceChildren(...[el('div', { class: 'tab-row' }, ...tabs.map(([k, label, n]) =>
    el('a', { class: 'tab', href: `#/${k}`, 'aria-current': S.tab === k ? 'page' : null }, label, n !== null ? el('span', { class: 'count', text: n }) : null))),
    null].filter(Boolean));
}

/* ---------- toasts and dialogs ---------- */
function toast(text, { undo, error, sticky } = {}) {
  const t = el('div', { class: `toast${error ? ' err' : ''}`, role: error ? 'alert' : 'status' }, el('span', { text }));
  const close = () => t.remove();
  if (undo) t.append(el('button', { type: 'button', class: 'toast-btn', text: 'Undo', onclick: async () => { close(); await undo(); } }));
  t.append(el('button', { type: 'button', class: 'toast-btn', 'aria-label': 'Dismiss', text: '✕', onclick: close }));
  $('toasts').append(t);
  if (!sticky && !error) setTimeout(close, undo ? 12000 : 7000);
  else if (error) setTimeout(close, 20000);
}
const dlg = () => $('dlg');
function openDialog(title, ...body) {
  const d = dlg();
  d.replaceChildren(el('div', { class: 'dlg-card' },
    el('div', { class: 'dlg-head' }, el('h2', { id: 'dlg-title', text: title }), el('button', { type: 'button', class: 'btn quiet icon', 'aria-label': 'Close', text: '✕', onclick: closeDialog })),
    ...body));
  if (!d.open) d.showModal();
  return d;
}
function closeDialog() { const d = dlg(); if (d.open) d.close(); }
dlg().addEventListener('click', (e) => { if (e.target === dlg()) closeDialog(); });
dlg().addEventListener('close', () => { if (S.stale) { S.stale = false; renderMain(); } });
function confirmBox(title, text, okLabel, danger) {
  return new Promise((ok) => {
    let result = false;
    const d = openDialog(title, el('p', { class: 'dlg-text', text }),
      el('div', { class: 'dlg-acts' },
        el('button', { type: 'button', class: 'btn quiet', text: 'Not now', onclick: closeDialog }),
        el('button', { type: 'button', class: danger ? 'btn danger' : 'btn good', text: okLabel, onclick: () => { result = true; closeDialog(); } })));
    d.addEventListener('close', () => ok(result), { once: true });
  });
}

/* ---------- routing ---------- */
function parseHash() {
  const [tab, id, mode] = location.hash.replace(/^#\/?/, '').split('/').map((x) => x && decodeURIComponent(x));
  S.tab = ['review', 'coming', 'done', 'briefs', 'debug'].includes(tab) ? tab : 'review';
  S.openId = id || null;
  S.mode = mode === 'edit' ? 'edit' : 'view';
}
function go(tab, id, { replace, edit } = {}) {
  const h = `#/${tab}${id ? '/' + encodeURIComponent(id) : ''}${edit ? '/edit' : ''}`;
  if (replace) { history.replaceState(null, '', h); onRoute(true); } else if (location.hash === h) onRoute(); else location.hash = h;
}
function onRoute(silent) {
  parseHash();
  if (S.mode === 'edit') { const p = S.posts[S.openId]; if (!p || !startEdit(p)) { S.mode = 'view'; history.replaceState(null, '', `#/${S.tab}${S.openId ? '/' + S.openId : ''}`); } }
  else if (S.edit) S.edit = null;
  if (S.tab !== 'review') { S.picking = false; S.picked.clear(); }
  renderAll();
  if (!silent) { const m = $('main'); const pane = m.querySelector('.pane-scroll'); if (pane) pane.scrollTop = 0; if (!wide()) window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', () => { S.banner = null; onRoute(); });
window.matchMedia('(min-width: 960px)').addEventListener('change', () => renderAll());

/* ---------- queue order (the holding queue for approved posts not in Buffer yet) ---------- */
const deadlineMs = (d) => { const t = d ? Date.parse(d) : NaN; return Number.isNaN(t) ? null : t; };
function orderQueue() {
  const list = Object.values(S.posts).filter((p) => p.status === 'approved' && !p.bufferId)
    .sort((a, b) => (a.queuePos ?? Infinity) - (b.queuePos ?? Infinity) || a.id.localeCompare(b.id));
  const idx = []; list.forEach((p, i) => { if (!p.queueManual && deadlineMs(p.deadline) != null) idx.push(i); });
  const byDl = idx.map((i) => list[i]).sort((a, b) => deadlineMs(a.deadline) - deadlineMs(b.deadline));
  idx.forEach((i, n) => { list[i] = byDl[n]; });
  return list;
}

/* ---------- review groups ---------- */
const isBack = (p) => p.status === 'review' && ((p.renderedAt && p.renderedAt > (p.reviewedAt || 0)) || (ver(p) > 1 && p.changeNote && !p.reviewedAt));
function weeksSentence(posts) {
  const starts = [...new Set(posts.filter((p) => p.scheduledFor).map((p) => weekStart(p.scheduledFor).toISOString().slice(0, 10)))].sort();
  if (!starts.length) return 'Buffer picks the times.';
  const ds = starts.map((s) => new Date(s + 'T12:00:00Z'));
  const mon = (d) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  let txt;
  if (ds.length === 1) txt = `For the week of ${ds[0].getUTCDate()} ${mon(ds[0])}.`;
  else if (ds.every((d) => mon(d) === mon(ds[0]))) txt = `For the weeks of ${ds.slice(0, -1).map((d) => d.getUTCDate()).join(', ')} and ${ds.at(-1).getUTCDate()} ${mon(ds[0])}.`;
  else txt = `For the weeks of ${ds.map((d) => `${d.getUTCDate()} ${mon(d)}`).join(' and ')}.`;
  return `${txt} Buffer picks the times.`;
}
function reviewGroups() {
  const ps = Object.values(S.posts).filter((p) => p.status === 'review' || p.status === 'changes').sort(sortBy((p) => p.deadline || p.scheduledFor));
  const groups = [];
  const back = ps.filter(isBack);
  if (back.length) groups.push({ key: 'back', title: 'Back from Claude', sub: 'You asked for changes. Here\'s the new version.', posts: back });
  const rest = ps.filter((p) => !isBack(p));
  const byBrief = new Map();
  for (const p of rest) if (p.briefId) (byBrief.get(p.briefId) || byBrief.set(p.briefId, []).get(p.briefId)).push(p);
  const briefGroups = [...byBrief].map(([id, posts]) => {
    const b = brief(id);
    const dl = posts.map((p) => p.deadline).filter(Boolean).sort()[0];
    const have = Object.values(S.posts).filter((p) => p.briefId === id && ['scheduled', 'approved'].includes(p.status)).length;
    const bits = [];
    if (b && b.eventDate) bits.push(`Event ${dateOnly(b.eventDate)}`);
    if (dl) bits.push(`must go out by ${dayText(dl)}`);
    if (have) bits.push(`${have} already scheduled`);
    return { key: 'brief:' + id, briefId: id, eyebrow: 'From your brief', title: b ? (b.what || 'Your brief') : 'Your brief', sub: bits.join(' · '), posts, share: true, sort: (b && b.eventDate) || dl || '9' };
  }).sort((a, b) => a.sort.localeCompare(b.sort));
  groups.push(...briefGroups);
  const weekly = rest.filter((p) => !p.briefId);
  if (weekly.length) groups.push({ key: 'weekly', eyebrow: 'Weekly plan', title: 'New from Claude this week', sub: weeksSentence(weekly), posts: weekly });
  return groups;
}
const groupOf = (groups, id) => groups.find((g) => g.posts.some((p) => p.id === id));
// After deciding on a post, the next one to open: the next in its group, else the next group's first.
function nextToOpen(groups, id) {
  const gi = groups.findIndex((g) => g.posts.some((p) => p.id === id));
  if (gi < 0) return null;
  const mine = groups[gi].posts, i = mine.findIndex((p) => p.id === id);
  const open = (ps) => ps.find((p) => p.status === 'review' && p.id !== id);
  const after = open(mine.slice(i + 1)) || open(mine.slice(0, i));
  if (after) return after.id;
  for (let k = 1; k < groups.length; k++) { const g = groups[(gi + k) % groups.length]; const f = g.posts.find((p) => p.status === 'review'); if (f && g !== groups[gi]) return f.id; }
  return null;
}

/* ---------- pieces: thumbnails, items, media ---------- */
const thumb = (p) => p.imageUrl ? el('img', { class: 'thumb', src: p.imageUrl, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'thumb none', text: 'No image yet' });
function itemSub(p, g) {
  const note = g && g.key === 'back' && p.changeNote ? p.changeNote.replace(/\.$/, '') : (p.status === 'changes' ? 'Claude is on it' : '');
  const kind = kindOf(p) + (isCarousel(p) && slidesOf(p).length ? ` · ${slidesOf(p).length} slides` : '');
  return [el('span', { class: 'k', text: kind + (note ? ' · ' : '') }), note];
}
function postItem(p, href, { selected, group, pick } = {}) {
  const g = progress(p);
  const inner = [thumb(p), el('span', { class: 'item-body' },
    el('span', { class: 'item-kind', text: kindOf(p) + (isCarousel(p) && slidesOf(p).length ? ` · ${slidesOf(p).length} slides` : '') }),
    el('span', { class: 'item-title', text: p.title || 'Post' }),
    el('span', { class: 'item-sub' + (g.cls === 'working' ? ' amber' : '') }, ...itemSub(p, group)),
    el('span', { class: `chip ${g.cls}`, text: g.chip }))];
  if (pick) {
    const on = S.picked.has(p.id);
    return el('button', { type: 'button', class: `item pick${on ? ' selected' : ''}`, 'aria-pressed': String(on), 'data-fid': p.id, onclick: () => togglePick(p.id) }, el('span', { class: 'pick-mark', 'aria-hidden': 'true', text: on ? '✓' : '' }), ...inner);
  }
  return el('a', { class: `item${selected ? ' selected' : ''}`, href, 'aria-current': selected ? 'true' : null, 'data-fid': p.id }, ...inner);
}
function togglePick(id) {
  if (S.picked.has(id)) S.picked.delete(id);
  else if (S.picked.size >= 4) { toast('You can share up to 4 posts at once.'); return; } else S.picked.add(id);
  renderMain();
}

function designPreview(spec) {
  const [w, h] = SIZES[spec.format] || SIZES.post;
  const box = el('div', { class: 'design', style: `aspect-ratio:${w}/${h}` });
  const f = el('iframe', { src: `templates/canvas.html?v=${TEMPLATE_V}`, width: w, height: h, title: 'Live preview of the design', tabindex: '-1' });
  const fit = () => { f.style.transform = `scale(${box.clientWidth / w})`; };
  box.draw = (s) => {
    try {
      const win = f.contentWindow; if (!win || !win.render) return;
      const x = { ...s, animate: false }; if (x.photo) x.photo = new URL(x.photo, location.href).href;
      win.document.documentElement.style.cssText = `--w:${w}px;--h:${h}px;--u:${w / 1080}px`;
      win.SPEC = x; win.render();
      clearTimeout(box.fitTimer);
      box.fitTimer = setTimeout(() => { try { box.onfit && box.onfit(win.FIT); } catch { /* ignore */ } }, 450);
    } catch { /* the template isn't ready yet */ }
  };
  f.addEventListener('load', () => { fit(); box.draw(box.spec); });
  new ResizeObserver(fit).observe(box);
  box.spec = spec; box.append(f);
  return box;
}
// Swipe through a carousel's slides, as LinkedIn shows a document post.
function carouselView(p) {
  const urls = slidesOf(p);
  const track = el('div', { class: 'car-track', tabindex: '0', role: 'group', 'aria-label': `${urls.length} slides. Swipe or use the arrow keys.` },
    ...urls.map((u, i) => el('img', { src: u, alt: i === 0 ? (p.alt || p.title || 'Slide 1') : `Slide ${i + 1}`, loading: i ? 'lazy' : null, draggable: 'false' })));
  const count = el('span', { class: 'car-count', 'aria-live': 'polite', text: `1 of ${urls.length}` });
  const go = (d) => { const w = track.clientWidth; track.scrollTo({ left: Math.round(track.scrollLeft / w + d) * w, behavior: 'smooth' }); };
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / track.clientWidth); S.slide[p.id] = i; count.textContent = `${i + 1} of ${urls.length}`; }, { passive: true });
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
  if (S.slide[p.id]) requestAnimationFrame(() => { track.scrollLeft = S.slide[p.id] * track.clientWidth; });
  return el('div', { class: 'car' }, track,
    el('button', { class: 'car-btn prev', type: 'button', 'aria-label': 'Previous slide', text: '‹', onclick: () => go(-1) }),
    el('button', { class: 'car-btn next', type: 'button', 'aria-label': 'Next slide', text: '›', onclick: () => go(1) }), count);
}
function mediaView(p) {
  const [w, h] = ratioOf(p);
  let inner;
  if (p.needsRender && p.specEdit) {
    const spec = Array.isArray(p.specEdit.slides) ? p.specEdit.slides[Math.min(S.slide[p.id] || 0, p.specEdit.slides.length - 1)] : p.specEdit;
    inner = el('div', { class: 'draft' }, designPreview(spec), el('p', { class: 'draft-tag', text: `A draft of your edit. Claude is drawing version ${ver(p) + 1}.` }));
  } else if (p.kind === 'reel' && p.videoUrl) {
    inner = el('video', { src: p.videoUrl, poster: p.imageUrl || null, controls: true, loop: true, muted: true, autoplay: true, playsinline: true, preload: 'metadata', 'aria-label': p.alt || p.title || 'Reel' });
  } else if (isCarousel(p) && slidesOf(p).length) inner = carouselView(p);
  else if (p.imageUrl) inner = el('img', { src: p.imageUrl, alt: p.alt || p.title || 'The post' });
  else inner = el('div', { class: 'no-img', text: 'The image is on its way' });
  return el('div', { class: 'media', style: `--aw:${w};--ah:${h}` }, inner);
}
function historyView(p) {
  const h = Array.isArray(p.history) ? p.history : [];
  if (!h.length) return null;
  return el('details', { class: 'hist' }, el('summary', { text: `Earlier versions (${h.length})` }),
    el('div', { class: 'hist-list' }, ...h.slice().reverse().map((v) => el('div', { class: 'hist-item' },
      v.imageUrl ? el('img', { src: v.imageUrl, alt: `Version ${v.version}`, loading: 'lazy' }) : el('span'),
      el('p', {}, el('strong', { text: `Version ${v.version}` }), v.feedback ? el('span', { text: ` · You asked: ${[...(v.feedback.picks || []), v.feedback.note].filter(Boolean).join(' · ')}` }) : null)))));
}

/* ---------- Ready for review ---------- */
function viewReview(main) {
  const groups = reviewGroups();
  const ids = groups.flatMap((g) => g.posts.map((p) => p.id));
  if (wide() && S.mode !== 'edit' && (!S.openId || !S.posts[S.openId]) && ids.length) {
    const first = groups.flatMap((g) => g.posts).find((p) => p.status === 'review');
    if (first) { S.openId = first.id; history.replaceState(null, '', `#/review/${encodeURIComponent(first.id)}`); }
  }
  if (S.mode === 'edit') return main.append(editView(S.posts[S.openId]));
  const list = reviewList(groups);
  if (!wide()) { // phone: the list, or one post
    if (S.openId && S.posts[S.openId]) return main.append(postView(S.posts[S.openId], groups, 'review'));
    return main.append(list);
  }
  const open = S.openId && S.posts[S.openId];
  main.append(el('div', { class: 'split' }, list, open ? postView(open, groups, 'review') : emptyPane(groups)));
}
function emptyPane(groups) {
  const approved = S.banner;
  return el('section', { class: 'pane' }, approved ? bannerView() : null, el('div', { class: 'pane-scroll empty-pane' },
    el('h2', { text: 'You\'re all caught up' }),
    el('p', { text: groups.length ? 'Pick a post from the list.' : 'Nothing is waiting for you. New posts appear here as Claude makes them.' }),
    el('p', {}, el('a', { href: '#/coming', text: 'See what\'s going out in Coming up' }), ' or ', el('a', { href: '#/briefs', text: 'create a brief' }), '.')));
}
function reviewList(groups) {
  const n = reviewPosts().length;
  const viewToggle = wide() ? el('div', { class: 'seg', role: 'group', 'aria-label': 'Show posts as' },
    ...[['list', 'List'], ['grid', 'Grid']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(S.listView === v), text: t, onclick: () => setListView(v) }))) : null;
  const top = el('div', { class: 'list-top' }, el('span', { class: 'muted', text: S.loaded ? `${n} to review` : '' }), viewToggle,
    null);
  const body = [top];
  if (!wide() && S.banner) body.unshift(bannerView());
  if (S.picking) body.push(el('p', { class: 'pick-note', text: 'Tap up to 4 posts, then make one link to send.' }));
  if (!S.loaded) body.push(el('p', { class: 'muted', text: S.failed ? 'The posts couldn\'t be loaded. Pull to refresh, or reload the page.' : 'Loading…' }));
  else if (!groups.length) body.push(el('div', { class: 'empty' }, el('strong', { text: 'Nothing to review' }), el('p', { text: 'New posts appear here when they\'re ready for you.' })));
  for (const g of groups) {
    const heading = el('div', { class: 'group-head' }, el('div', {},
      g.eyebrow ? el('span', { class: 'eyebrow', text: g.eyebrow }) : null,
      el('h2', { text: `${g.title} · ${g.posts.length}` })),
      null);
    body.push(el('section', { class: `group g-${g.key.split(':')[0]}`, 'aria-label': g.title }, heading, g.sub ? el('p', { class: 'muted small', text: g.sub }) : null,
      el('div', { class: 'items' }, ...g.posts.map((p) => postItem(p, `#/review/${encodeURIComponent(p.id)}`, { selected: wide() && p.id === S.openId, group: g, pick: S.picking })))));
  }
  if (!wide() && S.loaded) body.push(el('section', { class: 'done-box' }, el('h2', { text: 'When you\'re done here' }),
    el('p', {}, 'Approved posts go straight into Buffer. See what\'s going out in ', el('a', { href: '#/coming', text: 'Coming up' }), ', or ', el('a', { href: '#/briefs', text: 'create a brief' }), '.')));
  const col = el('aside', { class: `list view-${wide() ? S.listView : 'grid'}`, 'aria-label': 'Posts to review' }, el('div', { class: 'list-scroll', 'data-keep': 'list' }, ...body));
  if (S.picking) col.append(el('div', { class: 'pick-bar' }, el('span', { text: `${S.picked.size} of 4 picked` }),
    el('button', { type: 'button', class: 'btn good', disabled: S.picked.size ? null : true, text: S.picked.size > 1 ? 'Make one link' : 'Make a link', onclick: () => openShare([...S.picked]) })));
  return col;
}
function shareSet(g) {
  const ps = g.posts.filter((p) => p.status === 'review' && p.imageUrl);
  if (!ps.length) return toast('Nothing in this set is ready to share yet.');
  if (ps.length > 4) toast('A link holds up to 4 posts, so this one has the first 4.');
  openShare(ps.slice(0, 4).map((p) => p.id));
}

/* ---------- a post, opened ---------- */
function bannerView() {
  const b = S.banner; if (!b) return null;
  return el('div', { class: 'banner', role: 'status' },
    el('span', {}, el('b', { text: b.text }), b.sub ? el('span', { text: ' ' + b.sub }) : null, b.link ? [' ', el('a', { href: b.link.href, text: b.link.text })] : null),
    b.undo ? el('button', { type: 'button', class: 'banner-undo', text: 'Undo', onclick: b.undo }) : null,
    el('button', { type: 'button', class: 'banner-x', 'aria-label': 'Dismiss', text: '✕', onclick: () => { S.banner = null; renderMain(); } }));
}
function postNavRow(p, groups, tab) {
  const g = tab === 'review' ? groupOf(groups, p.id) : null;
  const i = g ? g.posts.findIndex((x) => x.id === p.id) : -1;
  const label = g ? `${g.title}${g.posts.length > 1 ? ` · ${i + 1} of ${g.posts.length}` : ''}` : (tab === 'coming' ? 'Coming up' : tab === 'done' ? 'Done' : '');
  const step = (d) => { const t = g.posts[i + d]; if (t) go('review', t.id, { replace: true }); };
  const back = !wide() ? el('a', { class: 'back', href: `#/${tab}`, text: tab === 'review' ? '‹ Back' : `‹ Back to ${tab === 'coming' ? 'Coming up' : 'Done'}` }) : (tab !== 'review' ? el('a', { class: 'back', href: `#/${tab}`, text: `‹ Back to ${tab === 'coming' ? 'Coming up' : 'Done'}` }) : null);
  return el('div', { class: 'post-nav' }, back, el('span', { class: 'muted', text: label }),
    g && g.posts.length > 1 ? el('span', { class: 'prevnext' },
      el('button', { type: 'button', class: 'btn small white', disabled: i <= 0 ? true : null, onclick: () => step(-1), 'aria-label': 'Previous post', text: '‹' }),
      el('button', { type: 'button', class: 'btn small white', disabled: i >= g.posts.length - 1 ? true : null, onclick: () => step(1), 'aria-label': 'Next post', text: '›' })) : null);
}
// Laptop: the post's title, where it sits in the list, and Previous / Next, in one bar above it.
function paneHead(p, groups, tab) {
  const g = tab === 'review' ? groupOf(groups, p.id) : null;
  const all = tab === 'review' ? groups.flatMap((x) => x.posts) : [];
  const i = all.findIndex((x) => x.id === p.id);
  const step = (d) => { const t = all[i + d]; if (t) go('review', t.id, { replace: true }); };
  const back = tab !== 'review' ? el('a', { class: 'back', href: `#/${tab}`, text: `‹ ${tab === 'coming' ? 'Coming up' : 'Done'}` }) : null;
  return el('div', { class: 'pane-head' }, back,
    el('div', { class: 'ph-title' },
      el('span', { class: 'eyebrow', text: g ? g.title : (tab === 'coming' ? 'Coming up' : 'Done') }),
      el('h2', { class: 'post-title', id: 'post-title', text: p.title || 'Post' }),
      el('p', { class: 'post-meta', text: `${kindOf(p)} · ${(p.channels || ['linkedin']).map((c) => (c === 'linkedin' ? 'LinkedIn' : c[0].toUpperCase() + c.slice(1))).join(' and ')} · ${whenText(p)}` })),
    all.length > 1 && i >= 0 ? el('div', { class: 'prevnext' },
      el('button', { type: 'button', class: 'btn white', disabled: i <= 0 ? true : null, onclick: () => step(-1), 'aria-label': 'Previous post', text: '‹ Previous' }),
      el('button', { type: 'button', class: 'btn white', disabled: i >= all.length - 1 ? true : null, onclick: () => step(1), 'aria-label': 'Next post', text: 'Next ›' })) : null);
}
function postView(p, groups, tab) {
  const g = progress(p);
  const captionText = cap(p);
  let capBox;
  if (wide() && captionText.length > 150) {
    const open = { v: false };
    const short = captionText.replace(/\n\s*\n/g, '\n');
    const para = el('p', { class: 'caption clamp3', text: short });
    const more = el('button', { type: 'button', class: 'linkbtn', text: 'Show all', 'aria-expanded': 'false', onclick: () => { open.v = !open.v; para.classList.toggle('clamp3', !open.v); para.textContent = open.v ? captionText : short; more.textContent = open.v ? 'Show less' : 'Show all'; more.setAttribute('aria-expanded', String(open.v)); } });
    capBox = el('div', { class: 'cap-box' }, el('div', { class: 'cap-head' }, el('span', { class: 'label', text: p.captionEdit ? 'Post text (your edit)' : 'Post text' }), more), para);
  } else if (!wide() && captionText.length > 190) {
    const open = { v: false };
    const para = el('p', { class: 'caption clamp', text: captionText });
    const more = el('button', { type: 'button', class: 'linkbtn', text: 'more', 'aria-expanded': 'false', onclick: () => { open.v = !open.v; para.classList.toggle('clamp', !open.v); more.textContent = open.v ? 'less' : 'more'; more.setAttribute('aria-expanded', String(open.v)); } });
    capBox = el('div', { class: 'cap-box' }, el('span', { class: 'label', text: p.captionEdit ? 'Post text (your edit)' : 'Post text' }), para, more);
  } else capBox = el('div', { class: 'cap-box' }, el('span', { class: 'label', text: p.captionEdit ? 'Post text (your edit)' : 'Post text' }), el('p', { class: 'caption', text: captionText }));
  const stateNote = p.needsRender ? el('p', { class: 'note working', role: 'status', text: `Your edit is saved. Updating, back within the hour: Claude is drawing version ${ver(p) + 1}.` })
    : p.status === 'changes' ? el('p', { class: 'note working', role: 'status', text: `Claude is on it · back within the hour${p.feedback ? ` (${[...(p.feedback.picks || []), p.feedback.note].filter(Boolean).join(' · ')})` : ''}` })
      : g.cls === 'ready' && g.chip.startsWith('Version') ? el('p', { class: 'note ready', role: 'status', text: `${g.chip}.${p.changeNote ? ' What changed: ' + p.changeNote : ''}` })
        : ver(p) > 1 && p.changeNote && p.status === 'review' ? el('p', { class: 'note ready', text: `What changed: ${p.changeNote}` }) : null;
  if (wide()) {
    // Laptop: one focused column, the post with its post text underneath, as on LinkedIn, and the
    // buttons straight after it (they stick to the bottom of the window when the caption is long).
    const [w, h] = ratioOf(p);
    const stage = el('div', { class: 'post-stage', style: `--aw:${w};--ah:${h}` },
      stateNote && stateNote.classList.contains('working') ? stateNote : null, mediaView(p), capBox, p.about ? el('p', { class: 'about', text: p.about }) : null, historyView(p));
    return el('section', { class: 'pane', 'aria-labelledby': 'post-title' },
      paneHead(p, groups, tab), bannerView(),
      el('div', { class: 'pane-scroll', 'data-keep': 'pane' }, stage, actionBar(p, groups, tab)));
  }
  // Phone: the same order as the laptop. Title first, then the post, then its caption.
  const head = el('div', { class: 'post-head' },
    el('h2', { class: 'post-title', id: 'post-title', text: p.title || 'Post' }),
    el('p', { class: 'post-meta', text: `${kindOf(p)} · ${(p.channels || ['linkedin']).map((c) => (c === 'linkedin' ? 'LinkedIn' : c[0].toUpperCase() + c.slice(1))).join(' and ')} · ${whenText(p)}` }));
  const info = el('div', { class: 'info-col' },
    p.about ? el('p', { class: 'about', text: p.about }) : null,
    stateNote, capBox, historyView(p));
  const body = el('div', { class: 'post-body' }, head, el('div', { class: 'media-col' }, mediaView(p)), info);
  return el('section', { class: 'pane', 'aria-labelledby': 'post-title' },
    postNavRow(p, groups, tab),
    bannerView(),
    el('div', { class: 'pane-scroll', 'data-keep': 'pane' }, body),
    actionBar(p, groups, tab));
}

/* ---------- the action bar: Remove, Save for later, Share, Edit words, Ask for changes, Approve ---------- */
function actionBar(p, groups, tab) {
  const busyNow = S.busyIds.has(p.id);
  const dis = busyNow ? true : null;
  const left = el('div', { class: 'bar-left' },
    el('button', { type: 'button', class: 'txtbtn red', disabled: dis, text: 'Remove', onclick: () => setStatus(p, 'removed', groups, tab) }),
    el('button', { type: 'button', class: 'txtbtn', disabled: dis, text: 'Save for later', onclick: () => setStatus(p, 'saved', groups, tab) }));
  const share = null; // no preview-sharing page for Nick's Studio
  const edit = el('button', { type: 'button', class: 'btn amber', disabled: dis, text: p.spec ? 'Edit words' : 'Edit post text', onclick: () => go(tab, p.id, { edit: true }) });
  const ask = el('button', { type: 'button', class: 'btn amber', disabled: dis, text: 'Ask for changes', onclick: () => openChangesSheet(p, groups, tab) });
  let mid = '', rightBtns;
  if (['saved', 'removed'].includes(p.status)) {
    mid = p.status === 'saved' ? 'Saved for later.' : 'Not posting.';
    return el('div', { class: 'bar' }, el('div', { class: 'bar-left' }), el('span', { class: 'bar-mid', text: mid }), el('div', { class: 'bar-right' }, share,
      el('button', { type: 'button', class: 'btn good', disabled: dis, text: 'Bring back to review', onclick: () => bringBack(p) })));
  }
  if (p.status === 'posted') return el('div', { class: 'bar' }, el('div', { class: 'bar-left' }), el('span', { class: 'bar-mid', text: `Posted ${p.scheduledFor ? fmt(p.scheduledFor) : ''}` }), el('div', { class: 'bar-right' }, share));
  if (p.status === 'changes') {
    mid = 'Claude is on it · back within the hour';
    rightBtns = [el('button', { type: 'button', class: 'btn white', disabled: dis, text: 'Undo, it\'s fine as it is', onclick: () => undoChanges(p) })];
  } else if (p.needsRender) {
    mid = 'Updating, back within the hour. You can approve it when it\'s back.';
    rightBtns = [share, el('button', { type: 'button', class: 'btn good', disabled: true, text: 'Approve' })];
  } else if (['approved', 'scheduled'].includes(p.status) && !changedSinceApproval(p)) {
    mid = p.status === 'scheduled' ? `Approved version ${p.approvedVersion ?? ver(p)}. Going out ${fmt(p.scheduledFor)}. Changing it takes it out of Buffer until you approve it again.`
      : `Approved version ${p.approvedVersion ?? ver(p)}. Waiting for a Buffer slot.`;
    rightBtns = [edit, ask, el('button', { type: 'button', class: 'btn white', disabled: dis, text: 'Undo approval', onclick: () => undoApproval(p) })];
  } else {
    if (changedSinceApproval(p)) mid = `Changed since you approved version ${p.approvedVersion}: ${(p.changeNote || 'Claude made a new version').replace(/\.$/, '')}. Nothing goes to Buffer until you choose.`;
    else mid = ver(p) > 1 ? `Approving version ${ver(p)}${p.changeNote ? ' · ' + p.changeNote.charAt(0).toLowerCase() + p.changeNote.slice(1) : ''}` : 'Version 1';
    rightBtns = [edit, ask,
      el('button', { type: 'button', class: 'btn good big', disabled: dis, 'data-fid': 'approve', text: 'Approve', onclick: () => approve(p, groups, tab) })];
  }
  return el('div', { class: `bar st-${p.status}` }, left, el('span', { class: 'bar-mid', title: mid, text: mid }), el('div', { class: 'bar-right' }, ...rightBtns));
}

/* ---------- deciding ---------- */
async function guard(p, fn) {
  if (S.busyIds.has(p.id)) return;
  S.busyIds.add(p.id); renderMain();
  try { return await fn(); } finally { S.busyIds.delete(p.id); renderMain(); }
}
const ahead = (groups, p) => { const g = groupOf(groups, p.id); return { g, next: nextToOpen(groups, p.id) }; };
function openNext(tab, nextId, current) {
  if (tab === 'review') { if (nextId) go('review', nextId, { replace: true }); else go('review', null, { replace: true }); }
  else if (tab === 'coming' || tab === 'done') go(tab, null, { replace: true });
}
async function approve(p, groups, tab) {
  const { g, next } = ahead(groups, p);
  return guard(p, async () => {
    try {
      let cur = p;
      if (cur.status === 'scheduled' || cur.bufferId) cur = await postAction(cur, 'pull');
      const doc = await api('POST', `/api/posts/${encodeURIComponent(cur.id)}/approve`, { rev: cur._rev, version: ver(cur), caption: cap(cur) });
      const done = absorb(doc);
      afterApprove(done, g, next, tab);
    } catch (e) { fail(e, p); }
  });
}
function afterApprove(done, g, next, tab) {
  S.run[g ? g.key : 'x'] = (S.run[g ? g.key : 'x'] || 0) + 1;
  const text = done.status === 'scheduled' ? `Approved and scheduled · ${fmt(done.scheduledFor)}` : `Approved · waiting for a Buffer slot (${ordinal(Math.max(1, orderQueue().findIndex((x) => x.id === done.id) + 1))} in line)`;
  const banner = { text, sub: `"${done.title || 'Post'}"`, undo: () => undoApproval(done, true) };
  const groupsNow = reviewGroups();
  const left = g && groupsNow.find((x) => x.key === g.key && x.posts.some((y) => y.status === 'review'));
  if (g && !left) {
    const n = g.briefId ? Object.values(S.posts).filter((x) => x.briefId === g.briefId && ['scheduled', 'approved'].includes(x.status)).length : S.run[g.key];
    banner.sub = `All done for ${g.title}. ${n} ${g.briefId ? 'scheduled' : 'approved'}.`;
    banner.link = { href: '#/coming', text: 'See Coming up' };
  }
  S.banner = banner;
  if (tab === 'review') { const target = next && S.posts[next] && S.posts[next].status === 'review' ? next : null; go('review', target, { replace: true }); }
  else { go(tab, null, { replace: true }); }
  renderHeader(); renderTabs();
}
async function undoApproval(p, fromBanner) {
  const cur = S.posts[p.id] || p;
  try {
    const back = await postAction(cur, 'unapprove');
    S.banner = null;
    toast('Back in Ready for review.');
    go('review', back.id);
    renderHeader(); renderTabs();
  } catch (e) { fail(e, cur); }
}
async function setStatus(p, status, groups, tab) {
  const { next } = ahead(groups, p);
  return guard(p, async () => {
    try {
      const cur = await pullIfNeeded(p);
      await patchPost(cur, { status, reviewedAt: Date.now(), queuePos: DEL, queueManual: DEL, fitWarning: DEL });
      S.banner = null;
      toast(status === 'saved' ? 'Saved for later.' : 'Removed. It\'s not going out.', { undo: () => restore(p.id) });
      openNext(tab, next, p);
    } catch (e) { fail(e, p); }
  });
}
async function restore(id) {
  const cur = S.posts[id]; if (!cur) return;
  try { await patchPost(cur, { status: 'review', reviewedAt: Date.now() }); toast('Back in Ready for review.'); renderAll(); } catch (e) { fail(e, cur); }
}
const bringBack = (p) => restore(p.id).then(() => go('review', p.id));
async function undoChanges(p) {
  return guard(p, async () => { try { await patchPost(p, { status: 'review', feedback: DEL, reviewedAt: Date.now() }); toast('Back in Ready for review.'); } catch (e) { fail(e, p); } });
}

/* ---------- Ask for changes ---------- */
function openChangesSheet(p, groups, tab) {
  const picks = new Set();
  const msg = el('p', { class: 'msg', role: 'alert' });
  const note = el('textarea', { id: 'chg-note', rows: '4', placeholder: 'For example: lead with the bridge-roles line, or make it a quote card' });
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'What should change?' }, ...PICKS.map((l) => el('button', { type: 'button', class: 'chipbtn', 'aria-pressed': 'false', text: l,
    onclick: (e) => { picks.has(l) ? picks.delete(l) : picks.add(l); e.currentTarget.setAttribute('aria-pressed', String(picks.has(l))); } })));
  const send = el('button', { type: 'button', class: 'btn amber big', text: 'Send to Claude', onclick: async () => {
    const text = note.value.trim();
    if (!picks.size && !text) { msg.textContent = 'Pick what to change, or write a note.'; return; }
    send.disabled = true; msg.textContent = '';
    const { next } = ahead(groups, p);
    try {
      const cur = await pullIfNeeded(p);
      await patchPost(cur, { status: 'changes', feedback: { picks: [...picks], note: text, at: Date.now(), version: ver(p) }, reviewedAt: Date.now(), queuePos: DEL, queueManual: DEL });
      closeDialog(); S.banner = null;
      toast('Claude is on it · back within the hour');
      openNext(tab, next, p); renderHeader(); renderTabs();
    } catch (e) { send.disabled = false; msg.textContent = explain(e, p); if (e instanceof ApiError && e.status === 409) { closeDialog(); fail(e, p); } }
  } });
  openDialog('Ask for changes', el('p', { class: 'dlg-text', text: `"${p.title || 'Post'}"${needsPull(p) && p.status !== 'review' ? '. It will come out of Buffer until you approve the new version.' : ''}` }),
    el('p', { class: 'label', text: 'What should change?' }), chips,
    el('label', { for: 'chg-note', class: 'label', text: 'Anything else?' }), note, msg,
    el('div', { class: 'dlg-acts' }, el('button', { type: 'button', class: 'btn quiet', text: 'Cancel', onclick: closeDialog }), send));
  chips.querySelector('button').focus();
}

/* ---------- Share ---------- */
const enc = encodeURIComponent;
async function openShare(ids) {
  const ps = ids.map((i) => S.posts[i]).filter(Boolean);
  if (!ps.length) return;
  const one = ps.length === 1;
  const note = el('p', { class: 'dlg-text', text: 'Making the link…' }), msg = el('p', { class: 'msg', 'aria-live': 'polite' });
  const opts = el('div', { class: 'share-opts' });
  const strip = el('div', { class: 'share-thumbs' }, ...ps.map((p) => el('figure', {}, thumb(p), el('figcaption', { text: p.title || 'Post' }))));
  openDialog(one ? 'Share a preview' : `Share ${ps.length} previews`, strip, note, opts, msg, el('div', { class: 'dlg-acts' }, el('button', { type: 'button', class: 'btn quiet', text: 'Close', onclick: closeDialog })));
  try {
    const r = await api('POST', '/api/share', { posts: ids });
    const link = r.url;
    const text = one ? `Here's a preview of the post "${ps[0].title || 'Post'}" (version ${ver(ps[0])}). Does it look right to you?` : `Here are previews of ${ps.length} posts: ${ps.map((x) => `"${x.title || 'Post'}"`).join(', ')}. Do they look right to you?`;
    const subject = one ? 'Preview: ' + (ps[0].title || 'post') : `Previews of ${ps.length} posts`;
    const out = [];
    if (navigator.share) out.push(el('button', { type: 'button', class: 'btn white', text: 'Share…', onclick: async () => { try { await navigator.share({ title: subject, text, url: link }); } catch (err) { if (err && err.name !== 'AbortError') msg.textContent = 'Sharing didn\'t work here. Try WhatsApp or Copy link.'; } } }));
    out.push(el('a', { class: 'btn white', href: `https://wa.me/?text=${enc(text + ' ' + link)}`, target: '_blank', rel: 'noopener', text: 'WhatsApp' }),
      el('a', { class: 'btn white', href: `sms:&body=${enc(text + ' ' + link)}`, text: 'Message' }),
      el('a', { class: 'btn white', href: `mailto:?subject=${enc(subject)}&body=${enc(text + '\n\n' + link)}`, text: 'Email' }),
      el('button', { type: 'button', class: 'btn white', text: 'Copy link', onclick: async () => {
        try { await navigator.clipboard.writeText(link); msg.textContent = 'Link copied. Paste it anywhere.'; } catch {
          const box = el('input', { value: link, readonly: true, 'aria-label': 'Preview link' }); msg.replaceChildren('Copying is blocked here. Select the link and copy it: ', box); box.focus(); box.select();
        } } }),
      el('a', { class: 'btn quiet', href: link, target: '_blank', rel: 'noopener', text: 'Open the page' }));
    opts.replaceChildren(...out);
    note.textContent = `This sends a link to a page with ${one ? `version ${ver(ps[0])}` : `these ${ps.length} posts`}, marked "Preview". It works until ${r.expires ? fmt(new Date(r.expires).toISOString()) : 'a few days from now'}, then stops.`;
  } catch (e) { note.textContent = e instanceof ApiError && e.status === 0 ? explain(e) : 'The preview link couldn\'t be made just now. Try again in a minute, or message Nick.'; }
}
function openSharePicker() {
  const cands = Object.values(S.posts).filter((p) => ['scheduled', 'approved', 'review'].includes(p.status) && p.imageUrl && !p.needsRender).sort(sortBy((p) => p.scheduledFor || p.deadline));
  const chosen = new Set();
  const go2 = el('button', { type: 'button', class: 'btn good', disabled: true, text: 'Make a link', onclick: () => openShare([...chosen]) });
  const count = el('span', { class: 'muted', text: '0 of 4 picked' });
  const list = el('div', { class: 'picker' }, ...cands.map((p) => el('label', { class: 'picker-row' },
    el('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) { if (chosen.size >= 4) { e.target.checked = false; toast('You can share up to 4 posts at once.'); return; } chosen.add(p.id); } else chosen.delete(p.id); count.textContent = `${chosen.size} of 4 picked`; go2.disabled = !chosen.size; } }),
    thumb(p), el('span', {}, el('b', { text: p.title || 'Post' }), el('span', { class: 'muted small', text: ` ${kindOf(p)} · ${progress(p).chip}` })))));
  openDialog('Share previews', el('p', { class: 'dlg-text', text: 'Pick up to 4 posts. They go in one link, so whoever opens it sees them together.' }), list, el('div', { class: 'dlg-acts' }, count, el('button', { type: 'button', class: 'btn quiet', text: 'Cancel', onclick: closeDialog }), go2));
}

/* ---------- Edit words ---------- */
const FIELDS = [['kicker', 'Small line above'], ['number', 'Number'], ['headline', 'Headline'], ['quote', 'The quote'], ['text', 'Line underneath'], ['byline', 'Who said it'], ['source', 'Where it\'s from'], ['cta', 'Button words'], ['url', 'Web address, bottom right']];
const FOOTER_DEFAULT = ['Nick Petrie'];
const hasFooterBar = () => true;
const slideSpec = (E) => (E.spec && Array.isArray(E.spec.slides) ? E.spec.slides[Math.min(E.slide, E.spec.slides.length - 1)] : E.spec);
function startEdit(p) {
  if (!p) return false;
  if (S.edit && S.edit.id === p.id) return true;
  S.edit = { id: p.id, base: p.spec ? JSON.parse(JSON.stringify(p.spec)) : null, spec: p.spec ? JSON.parse(JSON.stringify(p.spec)) : null, caption: cap(p), slide: 0, version: ver(p), busy: null, msg: '' };
  return true;
}
const editDirty = (E, p) => E.caption.trim() !== cap(p) || (E.spec && JSON.stringify(E.spec) !== JSON.stringify(E.base));
function editView(p) {
  if (!p) return el('section', { class: 'pane' }, el('p', { text: 'That post isn\'t here any more.' }));
  const E = S.edit;
  const cur = E.spec ? slideSpec(E) : null;
  const isReel = p.kind === 'reel';
  const live = cur ? designPreview(cur) : null;
  const fitNote = el('p', { class: 'fit-note', 'aria-live': 'polite', text: live ? 'Checking it fits…' : '' });
  if (live) live.onfit = (f) => { fitNote.className = 'fit-note' + (f && !f.ok ? ' bad' : ''); fitNote.textContent = f && !f.ok ? 'Too many words to fit inside the edges. Shorten them a little, or the logo and footer get cut off.' : 'Fits inside the edges ✓'; };
  const fields = [];
  if (cur) {
    for (const [k, label] of FIELDS) {
      if (typeof cur[k] !== 'string') continue;
      const id = `f-${k}`;
      const ta = el('textarea', { id, rows: k === 'headline' || k === 'text' || k === 'quote' ? '3' : '2', enterkeyhint: 'done' }); ta.value = cur[k];
      ta.addEventListener('input', () => { cur[k] = ta.value; live.draw(cur); });
      fields.push(el('div', { class: 'field' }, el('label', { for: id, text: label }), k === 'headline' ? el('span', { class: 'hint', text: 'Put [[double square brackets]] round words to highlight them.' }) : null, ta));
    }
    if (hasFooterBar(cur)) [['Bottom left', 0]].forEach(([label, n]) => {
      const id = `f-footer-${n}`, ta = el('textarea', { id, rows: '1' }); ta.value = (cur.footer || FOOTER_DEFAULT)[n] ?? '';
      ta.addEventListener('input', () => { const f = [...(cur.footer || FOOTER_DEFAULT)]; f[n] = ta.value; cur.footer = f; live.draw(cur); });
      fields.push(el('div', { class: 'field' }, el('label', { for: id, text: label }), ta));
    });
  }
  const capTa = el('textarea', { id: 'f-caption', rows: '12', class: 'cap-input' }); capTa.value = E.caption;
  capTa.addEventListener('input', () => { E.caption = capTa.value; });
  const tabs = cur && E.spec.slides ? el('div', { class: 'slide-pick', role: 'group', 'aria-label': 'Slide' }, el('span', { class: 'muted small', 'aria-hidden': 'true', text: 'Slide' }), ...E.spec.slides.map((_, i) => el('button', { type: 'button', class: 'chipbtn num', 'aria-pressed': String(i === E.slide), 'aria-label': `Slide ${i + 1}`, text: String(i + 1), onclick: () => { E.slide = i; renderMain(); } }))) : null;
  const next = ver(p) + 1;
  const reelNote = isReel && cur;
  const save = (approve) => saveEdit(p, approve);
  const cancel = async () => {
    if (editDirty(E, p) && !(await confirmBox('Leave without saving?', 'Your changes to the words will be lost.', 'Leave without saving', true))) return;
    S.edit = null; go(S.tab, p.id, { replace: true });
  };
  const bar = el('div', { class: 'bar edit-bar' },
    el('span', { class: 'bar-mid left', text: E.busy || (cur && !isReel ? `Saving makes version ${next} straight away. No waiting for Claude.` : reelNote ? `Reels are redrawn by Claude. If you change the design, it's back within the hour, then you approve it.` : 'Saving updates the post text straight away.') }),
    el('div', { class: 'bar-right' },
      el('button', { type: 'button', class: 'txtbtn', disabled: E.busy ? true : null, text: 'Cancel', onclick: cancel }),
      el('button', { type: 'button', class: 'btn white', disabled: E.busy ? true : null, text: 'Save, I\'ll approve later', onclick: () => save(false) }),
      el('button', { type: 'button', class: 'btn good big', disabled: E.busy ? true : null, text: 'Save and approve', onclick: () => save(true) })));
  const [aw, ah] = cur ? (SIZES[cur.format] || SIZES.post) : ratioOf(p);
  const left = cur ? el('div', { class: 'edit-preview' }, el('div', { class: 'media edit', style: `--aw:${aw};--ah:${ah}` }, live), tabs, fitNote) : null;
  const rewrite = el('p', { class: 'hint', 'aria-live': 'polite' }, 'Want Claude to rewrite it? ', el('button', { type: 'button', class: 'linkbtn', text: 'Ask for changes', onclick: () => openChangesSheet(p, reviewGroups(), S.tab) }), ' and pick "Change the wording".');
  const design = fields.length ? el('div', { class: 'edit-col edit-design' }, el('span', { class: 'label', text: tabs ? `On slide ${E.slide + 1} of ${E.spec.slides.length}` : 'On the design' }), ...fields) : null;
  const caption = el('div', { class: 'edit-col edit-caption' }, el('label', { class: 'label', for: 'f-caption', text: 'Post text' }), capTa, rewrite);
  const msg = E.msg ? el('p', { class: 'msg', role: 'alert', text: E.msg }) : null;
  if (wide()) {
    // Laptop: the same bar as the post above, the preview with its caption underneath, and the
    // words on the design beside it.
    return el('section', { class: 'edit-view', 'aria-labelledby': 'edit-title' },
      el('div', { class: 'pane-head editing-head' },
        el('div', { class: 'ph-title' }, el('span', { class: 'eyebrow', text: 'Editing the words' }), el('h2', { id: 'edit-title', class: 'post-title', text: p.title || 'Post' })),
        el('span', { class: 'muted small', text: 'The list is hidden while you edit.' })),
      el('div', { class: 'pane-scroll', 'data-keep': 'edit' },
        el('div', { class: `edit-grid${left ? '' : ' no-preview'}`, style: `--aw:${aw};--ah:${ah}` },
          el('div', { class: 'edit-left' }, left, caption), design, msg),
        bar));
  }
  return el('section', { class: 'edit-view', 'aria-labelledby': 'edit-title' },
    el('div', { class: 'edit-banner' }, el('h2', { id: 'edit-title', text: `Editing the words on "${p.title || 'Post'}"` })),
    el('div', { class: 'edit-body', 'data-keep': 'edit' }, left,
      el('div', { class: 'edit-fields' }, design, caption, msg)),
    bar);
}

// Draws one design in a hidden full-size copy of the template and returns it as a 1080-wide JPEG.
async function rasterise(spec) {
  if (!window.modernScreenshot) throw new Error('the picture maker didn\'t load, so check your connection and reload');
  const [w, h] = SIZES[spec.format] || SIZES.post;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.title = 'Drawing';
  f.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;border:0;pointer-events:none`;
  f.src = `templates/canvas.html?v=${TEMPLATE_V}`;
  document.body.append(f);
  try {
    await new Promise((ok, no) => { f.onload = ok; f.onerror = () => no(new Error('the design page didn\'t load')); setTimeout(() => no(new Error('the design page took too long')), 20000); });
    const win = f.contentWindow, doc = win.document;
    const x = { ...spec, animate: false }; if (x.photo) x.photo = new URL(x.photo, location.href).href;
    doc.documentElement.style.cssText = `--w:${w}px;--h:${h}px;--u:${w / 1080}px`;
    win.SPEC = x; win.render();
    await Promise.all(['400 40px "Source Serif 4 Display"', '400 40px "Source Serif 4"', '400 30px "Source Sans 3"', '600 30px "Source Sans 3"', '700 30px "Source Sans 3"'].map((s) => doc.fonts.load(s).catch(() => {})));
    await doc.fonts.ready; await sleep(350);
    const node = doc.querySelector('.canvas');
    return await window.modernScreenshot.domToBlob(node, { scale: 1, width: w, height: h, type: 'image/jpeg', quality: 0.92 });
  } finally { f.remove(); }
}
// Names are never reused, so a retry after a partial save adds a letter: -v3, -v3b, -v3c.
async function uploadImage(prefix, version, blob) {
  for (const suffix of ['', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    try {
      const r = await api('POST', `/api/upload?name=${enc(`${prefix}-v${version}${suffix}.jpg`)}`, blob, blob.type || 'image/jpeg');
      return r.url;
    } catch (e) { if (!(e instanceof ApiError && e.status === 409)) throw e; }
  }
  throw new Error('too many saved pictures with that name');
}
const histEntry = (p) => {
  const h = { version: ver(p), imageUrl: p.imageUrl, caption: cap(p), spec: p.spec };
  if (p.videoUrl) h.videoUrl = p.videoUrl;
  if (p.slideUrls) h.slideUrls = p.slideUrls;
  if (p.feedback) h.feedback = p.feedback;
  return JSON.parse(JSON.stringify(h));
};
async function saveEdit(p, approve) {
  const E = S.edit; if (!E || E.busy) return;
  const caption = E.caption.trim();
  if (!caption) { E.msg = 'The post text can\'t be empty.'; return renderMain(); }
  const live = S.posts[p.id] || p;
  if (live._rev !== p._rev && live.version !== E.version) { E.msg = 'Claude made a new version of this post while you were editing, so your words haven\'t been saved. Cancel to see the new version, then edit that one.'; return renderMain(); }
  const specChanged = !!E.spec && JSON.stringify(E.spec) !== JSON.stringify(E.base);
  const capChanged = caption !== cap(live);
  if (!specChanged && !capChanged) { S.edit = null; go(S.tab, p.id, { replace: true }); if (approve) { const groups = reviewGroups(); return approve && approvePost(live, groups); } toast('Nothing was changed.'); return; }
  const isReel = live.kind === 'reel';
  const next = ver(live) + 1;
  E.msg = ''; E.busy = specChanged && !isReel ? `Making version ${next}…` : 'Saving…'; renderMain();
  const groups = reviewGroups(); const { g, next: nextId } = ahead(groups, live);
  try {
    let cur = await pullIfNeeded(S.posts[p.id] || live);
    const set = { reviewedAt: Date.now() };
    if (capChanged) set.captionEdit = caption;
    if (specChanged && isReel) {
      Object.assign(set, { specEdit: E.spec, needsRender: true, renderAskedAt: Date.now() });
    } else if (specChanged) {
      const slides = Array.isArray(E.spec.slides) ? E.spec.slides : [E.spec];
      const urls = [];
      for (let k = 0; k < slides.length; k++) {
        E.busy = slides.length > 1 ? `Making version ${next}: slide ${k + 1} of ${slides.length}…` : `Making version ${next}…`; renderBar();
        const blob = await rasterise(slides[k]);
        urls.push(await uploadImage(Array.isArray(E.spec.slides) ? `${cur.id}-s${k + 1}` : cur.id, next, blob));
      }
      const now = Date.now();
      Object.assign(set, { version: next, history: [...(Array.isArray(cur.history) ? cur.history : []), histEntry(cur)], spec: E.spec, imageUrl: urls[0], renderedAt: now, reviewedAt: now, changeNote: DEL, feedback: DEL, needsRender: DEL, specEdit: DEL });
      if (Array.isArray(E.spec.slides)) set.slideUrls = urls;
    }
    E.busy = 'Saving…'; renderBar();
    const saved = await patchPost(cur, set);
    S.edit = null;
    if (approve && !(isReel && specChanged)) {
      go(S.tab, saved.id, { replace: true });
      const doc = await api('POST', `/api/posts/${encodeURIComponent(saved.id)}/approve`, { rev: saved._rev, version: ver(saved), caption: cap(saved) });
      afterApprove(absorb(doc), g, nextId, S.tab);
    } else {
      go(S.tab, saved.id, { replace: true });
      toast(isReel && specChanged ? 'Saved. Updating, back within the hour.' : (specChanged ? `Saved as version ${ver(saved)}. Have a look, then approve it.` : 'Saved.'));
    }
    renderHeader(); renderTabs();
  } catch (e) {
    E.busy = null;
    E.msg = explain(e, p) + (e instanceof ApiError ? '' : ' Your words are still here, so you can try again.');
    renderMain();
    if (e instanceof ApiError && e.status === 409) toast(E.msg, { error: true });
  }
}
function renderBar() { const b = document.querySelector('.edit-bar .bar-mid'); if (b && S.edit) b.textContent = S.edit.busy || ''; document.querySelectorAll('.edit-bar button').forEach((x) => { x.disabled = !!S.edit?.busy; }); }
const approvePost = (p, groups) => approve(p, groups, S.tab);

/* ---------- Coming up ---------- */
function viewComing(main) {
  if (S.mode === 'edit' && S.posts[S.openId]) return main.append(editView(S.posts[S.openId]));
  if (S.openId && S.posts[S.openId]) { const groups = reviewGroups(); return main.append(postView(S.posts[S.openId], groups, 'coming')); }
  if (!S.loaded) return main.append(el('p', { class: 'padded muted', text: 'Loading…' }));
  main.append(wide() ? comingWide() : comingNarrow());
}
function freeSlots(from, days) {
  const slots = (S.buffer && S.buffer.slots) || {};
  const { free } = bufferInfo();
  const taken = new Set(scheduledPosts().filter((p) => p.scheduledFor).map((p) => new Date(p.scheduledFor).getTime()));
  const out = []; let left = free;
  for (let i = 0; i < days && left > 0; i++) {
    const d = new Date(from.getTime() + i * 864e5);
    const k = dayKey(d.toISOString());
    const wd = new Date(k + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toLowerCase();
    const t = slots[wd]; if (!t) continue;
    const at = new Date(`${k}T${t}:00`).getTime();
    const iso = londonToIso(k, t);
    if (Date.parse(iso) < Date.now()) continue;
    if ([...taken].some((x) => Math.abs(x - Date.parse(iso)) < 60000)) continue;
    out.push({ key: k, time: t, iso }); left--;
  }
  return out;
}
// A London wall-clock time on a given day, as an ISO instant.
function londonToIso(k, t) {
  const guess = new Date(`${k}T${t}:00Z`);
  const off = (Date.parse(`${k}T${t}:00Z`) - Date.parse(new Date(guess).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T') + 'Z'));
  return new Date(guess.getTime() + off).toISOString();
}
function comingWide() {
  const start = new Date(); const startKey = todayKey();
  const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(new Date(startKey + 'T12:00:00Z').getTime() + i * 864e5); return d.toISOString().slice(0, 10); });
  const byDay = {};
  for (const p of scheduledPosts()) if (p.scheduledFor) (byDay[dayKey(p.scheduledFor)] ||= []).push(p);
  for (const k in byDay) byDay[k].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const events = {}; for (const b of Object.values(S.briefs)) if (b.eventDate) (events[b.eventDate] ||= []).push(b.what || 'Event');
  const deadlines = {};
  for (const p of Object.values(S.posts)) if (p.deadline && ['review', 'changes', 'approved', 'scheduled'].includes(p.status)) { const k = dayKey(p.deadline); const nm = briefName(p) || p.title || 'Post'; (deadlines[k] ||= new Set()).add(nm); }
  const free = {}; for (const f of freeSlots(start, 28)) (free[f.key] ||= []).push(f);
  const head = [...Array(7)].map((_, i) => new Date(new Date(startKey + 'T12:00:00Z').getTime() + i * 864e5).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }));
  const cells = days.map((k, i) => {
    const d = new Date(k + 'T12:00:00Z'), isToday = k === startKey;
    const num = (i === 0 || d.getUTCDate() === 1) ? `${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}` : String(d.getUTCDate());
    return el('li', { class: `day${isToday ? ' today' : ''}${events[k] ? ' event' : ''}`, 'aria-label': `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${isToday ? ', today' : ''}` },
      el('div', { class: 'dnum' }, el('b', { text: num }), isToday ? el('span', { class: 'muted', text: ' · today' }) : null),
      ...(events[k] || []).map((t) => el('span', { class: 'cal-chip ev', title: `Event: ${t}` }, el('span', { class: 't', text: `Event: ${t}` }))),
      ...(byDay[k] || []).map((p) => el('a', { class: 'cal-post', href: `#/coming/${encodeURIComponent(p.id)}`, title: `${p.title || 'Post'} · ${fmt(p.scheduledFor)}` },
        p.imageUrl ? el('img', { src: p.imageUrl, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'cal-noimg', text: kindOf(p) }),
        el('span', { class: 'cal-time', text: hm(p.scheduledFor) }),
        el('span', { class: 't', text: p.title || 'Post' }))),
      ...(free[k] || []).map((f) => el('span', { class: 'cal-chip free', title: 'Buffer posts at this time. Nothing is booked here yet.' }, el('span', { class: 't', text: `${f.time} free` }))),
      ...[...(deadlines[k] || [])].map((n) => el('span', { class: 'cal-chip dl', title: `Deadline: ${n}` }, el('span', { class: 't', text: `Deadline: ${n}` }))));
  });
  const cal = el('div', { class: 'cal-col' },
    el('p', { class: 'muted', text: 'The next 3 weeks, at the times Buffer will post them. Dashed = a free Buffer slot.' }),
    el('div', { class: 'cal-head', 'aria-hidden': 'true' }, ...head.map((h) => el('span', { text: h }))),
    el('ol', { class: 'cal-grid' }, ...cells));
  return el('div', { class: 'coming' }, el('div', { class: 'cal-scroll', 'data-keep': 'cal' }, cal), queueColumn());
}
function comingNarrow() {
  const wrap = el('div', { class: 'coming-narrow' });
  wrap.append(el('div', { class: 'coming-top' }, el('p', { class: 'muted', text: 'The next 3 weeks, as Buffer will post them.' }), el('button', { type: 'button', class: 'btn small white', text: 'Share previews', onclick: () => openSharePicker() })));
  const posts = scheduledPosts().filter((p) => p.scheduledFor).sort(sortBy((p) => p.scheduledFor));
  const free = freeSlots(new Date(), 28);
  const wk = new Map();
  const add = (iso) => { const k = weekStart(iso).toISOString().slice(0, 10); if (!wk.has(k)) wk.set(k, { posts: [], free: [] }); return wk.get(k); };
  posts.forEach((p) => add(p.scheduledFor).posts.push(p));
  free.forEach((f) => add(f.iso).free.push(f));
  const thisWeek = weekStart(new Date().toISOString()).toISOString().slice(0, 10);
  [...wk].sort(([a], [b]) => a.localeCompare(b)).forEach(([k, w]) => {
    const label = k === thisWeek ? 'This week' : new Date(new Date(thisWeek + 'T12:00:00Z').getTime() + 7 * 864e5).toISOString().slice(0, 10) === k ? 'Next week' : `Week of ${new Date(k + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
    const rows = w.posts.map((p) => schedRow(p));
    const fr = w.free;
    if (fr.length && fr.length <= 2) fr.forEach((f) => rows.push(el('div', { class: 'free-line', text: `${dayText(f.iso)}, ${f.time} · free Buffer slot` })));
    else if (fr.length) rows.push(el('div', { class: 'free-line', text: `${dayText(fr[0].iso)} to ${dayText(fr.at(-1).iso)} · ${plural(fr.length, 'free Buffer slot')}` }));
    wrap.append(el('section', { class: 'week' }, el('h2', { class: 'muted', text: label }), ...rows));
  });
  if (!posts.length && !free.length) wrap.append(el('p', { class: 'muted', text: 'Nothing is scheduled yet. Approved posts appear here once Buffer has a slot.' }));
  wrap.append(queueColumn());
  return wrap;
}
function schedRow(p) {
  return el('a', { class: 'row', href: `#/coming/${encodeURIComponent(p.id)}` }, thumb(p), el('span', { class: 'item-body' },
    el('span', { class: 'item-title', text: p.title || 'Post' }), el('span', { class: 'item-sub', text: `${kindOf(p)}${briefName(p) ? ' · ' + briefName(p) : ' · weekly plan'}` }), chip(p)));
}
function swapCandidate() {
  return scheduledPosts().filter((p) => !p.deadline).sort((a, b) => (b.scheduledFor || '').localeCompare(a.scheduledFor || ''))[0] || null;
}
function queueColumn() {
  const q = orderQueue();
  const claude = Object.values(S.posts).filter((p) => p.status === 'changes');
  const col = el('aside', { class: 'queue-col', 'aria-label': 'Approved, waiting for a Buffer slot', 'data-keep': 'queue' });
  col.append(el('h2', { text: `Approved, waiting for a Buffer slot · ${q.length}` }), el('p', { class: 'muted small', text: 'Buffer holds 10 at a time. These go in, in this order, as posts go out.' }));
  const warned = q.filter((p) => p.fitWarning);
  for (const p of warned) {
    const out = swapCandidate();
    const dl = (p.fitWarning && p.fitWarning.deadline) || p.deadline;
    col.append(el('div', { class: 'warn', role: 'alert' },
      el('strong', { text: dl ? `Won't go out before ${dayText(dl)}` : 'Won\'t go out in time' }),
      el('p', { text: `"${p.title || 'Post'}" needs a slot${dl ? ' before then' : ''}, and Buffer is full until then.` }),
      out ? el('button', { type: 'button', class: 'btn good', text: `Make room: swap out "${out.title || 'Post'}"`, onclick: () => makeRoom(p, out) })
        : el('p', { class: 'small', text: 'Nothing in Buffer can be swapped out, because every booked post has a deadline.' })));
  }
  if (!q.length) col.append(el('p', { class: 'muted', text: 'Nothing is waiting. Approved posts go straight into Buffer while it has room.' }));
  const ul = el('ol', { class: 'queue' });
  const rebuild = () => { /* the DOM is the order while dragging; see saveOrder */ };
  q.forEach((p, i) => ul.append(queueItem(p, i, q.length, ul)));
  col.append(ul);
  if (q.length) col.append(el('p', { class: 'muted small', text: 'Drag to reorder, or use the arrows. Click any post in the calendar to see it. Changing a scheduled post takes it out of Buffer until you approve it again.' }));
  if (claude.length) col.append(el('h3', { class: 'with-claude', text: `Claude is on it · ${claude.length}` }), el('div', { class: 'items' }, ...claude.map((p) => postItem(p, `#/review/${encodeURIComponent(p.id)}`))));
  return col;
}
function queueItem(p, i, n, ul) {
  const li = el('li', { class: 'q-item', draggable: wide() ? 'true' : null, 'data-id': p.id });
  const info = `${ordinal(i + 1)} in line · ${p.deadline ? 'by ' + dayText(p.deadline) : 'no deadline'}`;
  const move = (d) => { const items = [...ul.children], j = items.indexOf(li) + d; if (j < 0 || j >= items.length) return; ul.insertBefore(li, d < 0 ? items[j] : items[j].nextSibling); saveOrder(ul, li); };
  li.append(el('span', { class: 'handle', 'aria-hidden': 'true', text: '⋮⋮' }), thumb(p),
    el('a', { class: 'item-body', href: `#/coming/${encodeURIComponent(p.id)}` }, el('span', { class: 'item-title', text: p.title || 'Post' }), el('span', { class: `item-sub${p.fitWarning ? ' red' : ''}`, text: info })),
    el('span', { class: 'q-btns' },
      el('button', { type: 'button', class: 'btn white icon', 'aria-label': `Move "${p.title || 'post'}" up`, disabled: i === 0 ? true : null, text: '↑', onclick: () => move(-1) }),
      el('button', { type: 'button', class: 'btn white icon', 'aria-label': `Move "${p.title || 'post'}" down`, disabled: i === n - 1 ? true : null, text: '↓', onclick: () => move(1) })));
  li.addEventListener('dragstart', (e) => { S.dragging = true; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); });
  li.addEventListener('dragend', () => { li.classList.remove('dragging'); S.dragging = false; saveOrder(ul, li); });
  li.addEventListener('dragover', (e) => {
    e.preventDefault(); const drag = ul.querySelector('.dragging'); if (!drag || drag === li) return;
    const r = li.getBoundingClientRect(); ul.insertBefore(drag, e.clientY < r.top + r.height / 2 ? li : li.nextSibling);
  });
  return li;
}
async function saveOrder(ul) {
  const ids = [...ul.children].map((x) => x.dataset.id);
  const before = orderQueue().map((p) => p.id);
  if (ids.join() === before.join()) return;
  // Reflect the new order locally while the server catches up.
  ids.forEach((id, i) => { if (S.posts[id]) { S.posts[id].queuePos = i + 1; S.posts[id].queueManual = true; } });
  try { await api('POST', '/api/queue/order', { ids }); toast('New order saved.'); await refresh(); } catch (e) { fail(e); await refresh(); }
  renderMain();
}
async function makeRoom(p, out) {
  if (!(await confirmBox('Make room?', `"${out.title || 'Post'}" comes out of Buffer and goes back to the front of the waiting line. "${p.title || 'Post'}" takes its place, at ${fmt(out.scheduledFor)}.`, 'Make room'))) return;
  try {
    const r = await api('POST', '/api/queue/make-room', { postId: p.id, swapOutId: out.id });
    await refresh(false);
    toast(r && r.ok === false ? 'That didn\'t go through, so nothing has moved.' : `Done. "${p.title || 'Post'}" is booked, and "${out.title || 'Post'}" is first in the waiting line.`);
    renderAll();
  } catch (e) { fail(e); await refresh(); }
}

/* ---------- Done ---------- */
const whenOf = (p) => p.scheduledFor || (p.createdAt ? new Date(p.createdAt).toISOString() : '');
const statNum = (n) => Number(n).toLocaleString('en-GB');
function metricsText(p) {
  const m = p.metrics; if (!m) return null;
  const bits = [];
  if (m.views != null) bits.push(`${statNum(m.views)} views`); else if (m.reach != null) bits.push(`${statNum(m.reach)} reached`);
  if (m.reactions != null) bits.push(`${statNum(m.reactions)} likes`);
  if (m.comments) bits.push(`${statNum(m.comments)} ${m.comments === 1 ? 'comment' : 'comments'}`);
  if (m.saves) bits.push(`${statNum(m.saves)} saves`);
  if (m.shares) bits.push(`${statNum(m.shares)} shares`);
  if (m.follows) bits.push(`${statNum(m.follows)} new followers`);
  return bits.join(' · ') || null;
}
function viewDone(main) {
  if (S.openId && S.posts[S.openId]) return main.append(postView(S.posts[S.openId], [], 'done'));
  if (!S.loaded) return main.append(el('p', { class: 'padded muted', text: 'Loading…' }));
  const FILTERS = [['posted', 'Posted', ['posted']], ['saved', 'Saved for later', ['saved']], ['removed', 'Removed', ['removed']]];
  const q = S.q.trim().toLowerCase();
  const matches = (p) => !q || [p.title, p.about, cap(p), briefName(p), kindOf(p), p.pillar].filter(Boolean).join(' ').toLowerCase().includes(q);
  const counts = Object.fromEntries(FILTERS.map(([k, , st]) => [k, Object.values(S.posts).filter((p) => st.includes(p.status) || (k === 'removed' && p.status === 'skipped')).length]));
  const sel = FILTERS.find(([k]) => k === S.doneFilter) || FILTERS[0];
  const ps = Object.values(S.posts).filter((p) => (sel[2].includes(p.status) || (sel[0] === 'removed' && p.status === 'skipped')) && matches(p))
    .sort((a, b) => whenOf(b).localeCompare(whenOf(a)));
  const search = el('input', { id: 'done-q', type: 'search', placeholder: 'Search words or a brief', value: S.q, autocomplete: 'off', 'data-fid': 'done-q' });
  search.addEventListener('input', () => { S.q = search.value; const pos = search.selectionStart; renderMain(); const n = $('done-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Show' }, ...FILTERS.map(([k, label]) => el('button', { type: 'button', class: 'chipbtn', 'aria-pressed': String(S.doneFilter === k), text: `${label}${counts[k] ? ' ' + counts[k] : ''}`, onclick: () => { S.doneFilter = k; renderMain(); } })));
  const cards = ps.map((p) => doneCard(p));
  main.append(el('div', { class: 'done' },
    el('div', { class: 'done-top' }, el('div', { class: 'field' }, el('label', { for: 'done-q', text: 'Find a post' }), search), chips),
    el('h2', { class: 'sr', text: sel[1] }),
    ps.length ? el('div', { class: 'cards' }, ...cards) : el('div', { class: 'empty' }, el('strong', { text: q ? 'No posts match that' : S.doneFilter === 'posted' ? 'Nothing has gone out yet' : S.doneFilter === 'saved' ? 'Nothing saved for later' : 'Nothing removed' }), el('p', { text: q ? 'Try fewer or different words.' : 'Posts you ' + (S.doneFilter === 'posted' ? 'approve appear here once they\'ve been posted.' : S.doneFilter === 'saved' ? 'keep for later appear here.' : 'remove appear here, and can be brought back.') })),
    el('p', { class: 'muted small', text: 'Newest first. Numbers come from Buffer about a week after a post goes out. Saved for later and Removed keep the post, so it can be brought back.' })));
}
function doneCard(p) {
  const bn = briefName(p);
  const m = metricsText(p);
  let result;
  if (p.status === 'posted') {
    const when = p.scheduledFor ? dayText(p.scheduledFor) : '';
    const young = p.scheduledFor && Date.now() - Date.parse(p.scheduledFor) < 7 * 864e5;
    result = `Posted ${when}${m ? ' · ' + m : (young ? ' · numbers after 7 days' : '')}`;
  } else result = p.status === 'saved' ? 'Saved for later' : 'Not posting';
  const acts = p.status === 'posted'
    ? [el('button', { type: 'button', class: 'linkbtn', text: 'Make another like it', onclick: () => anotherLike(p) })]
    : [el('button', { type: 'button', class: 'linkbtn', text: p.status === 'saved' ? 'Bring back to review' : 'Undo', onclick: () => restore(p.id) })];
  return el('article', { class: `card ${p.status}` }, el('a', { class: 'card-thumb', href: `#/done/${encodeURIComponent(p.id)}`, 'aria-label': `Open "${p.title || 'Post'}"` }, thumb(p)),
    el('div', { class: 'card-body' }, el('h3', {}, el('a', { href: `#/done/${encodeURIComponent(p.id)}`, text: p.title || 'Post' })),
      el('span', { class: 'muted small', text: `${kindOf(p)} · ${bn || 'weekly plan'}` }),
      el('span', { class: 'card-result', text: result }), el('span', { class: 'card-acts' }, ...acts)));
}
function anotherLike(p) {
  S.prefill = `Another post like "${p.title || 'this one'}"`;
  go('briefs');
}

/* ---------- Briefs ---------- */
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);
function briefStatus(b) {
  if (b.status === 'working') {
    let eta = 'about 20 min';
    if (b.startedAt && b.etaMinutes != null) { const left = Math.round((b.startedAt + b.etaMinutes * 60000 - Date.now()) / 60000); eta = left > 1 ? `about ${left} min` : 'any minute now'; }
    else if (b.etaMinutes != null) eta = `about ${b.etaMinutes} min`;
    return { cls: 'working', node: el('span', { class: 'bstat is-working' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), ` In progress · ${eta}`) };
  }
  if (b.status === 'done') {
    const n = (b.postIds || []).length || Object.values(S.posts).filter((p) => p.briefId === b.id).length;
    return { cls: 'done', node: el('span', { class: 'bstat is-done', title: `${plural(n, 'post')} made` }, `✓ Done · ${n} made`) };
  }
  return { cls: 'new', node: el('span', { class: 'bstat is-new', text: `Not started · picked up by ${nextPickup()}` }) };
}
function briefMeta(b) {
  const ps = Object.values(S.posts).filter((p) => p.briefId === b.id);
  const bits = [];
  if (b.status !== 'done' || !ps.length) { if (b.createdAt) bits.push(`Sent ${dayKey(new Date(b.createdAt).toISOString()) === todayKey() ? 'today' : dayText(new Date(b.createdAt).toISOString())} ${hm(new Date(b.createdAt).toISOString())}`); }
  bits.push(b.eventDate ? `${bits.length ? 'event' : 'Event'} ${dateOnly(b.eventDate)}` : (b.status === 'done' ? '' : 'no date'));
  const c = (st) => ps.filter((p) => st.includes(p.status)).length;
  if (ps.length) { const parts = [[c(['review']), 'ready for review'], [c(['scheduled', 'approved']), 'scheduled'], [c(['changes']), 'with Claude'], [c(['posted']), 'posted']].filter(([n]) => n); bits.push(...parts.map(([n, l]) => `${n} ${l}`)); }
  return bits.filter(Boolean).join(' · ');
}
// The one thing to do with a brief's posts: review the ones that are ready.
function toReview(b, ps) {
  const n = ps.filter((p) => p.status === 'review').length;
  if (!n) return null;
  const first = ps.find((p) => p.status === 'review');
  return el('a', { class: 'btn small white', href: `#/review/${encodeURIComponent(first.id)}`, text: `Review ${n === 1 ? 'the 1 ready' : `${n} ready`} ›` });
}
function buildBriefForm() {
  const form = el('form', { class: 'panel brief-form', novalidate: true });
  const f = (id, label, control, hint) => el('div', { class: 'field' }, el('label', { for: id, text: label }), hint ? el('span', { class: 'hint', text: hint }) : null, control);
  const what = el('textarea', { id: 'b-what', rows: '3', placeholder: 'For example: my new essay on bridge roles, or talking at the NPA summit on 12 March', required: true });
  const date = el('input', { id: 'b-date', type: 'date' });
  const start = el('select', { id: 'b-start' }, ...['As soon as possible', '2 weeks before', '1 week before', 'A few days before', 'After the event too'].map((o) => el('option', { text: o })));
  const details = el('textarea', { id: 'b-details', rows: '4', placeholder: 'The link, the key argument or quote, and what people should do (read, subscribe, book a session)' });
  const fmts = ['Image post', 'Carousel', 'Quote card', 'Text only'].map((l) => el('label', { class: 'check' }, el('input', { type: 'checkbox', value: l, checked: l === 'Image post' ? true : null }), ' ' + l));
  const pName = el('input', { id: 'b-pname', placeholder: 'For example: News Product Alliance', autocomplete: 'off' });
  const pIg = el('input', { id: 'b-pig', placeholder: 'Their LinkedIn page', autocapitalize: 'none', autocomplete: 'off' });
  const pLogo = el('input', { id: 'b-plogo', type: 'checkbox' });
  const photos = el('input', { id: 'b-photos', type: 'file', accept: 'image/*', multiple: true });
  const photoList = el('ul', { class: 'photo-list', 'aria-live': 'polite' });
  const files = [];
  const showFiles = () => photoList.replaceChildren(...files.map((fl, i) => el('li', {}, el('span', { text: fl.name }), el('button', { type: 'button', class: 'linkbtn', 'aria-label': `Remove ${fl.name}`, text: 'Remove', onclick: () => { files.splice(i, 1); showFiles(); } }))));
  photos.addEventListener('change', () => { for (const fl of photos.files) if (files.length < 6) files.push(fl); photos.value = ''; showFiles(); });
  const msg = el('p', { class: 'msg', role: 'alert' });
  const send = el('button', { type: 'submit', class: 'btn good big', text: 'Send brief' });
  const more = el('details', { class: 'more' }, el('summary', { text: 'More details: formats, photos, and anyone to mention' }),
    el('div', { class: 'more-body' },
      f('b-details', 'Key details', details),
      el('div', { class: 'field' }, el('span', { class: 'lbl', id: 'fmt-l', text: 'Formats' }), el('div', { class: 'checks', role: 'group', 'aria-labelledby': 'fmt-l' }, ...fmts)),
      f('b-photos', 'Photos', photos, 'Optional. Up to 6 photos: you speaking, a slide, the event.'), photoList,
      el('div', { class: 'two' }, f('b-pname', 'Mention another organisation?', pName, 'Their name'), f('b-pig', 'Their LinkedIn', pIg)),
      el('label', { class: 'check' }, pLogo, ' They\'re happy for their logo to be used')));
  form.append(el('h2', { text: 'Create a brief' }),
    el('p', { class: 'muted', text: 'A new essay, an issue, a talk or mentoring spaces. A few options arrive, usually within the hour, under their own heading in Ready for review.' }),
    f('b-what', 'What\'s it about?', what),
    el('div', { class: 'two' }, f('b-date', 'Event date, if any', date), f('b-start', 'Start posting from', start)),
    more, msg, send);
  form.prefill = (t) => { if (!what.value) what.value = t; what.focus(); };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!what.value.trim()) { msg.textContent = 'Say what it\'s about first.'; what.focus(); return; }
    msg.textContent = ''; send.disabled = true; send.textContent = files.length ? 'Sending photos…' : 'Sending…';
    const id = newId();
    try {
      const urls = [];
      for (let i = 0; i < files.length; i++) urls.push((await api('POST', `/api/upload?name=${enc(`brief-${id}-photo-${i + 1}-v1.jpg`)}`, await shrinkPhoto(files[i]), 'image/jpeg')).url);
      const ig = pIg.value.trim().split(/[\s,]+/).filter(Boolean).map((x) => (x.startsWith('http') || x.startsWith('@') ? x : '@' + x));
      const data = {
        what: what.value.trim(), eventDate: date.value || null, start: start.value, count: 'Up to Claude',
        formats: fmts.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
        details: details.value.trim(), photos: urls.length ? `Photos uploaded: ${urls.join(' ')}` : '', photoUrls: urls, extra: '',
        partner: pName.value.trim() ? { name: pName.value.trim(), links: ig, logoOk: pLogo.checked } : null,
        status: 'new', createdAt: Date.now(), createdBy: (S.me && S.me.email) || null,
      };
      const doc = await api('PUT', `/api/docs/briefs/${id}`, { data });
      absorb(doc, 'briefs');
      form.reset(); files.length = 0; showFiles(); more.open = false;
      toast('Brief sent. A few options usually arrive within the hour, under their own heading in Ready for review.');
      renderMain();
    } catch (err) { msg.textContent = explain(err); }
    send.disabled = false; send.textContent = 'Send brief';
  });
  return form;
}
// Phone photos are big: shrink to 2000px on the long side before uploading.
async function shrinkPhoto(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.88));
    if (blob) return blob;
  } catch { /* fall back to the original */ }
  return file;
}
function viewBriefs(main) {
  if (!S.formEl) S.formEl = buildBriefForm();
  if (S.prefill) { S.formEl.prefill(S.prefill); S.prefill = null; }
  const bs = Object.values(S.briefs).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = el('section', { class: 'panel briefs' }, el('h2', { text: 'Your briefs' }),
    !S.loaded ? el('p', { class: 'muted', text: 'Loading…' }) : !bs.length ? el('p', { class: 'muted', text: 'No briefs yet. Tell Claude about an event, an offer or a topic.' }) : null,
    ...bs.map((b) => {
      const st = briefStatus(b);
      const ps = Object.values(S.posts).filter((p) => p.briefId === b.id && !['removed'].includes(p.status)).sort(sortBy((p) => p.scheduledFor));
      const strip = ps.length ? el('div', { class: 'brief-thumbs' }, ...ps.slice(0, 8).map((p) => el('a', { href: `#/${p.status === 'scheduled' ? 'coming' : p.status === 'posted' || p.status === 'saved' ? 'done' : 'review'}/${encodeURIComponent(p.id)}`, title: `${p.title || 'Post'} · ${progress(p).chip}` }, thumb(p), el('span', { class: `chip ${progress(p).cls}`, text: progress(p).chip.split(' · ')[0] }))),
        ps.length > 8 ? el('span', { class: 'muted small', text: `+${ps.length - 8} more` }) : null) : null;
      return el('div', { class: `brief b-${st.cls}` },
        el('div', { class: 'brief-row' },
          el('div', { class: 'brief-main' }, el('span', { class: 'brief-title', text: b.what || 'Brief' }), el('div', { class: 'brief-meta' }, st.node, el('span', { class: 'muted small', text: briefMeta(b) }))),
          toReview(b, ps)),
        strip,
        b.reply ? el('details', { class: 'reply', open: b.status === 'working' ? true : null }, el('summary', { text: 'Note from Claude' }), el('p', { text: b.reply })) : null);
    }));
  main.append(el('div', { class: 'briefs-page' }, S.formEl, el('div', { class: 'briefs-right' }, list, ideasPanel())));
}
function ideasPanel() {
  const all = Object.values(S.ideas).filter((x) => !x.usedIn);
  const todo = all.filter((x) => x.status === 'proposed').sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.createdAt || 0) - (b.createdAt || 0));
  const saved = Object.values(S.posts).filter((p) => p.status === 'saved').length;
  const shown = S.showAllIdeas ? todo : todo.slice(0, 3);
  const panel = el('section', { class: 'panel ideas' }, el('h2', { text: 'Ideas and saved posts' }),
    el('p', { class: 'muted', text: `${plural(saved, 'post')} you saved for later, and ${plural(todo.length, 'one-line idea')} for the weekly plan. A yes means Claude can make it into a post; nothing goes out from here.` }));
  if (!S.loaded) return panel;
  for (const x of shown) panel.append(ideaItem(x));
  if (!todo.length) panel.append(el('p', { class: 'muted', text: 'You\'ve been through every idea. Thank you.' }));
  panel.append(el('div', { class: 'idea-links' },
    todo.length > 3 ? el('button', { type: 'button', class: 'linkbtn', 'aria-expanded': String(S.showAllIdeas), text: S.showAllIdeas ? 'Show fewer ideas' : `See all ${todo.length} ideas ›`, onclick: () => { S.showAllIdeas = !S.showAllIdeas; renderMain(); } }) : null,
    saved ? el('a', { class: 'linkbtn', href: '#/done', onclick: () => { S.doneFilter = 'saved'; }, text: 'See saved posts ›' }) : null));
  return panel;
}
async function setIdea(x, set, msg) {
  try {
    const doc = await api('PATCH', `/api/docs/ideas/${encodeURIComponent(x.id)}`, { rev: x._rev, set: { ...set, reviewedAt: Date.now() } });
    absorb(doc, 'ideas'); renderMain();
    toast(msg, { undo: set.status ? async () => { const cur = S.ideas[x.id]; try { absorb(await api('PATCH', `/api/docs/ideas/${encodeURIComponent(x.id)}`, { rev: cur._rev, set: { status: x.status || 'proposed' } }), 'ideas'); renderMain(); } catch (e) { fail(e); } } : null });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.doc) { absorb(e.doc, 'ideas'); renderMain(); toast('That idea was just changed, so it has been refreshed. Please try again.', { error: true }); } else fail(e);
  }
}
function ideaItem(x) {
  const ask = x.question || x.type === 'Question';
  const main = el('div', { class: 'idea-main' }, el('span', {}, x.type ? el('b', { text: x.type.replace(/ or fact$/i, '') + ': ' }) : null, x.title || 'Idea'),
    x.question ? el('p', { class: 'muted small', text: x.question }) : null, x.body ? el('p', { class: 'muted small', text: x.body }) : null,
    x.claudeNote ? el('p', { class: 'muted small', text: `Claude's note: ${x.claudeNote}` }) : null);
  if (ask) {
    const ta = el('textarea', { rows: '3', 'aria-label': `Your answer to: ${x.question || x.title}`, placeholder: 'Write your answer here, as you\'d say it' });
    return el('div', { class: 'idea' }, main, el('div', { class: 'idea-acts col' }, ta, el('button', { type: 'button', class: 'btn white', text: 'Save answer', onclick: () => { const v = ta.value.trim(); if (v) setIdea(x, { note: v, status: 'ok' }, 'Answer saved.'); } })));
  }
  return el('div', { class: 'idea' }, main, el('div', { class: 'idea-acts' },
    el('button', { type: 'button', class: 'btn white', 'aria-label': `Yes: ${x.title}`, text: 'Yes', onclick: () => setIdea(x, { status: 'ok' }, 'Thanks, that\'s a yes.') }),
    el('button', { type: 'button', class: 'btn white', 'aria-label': `No: ${x.title}`, text: 'No', onclick: () => setIdea(x, { status: 'no' }, 'Thanks, that\'s a no.') })));
}

/* ---------- Debug (Nick only): the Buffer sync and the activity log ---------- */
function viewDebug(main) {
  if (!S.me || !S.me.admin) return main.append(el('p', { class: 'padded muted', text: 'This page is for Nick.' }));
  const D = S.debug ||= { log: null, report: null, busy: false, err: '' };
  const load = async () => { try { D.log = await api('GET', '/api/admin/log?limit=80'); D.err = ''; } catch (e) { D.err = explain(e); } renderMain(); };
  if (!D.log && !D.err) load();
  const b = S.buffer || {};
  const sync = el('button', { type: 'button', class: 'btn white', disabled: D.busy ? true : null, text: D.busy ? 'Syncing…' : 'Run the Buffer sync now', onclick: async () => {
    D.busy = true; renderMain();
    try { D.report = await api('POST', '/api/admin/sync'); await refresh(); } catch (e) { D.report = { error: explain(e) }; }
    D.busy = false; await load();
  } });
  const when = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const rows = (D.log || []).map((r) => el('tr', { class: /fail|error|mismatch|revert/.test(r.action) ? 'bad' : '' },
    el('td', { text: when(r.at) }), el('td', { text: r.who }), el('td', { text: r.action }), el('td', { text: r.docId || '' }),
    el('td', {}, el('code', { text: (r.detail || '').slice(0, 300) }))));
  main.append(el('div', { class: 'debug' },
    el('section', { class: 'panel' }, el('h2', { text: 'Buffer sync' }),
      el('p', { class: 'muted', text: `Runs every 15 minutes and after each approval. Last checked ${b.checkedAt ? fmt(b.checkedAt) : 'never'} · ${b.used ?? '?'} of ${b.limit ?? 10} in Buffer · ${b.waiting ?? 0} waiting.` }),
      el('div', { class: 'idea-links' }, sync, el('button', { type: 'button', class: 'btn white', text: 'Reload the log', onclick: load })),
      D.report ? el('pre', { class: 'report', text: JSON.stringify(D.report, null, 2) }) : null),
    el('section', { class: 'panel' }, el('h2', { text: 'Activity' }), D.err ? el('p', { class: 'msg', text: D.err }) : null,
      !D.log ? (D.err ? null : el('p', { class: 'muted', text: 'Loading…' })) : el('div', { class: 'log-wrap' }, el('table', { class: 'log' },
        el('thead', {}, el('tr', {}, ...['When', 'Who', 'What', 'Post', 'Detail'].map((h) => el('th', { text: h })))), el('tbody', {}, ...rows))))));
}

/* ---------- render ---------- */
const busy = () => {
  if (S.mode === 'edit' || S.dragging || dlg().open) return true;
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('main').contains(a) && !(S.tab === 'done' && a.id === 'done-q'));
};
function renderMain() {
  const main = $('main');
  // Keep scroll positions and the focused control across a redraw.
  const keep = {}; main.querySelectorAll('[data-keep]').forEach((n) => { keep[n.dataset.keep] = n.scrollTop; });
  const fid = document.activeElement && main.contains(document.activeElement) ? document.activeElement.dataset.fid : null;
  const pageY = window.scrollY;
  main.replaceChildren();
  main.className = `tab-${S.tab}${S.mode === 'edit' ? ' editing' : ''}${S.openId && !wide() ? ' opened' : ''}`;
  if (S.failed && !S.loaded) main.append(el('div', { class: 'empty padded' }, el('strong', { text: 'Studio couldn\'t load your posts' }), el('p', { text: 'Check your connection.' }), el('button', { type: 'button', class: 'btn white', text: 'Try again', onclick: () => refresh(false) })));
  else if (S.tab === 'review') viewReview(main);
  else if (S.tab === 'coming') viewComing(main);
  else if (S.tab === 'done') viewDone(main);
  else if (S.tab === 'debug') viewDebug(main);
  else viewBriefs(main);
  main.querySelectorAll('[data-keep]').forEach((n) => { if (keep[n.dataset.keep] != null) n.scrollTop = keep[n.dataset.keep]; });
  if (fid) { const n = [...main.querySelectorAll('[data-fid]')].find((x) => x.dataset.fid === fid); if (n) n.focus({ preventScroll: true, focusVisible: S.keyboard }); }
  if (!wide()) window.scrollTo(0, pageY);
  document.title = S.tab === 'review' && reviewPosts().length ? `(${reviewPosts().length}) Studio` : 'Studio';
}
function renderAll() { renderHeader(); renderTabs(); renderMain(); }
function render() { renderAll(); }

/* ---------- start ---------- */
addEventListener('keydown', () => { S.keyboard = true; }, true);
addEventListener('pointerdown', () => { S.keyboard = false; }, true);
(async function init() {
  parseHash();
  const wantEdit = S.mode === 'edit'; S.mode = 'view';
  renderAll();
  api('GET', '/api/me').then((m) => { S.me = m; if (m && m.admin) { renderTabs(); if (S.tab === 'debug') renderMain(); } }).catch(() => {});
  try { loadState(await api('GET', '/api/state')); } catch (e) { S.failed = true; }
  if (wantEdit) onRoute(true); else renderAll();
  setInterval(() => { if (!document.hidden) refresh(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', () => refresh());
  setInterval(() => { if (!document.hidden) { renderHeader(); } }, 60000);
})();
