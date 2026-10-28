"""Round 2: NP mark drawn from measurements of Nick's reference, reader promise options,
and the confirmed choices (A2, B3, D2, F1). Run: python3 -I previews/build-round2.py"""
import base64
import pathlib

here = pathlib.Path(__file__).resolve().parent
# Reuse helpers without re-running the round 1 page build.
src = (here / 'build-comparison.py').read_text().split('# --- Sections')[0]
cmp = {'__file__': str(here / 'build-comparison.py')}
exec(compile(src, 'build-comparison.py', 'exec'), cmp)
INK, PAPER, YELLOW, MUTED, RULE = cmp['INK'], cmp['PAPER'], cmp['YELLOW'], cmp['MUTED'], cmp['RULE']
np_badge, motif, masthead, option, row, font_css = cmp['np_badge'], cmp['motif'], cmp['masthead'], cmp['option'], cmp['row'], cmp['font_css']

# Measured from np-direction-reference.png (cap height 37 px scaled to 100 units):
# N 84 wide, stems 19, diagonal ~24 across; gap 13; P 73 wide, stem 19, horizontals 16,
# bowl 65 deep, right side 19, counter 35 x 33, outer corner radius ~17.
N_MEASURED = '<path d="M0 100V0H19L65 67V0H84V100H65L19 31V100Z"/>'
P_MEASURED = ('<path fill-rule="evenodd" d="M97 100V0H153C163 0 170 7 170 17V48C170 58 163 65 153 65H116V100Z'
              'M116 16V49H143C148 49 151 46 151 41V24C151 19 148 16 143 16Z"/>')
P_ROUNDER = ('<path fill-rule="evenodd" d="M97 100V0H144C159 0 170 11 170 26V39C170 54 159 65 144 65H116V100Z'
             'M116 16V49H139C146 49 151 44 151 37V28C151 21 146 16 139 16Z"/>')
# Heavier: stems 21, horizontals 18, same outer proportions.
N_HEAVY = '<path d="M0 100V0H21L63 64V0H84V100H63L21 36V100Z"/>'
P_HEAVY = ('<path fill-rule="evenodd" d="M97 100V0H153C163 0 170 7 170 17V48C170 58 163 65 153 65H118V100Z'
           'M118 18V47H142C146 47 149 44 149 40V25C149 21 146 18 142 18Z"/>')

C3 = (N_MEASURED + P_MEASURED, 170)
C4 = (N_MEASURED + P_ROUNDER, 170)
C5 = (N_HEAVY + P_HEAVY, 170)
C1 = cmp['NP_KIT']

ref_path = here.parent / 'brand/np-direction-reference.png'
ref_b64 = base64.b64encode(ref_path.read_bytes()).decode()


def overlay(mark, label):
    """The reference's bare NP, enlarged, with the vector drawn on top in a translucent colour."""
    paths, w = mark
    # Bare NP in the reference image sits at x 161-224, y 206-243 (37 px cap height); scale 6x.
    s = 6
    img_w, img_h = 274 * s, 320 * s
    left, top = 161 * s, 206 * s
    cap = 37 * s
    k = cap / 100
    return (f'<figure class="ov"><div class="ovbox" style="width:{(w * k) + 40:.0f}px;height:{cap + 40}px">'
            f'<img src="data:image/png;base64,{ref_b64}" style="position:absolute;width:{img_w}px;height:{img_h}px;left:{-left + 20}px;top:{-top + 20}px;image-rendering:auto" alt="">'
            f'<svg style="position:absolute;left:20px;top:20px" width="{w * k:.0f}" height="{cap}" viewBox="0 0 {w} 100" fill="#E6463C" fill-opacity="0.55">{paths}</svg>'
            f'</div><figcaption>{label}: red is the new drawing, black is your reference</figcaption></figure>')


def np_row(mark):
    return row(np_badge(mark, 128), np_badge(mark, 128, 'circle'), np_badge(mark, 128, bg=PAPER, fg=INK), np_badge(mark, 48), np_badge(mark, 32),
               label='128 / circle / paper / 48 / 32')


