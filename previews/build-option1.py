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

FEATURED = ['bridge-roles-need-to-die', 'the-two-product-team-problem', 'readers-readers-readers-readers-readers']
featured = [next(p for p in posts if p['slug'] == s) for s in FEATURED]
more = [p for p in posts if p['slug'] not in FEATURED][:3]
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
    return (f'<li class="entry"><{h}><a href="#article">{e(p["title"])}</a></{h}>'
            f'<p class="meta">{nice_date(p["date"])}</p>' + (f'<p class="sum">{e(p["standfirst"])}</p>' if summary else '') + '</li>')


def mentoring_band():
    return (f'<section class="mentor-band"><div class="wrap mentor-in">'
            f'<div class="mentor-head"><p class="label">Mentoring</p><h2>Stuck between editorial and product? Let\'s talk it through.</h2>'
            f'<p>I mentor and coach people in news product: getting started, stepping into a first management role, or leading change in an organisation that would rather not.</p><p class="proof">More than 65 sessions since 2021.</p>'
            f'<p class="actions"><a class="btn paper" href="#mentoring">Book a session</a> <a href="#mentoring">How it works</a></p></div>'
            f'<ul class="mentor-facts"><li><b>Pay what you can</b>One-off sessions. £250 is the full rate; £1 is fine.</li>'
            f'<li><b>Ongoing mentoring</b>Monthly spaces open from October 2026, over 3, 6 or 12 months.</li>'
            f'<li><b>Ask your employer</b>Many will fund it as personal development.</li></ul>'
            f'</div></section>')


def author_card():
    return (f'<aside class="author"><img src="{PHOTO}" alt="Nick Petrie" width="80" height="80">'
            f'<div><p class="author-name">Nick Petrie</p><p class="small">{BIO}</p>'
            f'<p class="small"><a href="#about">About me</a> · <a href="#mentoring">Mentoring</a></p></div></aside>')


PAGES = {}

PAGES['home'] = f'''{header('home')}
<main class="wrap">
  <section class="hero">
    <div class="hero-text"><h1>{STATEMENT}</h1><p class="lede">{BIO}</p><p><a href="#about">More about me</a></p></div>
    <figure class="portrait"><img src="{PHOTO}" alt="Nick Petrie" width="220" height="220"></figure>
  </section>
  {wnmp_block('home')}
  <section class="block"><h2 class="label">The hills I'll die on</h2><p class="small intro">Three pieces that say what I think, and why.</p><ol class="entries featured">{''.join(entry(p) for p in featured)}</ol></section>
  <section class="block"><h2 class="label">More writing</h2><ol class="entries compact">{''.join(entry(p, summary=False) for p in more)}</ol><p><a href="#writing">All writing</a></p></section>
</main>
{mentoring_band()}
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
      <ul><li>Former board member of the News Product Alliance, and now a coach with the NPA</li><li>Ran Evolving Newsroom, a side project on how newsroom roles are changing</li><li>Co-founded Wannabe Hacks (sadly no longer online)</li></ul>
      <h2>How I work</h2>{about_how}
    </div>
  </article>
  {wnmp_block('about', compact=True)}
</main>
{footer('foot-about')}'''

