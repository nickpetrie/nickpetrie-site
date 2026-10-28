// Drives the main Studio flows against the mock API and checks the results. node studio/test/flows.cjs
const { chromium } = require('/home/user/bby/node_modules/playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/studio-shots/';
const MS = '/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/spike/ms.js';
const BASE = 'http://localhost:8123/';
const state = async () => (await fetch(BASE + 'api/state')).json();
const post = async (id) => { const d = (await state()).posts.find((p) => p.id === id); return d && { ...d.data, id: d.id, rev: d.rev }; };
let fails = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const mk = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600 });
    await ctx.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(MS) }));
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 200)); });
    page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++; });
    return page;
  };
  const reset = () => fetch(BASE + '__mock/reset');
  const open = async (page, hash) => { await page.goto(BASE + '?r=' + Date.now() + hash); await page.waitForSelector('.item, .pane, .day, .card, .brief-form, .edit-view', { timeout: 10000 }); await page.waitForTimeout(500); };

  // 1. Approve with Buffer full: waits in line, opens the next post in the group.
  await reset();
  let page = await mk({ width: 1366, height: 860 });
  await open(page, '#/review/2026-10-31-website-b-look');
  await page.click('button:has-text("Approve")'); await page.waitForSelector('.banner'); await page.waitForTimeout(500);
  let b = await page.textContent('.banner');
  ok(/waiting for a Buffer slot \(\d+(st|nd|rd|th) in line\)/.test(b), 'approve, Buffer full: ' + b.trim().slice(0, 90));
  ok((await post('2026-10-31-website-b-look')).status === 'approved', 'post is approved in the db');
  ok(!page.url().includes('website-b-look'), 'moved on to another post: ' + page.url().split('#')[1]);
  await page.screenshot({ path: OUT + 'laptop-7-approved.png' });
  await page.click('.banner-undo'); await page.waitForTimeout(600);
  ok((await post('2026-10-31-website-b-look')).status === 'review', 'undo puts it back to review');

  // 2. Approve with room: scheduled.
  await fetch(BASE + '__mock/reset');
  await page.close(); await browser.contexts()[0]?.close();
  await new Promise((r) => setTimeout(r, 100));
  console.log('-- (restart the mock with --room for the scheduled path; see flows-room.cjs)');

  // 3. Ask for changes.
  await reset();
  page = await mk({ width: 1366, height: 860 });
  await open(page, '#/review/2026-10-31-website-c-one-place');
  await page.click('button:has-text("Ask for changes")'); await page.click('button:has-text("Different colours")'); await page.fill('#chg-note', 'Warmer please');
  await page.click('button:has-text("Send to Claude")'); await page.waitForTimeout(800);
  const pc = await post('2026-10-31-website-c-one-place');
  ok(pc.status === 'changes' && pc.feedback.picks[0] === 'Different colours' && pc.feedback.note === 'Warmer please' && pc.feedback.version === 1, 'ask for changes saved: ' + JSON.stringify(pc.feedback));
  ok((await page.textContent('#toasts')).includes('Claude is on it · back within the hour'), 'toast copy');

  // 4. Edit words, save and approve (grid): rasterise, upload, patch, approve.
  await reset();
  await open(page, '#/review/2026-11-04-mum-club-reminder');
  await page.click('button:has-text("Edit words")'); await page.waitForSelector('#f-headline'); await page.waitForTimeout(1200);
  await page.fill('#f-headline', 'See you\n[[this Sunday.]]'); await page.fill('#f-footer-0', 'With The Mum Club, Kingston');
  await page.waitForTimeout(900); await page.screenshot({ path: OUT + 'laptop-3c-edit-typed.png' });
  await page.click('button:has-text("Save and approve")');
  await page.waitForSelector('.banner', { timeout: 20000 }); await page.waitForTimeout(500);
  const pe = await post('2026-11-04-mum-club-reminder');
  ok(pe.version === 3 && pe.history.length === 2 && pe.history[1].version === 2, 'version 3, history has v2: v' + pe.version);
  ok(pe.imageUrl.endsWith('2026-11-04-mum-club-reminder-v3.jpg') && pe.spec.headline.includes('this Sunday') && pe.spec.footer[0].includes('Kingston'), 'new imageUrl and spec: ' + pe.imageUrl.split('/').pop());
  ok(pe.status === 'approved' || pe.status === 'scheduled', 'approved after save: ' + pe.status + ' approvedVersion ' + pe.approvedVersion);
  ok(pe.approvedVersion === 3 && !pe.changeNote, 'pinned v3');
  const media = await (await fetch(BASE + '__mock/media')).json();
  ok(media.includes('2026-11-04-mum-club-reminder-v3.jpg'), 'uploaded ' + media.join(','));
  const img = await fetch(pe.imageUrl); const buf = Buffer.from(await img.arrayBuffer());
  fs.writeFileSync(OUT + 'edited-reminder-v3.jpg', buf);
  const dims = (() => { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + buf.readUInt16BE(i + 2); } })();
  ok(dims && dims[0] === 1080 && dims[1] === 1080, 'uploaded jpeg is 1080 wide: ' + dims);

  // 5. Edit a carousel: all slides renamed -s<k>-v2.
  await reset();
  await open(page, '#/review/2026-11-13-relaxation-carousel/edit'); await page.waitForSelector('#f-headline'); await page.waitForTimeout(1200);
  await page.fill('#f-headline', 'An hour a week that is [[just for you.]]');
  await page.click('[aria-label="Slide 2"]'); await page.waitForSelector('#f-headline'); await page.waitForTimeout(800);
  await page.click('button:has-text("Save, I\'ll approve later")'); await page.waitForSelector('.toast', { timeout: 30000 }); await page.waitForTimeout(500);
  const pk = await post('2026-11-13-relaxation-carousel');
  ok(pk.version === 2 && pk.slideUrls.length === 5 && pk.slideUrls[2].endsWith('relaxation-carousel-s3-v2.jpg') && pk.status === 'review', 'carousel v2 with 5 slides: ' + pk.slideUrls.map((u) => u.split('-').slice(-2).join('-')).join(' '));
  ok(pk.spec.slides[0].headline.includes('that is'), 'slide 1 edit kept after switching tabs');

  // 6. Edit a scheduled post: pulled first.
  await reset();
  await open(page, '#/coming/2026-10-29-mum-club-a-hello');
  await page.click('button:has-text("Edit words")'); await page.waitForSelector('#f-headline'); await page.waitForTimeout(1200);
  await page.fill('#f-headline', 'Come and say hello. Really.');
  await page.click('button:has-text("Save, I\'ll approve later")'); await page.waitForSelector('.toast', { timeout: 30000 }); await page.waitForTimeout(500);
  const ps = await post('2026-10-29-mum-club-a-hello');
  ok(ps.status === 'review' && !ps.bufferId && ps.version === 6, 'scheduled post was pulled, v' + ps.version + ' ' + ps.status);

  // 7. Reel edit: needsRender.
  await reset();
  await open(page, '#/review/2026-11-11-myth-natural-birth/edit'); await page.waitForSelector('#f-headline'); await page.waitForTimeout(1200);
  await page.fill('#f-headline', 'Is hypnobirthing [[only]] for a vaginal birth?');
  await page.click('button:has-text("Save, I\'ll approve later")'); await page.waitForSelector('.toast'); await page.waitForTimeout(600);
  const pr = await post('2026-11-11-myth-natural-birth');
  ok(pr.needsRender === true && pr.version === 3 && pr.specEdit && pr.status === 'review', 'reel: needsRender, version unchanged');
  ok((await page.textContent('.note.working')).includes('Updating, back within the hour'), 'reel shows Updating copy');
  await page.screenshot({ path: OUT + 'laptop-3d-reel-updating.png' });

  // 8. 409: Claude changes the post while she is on it.
  await reset();
  await open(page, '#/review/2026-10-31-website-b-look');
  await fetch(BASE + '__mock/touch/2026-10-31-website-b-look');
  await page.click('button:has-text("Approve")'); await page.waitForSelector('.toast.err'); await page.waitForTimeout(400);
  ok((await page.textContent('.toast.err')).includes('just changed'), '409 message: ' + (await page.textContent('.toast.err')).slice(0, 80));
  ok((await post('2026-10-31-website-b-look')).status === 'review', 'not approved on conflict');
  await page.screenshot({ path: OUT + 'laptop-8-conflict.png' });

  // 9. Polling picks up a change without reload.
  await reset(); await open(page, '#/review');
  const before = await page.textContent('#sub');
  const st = await post('2026-10-31-website-e-story');
  await fetch(BASE + 'api/docs/posts/2026-10-31-website-e-story', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rev: st.rev ?? (await state()).posts.find((x) => x.id === st.id).rev, set: { status: 'review' } }) });
  await page.waitForTimeout(21000);
  ok((await page.textContent('#sub')) !== before, 'poll updated header: ' + before + ' -> ' + (await page.textContent('#sub')).slice(0, 30));

  // 10. Make room and reorder.
  await reset(); await open(page, '#/coming');
  await page.click('button:has-text("Make room")'); await page.click('dialog button:has-text("Make room")'); await page.waitForTimeout(900);
  const pm = await post('2026-11-05-last-chance-tickets');
  ok(pm.status === 'scheduled', 'make room booked the post: ' + pm.status);
  await reset(); await open(page, '#/coming');
  await page.click('.q-item:nth-child(2) button[aria-label*="up"]'); await page.waitForTimeout(900);
  const q = (await state()).posts.filter((p) => p.data.status === 'approved').sort((a, b) => a.data.queuePos - b.data.queuePos).map((p) => p.id);
  ok(q[0] === '2026-11-10-birth-partner', 'reorder saved: ' + q.join(', '));

  // 11. Brief with a photo.
  await reset(); await open(page, '#/briefs');
  await page.fill('#b-what', 'Richmond baby fair stall'); await page.fill('#b-date', '2026-11-22');
  await page.click('summary:has-text("More details")');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#b-photos', { name: 'stall.png', mimeType: 'image/png', buffer: png });
  await page.fill('#b-pname', 'Richmond Baby Fair'); await page.fill('#b-pig', 'richmondbabyfair');
  await page.click('button:has-text("Send brief")'); await page.waitForSelector('.toast'); await page.waitForTimeout(700);
  const bs = (await state()).briefs.filter((x) => x.data.what === 'Richmond baby fair stall');
  ok(bs.length === 1 && bs[0].data.status === 'new' && bs[0].data.eventDate === '2026-11-22' && bs[0].data.partner.links[0] === '@richmondbabyfair' && bs[0].data.photoUrls.length === 1, 'brief saved: ' + JSON.stringify(bs[0] && bs[0].data).slice(0, 200));
  ok((await (await fetch(BASE + '__mock/media')).json()).some((n) => /^brief-[a-z0-9]+-photo-1-v1\.jpg$/.test(n)), 'photo uploaded with the right name');
  await page.screenshot({ path: OUT + 'laptop-6b-briefs-sent.png' });

  // 12. Idea yes.
  const idea = page.locator('.idea button:has-text("Yes")').first(); await idea.click(); await page.waitForTimeout(600);
  ok((await state()).ideas.filter((i) => i.data.status === 'ok').length >= 1, 'idea marked yes');

  // 13. Remove and Undo on Done.
  await reset(); await open(page, '#/review/2026-10-31-website-b-look');
  await page.click('button:has-text("Remove")'); await page.waitForTimeout(600);
  ok((await post('2026-10-31-website-b-look')).status === 'removed', 'removed');
  await open(page, '#/done'); await page.click('button:has-text("Removed")'); await page.waitForTimeout(300);
  await page.locator('.card:has-text("option B") button:has-text("Undo")').first().click(); await page.waitForTimeout(600);
  ok((await post('2026-10-31-website-b-look')).status === 'review', 'undo from Done brings it back');
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  await browser.close();
})();
