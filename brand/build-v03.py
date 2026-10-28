"""Brand v0.3 artwork, from Nick's choices on 28 October 2026: A2 B3 C3 D2 E8 F1.
Writes brand/v0.3/*.svg. WNMP lettering is outlined from Source Sans 3 Bold (SIL OFL, licence in brand/).
Run: python3 -I brand/build-v03.py"""
import pathlib
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

here = pathlib.Path(__file__).resolve().parent
out = here / 'v0.3'
out.mkdir(exist_ok=True)

INK, PAPER, YELLOW = '#1F2834', '#F7F6F1', '#E6C635'

# C3: NP drawn from measurements of the preferred reference (cap height 100 units).
NP_PATHS = ('<path d="M0 100V0H19L65 67V0H84V100H65L19 31V100Z"/>'
            '<path fill-rule="evenodd" d="M97 100V0H153C163 0 170 7 170 17V48C170 58 163 65 153 65H116V100Z'
            'M116 16V49H143C148 49 151 46 151 41V24C151 19 148 16 143 16Z"/>')
NP_W = 170

# A2: paired rules, thick over thin, on a 48 x 27 box.
RULES = '<path d="M0 0H48V11H0ZM0 22H48V27H0Z"/>'
RULES_W, RULES_H = 48, 27


def svg(viewbox, body, title, fill=INK):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" fill="{fill}" role="img"><title>{title}</title>{body}</svg>\n'


def write(name, text):
    (out / name).write_text(text)


# NP mark, bare and in avatars (ink and paper only: yellow belongs to WNMP).
write('np-mark.svg', svg(f'0 0 {NP_W} 100', NP_PATHS, 'Nick Petrie'))
write('np-mark-paper.svg', svg(f'0 0 {NP_W} 100', NP_PATHS, 'Nick Petrie', PAPER))
scale = 256 * 0.64 / NP_W
tx, ty = (256 - NP_W * scale) / 2, (256 - 100 * scale) / 2
inner = f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">{NP_PATHS}</g>'
for shape, container in [('square', '<rect width="256" height="256" fill="{bg}"/>'), ('circle', '<circle cx="128" cy="128" r="128" fill="{bg}"/>')]:
    write(f'np-{shape}-ink.svg', svg('0 0 256 256', container.format(bg=INK) + inner, 'Nick Petrie', PAPER))
    write(f'np-{shape}-paper.svg', svg('0 0 256 256', container.format(bg=PAPER) + inner, 'Nick Petrie', INK))

write('wnmp-paired-rules.svg', svg(f'0 0 {RULES_W} {RULES_H}', RULES, 'When News Meets Product'))

# Masthead: the v0.2 outlined masthead with the A2 motif swapped in.
mast = (here / 'wnmp-masthead-proposed.svg').read_text()
mast = mast.replace('M0 14H40V20H0ZM0 32H40V38H0Z', 'M0 12H40V21H0ZM0 30H40V34H0Z')
mast = mast.replace('— proposed masthead', '')
write('wnmp-masthead.svg', mast)


# B3 avatar: motif above outlined "WNMP" on yellow.
def outline(text, font_path, size, x, y):
    font = TTFont(font_path)
    cmap, gs = font.getBestCmap(), font.getGlyphSet()
    upm = font['head'].unitsPerEm
    k = size / upm
    paths, cursor = [], 0.0
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (k, 0, 0, -k, x + cursor, y)))
        paths.append(pen.getCommands())
        cursor += gs[name].width * k
    return ''.join(f'<path d="{d}"/>' for d in paths), cursor


bold = here / 'SourceSans3-Bold.woff'
size = 66
_, width = outline('WNMP', bold, size, 0, 0)
cap = size * 0.66  # Source Sans 3 cap height is about 0.66 em
rw, gap = 92, 14
rh = RULES_H * rw / RULES_W
top = (256 - (rh + gap + cap)) / 2
letters, _ = outline('WNMP', bold, size, (256 - width) / 2, top + rh + gap + cap)
rules = f'<g transform="translate({(256 - rw) / 2:.2f} {top:.2f}) scale({rw / RULES_W:.4f})">{RULES}</g>'
write('wnmp-avatar-square.svg', svg('0 0 256 256', f'<rect width="256" height="256" fill="{YELLOW}"/>{rules}{letters}', 'When News Meets Product'))
write('wnmp-avatar-circle.svg', svg('0 0 256 256', f'<circle cx="128" cy="128" r="128" fill="{YELLOW}"/>{rules}{letters}', 'When News Meets Product'))

print('Wrote', ', '.join(sorted(p.name for p in out.iterdir())))
