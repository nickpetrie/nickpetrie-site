"""Option 1 (Quiet column), refined: home, article, about, mentoring, newsletter and writing pages.
Writes previews/artifact-option1.html for publishing. Run after `npm run build`:
python3 -I previews/build-option1.py"""
import base64
import io
import pathlib
import re

from PIL import Image

here = pathlib.Path(__file__).resolve().parent
root = here.parent
ns = {'__file__': str(here / 'build-site-prototypes.py')}
exec(compile((here / 'build-site-prototypes.py').read_text().split('# --- Option 1')[0], 'build-site-prototypes.py', 'exec'), ns)
posts, tags, e, nice_date, kicker = ns['posts'], ns['tags'], ns['e'], ns['nice_date'], ns['kicker']
article, article_html, related, inline_svg, font_css = ns['article'], ns['article_html'], ns['related'], ns['inline_svg'], ns['font_css']
PROMISE = ns['PROMISE']

# The only real photo in the Ghost export (2022). A natural-light portrait would replace it.
buf = io.BytesIO()
Image.open(root / 'src/assets/images/2022/11/Nick-profile-colour-2022.jpg').convert('RGB').resize((560, 560)).save(buf, 'JPEG', quality=82)
PHOTO = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def prose_of(page):
    html = (root / f'dist/{page}/index.html').read_text()
    return re.search(r'<div class="prose">(.*?)</div>\s*</article>', html, re.S).group(1)


about_how = prose_of('about').split('<h2 id="how-i-work">How I work</h2>', 1)[1]
mentoring_html = prose_of('mentoring')
mentoring_html = re.sub(r'<h2 id=""></h2>', '', mentoring_html)
mentoring_html = mentoring_html.replace('<a class="button" href="https://savvycal.com/NickPetrie/0977e9aa">Book a mentoring session</a>',
                                        '<p><a class="btn" href="https://savvycal.com/NickPetrie/0977e9aa">Book a session</a></p>')

FEATURED = ['bridge-roles-need-to-die', 'the-two-product-team-problem', 'readers-readers-readers-readers-readers']
featured = [next(p for p in posts if p['slug'] == s) for s in FEATURED]
more = [p for p in posts if p['slug'] not in FEATURED][:6]
issues = [p for p in posts if p.get('issue')]

STATEMENT = 'I work where journalism meets product.'
BIO = ('Digital Director at The i Paper, previously at Reuters and The Times. '
       'I write about news product and newsroom strategy, and mentor people working in it.')
LINKS = [('LinkedIn', 'https://www.linkedin.com/in/nick-elliot-petrie/'), ('X', 'https://x.com/petren'), ('RSS', '#')]
NAV = [('Writing', 'writing'), ('Newsletter', 'newsletter'), ('Mentoring', 'mentoring'), ('About', 'about')]


def header(current):
    items = ''.join(f'<li><a href="#{h}"{" aria-current=page" if h == current else ""}>{t}</a></li>' for t, h in NAV)
    return (f'<header class="head wrap"><a class="brand" href="#home">{inline_svg("np-mark.svg", "np-mark")}<span>Nick Petrie</span></a>'
            f'<nav aria-label="Main"><ul>{items}</ul></nav></header>')


def signup(tag='Subscribe'):
    return (f'<form class="signup" onsubmit="return false"><label class="vh" for="em-{tag}">Email address</label>'
            f'<input id="em-{tag}" type="email" placeholder="you@example.com" autocomplete="email"><button type="submit">Subscribe</button></form>')


def wnmp_block(tag, compact=False):
    return (f'<section class="wnmp{" compact" if compact else ""}"><div class="wnmp-in">'
            f'{inline_svg("wnmp-masthead.svg", "mast")}'
            f'<div class="wnmp-copy"><p class="promise">{PROMISE}</p>{signup(tag)}'
            f'<p class="small">Free, a few times a year. <a href="#newsletter">Past issues</a></p></div></div></section>')


def footer(tag):
    links = ' · '.join(f'<a href="{h}">{t}</a>' for t, h in LINKS)
    return (f'<footer class="foot"><div class="wrap foot-in">'
            f'<div><p class="foot-name">Nick Petrie</p><p class="small">nick@nickpetrie.co<br>{links}</p></div>'
            f'<div class="foot-sign"><p class="foot-label">When News Meets Product</p><p class="small">{PROMISE}</p>{signup(tag)}</div>'
            f'</div></footer>')


