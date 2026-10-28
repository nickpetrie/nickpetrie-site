import { getCollection, type CollectionEntry } from 'astro:content';
import { site, person, newsletter } from '../site';

export async function getPosts() {
  const posts = await getCollection('posts', (p) => !p.data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

export const ogPath = (slug: string) => `/og/${slug}.png`;

export function wordCount(body = '') {
  return body.replace(/<[^>]+>|[#*_>`\[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(item.path, site.url).href,
    })),
  };
}

export function authorNode(author: CollectionEntry<'authors'>) {
  if (author.id === 'nick') return { '@id': person['@id'] };
  return {
    '@type': 'Person',
    '@id': `${site.url}/author/${author.id}/#person`,
    name: author.data.name,
    url: author.data.url ?? `${site.url}/author/${author.id}/`,
    sameAs: author.data.sameAs,
  };
}

export function articleNode(post: CollectionEntry<'posts'>, authors: CollectionEntry<'authors'>[]) {
  const url = `${site.url}/${post.id}/`;
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: post.data.metaTitle ?? post.data.title,
    description: post.data.metaDescription ?? post.data.description,
    datePublished: post.data.date.toISOString(),
    dateModified: (post.data.updated ?? post.data.date).toISOString(),
    author: authors.map(authorNode),
    publisher: { '@id': person['@id'] },
    image: `${site.url}${ogPath(post.id)}`,
    inLanguage: site.lang,
    keywords: post.data.tags.join(', ') || undefined,
    wordCount: wordCount(post.body),
    ...(post.data.newsletter && {
      isPartOf: {
        '@type': 'CreativeWorkSeries',
        '@id': `${newsletter.url}#series`,
        name: newsletter.name,
        url: newsletter.url,
      },
    }),
  };
}
