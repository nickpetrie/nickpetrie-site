# Formats, layouts and the spec

## Formats

| `format` | Size | Use |
|---|---|---|
| `post` | 1080 × 1350 | LinkedIn and Instagram portrait (4:5). The default: it takes the most room in the feed. |
| `square` | 1080 × 1080 | Square posts, testimonials, carousels if you prefer square. |
| `landscape` | 1200 × 627 | LinkedIn link images, X, Mastodon. Short: kicker, headline and URL only. |
| `story` | 1080 × 1920 | Stories. Text is kept out of the top 230 and bottom 300 units. |

**LinkedIn carousels** are PDF "document" posts: give the spec a `slides` list and render to `.pdf`. Seven to ten slides; one idea per slide.

## Layouts

| `layout` | Theme (default) | Use |
|---|---|---|
| `statement` | `paper` | A new essay or an idea: paired rules, kicker, headline, text. Sits at the bottom of the canvas. |
| `issue` | always `yellow` | A newsletter issue: the WNMP masthead, "Issue N", headline, standfirst. Footer "Free, a few times a year" and the newsletter URL. |
| `quote` | `ink` | A line from an essay (verbatim), or a testimonial (`paper`). `byline`, optional `source`. |
| `point` | `paper` | A carousel slide: big `number`, headline, text. |
| `offer` | `ink` | Mentoring and coaching: kicker, headline, `facts` with yellow rules. |
| `cta` | `yellow` | The last carousel slide: question or prompt, text, `cta` button. Set `"masthead": true` for the WNMP masthead. |

Themes: `paper`, `ink`, `yellow`. Pair them across a carousel: paper slides with one ink or yellow at the end, not a rainbow.

## The spec

```json
{
  "format": "post",
  "layout": "statement",
  "theme": "paper",
  "kicker": "New essay",
  "headline": "Bridge roles need to [[die]].",
  "headlineSize": 96,
  "text": "One or two sentences.",
  "facts": [{"label": "Ongoing mentoring", "value": "Monthly spaces open from October 2026"}],
  "quote": "Verbatim words.",
  "byline": "Nick Petrie",
  "source": "Bridge roles need to die",
  "number": "1",
  "cta": "nickpetrie.co/newsletter",
  "count": "2/7",
  "masthead": false,
  "portrait": "assets/nick-2022.jpg",
  "footer": ["Nick Petrie"],
  "url": "nickpetrie.co"
}
```

- `headline`: `\n` for a deliberate break. `[[words]]` gets the highlighter (yellow marker on paper, yellow text on ink, an underline on yellow). One phrase at most, the one that carries the meaning.
- `headlineSize` in units of a 1080-wide canvas. Defaults: statement 96, issue 92, quote 64, point 80, offer 84, cta 96 (landscape 80% of these).
- `footer[0]` is the left of the footer (default "Nick Petrie"); `url` the right (default "nickpetrie.co").
- `count` shows top right, for carousels ("2/7").
- **Fit:** the template steps the headline down to 70% to keep everything inside the margins, and `render.mjs` prints the size it used: copy it into the spec. If it still doesn't fit, the render stops: shorten the words.

## Recipes

- **New essay (post):** statement, paper. Kicker "New essay". The essay's title as the headline, the standfirst or the sharpest sentence as text.
- **Newsletter issue (post):** issue. Kicker "Issue N", headline the title, text the standfirst.
- **Quote card (post or square):** quote, ink. The line verbatim; byline "Nick Petrie", source the essay title.
- **Testimonial (square):** quote, paper. Only quotes cleared for public use, verbatim (shorten with "…"). Footer "Mentoring and coaching", URL nickpetrie.co/mentoring.
- **Mentoring (post):** offer, ink, the three offers as facts.
- **Carousel (PDF):** slide 1 statement (the claim), slides 2 to N-1 `point` (one action each, from the essay), last slide `cta` with the masthead ("What would you do differently?" plus the newsletter URL).
- **Link image (landscape):** statement with kicker and headline only. The site already makes one for every post at `/og/<slug>.png`.
