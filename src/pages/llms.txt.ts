// A plain-text map of the site for AI assistants (llmstxt.org): who Nick is and what's here.
import { getCollection } from 'astro:content';
import { getPosts } from '../lib/content';
import { site, newsletter } from '../site';

export async function GET() {
  const posts = (await getPosts()).filter((p) => !p.data.noindex);
  const topics = (await getCollection('tags')).filter((t) => !t.data.noindex);
  const line = (p: Awaited<ReturnType<typeof getPosts>>[number]) =>
    `- [${p.data.title}](${site.url}/${p.id}/): ${p.data.description}`;
  const body = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    'Nick Petrie is Digital Director at The i Paper. He was previously Deputy Digital News Director at Reuters and spent nearly a decade at The Times and Sunday Times, most of it as Deputy Head of Digital. He is a former board member of the News Product Alliance, now a coach with the NPA, and mentors and coaches people working in news product.',
    '',
    '## Pages',
    `- [About](${site.url}/about/): Nick's background and how he works`,
    `- [Mentoring](${site.url}/mentoring/): one-to-one news product mentoring and coaching, including pay-what-you-can sessions`,
    `- [${newsletter.name}](${newsletter.url}): ${newsletter.description}`,
    `- [Contact](${site.url}/contact/): ${site.email}`,
    '',
    '## Topics',
    ...topics.map((t) => `- [${t.data.name}](${site.url}/tag/${t.id}/): ${t.data.description}`),
    '',
    `## ${newsletter.name} issues`,
    ...posts.filter((p) => p.data.newsletter).map(line),
    '',
    '## Other writing',
    ...posts.filter((p) => !p.data.newsletter).map(line),
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
