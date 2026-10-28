"""One-off: new descriptions, curated related posts, noindex on thin posts and missing tags.
Writes into front matter in src/content/posts. Safe to re-run."""
import json, pathlib, re

POSTS = pathlib.Path(__file__).resolve().parent.parent / 'src/content/posts'

DESC = {
    'a-golden-opportunity': "Most publishers are stuck partway through their digital transition just as AI arrives. The real problems are structural and cultural, and need alignment.",
    'after-two-years-of-mentoring-and-baby': "65 mentoring sessions in: what has changed since my first 18 months, and why I moved to pay-what-you-can mentoring for news product people.",
    'better-leaders-a-new-podcast-from-anita-zelina': "Notes on the first episode of Anita Zelina's Better Leaders podcast: Trei Brundrett on learning leadership from your team, and real collaboration.",
    'bridge-roles-need-to-die': "Bridge roles between editorial and product have become a sticking plaster. They should be time-limited, with a plan to retire them, not a permanent fix.",
    'brief-reflection-first-18-months-mentoring': "What 37 news product mentoring sessions taught me: missing career paths, how differently publishers organise, and how lonely the work can be.",
    'cherry-picking-metrics': "The Times reported a 40% drop in toxic comments after requiring real names. Why the absolute number isn't enough, and the context newsroom data needs.",
    'excellent-guides-for-news-product-people': "The News Product Alliance's Product Kit now has 19 practical guides on product strategy, research and development in news organisations.",
    'experimenting-with-apple-news-the-first-time-around': "Notes on experimenting with Apple News, first published on Medium.",
    'gotta-get-structural': "Starting as Digital Director at The i Paper: better reader metrics, a new relationship between newsroom and product, and a longer view of change.",
    'joining-the-news-product-alliance-board': "I'm joining the board of the News Product Alliance as it becomes a non-profit, to help grow its community of news product people.",
    'lets-talk-about-how-the-roles-in-newsrooms-are-evolving': "Why I started Evolving Newsroom, a newsletter profiling the people in the new, non-traditional roles that have appeared in newsrooms.",
    'news-2050-a-30-year-outlook-for-the-media': "A 30-year outlook for news media: the meta-trends that will shape news by 2050, and what media companies should be doing about them now.",
    'news-product-management-certificate': "The News Product Alliance has launched the News Product Management Certification, a part-time course for mid to senior news professionals.",
    'newsrooms-product-development-why-is-speed-good': "Newsrooms and product teams both love speed, for the wrong reasons. What matters is shortening the time to learn, and deciding well with what you learn.",
    'no-thing-can-save-journalism': "No single format, from video to newsletters, will save journalism. Publishers need structures built around readers, and the will to reallocate power.",
    'opportunity-choosing-different-news-product': "Publishers define themselves by how close they are to competitors. The opportunity is in choosing to be different and putting readers' needs first.",
    'readers-readers-readers-readers-readers': "If the news industry has one problem, it's failing to understand and serve readers' needs. Five places to start closing the gap.",
    'stand-out-or-fade-away': "Lessons from edition-based publishing at The Times and The Verge's redesign: why news products need a point of view as platforms send less traffic.",
    'strategy-isnt-sexy-it-just-means-having-a-plan': "Strategy just means having a plan. Using the kernel from Good Strategy Bad Strategy: why coherent actions and real trade-offs are where plans fail.",
    'the-times-and-sunday-times-approach-to-data-in-the-newsroom': "How The Times and The Sunday Times approached data in the newsroom, first published on Medium.",
    'the-two-product-team-problem': "Most publishers have two product teams: the newsroom and the product department. How alignment, structure and integration can make them one.",
    'why-newsrooms-need-to-stop-transforming-and-start-changing': "The news industry had time to adapt to disruption and squandered it. Why newsrooms need to stop running transformations and make lasting change.",
}
STANDFIRST = {'bridge-roles-need-to-die': 'They let us ignore the real problems.'}
# Thin or link-only posts: kept online for anyone with the link, but out of search and the sitemap.
NOINDEX = {'experimenting-with-apple-news-the-first-time-around', 'the-times-and-sunday-times-approach-to-data-in-the-newsroom',
           'news-product-management-certificate', 'excellent-guides-for-news-product-people', 'better-leaders-a-new-podcast-from-anita-zelina'}