def entry(p, h='h3', summary=True):
    label = f'<span class="chip">WNMP · Issue {p["issue"]}</span>' if p.get('issue') else ''
    return (f'<li class="entry"><{h}><a href="#article">{e(p["title"])}</a></{h}>'
            f'<p class="meta">{nice_date(p["date"])} {label}</p>' + (f'<p class="sum">{e(p["standfirst"])}</p>' if summary else '') + '</li>')


def mentoring_band():
    return ('<section class="mentor-band"><div class="mentor-in"><p class="label">Mentoring</p>'
            '<h2>Stuck between editorial and product? Let\'s talk it through.</h2>'
            '<p>I mentor people in news product, from first roles to leading change: strategy, structures, teams and careers. '
            'One-off sessions are pay what you can, and I have a few spaces for ongoing monthly mentoring.</p>'
            '<p class="actions"><a class="btn" href="#mentoring">Book a session</a> <a href="#mentoring">How it works</a></p></div></section>')


def author_card():
    return (f'<aside class="author"><img src="{PHOTO}" alt="Nick Petrie" width="80" height="80">'
            f'<div><p class="author-name">Nick Petrie</p><p class="small">{BIO}</p>'
            f'<p class="small"><a href="#about">About me</a> · <a href="#mentoring">Mentoring</a></p></div></aside>')


PAGES = {}

PAGES['home'] = f'''{header('home')}
<main class="wrap">
  <section class="hero">
    <div class="hero-text"><h1>{STATEMENT}</h1><p class="lede">{BIO}</p><p><a href="#about">More about me</a></p></div>
    <figure class="portrait"><img src="{PHOTO}" alt="Nick Petrie" width="280" height="280"><figcaption>Photo: 2022 profile picture, to be replaced with a new portrait</figcaption></figure>
  </section>
  {wnmp_block('home')}
  <section class="block"><h2 class="label">Start here</h2><ol class="entries featured">{''.join(entry(p) for p in featured)}</ol></section>
  <section class="block"><h2 class="label">More writing</h2><ol class="entries compact">{''.join(entry(p, summary=False) for p in more)}</ol><p><a href="#writing">All writing</a></p></section>
  {mentoring_band()}
</main>
{footer('foot-home')}'''

PAGES['article'] = f'''{header('writing')}
<main class="wrap">
  <article class="art">
    <p class="label">{kicker(article)}</p>
    <h1>{e(article["title"])}</h1>
    <p class="standfirst">{e(article["standfirst"])}</p>
    <p class="byline">By <a href="#about">Nick Petrie</a> · {nice_date(article["date"])}</p>
    <div class="prose">{article_html}</div>
    <p class="tags">Filed under {e(', '.join(tags.get(t, t) for t in article.get('tags') or []))}</p>
  </article>
  {author_card()}
  <section class="block"><h2 class="label">Related</h2><ol class="entries compact">{''.join(entry(p, summary=False) for p in related[:2])}</ol></section>
  {wnmp_block('art', compact=True)}
</main>
{footer('foot-art')}'''

PAGES['about'] = f'''{header('about')}
<main class="wrap">
  <article class="art">
    <h1>About</h1>
    <figure class="portrait inline"><img src="{PHOTO}" alt="Nick Petrie" width="280" height="280"></figure>
    <div class="prose">
      <p class="lead">I'm Nick Petrie. I work where journalism meets product.</p>
      <p>I'm Digital Director at The i Paper. Before that I spent three years as Deputy Digital News Director at Reuters, and nearly a decade at The Times and Sunday Times, most of it as Deputy Head of Digital, working on content and subscription strategy, newsroom transformation, newsroom tooling, data and insights in the newsroom, and edition-based publishing.</p>
      <p>I write <a href="#newsletter">When News Meets Product</a>, and I <a href="#mentoring">mentor</a> people working in news product.</p>
      <h2>Elsewhere</h2>
      <ul><li>Former board member of the News Product Alliance</li><li>Ran Evolving Newsroom, a side project on how newsroom roles are changing</li><li>Co-founded Wannabe Hacks (sadly no longer online)</li></ul>
      <h2>How I work</h2>{about_how}
    </div>
  </article>
  {wnmp_block('about', compact=True)}
</main>
{footer('foot-about')}'''

