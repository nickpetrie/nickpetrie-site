"""Three website directions for review, using real posts and brand v0.3.
Writes previews/site-prototypes.html (self-contained). Run after `npm run build`:
python3 -I previews/build-site-prototypes.py"""
import html
import json
import pathlib
import re

here = pathlib.Path(__file__).resolve().parent
root = here.parent
cmp = {'__file__': str(here / 'build-comparison.py')}
exec(compile((here / 'build-comparison.py').read_text().split('# --- Marks')[0], 'build-comparison.py', 'exec'), cmp)
font_css = cmp['font_css']
v03 = root / 'brand/v0.3'


def inline_svg(name, cls='', width=None):
    s = (v03 / name).read_text().strip()
    s = re.sub(r'<title>.*?</title>', '', s)
    attrs = f' class="{cls}"' if cls else ''
    attrs += f' width="{width}"' if width else ''
    return s.replace('<svg ', f'<svg{attrs} aria-hidden="true" ', 1)


# --- Content from the real site ------------------------------------------------

def front(path):
    text = path.read_text()
    fm = text.split('---')[1]
    data = {}
    for line in fm.strip().splitlines():
        if ':' in line and not line.startswith('  '):
            k, v = line.split(':', 1)
            v = v.strip()
            try:
                data[k] = json.loads(v) if v else None
            except json.JSONDecodeError:
                data[k] = v
    data['issue'] = int(m.group(1)) if (m := re.search(r'issue: (\d+)', fm)) else None
    data['slug'] = path.stem
    return data


posts = sorted((front(p) for p in (root / 'src/content/posts').glob('*.md')), key=lambda p: p['date'], reverse=True)
tags = {t['slug']: t['name'] for t in json.loads((root / 'src/data/tags.json').read_text())}

MONTHS = 'January February March April May June July August September October November December'.split()


def nice_date(iso):
    y, m, d = iso[:10].split('-')
    return f'{int(d)} {MONTHS[int(m) - 1]} {y}'


e = html.escape
# Standfirsts Nick has already written (the beehiiv preview text); other posts fall back to their excerpt.
STANDFIRST = {'bridge-roles-need-to-die': 'They let us ignore the real problems.'}
for p in posts:
    p['standfirst'] = STANDFIRST.get(p['slug'], p['description'])
lead = posts[0]
article_html = re.search(r'<div class="prose">(.*?)</div>\s*(?:<ul class="tags"|</article>)', (root / 'dist/bridge-roles-need-to-die/index.html').read_text(), re.S).group(1)
article = next(p for p in posts if p['slug'] == 'bridge-roles-need-to-die')
# The one pull quote the email preview uses, so both media show the same building block.
QUOTE = 'We keep creating jobs that exist to stand in the gap between editorial and product, and then we wonder why the gap never closes.'
article_html = article_html.replace(f'<p>{QUOTE}</p>', f'<blockquote class="pull"><p>{QUOTE}</p></blockquote>', 1)

PROMISE = 'For people trying to change news organisations from the inside.'
BIO = ('Digital Director at The i Paper. Previously Deputy Digital News Director at Reuters, and nearly a decade at '
       'The Times and Sunday Times. I write about news product and newsroom strategy, and mentor people in news product.')
STATEMENT = 'I work where journalism meets product.'
NAV = [('Writing', '#'), ('Newsletter', '#'), ('Mentoring', '#'), ('About', '#')]


def nav(cls='nav'):
    return f'<nav class="{cls}" aria-label="Main"><ul>' + ''.join(f'<li><a href="{h}">{t}</a></li>' for t, h in NAV) + '</ul></nav>'


def signup(label='Subscribe', dark=False):
    return (f'<form class="signup{" dark" if dark else ""}" onsubmit="return false"><label class="vh" for="em">Email address</label>'
            f'<input id="em" type="email" placeholder="you@example.com"><button type="submit">{label}</button></form>')


def tag_names(p):
    return ', '.join(tags.get(t, t) for t in p.get('tags') or [])


def kicker(p):
    return f'WNMP · Issue {p["issue"]}' if p.get('issue') else (tags.get((p.get('tags') or [''])[0], 'Writing'))


