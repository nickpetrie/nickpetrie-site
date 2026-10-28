// One-off importer: Ghost export JSON -> Astro content collections.
// Usage: node scripts/import-ghost.mjs <export.json> <images-dir>
// <images-dir> holds the live /content/images/... tree. Members data is never read.
import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import sharp from 'sharp';
import { pageSlugMap, wnmpIssues, legacyTagSlugs } from './url-map.mjs';

const [exportPath, imagesDir] = process.argv.slice(2);
if (!exportPath || !imagesDir) {
  console.error('Usage: node scripts/import-ghost.mjs <export.json> <images-dir>');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const out = {
  posts: path.join(root, 'src/content/posts'),
  pages: path.join(root, 'src/content/pages'),
  data: path.join(root, 'src/data'),
  images: path.join(root, 'src/assets/images'),
};
for (const dir of Object.values(out)) fs.mkdirSync(dir, { recursive: true });

const { data } = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
const published = data.posts.filter((p) => p.status === 'published');
const metaByPost = new Map(data.posts_meta.map((m) => [m.post_id, m]));
const tagsById = new Map(data.tags.map((t) => [t.id, t]));
const usersById = new Map(data.users.map((u) => [u.id, u]));

const sortByOrder = (a, b) => a.sort_order - b.sort_order;
const tagsFor = (id) =>
  data.posts_tags.filter((pt) => pt.post_id === id).sort(sortByOrder)
    .map((pt) => tagsById.get(pt.tag_id))
    .filter((t) => t && t.visibility === 'public')
    .map((t) => t.slug);
const authorsFor = (id) =>
  data.posts_authors.filter((pa) => pa.post_id === id).sort(sortByOrder)
    .map((pa) => usersById.get(pa.author_id)?.slug)
    .filter(Boolean);

// Images ----------------------------------------------------------------

const MAX_WIDTH = 2400;
const copied = new Map();

// Copies a Ghost image into src/assets (downsized if huge) and returns its repo path.
async function localImage(src) {
  const m = src.match(/\/content\/images\/(.+)$/);
  if (!m) return null;
  const rel = decodeURIComponent(m[1].split('?')[0]).replace(/^size\/w\d+(h\d+)?\//, '');
  if (copied.has(rel)) return copied.get(rel);
  const from = path.join(imagesDir, 'content/images', rel);
  if (!fs.existsSync(from)) {
    console.warn(`  missing image: ${rel}`);
    return null;
  }
  let to = path.join(out.images, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const img = sharp(from);
  const { width, format, size = fs.statSync(from).size } = await img.metadata();
  if (format === 'png' && size > 1_000_000) {
    // Large PNGs here are AI artwork, not screenshots: WebP keeps them sharp at a fraction of the size.
    to = to.replace(/\.png$/i, '.webp');
    await img.resize({ width: Math.min(width, MAX_WIDTH) }).webp({ quality: 86 }).toFile(to);
  } else if (width > MAX_WIDTH && format !== 'gif' && format !== 'svg') {
    await img.resize({ width: MAX_WIDTH }).toFile(to);
  } else {
    fs.copyFileSync(from, to);
  }
  copied.set(rel, to);
  return to;
}

// Downloads a hot-linked Unsplash image so the site doesn't depend on it.
async function remoteImage(url, slug) {
  const to = path.join(out.images, 'remote', `${slug}.jpg`);
  if (!fs.existsSync(to)) {
    const u = new URL(url);
    u.searchParams.set('w', String(MAX_WIDTH));
    const res = await fetch(u);
    if (!res.ok) {
      console.warn(`  could not fetch ${url}: ${res.status}`);
      return null;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    await sharp(Buffer.from(await res.arrayBuffer())).jpeg({ quality: 82 }).toFile(to);
  }
  return to;
}

async function resolveImage(src, slug) {
  if (!src) return null;
  // Only this site's own images; bookmark cards also carry other Ghost blogs' /content/images/ URLs.
  if (/^(__GHOST_URL__|https?:\/\/(www\.)?nickpetrie\.co)\/content\/images\//.test(src)) return localImage(src);
  if (src.includes('images.unsplash.com')) return remoteImage(src, slug);
  return null;
}

// HTML -> Markdown ------------------------------------------------------

function rewriteHref(href) {
  if (!href) return href;
  let h = href.replace(/^__GHOST_URL__/, '').replace(/^https?:\/\/(www\.)?nickpetrie\.co/, '');
  if (h === '' ) h = '/';
  if (h.startsWith('/#/portal')) return '/newsletter/';
  const wp = h.match(/^\/index\.php\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/);
  if (wp) h = `/${wp[1]}/`;
  const slug = h.match(/^\/([^/]+)\/$/)?.[1];
  if (slug && pageSlugMap[slug]) h = `/${pageSlugMap[slug]}/`;
  return h;
}

function makeTurndown(imageMap) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---' });
  td.use(gfm);
  td.remove(['script', 'style']);

  td.addRule('ghostImage', {
    filter: (node) => node.nodeName === 'FIGURE' && node.classList.contains('kg-image-card'),
    replacement: (_c, node) => {
      const img = node.querySelector('img');
      const local = img && imageMap.get(img.getAttribute('src'));
      const caption = node.querySelector('figcaption')?.textContent.trim();
      const alt = (img?.getAttribute('alt') || caption || '').replace(/[[\]]/g, '');
      if (!local) return img ? `\n\n![${alt}](${img.getAttribute('src')})\n\n` : '';
      return `\n\n![${alt}](${local})${caption ? `\n*${caption}*` : ''}\n\n`;
    },
  });

  td.addRule('plainImage', {
    filter: 'img',
    replacement: (_c, node) => {
      const src = node.getAttribute('src');
      const alt = (node.getAttribute('alt') || '').replace(/[[\]]/g, '');
      return src ? `![${alt}](${imageMap.get(src) ?? src})` : '';
    },
  });

  td.addRule('ghostBookmark', {
    filter: (node) => node.nodeName === 'FIGURE' && node.classList.contains('kg-bookmark-card'),
    replacement: (_c, node) => {
      const href = rewriteHref(node.querySelector('a')?.getAttribute('href'));
      const title = node.querySelector('.kg-bookmark-title')?.textContent.trim() || href;
      const desc = node.querySelector('.kg-bookmark-description')?.textContent.trim();
      const pub = node.querySelector('.kg-bookmark-publisher')?.textContent.trim();
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return `\n\n<a class="bookmark" href="${href}">\n<strong>${esc(title)}</strong>${desc ? `\n<span>${esc(desc)}</span>` : ''}${pub ? `\n<small>${esc(pub)}</small>` : ''}\n</a>\n\n`;
    },
  });

  td.addRule('ghostEmbed', {
    filter: (node) => node.nodeName === 'FIGURE' && node.classList.contains('kg-embed-card'),
    replacement: (_c, node) => {
      const tweet = node.querySelector('blockquote.twitter-tweet');
      if (tweet) {
        const link = Array.from(tweet.querySelectorAll('a')).pop()?.getAttribute('href');
        const text = tweet.querySelector('p')?.textContent.trim();
        return `\n\n> ${text}\n>\n> [View on X](${link})\n\n`;
      }
      const iframe = node.querySelector('iframe');
      const src = iframe?.getAttribute('src') || '';
      if (src.includes('simplecast.com')) {
        return `\n\n<iframe class="embed-audio" src="${src}" title="${iframe.getAttribute('title') || 'Podcast episode'}" loading="lazy" height="200" width="100%"></iframe>\n\n`;
      }
      return '';
    },
  });

  // The old beehiiv / Substack sign-up iframes; the layout has its own sign-up form.
  td.addRule('signupIframes', {
    filter: (node) => node.nodeName === 'IFRAME' && /beehiiv|substack/.test(node.getAttribute('src') || ''),
    replacement: () => '',
  });

  td.addRule('savvycal', {
    filter: (node) => node.nodeName === 'DIV' && node.id === 'booking-page',
    replacement: () => '\n\n<a class="button" href="https://savvycal.com/NickPetrie/0977e9aa">Book a mentoring session</a>\n\n',
  });

  td.addRule('links', {
    filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
    replacement: (content, node) => {
      const href = rewriteHref(node.getAttribute('href'));
      return content.trim() ? `[${content}](${href})` : '';
    },
  });

  return td;
}

const tidy = (md) => md
  .replace(/^(#{1,6}) \*\*(.+?)\*\*\s*$/gm, '$1 $2')
  .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim() + '\n';

// Front matter ------------------------------------------------------------

const yaml = (v) => JSON.stringify(v);
function frontmatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${yaml(v2)}`);
    } else {
      lines.push(`${k}: ${yaml(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

const relFrom = (dir, file) => (file ? path.relative(dir, file).split(path.sep).join('/') : undefined);
const clean = (s) => s?.replace(/\s+/g, ' ').trim() || undefined;

function excerptFor(post, meta) {
  const own = clean(post.custom_excerpt) || clean(meta?.meta_description);
  if (own) return own;
  const text = clean(post.plaintext) || '';
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, '') + '…';
}

// Run ---------------------------------------------------------------------

let count = { posts: 0, pages: 0 };
for (const post of published) {
  const meta = metaByPost.get(post.id);
  const isPage = post.type === 'page';
  const slug = isPage ? pageSlugMap[post.slug] ?? post.slug : post.slug;
  const dir = isPage ? out.pages : out.posts;

  const imageMap = new Map();
  for (const src of post.html.match(/<img[^>]+src="([^"]+)"/g)?.map((t) => t.match(/src="([^"]+)"/)[1]) ?? []) {
    const local = await resolveImage(src, `${slug}-${imageMap.size}`);
    if (local) imageMap.set(src, relFrom(dir, local));
  }
  const feature = await resolveImage(post.feature_image, `${slug}-feature`);
  const og = meta?.og_image && meta.og_image !== post.feature_image ? await resolveImage(meta.og_image, `${slug}-og`) : null;

  const body = tidy(makeTurndown(imageMap).turndown(post.html));
  const fm = {
    title: post.title,
    description: excerptFor(post, meta),
    ...(isPage ? {} : { date: post.published_at }),
    updated: post.updated_at,
    ...(isPage ? { legacySlug: post.slug !== slug ? post.slug : undefined } : {
      tags: tagsFor(post.id).filter((t) => !legacyTagSlugs.includes(t)),
      authors: authorsFor(post.id),
    }),
    image: relFrom(dir, feature),
    imageAlt: clean(meta?.feature_image_alt),
    imageCaption: clean(meta?.feature_image_caption?.replace(/<[^>]+>/g, '')),
    ogImage: relFrom(dir, og),
    metaTitle: clean(meta?.meta_title),
    metaDescription: clean(meta?.meta_description),
    newsletter: wnmpIssues[post.slug],
  };
  fs.writeFileSync(path.join(dir, `${slug}.md`), frontmatter(fm) + body);
  count[isPage ? 'pages' : 'posts']++;
}

// Authors and tags as data files.
const usedTags = new Set(
  fs.readdirSync(out.posts).flatMap((f) => fs.readFileSync(path.join(out.posts, f), 'utf8').match(/^tags: (.+)$/m)?.[1] ? JSON.parse(fs.readFileSync(path.join(out.posts, f), 'utf8').match(/^tags: (.+)$/m)[1]) : []),
);
const tags = data.tags.filter((t) => t.visibility === 'public' && usedTags.has(t.slug))
  .map((t) => ({ slug: t.slug, name: t.name.charAt(0).toUpperCase() + t.name.slice(1), description: t.description || undefined }));
fs.writeFileSync(path.join(out.data, 'tags.json'), JSON.stringify(tags, null, 2) + '\n');

const authors = [];
for (const u of data.users) {
  const avatar = await resolveImage(u.profile_image, `author-${u.slug}`);
  authors.push({ slug: u.slug, name: u.name, bio: u.bio || undefined, avatar: relFrom(out.data, avatar) });
}
fs.writeFileSync(path.join(out.data, 'authors.import.json'), JSON.stringify(authors, null, 2) + '\n');

console.log(`Imported ${count.posts} posts, ${count.pages} pages, ${tags.length} tags, ${copied.size} images.`);