PAGES['mentoring'] = f'''{header('mentoring')}
<main class="wrap">
  <article class="art">
    <p class="label">Mentoring</p>
    <h1>News product mentoring</h1>
    <p class="standfirst">For people starting out in news product, moving into their first management role, or leading change in their organisation.</p>
    <div class="facts"><div><p class="label">One-off sessions</p><p>Pay what you can. £250 is the full rate; £1 is fine if that's what you can manage.</p></div><div><p class="label">Ongoing mentoring</p><p>2 to 3 monthly spaces from June 2026, over 3, 6 or 12 months.</p></div></div>
    <p><a class="btn" href="https://savvycal.com/NickPetrie/0977e9aa">Book a session</a></p>
    <div class="prose">{mentoring_html}</div>
  </article>
</main>
{footer('foot-mentor')}'''

PAGES['newsletter'] = f'''{header('newsletter')}
<main class="wrap">
  {wnmp_block('nl')}
  <section class="block"><p class="lede">Essays on news product, teams and strategy, from someone doing the work. Each issue is an argument, a few links worth your time, and an invitation to reply.</p></section>
  <section class="block"><h2 class="label">Past issues</h2><ol class="entries featured">{''.join(entry(p) for p in issues)}</ol></section>
</main>
{footer('foot-nl')}'''

years = {}
for p in posts:
    years.setdefault(p['date'][:4], []).append(p)
topic_chips = ''.join(f'<li><a href="#writing">{e(n)}</a></li>' for n in ['All'] + [tags[t] for t in ['strategy', 'leadership', 'product-development', 'mentoring', 'newsroom', 'data-in-the-newsroom']])
PAGES['writing'] = f'''{header('writing')}
<main class="wrap">
  <h1 class="page-h1">Writing</h1>
  <p class="lede">Everything I've written on news product, newsroom strategy, leadership and mentoring.</p>
  <ul class="chips">{topic_chips}</ul>
  {''.join(f'<section class="year"><h2>{y}</h2><ol class="entries compact">' + ''.join(entry(p, summary=False) for p in ps) + '</ol></section>' for y, ps in years.items())}
</main>
{footer('foot-writing')}'''

