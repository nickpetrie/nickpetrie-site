---
name: nick-petrie-social
description: Run Nick Petrie's LinkedIn pipeline through Studio (studio.nickpetrie.co) - turn new essays, newsletter issues and briefs into post options with cards, put them in Nick's approval queue, turn his feedback into new versions, and report what's going out. Use it whenever someone asks to make, refresh, check or schedule social posts for Nick, WNMP or his mentoring, asks what Nick has approved, or a scheduled Studio check fires. Never use it for Birth By You, which has its own pipeline.
---

# Nick Petrie social pipeline (Studio)

```
new essay, issue or brief → make options (card + post text) → Ready for review → Nick approves ──────→ Studio books it into Buffer → posted
                                                                            └→ asks for changes → new version ┘
```

Make every design and every word with the **nick-petrie-brand** skill: read its `SKILL.md` and `references/brand.md` first. End replies about the posts with the Studio link on its own line: https://studio.nickpetrie.co

## Studio

Studio is a Cloudflare Worker (`studio/` in the nickpetrie-site repo; `studio/CONTRACT.md` is the spec), a copy of Shannon's Studio adapted for LinkedIn.

- **Data** is in Studio's D1 database: collections `posts`, `briefs`, `ideas`, `buffer`, `config`. Read and write with `python3 studio/claude_db.py` (`list`, `get`, `patch <collection> <id> <rev> <file.json>`, `put`, `log`). Every patch passes the `rev` you read; a conflict means Nick changed it since, so re-read and redo.
- **Images:** render with the brand skill, then `node studio/add-image.mjs out.png <post-id> <version>` (carousel slides: `<post-id>-s<N>`). It prints the public URL. Names are never reused.
- **Studio handles Buffer itself**, every 15 minutes and when Nick approves: it books the approved version, joins carousel slides into one PDF, pulls posts he edits, and marks sent ones `posted`. Don't book, edit or delete Buffer posts yourself. Never use Birth By You's Buffer for Nick.
- **Until Buffer is connected** (`BUFFER_API_KEY`, `BUFFER_ORG_ID`, `BUFFER_CHANNEL_ID`), approved posts wait in Studio's queue. Nothing is lost.

## A post document (`posts/<id>`)

Id: `<planned date>-<slug>`, e.g. `2026-11-03-bridge-roles`.

| Field | Meaning |
|---|---|
| `status` | `review` · `changes` (Nick asked for changes) · `approved` · `scheduled` · `posted` · `saved` · `removed` |
| `version` | Starts at 1. `history` holds earlier versions `[{version, imageUrl, caption, spec, feedback}]`. |
| `kind` | `image`, `carousel` or `text` |
| `pillar` | `Essay`, `Newsletter`, `Quote`, `Carousel`, `Mentoring`, `Event` or `Comment` |
| `title`, `about`, `alt` | Short internal name; one line on what it's for; alt text (describe the card, including its words) |
| `caption` | The LinkedIn post text. `captionEdit` is Nick's own edit and always wins. |
| `firstComment` | Optional first comment, usually the essay link. |
| `spec` | The brand spec the card was made from (`{slides: [...]}` for a carousel). Studio's "Edit words" redraws it live. |
| `imageUrl`, `slideUrls` | Public media URLs. Slide 1 is also `imageUrl`. |
| `renderedAt` | Now (ms) on every new version. |
| `briefId`, `deadline` | When it came from a brief; the latest it may go out (ISO, end of day). |
| `changeNote` | One plain sentence on what changed in this version. |

## 0. Briefs and new essays

On each check, `list briefs --status new` first. Set each to `working` (with `startedAt`, `etaMinutes`), make the posts, then `done` with `postIds` and a short `reply`. If a fact that must be right is missing, ask in `reply` and leave it `working`.

When a new essay or newsletter issue is published on nickpetrie.co (or Nick asks), make a set:
1. **Launch post:** `image`, the brand skill's new-essay or issue card, post text from the essay's argument, `firstComment` with the essay URL.
2. **Two alternatives** that really differ: a quote card with the sharpest line (verbatim), and a carousel if the essay has a list or steps. Different first lines, not just different images.
3. **A follow-up** a week later: a quote card or a text post that picks up one point and asks a question.

Put them in with `put posts <id> <file.json>`: `status: "review"`, `version: 1`, `history: []`, `spec`, `imageUrl` (and `slideUrls`), `renderedAt`, `briefId` or `deadline` where relevant.

## 1. Feedback into new versions

`list posts --status changes`. Read `feedback.picks` and `feedback.note`, make version n+1 (render, upload as `-v<n+1>`), then patch: push the old version onto `history`, new `version`, `imageUrl`/`slideUrls`, `spec`, `renderedAt`, `changeNote`, delete `feedback`, `status: "review"`. If only the timing changed, keep the media and update `deadline`.

Posts with `needsRender: true` (anything the browser couldn't draw): render `specEdit`, upload as n+1, set `spec`, remove `specEdit`, `needsRender`, `renderAskedAt`, keep the status.

## 2. After posting

A week after a post goes out, save its numbers in `metrics` (reactions, comments, reposts, impressions) if Buffer reports them. Every month, tell Nick in one or two lines which kinds of post did best, and suggest the next essay's set accordingly.

## How requests reach you

Nothing wakes you automatically. Briefs and change requests wait in the database until a check runs: either a scheduled Studio check (if Nick sets one up) or Nick asking. Start with briefs, then `changes`, then `needsRender`. Stay quiet when there's nothing to do.