def avatar_b3(size, shape='square'):
    clip = 'border-radius:50%;' if shape == 'circle' else ''
    small = size <= 48
    return (f'<div style="width:{size}px;height:{size}px;background:{YELLOW};display:flex;flex-direction:column;align-items:center;justify-content:center;'
            f'gap:{size * (0.06 if small else 0.05):.1f}px;{clip}color:{INK};flex:none">'
            f'{motif("thick-thin", size * (0.30 if small else 0.36))}'
            f'<span style="font:700 {size * (0.29 if small else 0.25):.1f}px/1 \'Source Sans 3\';letter-spacing:-0.03em">WNMP</span></div>')


sections = []

sections.append(('C', 'NP mark, round 2',
    'I measured the letters in your reference image: the kit drawing is about 12% too narrow, its P bowl is too small and too square, and all its strokes are the same weight, where your reference has slightly thinner horizontals. These three drawings use your reference\'s measurements. The overlays show how closely each one matches.',
    ''.join([
        option('C3', 'Measured from your reference', np_row(C3) + overlay(C3, 'C3'), recommended=True),
        option('C4', 'Measured, with a rounder bowl', np_row(C4) + overlay(C4, 'C4')),
        option('C5', 'Measured, one step heavier', np_row(C5) + overlay(C5, 'C5') + '<p class="small">Slightly bolder, so it holds up better white on ink at small sizes.</p>'),
        option('C1', 'Kit v0.2, for comparison', np_row(C1) + overlay(C1, 'C1'), kit=True),
        '<p class="small">Your reference is about 40 px tall, so the overlay is blurred. It can confirm proportions, not fine curves. If you have a larger or vector version of the reference, send it and I can match it exactly.</p>',
    ])))

promise_groups = [
    ('What it is', [
        ('E4', 'Essays on how news organisations really change, from someone inside one.'),
        ('E5', 'News product, from the inside.'),
    ]),
    ('The tension in the title', [
        ('E6', 'When news meets product, something has to give. This is about what, and why.'),
        ('E7', 'Where journalism and product collide, and how to make it work.'),
    ]),
    ('Who it\'s for', [
        ('E8', 'For people trying to change news organisations from the inside.'),
        ('E9', 'For the people stuck between editorial and product, and the people who manage them.'),
    ]),
    ('Your voice, more blunt', [
        ('E10', 'Honest notes on building news products, and the organisations that make it hard.'),
        ('E2', 'How news organisations actually change, and why they often don’t.'),
    ]),
]

prompts = ''.join(
    f'<h3 class="grp">{name}</h3>' + ''.join(
        f'<div class="promise"><span class="code">{code}</span><p class="pk">When News Meets Product, by Nick Petrie</p><p class="pl">{line}</p></div>'
        for code, line in items)
    for name, items in promise_groups
)
sections.append(('E', 'Reader promise, round 2',
    'One line that tells a stranger what they\'ll get and why it\'s worth their inbox. It appears under the masthead on the newsletter page, on every sign-up form and in the email footer. None of these promises a schedule or numbers we can\'t keep. Pick one, combine two, or tell me what\'s missing.',
    f'<div class="opt">{prompts}</div>'))

sections.append(('✓', 'Confirmed so far', 'A2, B3, D2 and F1, shown together.', ''.join([
    option('A2', 'Thick over thin', row(motif('thick-thin', 48), label='Motif') + masthead('thick-thin', 300)),
    option('B3', 'Motif above WNMP', row(avatar_b3(128), avatar_b3(128, 'circle'), avatar_b3(48), avatar_b3(32), label='128 / circle / 48 / 32') +
           '<p class="small">At 48 px and below I\'ve shrunk the motif and enlarged the lettering. At 32 px WNMP is still very small: that\'s the weak point of B3. That size mostly appears in inbox lists and comment threads, where the name sits right next to it, so I think it\'s acceptable.</p>'),
    option('D2 + F1', 'Serif sizes, dark mode and links', '<p class="small">Regular Source Serif below 40 px and Display above; paper on ink in dark mode, #A9B1BA for secondary text, and links in the text colour with an underline.</p>'),
])))

