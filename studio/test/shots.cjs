// Screenshots every Studio screen against the mock API. Usage: node studio/test/shots.cjs [laptop|phone]
const { chromium } = require('/home/user/bby/node_modules/playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/studio-shots/';
const MS = '/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/spike/ms.js';
const BASE = 'http://localhost:8123/';
const which = process.argv[2] || 'both';
async function session(browser, vp, name, fn) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: vp.width < 600, isMobile: vp.width < 600 });
  await ctx.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(MS) }));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${name}] console.${m.type()}:`, m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log(`[${name}] PAGEERROR`, e.message));
  await fetch('http://localhost:8123/__mock/reset');
  await page.goto(BASE + '#/review'); await page.waitForSelector('.item', { timeout: 10000 });
  await page.waitForTimeout(800);
  const shot = async (n) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}${name}-${n}.png` }); console.log('shot', name, n); };
  await fn(page, shot);
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch();
  if (which !== 'phone') await session(browser, { width: 1366, height: 860 }, 'laptop', async (page, shot) => {
    await shot('1-review');
    await page.goto(BASE + '#/review/2026-11-11-myth-natural-birth'); await shot('1b-review-reel');
    await page.goto(BASE + '#/review/2026-11-13-relaxation-carousel'); await shot('1c-review-carousel');
    await page.goto(BASE + '#/review/2026-11-04-mum-club-reminder'); await page.waitForTimeout(500);
    await page.click('text=Ask for changes'); await shot('2-ask-sheet');
    await page.keyboard.press('Escape');
    await page.click('text=Edit words'); await page.waitForSelector('.design iframe'); await page.waitForTimeout(1500); await shot('3-edit');
    await page.goto(BASE + '#/review/2026-11-13-relaxation-carousel/edit'); await page.waitForTimeout(2000); await shot('3b-edit-carousel');
    await page.goto(BASE + '#/coming'); await shot('4-coming');
    await page.goto(BASE + '#/coming/2026-10-29-mum-club-a-hello'); await shot('4b-coming-post');
    await page.goto(BASE + '#/done'); await shot('5-done');
    await page.click('text=Saved for later'); await shot('5b-done-saved');
    await page.goto(BASE + '#/briefs'); await page.click('summary'); await shot('6-briefs');
  });
  if (which !== 'laptop') await session(browser, { width: 390, height: 844 }, 'phone', async (page, shot) => {
    await shot('1-main'); await page.evaluate(() => window.scrollTo(0, 900)); await shot('1b-main-scrolled');
    await page.goto(BASE + '#/review/2026-11-04-mum-club-reminder'); await shot('2-post');
    await page.evaluate(() => window.scrollTo(0, 99999)); await shot('2b-post-bar');
    await page.click('text=Ask for changes'); await shot('3-ask-sheet'); await page.keyboard.press('Escape');
    await page.click('text=Edit words'); await page.waitForTimeout(1500); await shot('4-edit');
    await page.evaluate(() => window.scrollTo(0, 99999)); await shot('4b-edit-bottom');
    await page.goto(BASE + '#/coming'); await shot('5-coming'); await page.evaluate(() => window.scrollTo(0, 99999)); await shot('5b-coming-bottom');
    await page.goto(BASE + '#/done'); await shot('6-done');
    await page.goto(BASE + '#/briefs'); await shot('7-briefs'); await page.evaluate(() => window.scrollTo(0, 99999)); await shot('7b-briefs-bottom');
  });
  await browser.close();
})();
