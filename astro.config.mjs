import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { lastModified, isNoindex } from './scripts/lastmod.mjs';

const site = 'https://www.nickpetrie.co';

export default defineConfig({
  site,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !/\/404|\/newsletter\/thanks\//.test(page) && !isNoindex(new URL(page).pathname),
      serialize(item) {
        const lastmod = lastModified(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