PAGES['mentoring'] = f'''{header('mentoring')}
<main class="wrap">
  <article class="art mentor-page">
    <p class="label">Mentoring</p>
    <h1>News product mentoring</h1>
    <p class="standfirst">Mentoring and coaching for people in news product, from someone who has done the job: at The Times, Reuters and now The i Paper.</p>
    <div class="facts">
      <div><p class="label">One-off sessions</p><p>Pay what you can. A session is worth £250; students, early-career journalists and anyone who can't afford it are welcome to pay £1. Honestly.</p></div>
      <div><p class="label">Ongoing mentoring</p><p>2 to 3 monthly spaces open from October 2026, best as a 3, 6 or 12 month commitment so we can set goals and work through them, with WhatsApp support between calls.</p></div>
    </div>
    <p class="actions"><a class="btn" href="https://savvycal.com/NickPetrie/0977e9aa">Book a session</a> <span class="small">It's often worth asking whether your employer will fund it.</span></p>

    <h2 class="section-h">Who it's for</h2>
    <div class="who">
      <div><h3>Getting started</h3><p>You're new to news product, or moving into it from editorial, and want to understand the paths open to you.</p></div>
      <div><h3>First time managing</h3><p>You've stepped into your first management role and want a sounding board while you find your feet.</p></div>
      <div><h3>Leading change</h3><p>You're responsible for cultural change or innovation, and the organisation isn't making it easy.</p></div>
    </div>

    <h2 class="section-h">What we can work on</h2>
    <ul class="ticks"><li>Business, product and organisational strategy</li><li>Structures and teams: how editorial, product and data work together</li><li>Newsroom tooling</li><li>Using reader data and insights in the newsroom</li><li>Your next career move</li></ul>

    <h2 class="section-h">How it works</h2>
    <ol class="steps"><li><b>Book a time.</b> When you book, you check out rather than just pick a slot. You'll see the fee with a "change amount" button: set what you can afford.</li>
    <li><b>We talk.</b> Bring the problem you're stuck on. I'll ask a lot of questions and tell you what I think.</li>
    <li><b>Keep going, if it helps.</b> For ongoing mentoring we agree goals, meet monthly and stay in touch in between.</li></ol>

    <h2 class="section-h">What people say</h2>
    <div class="quotes">
      <figure class="quote tbc"><blockquote><p>A short quote from someone you've mentored or coached goes here: what they were stuck on, and what changed.</p></blockquote><figcaption>Name, role, organisation</figcaption></figure>
      <figure class="quote tbc"><blockquote><p>A second quote, ideally from someone at a different stage: a first-time manager, or someone leading change.</p></blockquote><figcaption>Name, role, organisation</figcaption></figure>
    </div>
    <p class="small">More than 65 sessions since 2021.</p>

    <div class="pull-note"><p>I'll always offer free or very low cost sessions of some kind. Those who can afford to pay, I trust your judgement as to how much that is. I mean every word of that.</p></div>

    <h2 class="section-h">With the News Product Alliance</h2>
    <p>I was a mentor on the first cohort of the <a href="https://newsproduct.org/mentor-network">News Product Alliance's Mentor Network</a> in 2022 and 2023, and I'm now a coach with the NPA. If you're an NPA member, that's another way to work with me.</p>

    <h2 class="section-h">Questions</h2>
    <div class="faq">
      <details><summary>How much does it cost?</summary><p>One-off sessions are pay what you can. A session is worth £250, and you can set any amount from £1 when you book. Stripe won't take £0.</p></details>
      <details><summary>Is paying £1 really fine?</summary><p>Yes. Students, early-career journalists and anyone who can't afford more are welcome to pay £1. If you can afford to pay, I trust your judgement.</p></details>
      <details><summary>Is this mentoring or coaching?</summary><p>Both. Mentoring is me sharing what I've learnt and what I'd do in your position. Coaching is helping you work out your own answer. Most sessions use a bit of each, depending on what you need.</p></details>
      <details><summary>Who is it for?</summary><p>People working in or moving into news product, audience, data and digital roles: from first jobs to people leading change across a newsroom.</p></details>
      <details><summary>Can my employer pay?</summary><p>Often, yes. Many organisations will fund mentoring or coaching as personal development, so it's worth asking.</p></details>
      <details><summary>How does ongoing mentoring work?</summary><p>We agree goals, meet monthly over 3, 6 or 12 months, and stay in touch on WhatsApp between calls. I have 2 to 3 spaces open from October 2026.</p></details>
    </div>

    <p class="actions"><a class="btn" href="https://savvycal.com/NickPetrie/0977e9aa">Book a session</a></p>
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
.portrait{margin:0} .portrait img{display:block;width:100%;max-width:220px;aspect-ratio:1;object-fit:cover;border-radius:50%}
.portrait figcaption{font-size:13px;color:var(--muted);margin-top:6px;max-width:280px}
.portrait.inline{margin:8px 0 24px}
@container view (max-width:759px){.hero .portrait img{max-width:132px} .wnmp{margin-inline:calc(-1 * max(20px, env(safe-area-inset-left, 0px)))} .wnmp-in{padding:28px max(20px, env(safe-area-inset-left, 0px))}}
@container view (min-width:760px){.hero{grid-template-columns:minmax(0,1fr) 240px;align-items:end;gap:40px}}

.wnmp{background:var(--yellow);color:#1F2834;margin-block:44px}
.wnmp-in{display:grid;gap:18px;padding:28px} .mast{display:block;width:100%;max-width:340px;height:auto}
.wnmp .promise{font:400 clamp(18px, 5.4cqi, 21px)/1.3 var(--serif);margin:0 0 4px;text-wrap:balance} .wnmp .small{color:#1F2834} .wnmp a{color:#1F2834}
.wnmp.compact .mast{max-width:240px} .wnmp.compact .wnmp-in{padding:22px}
@container view (min-width:760px){.wnmp-in{grid-template-columns:230px minmax(0,1fr);align-items:center;gap:32px;padding:32px} .wnmp.compact .wnmp-in{grid-template-columns:200px minmax(0,1fr)}}
.signup{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 8px} .signup input{flex:1 1 200px;min-width:0;font:inherit;font-size:17px;padding:11px 12px;border:1px solid #1F2834;border-radius:4px;background:#fff;color:#1F2834}
.signup button,.btn{font:700 16px/1 var(--sans);padding:13px 18px;border-radius:4px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;text-decoration:none;display:inline-block}
.wnmp .signup button{background:#1F2834;border-color:#1F2834;color:#F7F6F1}

.block{margin-block:44px}
.entries{list-style:none;margin:0;padding:0} .entry{border-top:1px solid var(--rule);padding:16px 0}
.entry h3{font:400 24px/1.2 var(--serif);margin:0 0 4px} .entry h3 a{text-decoration:none} .entry h3 a:hover{text-decoration:underline}
.entries.compact .entry{padding:12px 0} .entries.compact h3{font-size:20px}
.meta{font-size:14px;color:var(--muted);margin:0} .sum{margin:6px 0 0;color:var(--muted);max-width:62ch}
.chip{font:700 11px/1 var(--sans);letter-spacing:.05em;background:var(--yellow);color:#1F2834;padding:3px 6px;border-radius:3px;margin-left:6px;vertical-align:1px}

.mentor-band{background:#1F2834;color:#F7F6F1;padding-block:52px;margin-top:56px}
.mentor-in{display:grid;gap:28px} .mentor-band .label{color:#E6C635}
.mentor-band h2{font:400 clamp(32px,5vw,44px)/1.08 var(--display);margin:0 0 14px;max-width:18ch} .mentor-band p{max-width:56ch;font-size:19px}
.mentor-band a{color:#F7F6F1} .btn.paper{background:#F7F6F1;color:#1F2834;border-color:#F7F6F1}
.mentor-facts{list-style:none;margin:0;padding:0;display:grid;gap:14px} .mentor-facts li{border-top:3px solid #E6C635;padding-top:10px;font-size:17px;color:#D9DDE2} .mentor-facts b{display:block;color:#F7F6F1;font-size:18px;margin-bottom:2px}
@container view (min-width:760px){.mentor-in{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:48px;align-items:start}}
.foot{margin-top:0!important} .intro{margin-top:-4px}
.actions{display:flex;flex-wrap:wrap;gap:16px;align-items:center}

.foot{border-top:1px solid var(--rule);margin-top:64px;padding-block:32px 48px}
.foot-in{display:grid;gap:28px} .foot-name{font:600 18px/1.2 var(--sans);margin:0 0 6px} .foot-label{font:700 15px/1.2 var(--sans);margin:0 0 4px}
@container view (min-width:760px){.foot-in{grid-template-columns:1fr 1.3fr}}

.art h1,.page-h1{font:400 clamp(38px,6.5vw,54px)/1.06 var(--display);margin:12px 0 14px;letter-spacing:-.01em}
.standfirst{font-size:21px;margin:0 0 14px;max-width:56ch}
.byline{font-size:15px;color:var(--muted);border-bottom:1px solid var(--rule);padding-bottom:22px;margin:0 0 28px}
.prose{font:400 19.5px/1.7 var(--serif);max-width:64ch} .prose p{margin:0 0 1.25em}
@container view (min-width:760px){.prose{font-size:21px;line-height:1.72} .art .standfirst{font-size:24px}} .prose .lead{font-size:23px;line-height:1.4}
.prose h2{font:400 28px/1.2 var(--serif);margin:1.6em 0 .5em} .prose h3{font:700 16px/1.3 var(--sans);margin:2em 0 .5em}
.prose hr{border:0;border-top:1px solid var(--ink);margin:2.4em 0 0} .prose hr+h3{margin-top:.7em}
.prose blockquote{margin:1.4em 0;padding:2px 0 2px 20px;border-left:3px solid var(--yellow)}
.pull{margin:2em 0!important;padding:4px 0 4px 24px!important} .pull p{font:400 clamp(26px,4vw,34px)/1.2 var(--display)!important;margin:0!important}
.prose ul{padding-left:1.2em} .tags{font-size:15px;color:var(--muted)}
.author{display:flex;gap:16px;align-items:flex-start;border:1px solid var(--rule);background:var(--card);padding:18px;margin-block:36px;border-radius:4px}
.author img{width:80px;height:80px;border-radius:50%;object-fit:cover;flex:none} .author-name{font:600 18px/1.2 var(--sans);margin:0 0 4px}
.facts{display:grid;gap:12px;margin:20px 0} .facts>div{border-top:3px solid var(--yellow);padding-top:10px} .facts p:not(.label){margin:0}
@container view (min-width:620px){.facts{grid-template-columns:1fr 1fr;gap:24px}}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:20px 0 8px} .chips a{display:block;font-size:15px;font-weight:600;border:1px solid var(--rule);border-radius:999px;padding:4px 12px;text-decoration:none}
.chips li:first-child a{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.year{display:grid;gap:4px;margin-top:28px} .year h2{font:600 16px/1.6 var(--sans);color:var(--muted);margin:0}
@container view (min-width:620px){.year{grid-template-columns:80px minmax(0,1fr);gap:16px} .year h2{padding-top:12px}}

.section-h{font:400 30px/1.15 var(--serif);margin:48px 0 16px}
.who{display:grid;gap:14px} .who>div{background:var(--card);border:1px solid var(--rule);border-radius:4px;padding:18px}
.who h3{font:600 18px/1.25 var(--sans);margin:0 0 6px} .who p{margin:0;font-size:17px;color:var(--muted)}
@container view (min-width:760px){.who{grid-template-columns:repeat(3,minmax(0,1fr))}}
.ticks{list-style:none;padding:0;margin:0;display:grid;gap:8px} .ticks li{padding-left:22px;position:relative} .ticks li::before{content:"";position:absolute;left:0;top:.6em;width:12px;height:3px;background:var(--yellow)}
.steps{margin:0;padding-left:1.3em;display:grid;gap:12px} .steps b{font-weight:700}
.mentor-band .proof{color:#E6C635;font-weight:700;margin-top:-4px}
.quotes{display:grid;gap:14px} @container view (min-width:760px){.quotes{grid-template-columns:1fr 1fr}}
.quote{margin:0;padding:18px 20px;background:var(--card, #fff);border:1px solid var(--rule);border-radius:6px} .quote blockquote{margin:0} .quote p{font:400 19px/1.45 var(--serif);margin:0 0 10px} .quote figcaption{font-size:15px;color:var(--muted)}
.quote.tbc{border-style:dashed;background:transparent} .quote.tbc p,.quote.tbc figcaption{color:var(--muted)}
.faq details{border-top:1px solid var(--rule);padding:14px 0} .faq details:last-child{border-bottom:1px solid var(--rule)} .faq summary{font-weight:700;font-size:18px;cursor:pointer} .faq details p{margin:10px 0 0}
.pull-note{margin:36px 0;padding:4px 0 4px 22px;border-left:3px solid var(--yellow)} .pull-note p{font:400 24px/1.35 var(--serif);margin:0}
.mentor-page .facts{margin-top:24px}

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