def byline():
    return f'<p class="byline">By <a href="#">Nick Petrie</a> · {nice_date(article["date"])}</p>'


related = [p for p in posts if p['slug'] != article['slug'] and set(p.get('tags') or []) & set(article.get('tags') or [])][:3]

# --- Option 1: quiet column -------------------------------------------------------

years = {}
for p in posts:
    years.setdefault(p['date'][:4], []).append(p)

o1_home = f'''
<header class="o1-head wrap">{'<a class="name" href="#">Nick Petrie</a>'}{nav()}</header>
<main class="wrap">
  <section class="o1-hero"><h1>{STATEMENT}</h1><p class="lede">{BIO}</p></section>
  <section class="o1-wnmp">
    {inline_svg("wnmp-masthead.svg", "mast", 320)}
    <p class="promise">{PROMISE}</p>
    {signup()}
    <p class="small">Free. Six issues so far. <a href="#">Read past issues</a></p>
  </section>
  <section class="o1-list"><h2 class="label">Writing</h2>
    {''.join(f'<div class="year"><h3>{y}</h3><ul>' + ''.join(f'<li><a href="#">{e(p["title"])}</a>{" <span class=chip>WNMP</span>" if p.get("issue") else ""}</li>' for p in ps) + '</ul></div>' for y, ps in list(years.items())[:4])}
    <p><a href="#">All writing</a></p>
  </section>
  <section class="o1-mentor"><h2 class="label">Mentoring</h2><p>I mentor people in news product, from first roles to leading change. <a href="#">Book a session: pay what you can.</a></p></section>
</main>
<footer class="o1-foot wrap"><p>nick@nickpetrie.co · <a href="#">LinkedIn</a> · <a href="#">X</a> · <a href="#">RSS</a></p></footer>'''

o1_article = f'''
<header class="o1-head wrap"><a class="name" href="#">Nick Petrie</a>{nav()}</header>
<main class="wrap">
  <article class="o1-art">
    <p class="label">{kicker(article)}</p>
    <h1>{e(article["title"])}</h1>
    <p class="standfirst">{e(article["standfirst"])}</p>
    {byline()}
    <div class="prose">{article_html}</div>
  </article>
  <section class="o1-wnmp">{inline_svg("wnmp-masthead.svg", "mast", 220)}<p class="promise">{PROMISE}</p>{signup()}</section>
</main>
<footer class="o1-foot wrap"><p>nick@nickpetrie.co · <a href="#">LinkedIn</a> · <a href="#">X</a> · <a href="#">RSS</a></p></footer>'''

# --- Option 2: profile and stream -------------------------------------------------

o2_side = f'''<aside class="o2-side">
  {inline_svg("np-square-ink.svg", "np l", 72)}{inline_svg("np-square-paper.svg", "np d", 72)}
  <p class="name">Nick Petrie</p>
  <p class="bio">{BIO}</p>
  <div class="ctas"><a class="btn yellow" href="#">Get the newsletter</a><a class="btn line" href="#">Book mentoring</a></div>
  <p class="contact">nick@nickpetrie.co<br><a href="#">LinkedIn</a> · <a href="#">X</a> · <a href="#">RSS</a></p>
  {nav("nav side")}
</aside>'''

topic_chips = ''.join(f'<li><a href="#">{e(n)}</a></li>' for n in ['All', 'Newsletter'] + [tags[t] for t in ['strategy', 'leadership', 'product-development', 'mentoring', 'newsroom']])
o2_home = f'''<div class="o2-layout">{o2_side}
<main class="o2-main">
  <h1 class="o2-h1">{STATEMENT}</h1>
  <ul class="chips">{topic_chips}</ul>
  <ol class="stream">{''.join(f'<li class="{"is-wnmp" if p.get("issue") else ""}"><p class="label">{kicker(p)} · {nice_date(p["date"])}</p><h2><a href="#">{e(p["title"])}</a></h2><p>{e(p["description"])}</p></li>' for p in posts[:7])}</ol>
  <section class="o2-wnmp">{inline_svg("wnmp-avatar-square.svg", "av", 64)}<div><p class="t">When News Meets Product</p><p>{PROMISE}</p>{signup()}</div></section>
</main></div>'''