CSS = r'''
/* Option 1 refined: one quiet reading column on warm paper; yellow appears only where WNMP does. */
:root{--ink:#1F2834;--paper:#F7F6F1;--yellow:#E6C635;--muted:#5A6470;--rule:#D8DCD9;--card:#FFFFFF;
--sans:'Source Sans 3',Arial,sans-serif;--serif:'Source Serif 4',Georgia,serif;--display:'Source Serif 4 Display',Georgia,serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#F7F6F1;--paper:#1F2834;--muted:#A9B1BA;--rule:#36404C;--card:#26303D;color-scheme:dark}}
:root[data-theme="dark"]{--ink:#F7F6F1;--paper:#1F2834;--muted:#A9B1BA;--rule:#36404C;--card:#26303D;color-scheme:dark}
*{box-sizing:border-box} body{margin:0;background:var(--paper);color:var(--ink);font:400 18px/1.6 var(--sans)}
a{color:inherit;text-decoration:underline;text-underline-offset:.15em;text-decoration-thickness:1px}
a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}
h1,h2,h3{text-wrap:balance} img{max-width:100%;height:auto}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.label{font:700 13px/1.2 var(--sans);letter-spacing:.06em;text-transform:uppercase;margin:0 0 12px}
.small{font-size:15px;color:var(--muted);margin:0 0 8px} .lede{font-size:20px;color:var(--muted);max-width:60ch}
.view{container:view / inline-size;background:var(--paper);color:var(--ink);min-height:100vh}
.wrap{max-width:760px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}

.head{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:space-between;align-items:center;padding-block:26px 30px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:600 20px/1 var(--sans)}
.np-mark{width:34px;height:20px;fill:var(--ink);flex:none}
nav ul{list-style:none;display:flex;flex-wrap:wrap;gap:6px 22px;margin:0;padding:0} nav a{text-decoration:none;font-weight:600;padding-bottom:3px}
nav a[aria-current]{border-bottom:2px solid var(--ink)}

.hero{display:grid;gap:24px;padding-block:20px 8px}
.hero h1{font:400 clamp(40px,7vw,60px)/1.04 var(--display);letter-spacing:-.01em;margin:0 0 16px}
.hero .lede{margin:0 0 10px}
.portrait{margin:0} .portrait img{display:block;width:100%;max-width:280px;aspect-ratio:1;object-fit:cover;border-radius:2px}
.portrait figcaption{font-size:13px;color:var(--muted);margin-top:6px;max-width:280px}
.portrait.inline{margin:8px 0 24px}
@container view (max-width:759px){.hero .portrait img{max-width:180px}}
@container view (min-width:760px){.hero{grid-template-columns:minmax(0,1fr) 240px;align-items:end;gap:40px}}

.wnmp{background:var(--yellow);color:#1F2834;margin-block:44px}
.wnmp-in{display:grid;gap:18px;padding:28px} .mast{display:block;width:100%;max-width:340px;height:auto}
.wnmp .promise{font:400 22px/1.3 var(--serif);margin:0 0 4px} .wnmp .small{color:#1F2834} .wnmp a{color:#1F2834}
.wnmp.compact .mast{max-width:240px} .wnmp.compact .wnmp-in{padding:22px}
@container view (min-width:760px){.wnmp-in{grid-template-columns:300px minmax(0,1fr);align-items:center;gap:36px;padding:32px} .wnmp.compact .wnmp-in{grid-template-columns:230px minmax(0,1fr)}}
.signup{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 8px} .signup input{flex:1 1 200px;min-width:0;font:inherit;font-size:17px;padding:11px 12px;border:1px solid #1F2834;border-radius:4px;background:#fff;color:#1F2834}
.signup button,.btn{font:700 16px/1 var(--sans);padding:13px 18px;border-radius:4px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;text-decoration:none;display:inline-block}
.wnmp .signup button{background:#1F2834;border-color:#1F2834;color:#F7F6F1}

.block{margin-block:44px}
.entries{list-style:none;margin:0;padding:0} .entry{border-top:1px solid var(--rule);padding:16px 0}
.entry h3{font:400 24px/1.2 var(--serif);margin:0 0 4px} .entry h3 a{text-decoration:none} .entry h3 a:hover{text-decoration:underline}
.entries.compact .entry{padding:12px 0} .entries.compact h3{font-size:20px}
.meta{font-size:14px;color:var(--muted);margin:0} .sum{margin:6px 0 0;color:var(--muted);max-width:62ch}
.chip{font:700 11px/1 var(--sans);letter-spacing:.05em;background:var(--yellow);color:#1F2834;padding:3px 6px;border-radius:3px;margin-left:6px;vertical-align:1px}

.mentor-band{border-top:1px solid var(--ink);margin-block:48px;padding-top:14px}
.mentor-band h2{font:400 30px/1.15 var(--serif);margin:0 0 12px;max-width:24ch} .mentor-band p{max-width:62ch}
.actions{display:flex;flex-wrap:wrap;gap:16px;align-items:center}

.foot{border-top:1px solid var(--rule);margin-top:64px;padding-block:32px 48px}
.foot-in{display:grid;gap:28px} .foot-name{font:600 18px/1.2 var(--sans);margin:0 0 6px} .foot-label{font:700 15px/1.2 var(--sans);margin:0 0 4px}
@container view (min-width:760px){.foot-in{grid-template-columns:1fr 1.3fr}}

.art h1,.page-h1{font:400 clamp(38px,6.5vw,54px)/1.06 var(--display);margin:12px 0 14px;letter-spacing:-.01em}
.standfirst{font-size:21px;margin:0 0 14px;max-width:56ch}
.byline{font-size:15px;color:var(--muted);border-bottom:1px solid var(--rule);padding-bottom:22px;margin:0 0 28px}
.prose{font:400 19px/1.65 var(--serif);max-width:68ch} .prose p{margin:0 0 1.1em} .prose .lead{font-size:23px;line-height:1.4}
.prose h2{font:400 28px/1.2 var(--serif);margin:1.6em 0 .5em} .prose h3{font:700 16px/1.3 var(--sans);margin:2em 0 .5em}
.prose hr{border:0;border-top:1px solid var(--ink);margin:2.4em 0 0} .prose hr+h3{margin-top:.7em}
.prose blockquote{margin:1.4em 0;padding:2px 0 2px 20px;border-left:3px solid var(--yellow)}
.pull{margin:1.8em 0!important;padding:2px 0 2px 22px!important} .pull p{font:400 30px/1.2 var(--serif)!important;margin:0!important}
.prose ul{padding-left:1.2em} .tags{font-size:15px;color:var(--muted)}
.author{display:flex;gap:16px;align-items:flex-start;border:1px solid var(--rule);background:var(--card);padding:18px;margin-block:36px;border-radius:4px}
.author img{width:80px;height:80px;border-radius:50%;object-fit:cover;flex:none} .author-name{font:600 18px/1.2 var(--sans);margin:0 0 4px}
.facts{display:grid;gap:12px;margin:20px 0} .facts>div{border-top:3px solid var(--yellow);padding-top:10px} .facts p:not(.label){margin:0}
@container view (min-width:620px){.facts{grid-template-columns:1fr 1fr;gap:24px}}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:20px 0 8px} .chips a{display:block;font-size:15px;font-weight:600;border:1px solid var(--rule);border-radius:999px;padding:4px 12px;text-decoration:none}
.chips li:first-child a{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.year{display:grid;gap:4px;margin-top:28px} .year h2{font:600 16px/1.6 var(--sans);color:var(--muted);margin:0}
@container view (min-width:620px){.year{grid-template-columns:80px minmax(0,1fr);gap:16px} .year h2{padding-top:12px}}

/* Review toolbar and device frames */
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:11;background:#fff}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:10;background:#fff;color:#1F2834;border-bottom:1px solid #D8DCD9;padding-block:10px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));font:400 15px/1.4 'Source Sans 3',Arial,sans-serif}
.bar .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px} .bar b{margin-right:6px}
.bar button{font:600 14px/1 'Source Sans 3',Arial,sans-serif;padding:7px 10px;border:1px solid #1F2834;background:#fff;color:#1F2834;border-radius:4px;cursor:pointer}
.bar button[aria-pressed=true]{background:#1F2834;color:#fff} .bar p{margin:4px 0 0;color:#5A6470;max-width:90ch}
.stage{position:relative;overflow:hidden} .stage.framed{background:#E4E3DD;padding-block:16px}
.stage.framed .view{transform-origin:top left;box-shadow:0 1px 4px rgba(0,0,0,.15);min-height:0}
'''