body = ''.join(
    f'<section id="s{key}"><p class="eyebrow">{key} / {title}</p><h2>{title}</h2><p class="lede">{why}</p><div class="opts">{opts}</div></section>'
    for key, title, why, opts in sections
)

html = f'''<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand v0.3, round 2</title>
<style>
{font_css}
:root{{--ink:{INK};--paper:{PAPER};--yellow:{YELLOW};--muted:{MUTED};--rule:{RULE}}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.55 'Source Sans 3',Arial,sans-serif}}
.wrap{{max-width:1040px;margin:0 auto;padding:40px 16px 80px}}
h1{{font:400 52px/1.05 'Source Serif 4 Display',Georgia,serif;margin:0 0 12px}} h2{{font:400 34px/1.15 'Source Serif 4',Georgia,serif;margin:0 0 8px}}
.intro{{max-width:68ch;color:var(--muted);font-size:19px}}
section{{border-top:1px solid var(--ink);padding-top:16px;margin-top:56px}}
.eyebrow{{font:700 13px/1 'Source Sans 3';letter-spacing:.06em;text-transform:uppercase;margin:0 0 12px}}
.lede{{color:var(--muted);max-width:70ch;margin:0 0 20px}}
.opts{{display:grid;gap:16px}} .opt{{border:1px solid var(--rule);background:#fff;padding:20px;border-radius:4px;overflow:hidden}}
.opt.is-rec{{border:2px solid var(--ink)}}
.opt h3{{font:600 18px/1.3 'Source Sans 3';margin:0 0 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}}
.code{{font-weight:700;background:var(--ink);color:#fff;border-radius:3px;padding:1px 7px;font-size:14px}}
.tag{{font-size:12px;font-weight:700;border:1px solid var(--rule);border-radius:999px;padding:1px 8px;color:var(--muted)}} .tag.rec{{background:var(--yellow);border-color:var(--yellow);color:var(--ink)}}
.row{{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-bottom:16px}} .rowlabel{{flex-basis:100%;font-size:13px;color:var(--muted)}}
.mast{{background:var(--yellow);padding:20px 24px;max-width:100%}} .mast svg{{display:block;max-width:100%;height:auto}}
.small{{font-size:14px;color:var(--muted);margin:4px 0 0}}
.ov{{margin:8px 0 0}} .ovbox{{position:relative;overflow:hidden;background:#F7F6F1;max-width:100%}} .ov figcaption{{font-size:13px;color:var(--muted);margin-top:6px}}
.grp{{font:700 13px/1 'Source Sans 3' !important;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:22px 0 4px !important}} .grp:first-child{{margin-top:0 !important}}
.promise{{border-top:1px solid var(--rule);padding:12px 0 4px;display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:start}}
.promise .code{{grid-row:span 2;margin-top:2px}} .pk{{font-weight:700;margin:0;font-size:15px}} .pl{{font:400 22px/1.3 'Source Serif 4',Georgia,serif;margin:2px 0 8px}}
.reply{{margin-top:56px;padding:24px;background:var(--ink);color:#fff}} .reply h2{{color:#fff}} .reply code{{background:rgba(255,255,255,.12);padding:2px 6px;border-radius:3px}}
@media (max-width:600px){{h1{{font-size:38px}} .row{{gap:12px}} .pl{{font-size:19px}}}}
</style></head><body><div class="wrap">
<p class="eyebrow">Nick Petrie / When News Meets Product</p>
<h1>Brand v0.3, round 2</h1>
<p class="intro">New NP drawings measured from your reference, more reader promise options, and the four choices you've confirmed.</p>
{body}
<div class="reply"><h2>How to reply</h2><p>Pick an NP drawing (C3, C4 or C5, or tell me what's still off) and a promise (or a mix, such as <code>E6 + E8</code>).</p></div>
</div></body></html>'''

out = here / 'brand-v03-round2.html'
out.write_text(html)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
