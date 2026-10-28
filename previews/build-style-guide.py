"""Builds the style guide page (previews/artifact-style-guide.html) from the brand skill.
Render the examples first (see .claude/skills/nick-petrie-brand/SKILL.md), then:
python3 -I previews/build-style-guide.py <dir with the example .jpg renders>"""
import base64
import html
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
skill = root / '.claude/skills/nick-petrie-brand'
shots = pathlib.Path(sys.argv[1])
e = html.escape


def b64(p, mime):
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()


def img(name, alt, cls=''):
    return f'<img src="{b64(shots / (name + ".jpg"), "image/jpeg")}" alt="{e(alt)}" class="{cls}">'


def svg(name, cls):
    s = (skill / 'assets/logo' / name).read_text().strip()
    s = re.sub(r'<title>.*?</title>', '', s).replace(' fill="#1F2834"', '')
    return s.replace('<svg ', f'<svg class="{cls}" aria-hidden="true" ', 1)


fonts = ''.join(
    f"@font-face{{font-family:'{fam}';src:url({b64(skill / 'assets/fonts' / f, 'font/woff2')}) format('woff2');font-weight:{w};font-style:{st}}}"
    for fam, f, w, st in [
        ('Source Sans 3', 'SourceSans3-Regular.woff2', 400, 'normal'),
        ('Source Sans 3', 'SourceSans3-Semibold.woff2', 600, 'normal'),
        ('Source Sans 3', 'SourceSans3-Bold.woff2', 700, 'normal'),
        ('Source Serif 4', 'SourceSerif4-Regular.woff2', 400, 'normal'),
        ('Source Serif 4', 'SourceSerif4-Italic.woff2', 400, 'italic'),
        ('Source Serif 4 Display', 'SourceSerif4Display-Regular.woff2', 400, 'normal'),
    ])

SAMPLE_POST = """Bridge roles need to die.

Not because the problems they solve don't matter. Coordination between editorial and product matters more than ever. But these roles have become the sticking plaster we reach for instead of doing the harder work: restructuring teams, aligning incentives, building shared goals.

A lot of the people I coach are in bridge roles. They see the dysfunction more clearly than anyone, and hold things together through sheer force of will. Because they're so good at it, the business never has to fix the underlying problem.

If you create a bridge role, plan how to retire it on the day you create it.

What's the longest-running "temporary" role in your organisation?

nickpetrie.co/bridge-roles-need-to-die"""

TRAITS = [
    ('Direct', 'Lead with the argument. Headlines are claims, not topics.', 'Bridge roles need to die.', 'Some thoughts on bridge roles in newsrooms'),
    ('Plain', 'Short sentences, everyday words, British English.', 'Strategy just means having a plan.', 'Leveraging strategic frameworks to unlock alignment'),
    ('Concrete', 'Real examples, numbers with context, metaphors from life.', 'Every Friday for seven months, the New York Times exec team talked.', 'Leading publishers invest heavily in alignment.'),
    ('Honest', 'Name the trade-offs. Say when something is hard.', 'All of these are easy to write and hard to do.', 'Follow these five simple steps to transform your newsroom.'),
    ('Constructive', 'Every critique ends with what to do.', 'This is where I would start: 1. Invest much, much more in understanding your audience…', 'Newsrooms are failing their readers.'),
    ('Open', 'End by inviting a reply.', 'What would you do differently?', 'Let that sink in.'),
]

TONE = [
    ('Essay or newsletter', 'Argued and personal. One big idea, the evidence, what to do, an invitation to reply.'),
    ('LinkedIn post', 'The essay’s argument in 80 to 200 words. First line is the claim. One question or one link.'),
    ('Quote card', 'One line that stands on its own, verbatim from the essay.'),
    ('Mentoring', 'Warm and practical. Pay what you can, stated plainly and meant.'),
    ('Comments and replies', 'Generous, curious, brief.'),
]

STYLE = [
    ('Spelling', 'British: organisation, prioritise, programme, behaviour.'),
    ('Case', 'Sentence case for headlines, titles and buttons. Kickers are capitalised by the design, never typed in caps.'),
    ('Dates and money', '23 January 2026 · 7pm, 7.30pm · £250, £1'),
    ('Numbers', 'One to nine in words, 10 and up in figures. Always figures for data and money.'),
    ('Punctuation', 'Prefer a colon or full stop to a dash. Curly quotes in designs.'),
    ('Names', 'The i Paper · The Times and Sunday Times · Reuters · News Product Alliance, then NPA · When News Meets Product, then WNMP where readers know it.'),
    ('Links', 'Link text says where it goes. Never “click here”.'),
    ('Hashtags', 'None, or up to three specific ones at the end.'),
    ('Avoid', 'Hype (game-changer, unlock, supercharge) · “I’m humbled to announce” · one-line-per-paragraph cliffhangers · emoji in designs · naming and shaming people or employers.'),
]

