// A 1200x630 social card for every post and page, rendered at build time.
// The look is a placeholder until the visual direction is settled.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getCollection } from 'astro:content';
import { getPosts, formatDate } from '../../lib/content';
import { newsletter } from '../../site';

const require = createRequire(import.meta.url);
const font = (weight: number) => fs.readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`));

export async function getStaticPaths() {
  const posts = await getPosts();
  const pages = await getCollection('pages');
  return [
    { params: { slug: 'default' }, props: { title: 'Nick Petrie', kicker: 'News product, newsroom strategy and mentoring' } },
    ...posts.map((p) => ({
      params: { slug: p.id },
      props: {
        title: p.data.title,
        kicker: p.data.newsletter ? `${newsletter.name} · Issue ${p.data.newsletter.issue}` : formatDate(p.data.date),
      },
    })),
    ...pages.map((p) => ({ params: { slug: p.id }, props: { title: p.data.title, kicker: 'nickpetrie.co' } })),
  ];
}

const h = (type: string, style: Record<string, unknown>, children: unknown) => ({ type, props: { style, children } });

export async function GET({ props }: { props: { title: string; kicker: string } }) {
  const tree = h('div', {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '72px 80px', background: '#16181D', color: '#FAF8F3', fontFamily: 'Inter',
  }, [
    h('div', { fontSize: 30, color: '#02B3E7', fontWeight: 700 }, props.kicker),
    h('div', { fontSize: props.title.length > 60 ? 64 : 76, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }, props.title),
    h('div', { fontSize: 30, display: 'flex', justifyContent: 'space-between' }, [
      h('span', {}, 'Nick Petrie'),
      h('span', { color: '#9CA3AF' }, 'nickpetrie.co'),
    ]),
  ]);
  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: font(400), weight: 400, style: 'normal' },
      { name: 'Inter', data: font(700), weight: 700, style: 'normal' },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  return new Response(png, { headers: { 'content-type': 'image/png' } });
}