page_buttons = ''.join(f'<button type="button" data-page="{k}">{k.capitalize()}</button>' for k in PAGES)
views = ''.join(f'<div class="view" data-view="{k}" hidden>{v}</div>' for k, v in PAGES.items())

html = f'''<title>nickpetrie.co Option 1</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>{font_css}{CSS}</style>
<div class="bar">
  <div class="row"><b>Page</b>{page_buttons}</div>
  <div class="row"><b>Screen</b><button type="button" data-frame="fit">Fit my screen</button><button type="button" data-frame="desktop">Desktop (1280 px)</button><button type="button" data-frame="phone">Phone (390 px)</button></div>
  <p>Option 1 refined, with real posts and brand v0.3. Links between pages work; the forms don't. The photo is your 2022 profile picture, standing in for a new portrait.</p>
</div>
<div class="stage" id="stage">{views}</div>
<script>
  const stage = document.getElementById('stage');
  let frame = 'fit';
  const pageFromHash = () => {{ const h = location.hash.slice(1); return document.querySelector(`[data-view="${{h}}"]`) ? h : 'home'; }};
  function fit() {{
    const v = document.querySelector('.view:not([hidden])');
    if (!v) return;
    stage.className = 'stage' + (frame === 'fit' ? '' : ' framed');
    v.style.width = ''; v.style.transform = ''; v.style.margin = ''; stage.style.height = '';
    if (frame === 'fit') return;
    const w = frame === 'desktop' ? 1280 : 390;
    const scale = Math.min(1, stage.clientWidth / w);
    v.style.width = w + 'px';
    if (scale < 1) v.style.transform = `scale(${{scale}})`; else v.style.margin = '0 auto';
    stage.style.height = (v.offsetHeight * scale + 32) + 'px';
  }}
  function show() {{
    const page = pageFromHash();
    for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== page;
    for (const b of document.querySelectorAll('[data-page]')) b.setAttribute('aria-pressed', String(b.dataset.page === page));
    for (const b of document.querySelectorAll('[data-frame]')) b.setAttribute('aria-pressed', String(b.dataset.frame === frame));
    window.scrollTo(0, 0);
    fit();
  }}
  document.addEventListener('click', (ev) => {{
    const b = ev.target.closest('[data-page],[data-frame]');
    if (!b) return;
    if (b.dataset.page) location.hash = b.dataset.page; else {{ frame = b.dataset.frame; show(); }}
  }});
  addEventListener('hashchange', show);
  addEventListener('resize', fit);
  document.fonts.ready.then(fit);
  show();
</script>
'''

out = here / 'artifact-option1.html'
out.write_text(html)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
