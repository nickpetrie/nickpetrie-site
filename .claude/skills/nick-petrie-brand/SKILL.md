---
name: nick-petrie-brand
description: Make on-brand social posts and copy for Nick Petrie and his newsletter When News Meets Product (WNMP), from the nickpetrie.co design system. Covers LinkedIn posts and carousels, quote cards, newsletter-issue cards, mentoring and coaching promos, link images for X and Mastodon, and the words that go with them (post text, captions, standfirsts). Use it whenever anyone asks for a social post, card, carousel, graphic or copy for Nick Petrie, WNMP, nickpetrie.co or his mentoring, even if they don't name the brand. Never use it for Birth By You, which has its own skill.
---

# Nick Petrie: social designs and copy

Everything comes from the website's brand (v0.3): ink and paper with WNMP yellow, Source Serif headlines, Source Sans labels, the NP mark and the paired-rules motif. Designs are rendered from one HTML template, so they match the site and Studio can redraw them live.

## Before you design

1. **Read `references/brand.md`.** Colours, type, marks, the voice, house style and the facts you're allowed to use. The voice rules matter as much as the colours.
2. **Pin down the facts.** Use only what's in `brand.md` or what Nick gives you. Quotes from essays and testimonials are verbatim. Missing something: write `[to confirm]`, don't guess.
3. **Pick the format and layout** from `references/formats.md`. For LinkedIn, default to `post` (4:5).

## Render

```bash
node scripts/render.mjs spec.json out.png    # a carousel writes out-1.png, out-2.png…
node scripts/render.mjs spec.json out.pdf    # carousel as a LinkedIn document post
node scripts/render.mjs spec.json out.html   # the filled-in page
```

A spec is a small JSON object (`examples/` has one of each layout):

```json
{"format": "post", "layout": "statement", "kicker": "New essay",
 "headline": "Bridge roles need to die.",
 "text": "We keep creating jobs that stand in the gap between editorial and product, then wonder why the gap never closes."}
```

Needs Node with Playwright (`require('playwright')`). Look at every render before handing it over: the headline should sit comfortably, nothing should touch the footer rule, and the text must be legible at phone size. If `render.mjs` stepped the headline down, keep that `headlineSize` in the spec. If it doesn't fit, shorten the words rather than shrinking the text.

## Writing the words

Most of the work is the copy. Write as Nick, first person, British English, following the voice in `brand.md`.

- **Design text:** a headline that makes a claim (3 to 10 words), at most two sentences of text. No emoji, no hashtags on the design.
- **LinkedIn post text:** first line is the argument, in one sentence. Then two to four short paragraphs: why it matters, one concrete example, what to do. End with one question or one link (the essay), not both. 80 to 200 words. Up to three specific hashtags at the end, or none.
- **Carousels:** take the essay's own list or steps. One point per slide, each a short imperative headline plus one sentence. The last slide asks a question and points to the newsletter.
- **Newsletter promos:** lead with the issue's thought, then "When News Meets Product is for people trying to change news organisations from the inside. A few times a year: one thought, a couple of interesting links, and an invitation to join the discussion."
- **Mentoring:** practical and warm. State pay what you can plainly. Leadership coaching is "get in touch".

## Hand-over

Show the image or PDF, give the post text ready to paste, list the facts used and anything marked `[to confirm]`, and give alt text (one plain sentence describing the card, including its words).
