// A 1200x630 social card for every post and page, rendered at build time in brand v0.3.
// Newsletter issues are yellow with the paired-rules motif; everything else is ink on paper.
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getCollection } from 'astro:content';
import { getPosts } from '../../lib/content';
import { newsletter } from '../../site';

const font = (file: string) => fs.readFileSync(path.resolve('brand', file));
const fonts = [
  { name: 'Sans', data: font('SourceSans3-Regular.woff'), weight: 400 as const, style: 'normal' as const },
  { name: 'Sans', data: font('SourceSans3-Semibold.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Sans', data: font('SourceSans3-Bold.woff'), weight: 700 as const, style: 'normal' as const },
  { name: 'Display', data: font('SourceSerif4Display-Regular.woff'), weight: 400 as const, style: 'normal' as const },
];
const INK = '#1F2834', PAPER = '#F7F6F1', YELLOW = '#E6C635', MUTED = '#5A6470';
const NP = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 100" fill="${fill}"><path d="M0 100V0H19L65 67V0H84V100H65L19 31V100Z"/><path fill-rule="evenodd" d="M97 100V0H153C163 0 170 7 170 17V48C170 58 163 65 153 65H116V100ZM116 16V49H143C148 49 151 46 151 41V24C151 19 148 16 143 16Z"/></svg>`)}`;

interface Card { title: string; kicker: string; wnmp?: boolean }

export async function getStaticPaths() {
  const posts = await getPosts();
  const pages = await getCollection('pages');
  const tags = new Map((await getCollection('tags')).map((t) => [t.id, t.data.name]));
  return [
    { params: { slug: 'default' }, props: { title: 'I work where journalism meets product.', kicker: 'News product, newsroom strategy and mentoring' } },
    ...posts.map((p) => ({
      params: { slug: p.id },
      props: p.data.newsletter
        ? { title: p.data.title, kicker: `${newsletter.name} · Issue ${p.data.newsletter.issue}`, wnmp: true }
        : { title: p.data.title, kicker: tags.get(p.data.tags[0]) ?? 'Writing' },
    })),
    ...pages.map((p) => ({
      params: { slug: p.id },
      props: { title: p.id === 'mentoring' ? 'News product mentoring and coaching' : p.data.title, kicker: p.id === 'mentoring' ? 'Pay what you can' : 'nickpetrie.co' },
    })),
  ];
}

const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}) =>
  ({ type, props: { style, children, ...extra } });

export async function GET({ props }: { props: Card }) {
  const bg = props.wnmp ? YELLOW : PAPER;
  const size = props.title.length > 70 ? 62 : props.title.length > 40 ? 74 : 86;
  const tree = h('div', {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', boxSizing: 'border-box',
    padding: '64px 80px', background: bg, color: INK, fontFamily: 'Sans',
  }, [
    h('div', { position: 'absolute', top: 64, left: 80, display: 'flex', alignItems: 'center', gap: 18 }, [
      h('img', { width: 68, height: 40 }, undefined, { src: NP(INK), width: 68, height: 40 }),
      h('span', { fontSize: 32, fontWeight: 600 }, 'Nick Petrie'),
    ]),
    h('div', { display: 'flex', flexDirection: 'column', gap: 26 }, [
      // The paired rules: the WNMP motif, and a quieter accent on everything else.
      h('div', { display: 'flex', flexDirection: 'column', gap: 9 }, [
        h('div', { width: 96, height: 18, background: props.wnmp ? INK : YELLOW }),
        h('div', { width: 96, height: 8, background: props.wnmp ? INK : YELLOW }),
      ]),
      h('div', { fontFamily: 'Display', fontSize: size, lineHeight: 1.06, letterSpacing: '-0.01em', maxWidth: 1000 }, props.title),
    ]),
    h('div', { display: 'flex', justifyContent: 'space-between', marginTop: 44, fontSize: 28, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }, [
      h('span', {}, props.kicker),
      h('span', { color: props.wnmp ? INK : MUTED, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }, 'nickpetrie.co'),
    ]),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(png, { headers: { 'content-type': 'image/png' } });
}
