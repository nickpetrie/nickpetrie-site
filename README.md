# nickpetrie.co

Nick Petrie's site: Astro, served by a Cloudflare Worker (static assets plus a small Worker for redirects and newsletter sign-up). Placeholder styling until the visual direction is settled.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Build to `dist/` |
| `npm run preview` | Run the built site through the Worker locally (`wrangler dev`) |
| `npm run check:urls -- http://localhost:8787 old-urls.txt` | Check every old URL answers 200 or 301s to a live page |
| `npm run import:ghost -- <export.json> <images-dir>` | One-off: regenerate content from the Ghost export |

## Where things live

- `src/content/posts/`, `src/content/pages/`: Markdown, imported from Ghost. Post URLs are `/<slug>/`, unchanged from Ghost.
- `src/data/`: tags and authors.
- `src/site.ts`: site-wide facts used in meta tags and structured data.
- `worker/routes.js`: every redirect (old page addresses, WordPress-era URLs, Ghost leftovers).
- `scripts/url-map.mjs`: URL decisions shared by the importer and the Worker.

## Decisions

- Pages moved to shorter addresses: `/nick-petrie/` → `/about/`, `/mentoring-media-innovation-news-product/` → `/mentoring/`, `/contact-colophon/` → `/contact/` (301s).
- Feed stays at `/rss/` and the sitemap at `/sitemap.xml`.
- Sign-ups post to `/api/subscribe`, which calls the beehiiv API. Needs the `BEEHIIV_API_KEY` secret.
- No personal data (for example Ghost members) ever goes in this public repo.
