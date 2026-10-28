import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // One or two sentences: the meta description, list summary and AI-facing summary.
      description: z.string(),
      // A short line under the headline. Falls back to the description.
      standfirst: z.string().optional(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      authors: z.array(z.string()).default(['nick']),
      image: image().optional(),
      imageAlt: z.string().optional(),
      imageCaption: z.string().optional(),
      ogImage: image().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      // Set on posts that went out as a When News Meets Product issue.
      newsletter: z.object({ issue: z.number(), beehiivSlug: z.string().optional() }).optional(),
      // Hand-picked "Read next" posts, by slug.
      related: z.array(z.string()).default([]),
      // Thin or link-only posts: still online, but kept out of search, the sitemap and home page.
      noindex: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      updated: z.coerce.date().optional(),
      legacySlug: z.string().optional(),
      faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
      testimonials: z.array(z.object({ quote: z.string(), name: z.string(), role: z.string().optional(), date: z.coerce.date().optional() })).default([]),
      image: image().optional(),
      ogImage: image().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
    }),
});

const tags = defineCollection({
  loader: file('./src/data/tags.json', { parser: (text) => JSON.parse(text).map((t: { slug: string }) => ({ id: t.slug, ...t })) }),
  // `intro` is HTML shown at the top of the topic page; thin topics are noindexed.
  schema: z.object({ slug: z.string(), name: z.string(), description: z.string().optional(), intro: z.string().optional(), noindex: z.boolean().default(false) }),
});

const authors = defineCollection({
  loader: file('./src/data/authors.json', { parser: (text) => JSON.parse(text).map((a: { slug: string }) => ({ id: a.slug, ...a })) }),
  schema: ({ image }) =>
    z.object({
      slug: z.string(),
      name: z.string(),
      bio: z.string().optional(),
      avatar: image().optional(),
      url: z.string().url().optional(),
      sameAs: z.array(z.string().url()).default([]),
    }),
});

export const collections = { posts, pages, tags, authors };