COLOURS = [
    ('Ink', '#1F2834', 'Text, the NP mark, dark cards', '#F7F6F1'),
    ('Paper', '#F7F6F1', 'The default ground. Warm, never pure white', '#1F2834'),
    ('Yellow', '#E6C635', 'When News Meets Product, the paired rules, the highlighter', '#1F2834'),
    ('Muted', '#5A6470', 'Secondary text on paper', '#F7F6F1'),
    ('Rule', '#D8DCD9', 'Hairlines on paper', '#1F2834'),
    ('Tint', '#EEEBE1', 'Quiet panels: quotes, cards', '#1F2834'),
]

TEMPLATES = [
    ('new-essay', 'New essay', 'statement · paper · 4:5', 'For every new piece. The title as the headline, the sharpest sentence as the text.'),
    ('issue', 'Newsletter issue', 'issue · yellow · 4:5', 'When an issue goes out. The masthead tells people it’s WNMP; yellow means newsletter everywhere.'),
    ('quote', 'Quote card', 'quote · ink · 4:5', 'A line you’d stand behind on its own, verbatim from the essay. Post a week after the essay to bring it back.'),
    ('mentoring', 'Mentoring and coaching', 'offer · ink · 4:5', 'The three offers. Use when spaces open, not more than once a month.'),
    ('testimonial', 'Testimonial', 'quote · paper · square', 'Only quotes cleared for public use, verbatim.'),
]

