// Reads each post's and page's `updated` date from front matter, so the sitemap's
// <lastmod> reflects real edits rather than the build time.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let cache;

function load() {
  const dates = new Map();
  for (const dir of ['posts', 'pages']) {
    const full = path.join(root, 'src/content', dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(full, file), 'utf8');
      const updated = text.match(/^updated: "?([^"\n]+)"?$/m)?.[1] ?? text.match(/^date: "?([^"\n]+)"?$/m)?.[1];
      if (updated) dates.set(`/${file.replace(/\.md$/, '')}/`, new Date(updated).toISOString());
    }
  }
  const newest = [...dates.values()].sort().at(-1);
  for (const p of ['/', '/writing/', '/newsletter/']) if (newest) dates.set(p, newest);
  return dates;
}

export function lastModified(pathname) {
  cache ??= load();
  return cache.get(pathname);
}

// Paths marked noindex (thin posts and topics), which the sitemap leaves out.
let noindexCache;
export function isNoindex(pathname) {
  noindexCache ??= (() => {
    const set = new Set();
    const posts = path.join(root, 'src/content/posts');
    for (const file of fs.readdirSync(posts).filter((f) => f.endsWith('.md'))) {
      if (/^noindex: true$/m.test(fs.readFileSync(path.join(posts, file), 'utf8'))) set.add(`/${file.replace(/\.md$/, '')}/`);
    }
    for (const t of JSON.parse(fs.readFileSync(path.join(root, 'src/data/tags.json'), 'utf8'))) if (t.noindex) set.add(`/tag/${t.slug}/`);
    return set;
  })();
  return noindexCache.has(pathname);
}
