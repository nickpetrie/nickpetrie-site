"""Builds previews/brand-v03-comparison.html: brand kit v0.2 against proposed v0.3 refinements.
Self-contained (fonts and images inlined) so it can be opened anywhere. Run: python3 previews/build-comparison.py"""
import base64
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
brand = root / 'brand'
fonts = root / 'public/fonts'

INK, PAPER, YELLOW, MUTED, RULE = '#1F2834', '#F7F6F1', '#E6C635', '#5A6470', '#D8DCD9'


def b64(path):
    return base64.b64encode(path.read_bytes()).decode()


font_css = ''.join(
    f"@font-face{{font-family:'{fam}';src:url(data:font/woff2;base64,{b64(fonts / f)}) format('woff2');font-weight:{w};font-display:block}}"
    for fam, f, w in [
        ('Source Sans 3', 'SourceSans3-Regular.woff2', 400),
        ('Source Sans 3', 'SourceSans3-Semibold.woff2', 600),
        ('Source Sans 3', 'SourceSans3-Bold.woff2', 700),
        ('Source Serif 4', 'SourceSerif4-Regular.woff2', 400),
        ('Source Serif 4 Display', 'SourceSerif4Display-Regular.woff2', 400),
    ]
)

# --- Marks -----------------------------------------------------------------

# Kit v0.2 NP (paths copied exactly from np-mark-proposed.svg), 149 x 100.
NP_KIT = ('<path d="M0 100V0H19L55 64V0H74V100H55L19 36V100Z"/>'
          '<path fill-rule="evenodd" d="M85 100V0H124Q149 0 149 25V39Q149 64 124 64H104V100ZM104 19V45H123Q130 45 130 38V26Q130 19 123 19Z"/>', 149)
# Proposed: closer to the reference. Wider N, round P bowl, same stem weight and close spacing. 162 x 100.
NP_ROUND = ('<path d="M0 100V0H20L62 66V0H82V100H62L20 34V100Z"/>'
            '<path fill-rule="evenodd" d="M93 100V0H130A32 32 0 0 1 130 64H113V100ZM113 18V46H128A14 14 0 0 0 128 18Z"/>', 162)