page = f'''<title>Nick Petrie style guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
{fonts}
/* Layout: one reading column on paper, with wide bands for the visual sections. Tokens are the site's own (brand v0.3). */
:root {{
  --ink: #1F2834; --paper: #F7F6F1; --yellow: #E6C635; --muted: #5A6470; --rule: #D8DCD9; --tint: #EEEBE1; --card: #FFFFFF;
  --good: #2F6B4F; --bad: #9A3B2E;
  --sans: 'Source Sans 3', Arial, sans-serif; --serif: 'Source Serif 4', Georgia, serif; --display: 'Source Serif 4 Display', Georgia, serif;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --ink: #F7F6F1; --paper: #1F2834; --muted: #A9B1BA; --rule: #36404C; --tint: #283240; --card: #26303D; --good: #8FC9A9; --bad: #E7A08F; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --ink: #F7F6F1; --paper: #1F2834; --muted: #A9B1BA; --rule: #36404C; --tint: #283240; --card: #26303D; --good: #8FC9A9; --bad: #E7A08F; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ background: var(--paper); color: var(--ink); font: 400 18px/1.6 var(--sans); }}
a {{ color: inherit; text-underline-offset: .15em; }}
a:focus-visible {{ outline: 3px solid var(--yellow); outline-offset: 2px; }}
h1, h2, h3 {{ text-wrap: balance; font-weight: 400; }}
.wrap {{ max-width: 1000px; margin: 0 auto; padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); }}
.narrow {{ max-width: 680px; }}
.label {{ font: 700 13px/1.2 var(--sans); letter-spacing: .07em; text-transform: uppercase; margin: 0 0 10px; color: var(--muted); }}
.np-mark {{ width: 40px; height: auto; }} .np-mark path {{ fill: var(--ink); }}
header.top {{ display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; padding-block: 26px; border-bottom: 3px solid var(--ink); }}
.brand {{ display: flex; align-items: center; gap: 12px; font: 600 20px/1 var(--sans); }}
nav ul {{ list-style: none; display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; padding: 0; }} nav a {{ text-decoration: none; font-weight: 600; }}
.hero {{ padding-block: 56px 24px; }}
.hero h1 {{ font: 400 clamp(42px, 7vw, 76px)/1.02 var(--display); margin: 0 0 18px; letter-spacing: -.01em; }}
.hero .lede {{ font: 400 22px/1.45 var(--serif); color: var(--muted); max-width: 40ch; margin: 0; }}
.promise {{ margin-top: 34px; padding: 22px 24px; background: var(--yellow); color: #1F2834; font: 400 clamp(22px, 3vw, 28px)/1.3 var(--serif); }}
.promise b {{ display: block; font: 700 13px/1.2 var(--sans); letter-spacing: .07em; text-transform: uppercase; margin-bottom: 8px; }}
section.part {{ padding-block: 56px; border-top: 1px solid var(--rule); }}
.part > .wrap > h2 {{ font: 400 clamp(32px, 4.5vw, 46px)/1.1 var(--display); margin: 0 0 8px; }}
.intro {{ font: 400 20px/1.5 var(--serif); color: var(--muted); max-width: 56ch; margin: 0 0 32px; }}
.traits {{ display: grid; gap: 14px; }}
@media (min-width: 760px) {{ .traits {{ grid-template-columns: 1fr 1fr; }} }}
.trait {{ background: var(--tint); padding: 22px 22px 20px; display: grid; gap: 10px; align-content: start; }}
.trait h3 {{ font: 400 26px/1.15 var(--serif); margin: 0; }}
.trait > p {{ margin: 0; color: var(--muted); }}
.say, .not {{ margin: 0; padding-left: 26px; position: relative; font: 400 18px/1.45 var(--serif); }}
.say::before, .not::before {{ position: absolute; left: 0; top: 0; font: 700 15px/1.6 var(--sans); }}
.say::before {{ content: "\\2713"; color: var(--good); }} .not {{ color: var(--muted); text-decoration: line-through; text-decoration-color: var(--bad); }}
.not::before {{ content: "\\2715"; color: var(--bad); text-decoration: none; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ text-align: left; vertical-align: top; padding: 12px 16px 12px 0; border-top: 1px solid var(--rule); }}
th {{ font-weight: 700; width: 30%; }}
.post {{ display: grid; gap: 24px; }}
@media (min-width: 860px) {{ .post {{ grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; }} }}
.li {{ background: var(--card); border: 1px solid var(--rule); border-radius: 8px; padding: 18px 20px; font: 400 16px/1.5 var(--sans); }}
.li-head {{ display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }}
.li-head span {{ width: 44px; height: 44px; border-radius: 50%; background: var(--ink); display: grid; place-items: center; }}
.li-head span svg {{ width: 26px; }} .li-head span svg path {{ fill: var(--paper); }}
.li-head b {{ display: block; }} .li-head small {{ color: var(--muted); }}
.li p {{ margin: 0 0 12px; white-space: pre-line; }} .li img {{ display: block; width: 100%; border-radius: 4px; }}
.notes {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; counter-reset: n; }}
.notes li {{ padding-left: 44px; position: relative; counter-increment: n; }}
.notes li::before {{ content: counter(n); position: absolute; left: 0; top: -2px; width: 30px; height: 30px; border-radius: 50%; background: var(--yellow); color: #1F2834; font: 700 15px/30px var(--sans); text-align: center; }}
.notes b {{ display: block; }}
.swatches {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }}
.sw {{ border: 1px solid var(--rule); }} .sw div {{ height: 92px; display: flex; align-items: flex-end; padding: 10px 12px; font: 700 14px/1 var(--sans); }}
.sw p {{ margin: 0; padding: 10px 12px 12px; font-size: 15px; line-height: 1.35; }} .sw code {{ font: 600 14px/1 ui-monospace, Menlo, monospace; display: block; margin-bottom: 4px; }}
.type {{ display: grid; gap: 22px; margin-top: 36px; }}
.type > div {{ display: grid; gap: 6px; border-top: 1px solid var(--rule); padding-top: 18px; }}
@media (min-width: 760px) {{ .type > div {{ grid-template-columns: 220px minmax(0, 1fr); gap: 24px; }} }}
.t-display {{ font: 400 54px/1.05 var(--display); }} .t-serif {{ font: 400 21px/1.6 var(--serif); }} .t-sans {{ font: 600 18px/1.4 var(--sans); }}
.t-label {{ font: 700 13px/1.2 var(--sans); letter-spacing: .07em; text-transform: uppercase; }}
.marks {{ display: grid; gap: 14px; margin-top: 36px; }}
@media (min-width: 760px) {{ .marks {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }} }}
.mark {{ display: grid; gap: 14px; align-content: start; }} .mark > div {{ height: 170px; display: grid; place-items: center; padding: 20px; }}
.mark p {{ margin: 0; font-size: 16px; color: var(--muted); }} .mark b {{ color: var(--ink); }}
.on-paper {{ background: #F7F6F1; border: 1px solid var(--rule); }} .on-ink {{ background: #1F2834; }} .on-yellow {{ background: #E6C635; }}
.on-paper svg path {{ fill: #1F2834; }} .on-ink svg path {{ fill: #F7F6F1; }} .on-yellow svg path {{ fill: #1F2834; }}
.m-np {{ width: 120px; }} .m-mast {{ width: 240px; }} .rules {{ display: grid; gap: 9px; }} .rules i {{ display: block; width: 96px; background: #E6C635; }}
.rules i:first-child {{ height: 22px; }} .rules i:last-child {{ height: 10px; }}
.gallery {{ display: grid; gap: 28px 22px; }}
@media (min-width: 640px) {{ .gallery {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
@media (min-width: 960px) {{ .gallery {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }} }}
figure.tpl {{ margin: 0; display: grid; gap: 10px; align-content: start; }}
figure.tpl img {{ display: block; width: 100%; height: auto; box-shadow: 0 1px 3px rgb(0 0 0 / .12), 0 8px 24px rgb(0 0 0 / .06); }}
figure.tpl b {{ font-size: 19px; }} figure.tpl code {{ font: 600 13px/1.3 ui-monospace, Menlo, monospace; color: var(--muted); display: block; }}
figure.tpl figcaption p {{ margin: 4px 0 0; color: var(--muted); font-size: 16px; line-height: 1.45; }}
.strip {{ display: flex; gap: 12px; overflow-x: auto; padding-bottom: 12px; scroll-snap-type: x mandatory; }}
.strip img {{ width: 220px; flex: none; height: auto; scroll-snap-align: start; box-shadow: 0 1px 3px rgb(0 0 0 / .12); }}
.wide img {{ width: 100%; max-width: 720px; display: block; box-shadow: 0 1px 3px rgb(0 0 0 / .12); }}
.next {{ background: #1F2834; color: #F7F6F1; padding-block: 56px; }}
.next h2 {{ font: 400 clamp(32px, 4.5vw, 46px)/1.1 var(--display); margin: 0 0 14px; }}
.next p, .next li {{ max-width: 62ch; color: #D9DDE2; }} .next .label {{ color: #E6C635; }}
footer {{ padding-block: 28px 48px; color: var(--muted); font-size: 15px; }}
@media (max-width: 560px) {{ th {{ width: 38%; }} .t-display {{ font-size: 42px; }} }}
</style>

<header class="top wrap">
  <div class="brand">{svg('np-mark.svg', 'np-mark')}<span>Nick Petrie</span></div>
  <nav aria-label="Sections"><ul><li><a href="#voice">Voice</a></li><li><a href="#linkedin">LinkedIn</a></li><li><a href="#house-style">House style</a></li><li><a href="#visual">Visual</a></li><li><a href="#social">Social</a></li></ul></nav>
</header>

<main>
  <section class="hero wrap">
    <p class="label">Style guide · brand v0.3 · 28 October 2026</p>
    <h1>How Nick Petrie sounds and looks.</h1>
    <p class="lede">One set of rules for the website, the newsletter and social. Written for Nick, and for Claude when it makes things in his name.</p>
    <div class="promise narrow"><b>Who it’s for</b>For people trying to change news organisations from the inside.</div>
  </section>

  <section class="part" id="voice"><div class="wrap">
    <h2>Voice</h2>
    <p class="intro">A practitioner talking to peers: someone who has done the job at The Times, Reuters and The i Paper, and is honest about how hard it is.</p>
    <div class="traits">
      {''.join(f'<div class="trait"><h3>{e(t)}</h3><p>{e(d)}</p><p class="say">{e(y)}</p><p class="not">{e(n)}</p></div>' for t, d, y, n in TRAITS)}
    </div>
    <h3 class="label" style="margin-top:40px">Tone by format</h3>
    <table><tbody>{''.join(f'<tr><th scope="row">{e(a)}</th><td>{e(b)}</td></tr>' for a, b in TONE)}</tbody></table>
  </div></section>

  <section class="part" id="linkedin"><div class="wrap">
    <h2>A LinkedIn post</h2>
    <p class="intro">The essay’s argument, short enough to read in the feed, with the card doing the stopping.</p>
    <div class="post">
      <div class="li">
        <div class="li-head"><span>{svg('np-mark-paper.svg', 'x')}</span><div><b>Nick Petrie</b><small>Digital Director at The i Paper</small></div></div>
        <p>{e(SAMPLE_POST)}</p>
        {img('new-essay', 'New essay card: Bridge roles need to die.')}
      </div>
      <ol class="notes">
        <li><b>The first line is the claim.</b>LinkedIn shows about two lines before “see more”. Make them the argument, not a warm-up.</li>
        <li><b>Two to four short paragraphs.</b>Why it matters, one concrete example from the work, what to do. 80 to 200 words.</li>
        <li><b>End on a question.</b>One people can answer from their own experience. The link goes last, on its own line.</li>
        <li><b>The card stops the scroll.</b>Portrait (4:5) takes the most room in the feed. Same title as the essay, so people recognise it on the site.</li>
        <li><b>No hashtags needed.</b>If you use them: up to three, specific, at the end.</li>
      </ol>
    </div>
  </div></section>

  <section class="part" id="house-style"><div class="wrap">
    <h2>House style</h2>
    <p class="intro">The small decisions, made once.</p>
    <table><tbody>{''.join(f'<tr><th scope="row">{e(a)}</th><td>{e(b)}</td></tr>' for a, b in STYLE)}</tbody></table>
  </div></section>

  <section class="part" id="visual"><div class="wrap">
    <h2>Visual</h2>
    <p class="intro">Ink and warm paper do almost all the work. Yellow belongs to the newsletter, so it means “When News Meets Product” wherever it appears.</p>
    <div class="swatches">
      {''.join(f'<div class="sw"><div style="background:{hx};color:{fg}">{e(n)}</div><p><code>{hx}</code>{e(u)}</p></div>' for n, hx, u, fg in COLOURS)}
    </div>
    <p class="small" style="color:var(--muted);margin-top:14px">Never yellow text on paper (it fails contrast). One accent per design: a highlight, a yellow kicker or the paired rules, not all three.</p>
    <div class="type">
      <div><p class="label">Display · headlines 40px and up</p><p class="t-display" style="margin:0">Bridge roles need to die.</p></div>
      <div><p class="label">Serif · body under 40px</p><p class="t-serif" style="margin:0">We keep creating jobs that exist to stand in the gap between editorial and product, and then we wonder why the gap never closes.</p></div>
      <div><p class="label">Sans · labels, bylines, buttons</p><p style="margin:0"><span class="t-label">New essay</span><br><span class="t-sans">Nick Petrie · nickpetrie.co</span></p></div>
    </div>
    <div class="marks">
      <div class="mark"><div class="on-paper">{svg('np-mark.svg', 'm-np')}</div><p><b>NP, the person.</b> Ink or paper only. Never yellow. With “Nick Petrie” in Source Sans Semibold.</p></div>
      <div class="mark"><div class="on-yellow">{svg('wnmp-masthead.svg', 'm-mast')}</div><p><b>The WNMP masthead.</b> For newsletter issues and subscribe prompts, on yellow.</p></div>
      <div class="mark"><div class="on-ink"><div class="rules"><i></i><i></i></div></div><p><b>The paired rules.</b> Thick over thin. Above a headline, as a divider or a bullet. Once per design.</p></div>
    </div>
    <p class="intro" style="margin-top:36px;margin-bottom:0"><b style="color:var(--ink)">Photography.</b> The 2022 profile photo is a stand-in: busy and dark, so keep it small and in a circle. What’s wanted is a natural-light portrait on a plain, light background, and a few working shots. No stock newsrooms, laptops or handshakes.</p>
  </div></section>

  <section class="part" id="social"><div class="wrap">
    <h2>Social templates</h2>
    <p class="intro">Five layouts and three grounds, from one template the site and Studio share. Each card is one JSON spec rendered by the brand skill.</p>
    <div class="gallery">
      {''.join(f'<figure class="tpl">{img(n, t + " template example")}<figcaption><b>{e(t)}</b><code>{e(c)}</code><p>{e(d)}</p></figcaption></figure>' for n, t, c, d in TEMPLATES)}
    </div>
    <h3 class="label" style="margin-top:48px">Carousel · a LinkedIn document post (PDF)</h3>
    <p style="max-width:62ch;margin:0 0 16px">The claim, one action per slide from the essay’s own list, then a question and the newsletter. Paper slides, one yellow at the end.</p>
    <div class="strip">{''.join(img(f'carousel-{i}', f'Carousel slide {i} of 7') for i in range(1, 8))}</div>
    <h3 class="label" style="margin-top:40px">Link image · X, Mastodon, LinkedIn links</h3>
    <div class="wide">{img('link', 'Landscape link image: Bridge roles need to die.')}</div>
  </div></section>

  <section class="next"><div class="wrap narrow">
    <p class="label">Next</p>
    <h2>Studio, for LinkedIn.</h2>
    <p>A copy of Shannon’s Studio, set up for you: Claude drafts posts and cards from each new essay, you approve or ask for changes, and approved posts go into your own Buffer queue for LinkedIn. It uses the templates on this page, so you can edit the words on a card and see it redraw.</p>
  </div></section>
</main>
<footer class="wrap">Brand v0.3. Source files: <code>.claude/skills/nick-petrie-brand</code> in the nickpetrie-site repo.</footer>
'''
out = root / 'previews/artifact-style-guide.html'
out.write_text(page)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