o2_article = f'''<div class="o2-layout">{o2_side}
<main class="o2-main">
  <article class="o2-art">
    <p class="label">{kicker(article)} · {nice_date(article["date"])}</p>
    <h1>{e(article["title"])}</h1>
    <p class="standfirst">{e(article["standfirst"])}</p>
    <div class="prose">{article_html}</div>
    <p class="tagline">Filed under {e(tag_names(article))}</p>
  </article>
  <section class="o2-wnmp">{inline_svg("wnmp-avatar-square.svg", "av", 64)}<div><p class="t">When News Meets Product</p><p>{PROMISE}</p>{signup()}</div></section>
</main></div>'''

# --- Option 3: front page -----------------------------------------------------------

secondary = posts[1:4]
o3_home = f'''
<header class="o3-head"><div class="wrapw"><a class="name" href="#">Nick Petrie</a>{nav()}</div></header>
<main>
  <section class="wrapw o3-lead">
    <div><p class="label">{kicker(lead)}</p><h1><a href="#">{e(lead["title"])}</a></h1><p class="standfirst">{e(lead["standfirst"])}</p><p class="byline">{nice_date(lead["date"])}</p></div>
    <aside class="o3-about"><p class="label">About</p><p class="stmt">{STATEMENT}</p><p>{BIO}</p><p><a href="#">More about me</a></p></aside>
  </section>
  <section class="wrapw o3-grid">{''.join(f'<article><p class="label">{kicker(p)}</p><h2><a href="#">{e(p["title"])}</a></h2><p>{e(p["description"])}</p></article>' for p in secondary)}</section>
  <section class="o3-band yellow"><div class="wrapw band-in">{inline_svg("wnmp-masthead.svg", "mast", 340)}<div><p class="promise">{PROMISE}</p>{signup()}<p class="small">Six issues so far. <a href="#">Read them all</a></p></div></div></section>
  <section class="wrapw o3-index"><h2 class="label">More writing</h2><ul>{''.join(f'<li><a href="#">{e(p["title"])}</a><span>{p["date"][:4]}</span></li>' for p in posts[4:12])}</ul></section>
  <section class="o3-band ink"><div class="wrapw band-in"><div><p class="label">Mentoring</p><p class="stmt">Stuck between editorial and product?</p></div><div><p>I mentor people in news product, from first roles to leading change. Pay what you can.</p><a class="btn paper" href="#">Book a session</a></div></div></section>
</main>
<footer class="o3-foot"><div class="wrapw"><p>nick@nickpetrie.co · <a href="#">LinkedIn</a> · <a href="#">X</a> · <a href="#">RSS</a></p></div></footer>'''

o3_article = f'''
<header class="o3-head"><div class="wrapw"><a class="name" href="#">Nick Petrie</a>{nav()}</div></header>
<main>
  <section class="wrapw o3-arthead"><p class="label">{kicker(article)}</p><h1>{e(article["title"])}</h1><p class="standfirst">{e(article["standfirst"])}</p>{byline()}</section>
  <section class="wrapw o3-artbody"><div class="prose">{article_html}</div>
    <aside class="o3-rail"><p class="label">Topics</p><p>{e(tag_names(article))}</p><p class="label">Mentoring</p><p>Working on this in your own organisation? <a href="#">Book a session.</a></p></aside></section>
  <section class="o3-band yellow"><div class="wrapw band-in">{inline_svg("wnmp-masthead.svg", "mast", 300)}<div><p class="promise">{PROMISE}</p>{signup()}</div></div></section>
  <section class="wrapw o3-grid"><h2 class="label full">Related</h2>{''.join(f'<article><p class="label">{kicker(p)}</p><h2><a href="#">{e(p["title"])}</a></h2><p>{e(p["description"])}</p></article>' for p in related)}</section>
</main>
<footer class="o3-foot"><div class="wrapw"><p>nick@nickpetrie.co · <a href="#">LinkedIn</a> · <a href="#">X</a> · <a href="#">RSS</a></p></div></footer>'''

