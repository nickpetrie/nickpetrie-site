#!/usr/bin/env node
// Render a Nick Petrie social design from a JSON spec (see references/formats.md).
//
//   node scripts/render.mjs spec.json out.png    image; a carousel writes out-1.png, out-2.png…
//   node scripts/render.mjs spec.json out.pdf    one page per slide: a LinkedIn document post
//   node scripts/render.mjs spec.json out.html   the filled-in page, to open or hand on
//
// Needs Playwright with Chromium (`require('playwright')`).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(SKILL, 'templates', 'canvas.html');

// CSS size of each format; designs are drawn in units of a 1080-wide canvas.
export const FORMATS = {
  post: [1080, 1350],      // LinkedIn and Instagram portrait, 4:5. The default.
  square: [1080, 1080],    // 1:1, carousel slides
  landscape: [1200, 627],  // LinkedIn link image, X, Mastodon
  story: [1080, 1920],     // 9:16
};

const [specPath, outArg] = process.argv.slice(2);
if (!specPath || !outArg) {
  console.error('Usage: node scripts/render.mjs spec.json out.(png|pdf|html)');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const out = path.resolve(outArg);
const format = spec.format || 'post';
if (!FORMATS[format]) throw new Error(`Unknown format ${format}. Use one of: ${Object.keys(FORMATS).join(', ')}`);
const [w, h] = FORMATS[format];
const css = `--w:${w}px;--h:${h}px;--u:${w / 1080}px`;

// Photo paths are relative to the spec, or to this skill folder.
for (const s of spec.slides || [spec]) {
  if (s.portrait && !/^(https?|file|data):/.test(s.portrait)) {
    const near = path.resolve(path.dirname(specPath), s.portrait);
    s.portrait = pathToFileURL(fs.existsSync(near) ? near : path.join(SKILL, s.portrait)).href;
  }
}

if (out.endsWith('.html')) {
  const html = fs.readFileSync(TEMPLATE, 'utf8').replace('</body>',
    `<script>window.SPEC=${JSON.stringify(spec)};document.documentElement.style.cssText=${JSON.stringify(css)};render();</script></body>`);
  const beside = path.join(path.dirname(TEMPLATE), path.basename(out));
  fs.writeFileSync(beside, html);
  if (beside !== out) fs.copyFileSync(beside, out);
  console.log(`Wrote ${out} (open it from ${beside} so the fonts load)`);
  process.exit(0);
}

const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(TEMPLATE).href);
const fit = await page.evaluate(async ([s, c]) => {
  document.documentElement.style.cssText = c;
  return window.render(s);
}, [spec, css]);
await page.waitForLoadState('networkidle');

fit.slides.forEach((f, i) => {
  if (f.headlineSize) console.log(`Slide ${i + 1}: headline stepped down to ${f.headlineSize} to fit. Keep "headlineSize": ${f.headlineSize} in the spec.`);
});
if (!fit.ok) {
  const bad = fit.slides.map((f, i) => (f.ok ? null : `slide ${i + 1} (${f.outside[0].over} units over)`)).filter(Boolean);
  console.error(`Doesn't fit: ${bad.join(', ')}. Shorten the words or lower headlineSize.`);
  await browser.close();
  process.exit(2);
}

const canvases = await page.$$('.canvas');
if (out.endsWith('.pdf')) {
  await page.pdf({ path: out, width: `${w}px`, height: `${h}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  console.log(`Wrote ${out} (${canvases.length} page${canvases.length > 1 ? 's' : ''}, ${w}x${h})`);
} else if (out.endsWith('.png')) {
  const many = canvases.length > 1;
  for (const [i, c] of canvases.entries()) {
    const file = many ? out.replace(/\.png$/, `-${i + 1}.png`) : out;
    await c.screenshot({ path: file });
    console.log(`Wrote ${file} (${w}x${h})`);
  }
} else {
  throw new Error('Output must end in .png, .pdf or .html');
}
await browser.close();
