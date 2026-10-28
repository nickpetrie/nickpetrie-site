import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
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
      image: image().optional(),
      ogImage: image().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
    }),
});

const tags = defineCollection({
  loader: file('./src/data/tags.json', { parser: (text) => JSON.parse(text).map((t: { slug: string }) => ({ id: t.slug, ...t })) }),
  schema: z.object({ slug: z.string(), name: z.string(), description: z.string().optional() }),
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