def np_badge(mark, size, shape='square', bg=INK, fg=PAPER):
    paths, w = mark
    scale = 256 * 0.64 / w  # the kit's rule: artwork fills 64% of the avatar width
    tx, ty = (256 - w * scale) / 2, (256 - 100 * scale) / 2
    container = f'<circle cx="128" cy="128" r="128" fill="{bg}"/>' if shape == 'circle' else f'<rect width="256" height="256" fill="{bg}"/>'
    return (f'<svg viewBox="0 0 256 256" width="{size}" height="{size}" fill="{fg}" role="img" aria-label="NP">{container}'
            f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">{paths}</g></svg>')


# Paired-rule motifs, all 48 wide on a 28-high box.
MOTIFS = {
    'equal': '<path d="M0 0H48V7H0ZM0 21H48V28H0Z"/>',          # kit v0.2
    'thick-thin': '<path d="M0 0H48V11H0ZM0 22H48V27H0Z"/>',     # newspaper "Oxford" rule
    'thin-thick': '<path d="M0 1H48V6H0ZM0 17H48V28H0Z"/>',
}


def motif(kind, width, colour=INK):
    h = width * 28 / 48
    return f'<svg viewBox="0 0 48 28" width="{width}" height="{h:.1f}" fill="{colour}" aria-hidden="true">{MOTIFS[kind]}</svg>'


masthead_src = (brand / 'wnmp-masthead-proposed.svg').read_text()
MAST_MOTIF = 'M0 14H40V20H0ZM0 32H40V38H0Z'
MAST_VARIANTS = {'equal': MAST_MOTIF, 'thick-thin': 'M0 12H40V21H0ZM0 30H40V34H0Z', 'thin-thick': 'M0 13H40V17H0ZM0 26H40V35H0Z'}


def masthead(kind, width):
    svg = masthead_src.replace(MAST_MOTIF, MAST_VARIANTS[kind]).replace('<svg ', f'<svg width="{width}" ', 1)
    return f'<div class="mast" style="width:{width + 48}px">{svg}</div>'


def avatar(kind, size, shape='square'):
    clip = 'border-radius:50%;' if shape == 'circle' else ''
    base = f'width:{size}px;height:{size}px;background:{YELLOW};display:flex;align-items:center;justify-content:center;{clip}overflow:hidden;flex:none'
    if kind == 'equal':
        return f'<div style="{base}">{motif("equal", size * 0.5)}</div>'
    if kind == 'wnmp':
        return f'<div style="{base};font:700 {size * 0.28:.1f}px/1 \'Source Sans 3\';letter-spacing:-0.02em;color:{INK}">WNMP</div>'
    if kind == 'stack':
        return (f'<div style="{base};flex-direction:column;gap:{size * 0.05:.1f}px;color:{INK}">'
                f'{motif("thick-thin", size * 0.36)}<span style="font:700 {size * 0.25:.1f}px/1 \'Source Sans 3\';letter-spacing:-0.02em">WNMP</span></div>')
    if kind == 'wn-mp':
        return (f'<div style="{base};flex-direction:column;color:{INK};font:700 {size * 0.36:.1f}px/0.92 \'Source Sans 3\';letter-spacing:-0.01em">'
                f'<span>WN</span><span>MP</span></div>')
    raise ValueError(kind)


def row(*cells, label=''):
    inner = ''.join(f'<div class="cell">{c}</div>' for c in cells)
    return f'<div class="row">{f"<div class=rowlabel>{label}</div>" if label else ""}{inner}</div>'


def option(code, title, body, recommended=False, kit=False):
    tag = '<span class="tag rec">Recommended</span>' if recommended else ('<span class="tag">Kit v0.2</span>' if kit else '')
    return f'<article class="opt{" is-rec" if recommended else ""}"><h3><span class="code">{code}</span> {title} {tag}</h3>{body}</article>'


ref_png = b64(brand.parent / 'brand' / 'np-direction-reference.png') if (brand / 'np-direction-reference.png').exists() else None

# --- Sections ----------------------------------------------------------------

sections = []

sections.append(('A', 'Paired-rule motif', 'Two equal bars can read as an equals sign or a menu icon. A thick-and-thin pair is a classic newspaper rule, so it reads as editorial.', ''.join([
    option('A1', 'Equal bars', row(motif('equal', 96), motif('equal', 48), motif('equal', 24), label='96 / 48 / 24 px') + masthead('equal', 300), kit=True),
    option('A2', 'Thick over thin', row(motif('thick-thin', 96), motif('thick-thin', 48), motif('thick-thin', 24), label='96 / 48 / 24 px') + masthead('thick-thin', 300), recommended=True),
    option('A3', 'Thin over thick', row(motif('thin-thick', 96), motif('thin-thick', 48), motif('thin-thick', 24), label='96 / 48 / 24 px') + masthead('thin-thick', 300)),
])))

sections.append(('B', 'WNMP avatar', 'This is what people see on social profiles and in inboxes, often at 32 to 48 px. It needs to say WNMP, not just show a shape.', ''.join([
    option('B1', 'Motif only', row(avatar('equal', 128), avatar('equal', 128, 'circle'), avatar('equal', 48), avatar('equal', 32), label='128 / circle / 48 / 32'), kit=True),
    option('B2', 'WNMP lettering', row(avatar('wnmp', 128), avatar('wnmp', 128, 'circle'), avatar('wnmp', 48), avatar('wnmp', 32), label='128 / circle / 48 / 32')),
    option('B3', 'Motif above WNMP', row(avatar('stack', 128), avatar('stack', 128, 'circle'), avatar('stack', 48), avatar('stack', 32), label='128 / circle / 48 / 32')),
    option('B4', 'Stacked WN / MP', row(avatar('wn-mp', 128), avatar('wn-mp', 128, 'circle'), avatar('wn-mp', 48), avatar('wn-mp', 32), label='128 / circle / 48 / 32'), recommended=True),
    '<p class="small">B2 is too small to read at 32 px, which is why B4 stacks the letters: they can be about a third bigger. It also picks up the sticky-note square from the planning stage. B2 to B4 use live type as a mock-up. The final artwork would be outlined vector paths, like the masthead.</p>',
    '<p class="small" hidden> as a mock-up. The final artwork would be outlined vector paths, like the masthead.</p>',
])))

ref = f'<img src="data:image/png;base64,{ref_png}" width="160" alt="Your preferred NP reference">' if ref_png else ''
sections.append(('C', 'NP mark', 'Your reference has wider letters and a round bowl on the P. The kit\'s refinement is narrower and squared off, which reads more like signage. C2 goes back towards the reference while keeping the weight and close spacing.', ''.join([
    option('C0', 'Your reference', row(ref, label='Supplied image')) if ref else '',
    option('C1', 'Kit refinement', row(np_badge(NP_KIT, 128), np_badge(NP_KIT, 128, 'circle'), np_badge(NP_KIT, 128, bg=PAPER, fg=INK), np_badge(NP_KIT, 48), np_badge(NP_KIT, 32), label='128 / circle / paper / 48 / 32'), kit=True),
    option('C2', 'Closer to the reference', row(np_badge(NP_ROUND, 128), np_badge(NP_ROUND, 128, 'circle'), np_badge(NP_ROUND, 128, bg=PAPER, fg=INK), np_badge(NP_ROUND, 48), np_badge(NP_ROUND, 32), label='128 / circle / paper / 48 / 32'), recommended=True),
    '<p class="small">Either way, I recommend dropping the yellow NP variants. Yellow signals WNMP, so your personal mark stays ink and paper. C2 is a first drawing for direction, not final artwork.</p>',
])))

sample = 'Bridge roles need to die'
def serif_rows(family):
    return ''.join(
        f'<div class="spec"><span class="px">{px}px</span><span style="font:400 {px}px/1.15 \'{family}\'">{sample}</span></div>'
        for px in (24, 32, 44)
    ) + f'<div class="spec dark"><span class="px">28px on ink</span><span style="font:400 28px/1.2 \'{family}\'">What are you seeing?</span></div>'

sections.append(('D', 'Serif sizes', 'The Display cut is elegant large but gets thin at smaller sizes, and especially white on ink.', ''.join([
    option('D1', 'Display everywhere', serif_rows('Source Serif 4 Display'), kit=True),
    option('D2', 'Regular below 40 px, Display above', serif_rows('Source Serif 4') + f'<div class="spec"><span class="px">56px</span><span style="font:400 56px/1.05 \'Source Serif 4 Display\'">{sample}</span></div>', recommended=True),
])))

promises = [
    ('E1', 'Clear thinking about the products, teams and decisions shaping news.', True, False),
    ('E2', 'How news organisations actually change, and why they often don’t.', False, True),
    ('E3', 'The products, teams and decisions behind news, from someone doing the work.', False, False),
]
sections.append(('E', 'Reader promise', 'Used in the newsletter footer, on the sign-up form and on the newsletter page. Your writing is blunter than the kit\'s line.', ''.join(
    option(code, 'Option', f'<div class="promise"><p class="pk">When News Meets Product, by Nick Petrie</p><p class="pl">{line}</p></div>', recommended=rec, kit=kit)
    for code, line, kit, rec in promises
)))

def theme_card(dark):
    bg, fg, mu, ru = (INK, PAPER, '#A9B1BA', '#36404C') if dark else (PAPER, INK, MUTED, RULE)
    return (f'<div class="card" style="background:{bg};color:{fg};border-color:{ru}"><p class="lbl" style="color:{fg}">Leadership</p>'
            f'<p style="font:400 30px/1.15 \'Source Serif 4\';margin:0 0 8px">{sample}</p>'
            f'<p style="font:400 17px/1.5 \'Source Sans 3\';color:{mu};margin:0 0 12px">23 January 2026 · Issue 6</p>'
            f'<p style="font:400 18px/1.55 \'Source Serif 4\';margin:0">Not another bridge, but <a href="#" style="color:{fg}">proper foundations</a>.</p>'
            f'<div style="border-left:3px solid {YELLOW};padding-left:14px;margin-top:16px;font:400 22px/1.25 \'Source Serif 4\'">One idea, one yellow edge.</div></div>')

sections.append(('F', 'Dark mode and links', 'The kit has no dark mode. I propose paper on ink, a lighter grey (#A9B1BA) for secondary text, yellow unchanged, and links in the text colour with an underline. Yellow on paper is 1.55:1, too faint for text.', option('F1', 'Light and dark', f'<div class="cards">{theme_card(False)}{theme_card(True)}</div>', recommended=True)))

# --- Page --------------------------------------------------------------------

body = ''.join(
    f'<section id="{key}"><p class="eyebrow">{key} / {title}</p><h2>{title}</h2><p class="lede">{why}</p><div class="opts">{opts}</div></section>'
    for key, title, why, opts in sections
)

html = f'''<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand v0.3 options</title>
<style>
{font_css}
:root{{--ink:{INK};--paper:{PAPER};--yellow:{YELLOW};--muted:{MUTED};--rule:{RULE}}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.55 'Source Sans 3',Arial,sans-serif}}
.wrap{{max-width:1040px;margin:0 auto;padding:40px 16px 80px}}
h1{{font:400 52px/1.05 'Source Serif 4 Display',Georgia,serif;margin:0 0 12px}} h2{{font:400 34px/1.15 'Source Serif 4',Georgia,serif;margin:0 0 8px}}
.intro{{max-width:68ch;color:var(--muted);font-size:19px}} .intro b{{color:var(--ink)}}
section{{border-top:1px solid var(--ink);padding-top:16px;margin-top:56px}}
.eyebrow,.lbl{{font:700 13px/1 'Source Sans 3';letter-spacing:.06em;text-transform:uppercase;margin:0 0 12px}}
.lede{{color:var(--muted);max-width:68ch;margin:0 0 20px}}
.opts{{display:grid;gap:16px}} .opt{{border:1px solid var(--rule);background:#fff;padding:20px;border-radius:4px}}
.opt.is-rec{{border:2px solid var(--ink)}}
.opt h3{{font:600 18px/1.3 'Source Sans 3';margin:0 0 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}}
.code{{font-weight:700;background:var(--ink);color:#fff;border-radius:3px;padding:1px 7px;font-size:14px}}
.tag{{font-size:12px;font-weight:700;border:1px solid var(--rule);border-radius:999px;padding:1px 8px;color:var(--muted)}} .tag.rec{{background:var(--yellow);border-color:var(--yellow);color:var(--ink)}}
.row{{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-bottom:16px}} .rowlabel{{flex-basis:100%;font-size:13px;color:var(--muted)}}
.mast{{background:var(--yellow);padding:20px 24px;max-width:100%}} .mast svg{{display:block;max-width:100%;height:auto}}
.small{{font-size:14px;color:var(--muted);margin:4px 0 0}}
.spec{{display:flex;gap:16px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--rule);overflow:hidden}} .spec .px{{flex:none;width:96px;font-size:13px;color:var(--muted)}}
.spec.dark{{background:var(--ink);color:#fff;padding:14px;border:0;margin-top:10px}} .spec.dark .px{{color:#A9B1BA}}
.promise{{border-top:1px solid var(--rule);padding-top:12px}} .pk{{font-weight:700;margin:0 0 4px}} .pl{{font:400 22px/1.3 'Source Serif 4',Georgia,serif;margin:0}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}} .card{{border:1px solid;padding:24px;border-radius:4px}}
.reply{{margin-top:56px;padding:24px;background:var(--ink);color:#fff}} .reply h2{{color:#fff}} .reply code{{background:rgba(255,255,255,.12);padding:2px 6px;border-radius:3px}}
@media (max-width:600px){{h1{{font-size:38px}} .row{{gap:12px}}}}
</style></head><body><div class="wrap">
<p class="eyebrow">Nick Petrie / When News Meets Product</p>
<h1>Brand v0.3 options</h1>
<p class="intro">Kit v0.2 against my proposed refinements, side by side and at real sizes. <b>Recommended</b> options have a heavy border. The palette, the person-and-publication relationship and the masthead lettering stay as they are. These are the open questions the kit itself flagged, plus three gaps.</p>
{body}
<div class="reply"><h2>How to reply</h2><p>Send the codes you want, for example <code>A2 B4 C2 D2 E2 F1</code>, plus any changes. I'll then finalise the artwork and apply only those choices to the email theme and the site.</p></div>
</div></body></html>'''

out = root / 'previews/brand-v03-comparison.html'
out.write_text(html)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
