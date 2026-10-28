// Full-content feed. Served at /rss/ (the Ghost address) by the Worker.
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts } from '../lib/content';
import { site } from '../site';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  const base = String(context.site ?? site.url).replace(/\/$/, '');
  return rss({
    title: site.name,
    description: site.description,
    site: base,
    customData: `<language>en-gb</language><atom:link href="${base}/rss/" rel="self" type="application/rss+xml"/>`,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    items: posts.map((post) => ({
      title: post.data.title,
      link: `/${post.id}/`,
      pubDate: post.data.date,
      description: post.data.description,
      categories: post.data.tags,
      author: 'nick@nickpetrie.co (Nick Petrie)',
      content: (post.rendered?.html ?? '').replace(/(src|href)="\//g, `$1="${base}/`),
    })),
  });
}