RELATED = {
    'a-golden-opportunity': ['stand-out-or-fade-away', 'why-newsrooms-need-to-stop-transforming-and-start-changing', 'the-two-product-team-problem'],
    'after-two-years-of-mentoring-and-baby': ['brief-reflection-first-18-months-mentoring', 'bridge-roles-need-to-die', 'joining-the-news-product-alliance-board'],
    'better-leaders-a-new-podcast-from-anita-zelina': ['bridge-roles-need-to-die', 'the-two-product-team-problem'],
    'bridge-roles-need-to-die': ['the-two-product-team-problem', 'gotta-get-structural', 'no-thing-can-save-journalism'],
    'brief-reflection-first-18-months-mentoring': ['after-two-years-of-mentoring-and-baby', 'bridge-roles-need-to-die', 'lets-talk-about-how-the-roles-in-newsrooms-are-evolving'],
    'cherry-picking-metrics': ['gotta-get-structural', 'newsrooms-product-development-why-is-speed-good', 'readers-readers-readers-readers-readers'],
    'excellent-guides-for-news-product-people': ['the-two-product-team-problem', 'brief-reflection-first-18-months-mentoring'],
    'experimenting-with-apple-news-the-first-time-around': ['stand-out-or-fade-away', 'opportunity-choosing-different-news-product'],
    'gotta-get-structural': ['the-two-product-team-problem', 'bridge-roles-need-to-die', 'why-newsrooms-need-to-stop-transforming-and-start-changing'],
    'joining-the-news-product-alliance-board': ['after-two-years-of-mentoring-and-baby', 'brief-reflection-first-18-months-mentoring'],
    'lets-talk-about-how-the-roles-in-newsrooms-are-evolving': ['bridge-roles-need-to-die', 'brief-reflection-first-18-months-mentoring'],
    'news-2050-a-30-year-outlook-for-the-media': ['no-thing-can-save-journalism', 'why-newsrooms-need-to-stop-transforming-and-start-changing', 'strategy-isnt-sexy-it-just-means-having-a-plan'],
    'news-product-management-certificate': ['the-two-product-team-problem', 'brief-reflection-first-18-months-mentoring'],
    'newsrooms-product-development-why-is-speed-good': ['opportunity-choosing-different-news-product', 'strategy-isnt-sexy-it-just-means-having-a-plan', 'cherry-picking-metrics'],
    'no-thing-can-save-journalism': ['news-2050-a-30-year-outlook-for-the-media', 'the-two-product-team-problem', 'why-newsrooms-need-to-stop-transforming-and-start-changing'],
    'opportunity-choosing-different-news-product': ['stand-out-or-fade-away', 'newsrooms-product-development-why-is-speed-good', 'readers-readers-readers-readers-readers'],
    'readers-readers-readers-readers-readers': ['stand-out-or-fade-away', 'opportunity-choosing-different-news-product', 'gotta-get-structural'],
    'stand-out-or-fade-away': ['opportunity-choosing-different-news-product', 'readers-readers-readers-readers-readers', 'a-golden-opportunity'],
    'strategy-isnt-sexy-it-just-means-having-a-plan': ['why-newsrooms-need-to-stop-transforming-and-start-changing', 'news-2050-a-30-year-outlook-for-the-media', 'gotta-get-structural'],
    'the-times-and-sunday-times-approach-to-data-in-the-newsroom': ['cherry-picking-metrics', 'stand-out-or-fade-away'],
    'the-two-product-team-problem': ['bridge-roles-need-to-die', 'gotta-get-structural', 'no-thing-can-save-journalism'],
    'why-newsrooms-need-to-stop-transforming-and-start-changing': ['strategy-isnt-sexy-it-just-means-having-a-plan', 'no-thing-can-save-journalism', 'the-two-product-team-problem'],
}
TAGS = {'gotta-get-structural': ['newsroom', 'strategy'], 'the-two-product-team-problem': ['product-development', 'newsroom', 'strategy'],
        'joining-the-news-product-alliance-board': ['leadership'], 'excellent-guides-for-news-product-people': ['product-development'],
        'news-product-management-certificate': ['product-development'], 'experimenting-with-apple-news-the-first-time-around': ['product-development']}

slugs = {p.stem for p in POSTS.glob('*.md')}
for slug, rel in RELATED.items():
    assert slug in slugs and all(r in slugs and r != slug for r in rel), slug
for p in sorted(POSTS.glob('*.md')):
    slug = p.stem
    fm, body = p.read_text().split('\n---\n', 1)
    lines = [l for l in fm.split('\n') if not re.match(r'(standfirst|noindex|related): ', l)]
    d = DESC[slug]
    assert len(d) <= 160, (slug, len(d))
    lines = [f'description: {json.dumps(d, ensure_ascii=False)}' if l.startswith('description: ') else l for l in lines]
    if slug in TAGS and not any(l.startswith('tags: ') for l in lines):
        lines.insert(next(i for i, l in enumerate(lines) if l.startswith('authors: ')), f'tags: {json.dumps(TAGS[slug])}')
    at = next(i for i, l in enumerate(lines) if l.startswith('authors: '))
    extra = []
    if slug in STANDFIRST: extra.append(f'standfirst: {json.dumps(STANDFIRST[slug])}')
    extra.append(f'related: {json.dumps(RELATED[slug])}')
    if slug in NOINDEX: extra.append('noindex: true')
    lines[at + 1:at + 1] = extra
    p.write_text('\n'.join(lines) + '\n---\n' + body)
print('updated', len(slugs))
