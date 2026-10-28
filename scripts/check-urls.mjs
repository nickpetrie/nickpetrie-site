// Checks every old URL against a running build: each must answer 200, or 301 to a page that answers 200.
// Usage: node scripts/check-urls.mjs <base-url> <old-urls.txt>
// <old-urls.txt> is one URL or path per line, e.g. a crawl of the old site's sitemap.
import fs from 'node:fs';

const [base, listFile] = process.argv.slice(2);
if (!base || !listFile) {
  console.error('Usage: node scripts/check-urls.mjs <base-url> <old-urls.txt>');
  process.exit(1);
}

// Old addresses that aren't in any sitemap but may have links pointing at them.
const extras = [
  ['/nick-petrie/', 301, '/about/'],
  ['/mentoring-media-innovation-news-product/', 301, '/mentoring/'],
  ['/contact-colophon/', 301, '/contact/'],
  ['/index.php/2020/05/27/lets-talk-about-how-the-roles-in-newsrooms-are-evolving/', 301, '/lets-talk-about-how-the-roles-in-newsrooms-are-evolving/'],
  ['/bridge-roles-need-to-die/amp/', 301, '/bridge-roles-need-to-die/'],
  ['/bridge-roles-need-to-die', 301, '/bridge-roles-need-to-die/'],
  ['/page/2/', 301, '/writing/'],
  ['/tag/strategy/rss/', 301, '/rss/'],
  ['/tag/getting-started/', 301, '/writing/'],
  ['/sitemap-posts.xml', 301, '/sitemap.xml'],
  ['/members/signup', 301, '/newsletter/'],
  ['/ghost/', 410],
  ['/rss/', 200],
  ['/sitemap.xml', 200],
  ['/robots.txt', 200],
  ['/llms.txt', 200],
  ['/og/bridge-roles-need-to-die.png', 200],
  ['/does-not-exist/', 404],
];

const paths = fs.readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((u) => (u.startsWith('http') ? new URL(u).pathname : u));

const get = (p) => fetch(new URL(p, base), { redirect: 'manual' });
const failures = [];

async function check(path, expectStatus, expectTarget) {
  const res = await get(path);
  if (expectStatus === undefined) {
    if (res.status === 200) return;
    if (res.status === 301) {
      const to = new URL(res.headers.get('location'), base).pathname;
      const final = await get(to);
      if (final.status === 200) return;
      return failures.push(`${path} -> 301 ${to} -> ${final.status}`);
    }
    return failures.push(`${path} -> ${res.status}`);
  }
  if (res.status !== expectStatus) return failures.push(`${path} -> ${res.status} (expected ${expectStatus})`);
  if (expectTarget) {
    const to = new URL(res.headers.get('location'), base).pathname;
    if (to !== expectTarget) failures.push(`${path} -> ${to} (expected ${expectTarget})`);
  }
}

for (const p of paths) await check(p);
for (const [p, status, target] of extras) await check(p, status, target);

const total = paths.length + extras.length;
if (failures.length) {
  console.log(`FAIL: ${failures.length} of ${total}`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`PASS: all ${total} URLs behave as expected (${paths.length} from the old site, ${extras.length} legacy and edge cases).`);