OPTIONS = [
    ('1', 'Quiet column', 'One narrow column, lots of paper, your statement up top and the newsletter as the single yellow moment. Closest to "minimal, clean, thoughtful".', o1_home, o1_article),
    ('2', 'Profile and stream', 'Who you are stays on screen (NP avatar, bio, two actions) while the writing scrolls beside it. Strongest for mentoring enquiries and people checking you out.', o2_home, o2_article),
    ('3', 'Front page', 'An editorial front page: lead essay, secondary pieces, then full-width bands for the newsletter and mentoring. Most like a publication; needs a steady flow of writing to look full.', o3_home, o3_article),
]

views = ''.join(
    f'<div class="view o{n}" data-opt="{n}" data-page="home" hidden>{home}</div><div class="view o{n}" data-opt="{n}" data-page="article" hidden>{art}</div>'
    for n, _, _, home, art in OPTIONS
)
descs = ''.join(f'<p class="desc" data-opt="{n}" hidden><b>Option {n}: {t}.</b> {d}</p>' for n, t, d, _, _ in OPTIONS)
opt_buttons = ''.join(f'<button type="button" data-set-opt="{n}">{n}. {t}</button>' for n, t, _, _, _ in OPTIONS)

CSS = r'''
:root{--ink:#1F2834;--paper:#F7F6F1;--yellow:#E6C635;--muted:#5A6470;--rule:#D8DCD9;
--sans:'Source Sans 3',Arial,sans-serif;--serif:'Source Serif 4',Georgia,serif;--display:'Source Serif 4 Display',Georgia,serif;
--np-light:block;--np-dark:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#F7F6F1;--paper:#1F2834;--muted:#A9B1BA;--rule:#36404C;--np-light:none;--np-dark:block;color-scheme:dark}}
:root[data-theme="dark"]{--ink:#F7F6F1;--paper:#1F2834;--muted:#A9B1BA;--rule:#36404C;--np-light:none;--np-dark:block;color-scheme:dark}
.np.l{display:var(--np-light)} .np.d{display:var(--np-dark)}
[hidden]{display:none!important} *{box-sizing:border-box} html{-webkit-text-size-adjust:100%} body{margin:0;background:var(--paper);color:var(--ink);font:400 18px/1.6 var(--sans)}
a{color:inherit;text-decoration:underline;text-underline-offset:.15em;text-decoration-thickness:1px}
h1,h2,h3{text-wrap:balance} img,svg{max-width:100%}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.label{font:700 13px/1.2 var(--sans);letter-spacing:.06em;text-transform:uppercase;margin:0 0 10px}
.small{font-size:15px;color:var(--muted)} .lede{color:var(--muted)}
.view{background:var(--paper);color:var(--ink);min-height:100vh;container:view / inline-size}
/* Device frames: the layout responds to the frame's width (container queries), so a desktop layout can be shown scaled down on a phone. */
.stage{position:relative;overflow:hidden} .stage.framed{background:#E4E3DD;padding-block:16px}
.stage.framed .view{transform-origin:top left;box-shadow:0 1px 4px rgba(0,0,0,.15);min-height:0}
.stage.phone .view{margin:0 auto}
.mast{display:block;height:auto}
.signup{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px} .signup input{flex:1 1 220px;font:inherit;font-size:17px;padding:11px 12px;border:1px solid var(--ink);border-radius:4px;background:#fff;color:#1F2834}
.signup button,.btn{font:700 16px/1 var(--sans);padding:13px 18px;border-radius:4px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;text-decoration:none;display:inline-block}
.prose{font:400 19px/1.65 var(--serif)} .prose p{margin:0 0 1.1em} .prose h3{font:700 15px/1.3 var(--sans);margin:2.2em 0 .6em}
.prose hr{border:0;border-top:1px solid var(--ink);margin:2.4em 0 0} .prose hr+h3{margin-top:.7em}
.pull{margin:1.8em 0;padding:2px 0 2px 22px;border-left:3px solid var(--yellow)} .pull p{font:400 30px/1.2 var(--serif)!important;margin:0!important}
.chip{font:700 11px/1 var(--sans);letter-spacing:.05em;background:var(--yellow);color:#1F2834;padding:3px 6px;border-radius:3px;margin-left:8px;vertical-align:2px}
nav ul{list-style:none;display:flex;gap:6px 20px;flex-wrap:wrap;margin:0;padding:0} nav a{text-decoration:none;font-weight:600}

/* Option 1 */
.o1 .wrap{max-width:720px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.o1-wnmp .signup button,.o3-band.yellow .signup button{background:#1F2834;border-color:#1F2834;color:#F7F6F1}
.o1-head{display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between;align-items:baseline;padding-top:28px!important;padding-bottom:28px!important}
.o1 .name{font:600 20px/1 var(--sans);text-decoration:none}
.o1-hero h1{font:400 clamp(40px,7vw,60px)/1.05 var(--display);margin:48px 0 18px;letter-spacing:-.01em}
.o1-hero .lede{font-size:20px;max-width:60ch}
.o1-wnmp{background:var(--yellow);color:#1F2834;padding:28px;margin:48px 0}
.o1-wnmp .promise{font:400 22px/1.3 var(--serif);margin:16px 0 4px} .o1-wnmp .small{color:#1F2834}
.o1-list .year{display:grid;grid-template-columns:72px 1fr;gap:16px;border-top:1px solid var(--rule);padding:14px 0}
.o1-list h3{font:600 16px/1.6 var(--sans);margin:0;color:var(--muted)} .o1-list ul{list-style:none;margin:0;padding:0}
.o1-list li{font:400 21px/1.35 var(--serif);margin:0 0 8px} .o1-list li a{text-decoration:none} .o1-list li a:hover{text-decoration:underline}
.o1-mentor{border-top:1px solid var(--ink);margin-top:40px;padding-top:12px}
.o1-foot{border-top:1px solid var(--rule);margin-top:56px;padding-top:20px!important;padding-bottom:40px!important;color:var(--muted);font-size:15px}
.o1-art h1{font:400 clamp(38px,7vw,56px)/1.06 var(--display);margin:24px 0 14px} .o1-art .standfirst{font-size:21px;margin:0 0 14px}
.o1-art .byline{color:var(--muted);font-size:15px;border-bottom:1px solid var(--rule);padding-bottom:22px;margin-bottom:28px}

/* Option 2 */
.o2-layout{display:grid;grid-template-columns:300px minmax(0,1fr);max-width:1180px;margin:0 auto;gap:56px;padding-block:40px;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px))}
.o2-side{position:sticky;top:24px;align-self:start}
.o2-side .np{width:72px;height:72px;margin-bottom:16px} .o2-side .name{font:600 24px/1.1 var(--sans);margin:0 0 10px}
.o2-side .bio{font-size:16px;color:var(--muted);margin:0 0 18px} .ctas{display:grid;gap:8px;margin-bottom:18px}
.btn.yellow{background:var(--yellow);border-color:var(--yellow);color:#1F2834;text-align:center} .btn.line{background:transparent;color:var(--ink);border-color:var(--ink);text-align:center}
.o2-side .contact{font-size:15px;color:var(--muted)} .nav.side{border-top:1px solid var(--rule);padding-top:14px;margin-top:14px} .nav.side ul{flex-direction:column;gap:6px}
.o2-h1{font:400 clamp(36px,5vw,52px)/1.08 var(--display);margin:0 0 20px}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0 0 20px} .chips a{display:block;font-size:15px;font-weight:600;border:1px solid var(--rule);border-radius:999px;padding:4px 12px;text-decoration:none}
.chips li:first-child a{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.stream{list-style:none;margin:0;padding:0} .stream li{border-top:1px solid var(--rule);padding:20px 0 20px} .stream li.is-wnmp{border-top:3px solid var(--yellow)}
.stream h2{font:400 28px/1.15 var(--serif);margin:0 0 8px} .stream h2 a{text-decoration:none} .stream p:not(.label){margin:0;color:var(--muted);max-width:62ch}
.o2-wnmp{display:flex;gap:20px;align-items:flex-start;border:1px solid var(--ink);padding:24px;margin:40px 0} .o2-wnmp .av{flex:none;width:64px;height:64px} .o2-wnmp .t{font:700 22px/1.1 var(--sans);margin:0 0 4px} .o2-wnmp p{margin:0}
.o2-art h1{font:400 clamp(36px,5vw,54px)/1.06 var(--display);margin:6px 0 14px} .o2-art .standfirst{font-size:21px;margin:0 0 28px;color:var(--muted)}
.o2-art .prose{font:400 19px/1.65 var(--sans);max-width:66ch} .o2-art .pull p{font-family:var(--serif)} .tagline{font-size:15px;color:var(--muted)}

/* Option 3 */
.o3 .wrapw{max-width:1200px;margin:0 auto;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px))}
.o3-head{border-bottom:1px solid var(--ink)} .o3-head .wrapw{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;align-items:center;padding-top:18px;padding-bottom:18px}
.o3 .name{font:600 22px/1 var(--sans);text-decoration:none}
.o3-lead{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:48px;padding-top:48px!important;padding-bottom:40px!important;border-bottom:1px solid var(--rule)}
.o3-lead h1{font:400 clamp(44px,6.5vw,80px)/1.02 var(--display);margin:0 0 18px;letter-spacing:-.015em} .o3-lead h1 a{text-decoration:none}
.o3-lead .standfirst{font-size:22px;max-width:40ch;margin:0 0 10px} .byline{color:var(--muted);font-size:15px}
.o3-about{border-left:1px solid var(--rule);padding-left:28px} .stmt{font:400 26px/1.2 var(--serif);margin:0 0 12px} .o3-about p{font-size:16px}
.o3-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;padding-top:32px!important;padding-bottom:48px!important}
.o3-grid .full{grid-column:1/-1;margin:0} .o3-grid h2{font:400 26px/1.15 var(--serif);margin:0 0 8px} .o3-grid h2 a{text-decoration:none} .o3-grid p:not(.label){color:var(--muted);font-size:16px;margin:0}
.o3-band{padding:44px 0} .o3-band.yellow{background:var(--yellow);color:#1F2834} .o3-band.ink{background:#1F2834;color:#F7F6F1}
.band-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center} .o3-band .promise{font:400 24px/1.3 var(--serif);margin:0} .o3-band .small{color:inherit}
.btn.paper{background:#F7F6F1;color:#1F2834;border-color:#F7F6F1;margin-top:8px}
.o3-index{padding-top:36px!important;padding-bottom:44px!important} .o3-index ul{list-style:none;padding:0;margin:0;columns:2;column-gap:48px}
.o3-index li{break-inside:avoid;display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--rule);padding:10px 0;font:400 19px/1.35 var(--serif)} .o3-index li a{text-decoration:none} .o3-index span{font:400 14px/1.6 var(--sans);color:var(--muted)}
.o3-foot{border-top:1px solid var(--ink);padding:20px 0 40px;color:var(--muted);font-size:15px}
.o3-arthead{padding-top:48px!important;padding-bottom:20px!important} .o3-arthead>*{max-width:920px} .o3-arthead h1{font:400 clamp(42px,6.5vw,76px)/1.02 var(--display);margin:0 0 16px}
.o3-arthead .standfirst{font-size:23px;margin:0 0 12px}
.o3-artbody{display:grid;grid-template-columns:minmax(0,680px) 260px;gap:64px;padding-top:24px!important;padding-bottom:48px!important;border-top:1px solid var(--rule)}
.o3-rail{border-left:1px solid var(--rule);padding-left:24px;font-size:16px;align-self:start;position:sticky;top:24px}

@container view (max-width:860px){
  .o2-layout{grid-template-columns:1fr;gap:28px;padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))} .o2-side{position:static} .nav.side{display:none} .ctas{grid-template-columns:1fr 1fr}
  .o3-lead,.band-in,.o3-artbody{grid-template-columns:1fr;gap:28px} .o3-about{border-left:0;padding-left:0;border-top:1px solid var(--rule);padding-top:20px}
  .o3-grid{grid-template-columns:1fr} .o3-index ul{columns:1} .o3-rail{border-left:0;padding-left:0;position:static}
}
@container view (max-width:520px){.o1-list .year{grid-template-columns:1fr;gap:4px} .o2-wnmp{flex-direction:column} .ctas{grid-template-columns:1fr}}

/* Review toolbar */
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:11;background:#fff}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:10;background:#fff;border-bottom:1px solid #D8DCD9;padding-block:10px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));font:400 15px/1.4 'Source Sans 3',Arial,sans-serif;color:#1F2834}
.bar .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px} .bar b{margin-right:6px}
.bar button{font:600 14px/1 'Source Sans 3',Arial,sans-serif;padding:7px 10px;border:1px solid #1F2834;background:#fff;color:#1F2834;border-radius:4px;cursor:pointer}
.bar button[aria-pressed=true]{background:#1F2834;color:#fff} .bar .desc{margin:4px 0 0;max-width:90ch;color:#5A6470} .bar .desc b{color:#1F2834}
'''

