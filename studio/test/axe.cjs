// Runs axe-core over the main Studio screens at laptop and phone size. node studio/test/axe.cjs
const { chromium } = require('/home/user/bby/node_modules/playwright');
const fs = require('fs');
const AX = fs.readFileSync('/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/axe/node_modules/axe-core/axe.min.js', 'utf8');
const MS = '/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/spike/ms.js';
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['laptop', { width: 1366, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(MS) }));
    const p = await ctx.newPage();
    for (const [label, hash, act] of [['review', '#/review', null], ['post', '#/review/2026-11-04-mum-club-reminder', null], ['edit', '#/review/2026-11-04-mum-club-reminder/edit', null], ['sheet', '#/review/2026-11-04-mum-club-reminder', async () => { await p.click('button:has-text("Ask for changes")'); }], ['coming', '#/coming', null], ['done', '#/done', null], ['briefs', '#/briefs', async () => { await p.click('summary'); }]]) {
      await p.goto('http://localhost:8123/?r=' + Date.now() + hash); await p.waitForSelector('.item, .pane, .day, .card, .brief-form, .edit-view'); await p.waitForTimeout(1200);
      if (act) { await act(); await p.waitForTimeout(400); }
      await p.addScriptTag({ content: AX });
      const r = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes.slice(0, 3).map((x) => x.target.join(' ') + ' | ' + (x.failureSummary || '').split('\n').slice(1, 3).join(' ')) })));
      console.log(`## ${name} ${label}: ${r.length} violations`); for (const v of r) console.log(' ', JSON.stringify(v));
    }
    await ctx.close();
  }
  await b.close();
})();