page = f'''<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Website prototypes</title>
<style>{font_css}{CSS}</style></head>
<body>
<div class="bar">
  <div class="row"><b>Option</b>{opt_buttons}</div>
  <div class="row"><b>Page</b><button type="button" data-set-page="home">Home</button><button type="button" data-set-page="article">Article</button></div>
  <div class="row"><b>Screen</b><button type="button" data-set-frame="fit">Fit my screen</button><button type="button" data-set-frame="desktop">Desktop (1280 px)</button><button type="button" data-set-frame="phone">Phone (390 px)</button></div>
  {descs}
  <p class="desc">Real posts and brand v0.3. Links don't go anywhere yet. "Desktop" shows the full-width layout scaled to fit your screen; dark mode follows your device setting.</p>
</div>
<div class="stage" id="stage">{views}</div>
<script>
  let opt = '1', page = 'home', frame = 'fit';
  const stage = document.getElementById('stage');
  function fit() {{
    const v = [...document.querySelectorAll('.view')].find((el) => !el.hidden);
    if (!v) return;
    stage.className = 'stage' + (frame === 'fit' ? '' : ' framed ' + frame);
    v.style.width = ''; v.style.transform = ''; stage.style.height = '';
    if (frame === 'fit') return;
    const w = frame === 'desktop' ? 1280 : 390;
    const avail = stage.clientWidth;
    const scale = Math.min(1, avail / w);
    v.style.width = w + 'px';
    v.style.transform = scale < 1 ? `scale(${{scale}})` : '';
    if (frame === 'phone' && scale === 1) v.style.marginLeft = 'auto';
    stage.style.height = (v.offsetHeight * scale + 32) + 'px';
  }}
  addEventListener('resize', fit);
  document.fonts.ready.then(fit);
  function show() {{
    for (const v of document.querySelectorAll('.view')) v.hidden = !(v.dataset.opt === opt && v.dataset.page === page);
    for (const d of document.querySelectorAll('.bar .desc[data-opt]')) d.hidden = d.dataset.opt !== opt;
    for (const b of document.querySelectorAll('[data-set-opt]')) b.setAttribute('aria-pressed', String(b.dataset.setOpt === opt));
    for (const b of document.querySelectorAll('[data-set-page]')) b.setAttribute('aria-pressed', String(b.dataset.setPage === page));
    for (const b of document.querySelectorAll('[data-set-frame]')) b.setAttribute('aria-pressed', String(b.dataset.setFrame === frame));
    window.scrollTo(0, 0);
    fit();
  }}
  document.addEventListener('click', (ev) => {{
    const b = ev.target.closest('[data-set-opt],[data-set-page],[data-set-frame]');
    if (!b) return;
    if (b.dataset.setOpt) opt = b.dataset.setOpt;
    else if (b.dataset.setPage) page = b.dataset.setPage;
    else frame = b.dataset.setFrame;
    show();
  }});
  show();
</script>
</body></html>'''

out = here / 'site-prototypes.html'
out.write_text(page)
art = re.sub(r'^<!doctype html>\s*<html[^>]*><head>.*?<title>', '<title>', page, flags=re.S)
art = art.replace('<title>Website prototypes</title>', '<title>nickpetrie.co site options</title>')
art = art.replace('</title>', '</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
art = art.replace('</head>\n<body>', '').replace('</body></html>', '')
(here / 'artifact-site-prototypes.html').write_text(art)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
