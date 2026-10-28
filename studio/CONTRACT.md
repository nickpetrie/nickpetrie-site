# Studio: how the parts fit together

Studio is Nick's LinkedIn post tool at `https://studio.nickpetrie.co`, a copy of Shannon's Studio for Birth By You (`nickpetrie/bby`, `studio/`) adapted for LinkedIn. One Cloudflare Worker (`nickpetrie-studio`) serves the screens (files in `web/`, uploaded to R2 under `studio-web/` by `deploy.mjs`), public post images and PDFs at `/p/<file>`, and an API (`/api/*`), and runs a cron every 15 minutes. This file is the contract between the parts.

## Infrastructure

| Thing | Value |
|---|---|
| Account | Nick's Cloudflare account `97b38e997c8ed5ed5eb3264ef052e31f` |
| Worker | `nickpetrie-studio`. Custom domain `studio.nickpetrie.co`. Secret `BUFFER_API_KEY` (to set once Nick's Buffer is connected). |
| Login | Cloudflare Access, team `misty-hall-b273.cloudflareaccess.com`. App "Studio (nickpetrie.co)" on the whole hostname, allowing `nicholas.petrie@gmail.com` (and `nicholaspetrie@gmail.com`); a second app on `studio.nickpetrie.co/p` with a Bypass policy so Buffer can fetch images. Its AUD goes in `ACCESS_AUD`. |
| Database | D1 `nickpetrie-studio`, id `c6080381-5b9b-44c0-bee0-19de01eff234`, binding `DB`. Schema in `schema.sql`. |
| Media | R2 bucket `nickpetrie-social`, binding `MEDIA`. Public URL `https://studio.nickpetrie.co/p/<name>`. Names are never reused (cached for a year). |
| Buffer | Nick's own account (never Birth By You's). LinkedIn profile channel. `BUFFER_ORG_ID` and `BUFFER_CHANNEL_ID` in `wrangler.jsonc`. Until they and the key are set, approved posts wait in Studio's queue and the cron does nothing. |
| Designs | `.claude/skills/nick-petrie-brand` (template, fonts, logos), copied into `web/` by `build.mjs`. |

## Post kinds (LinkedIn)

- `image`: one card (`imageUrl`), usually 4:5. Drawn in the browser when Nick edits the words.
- `carousel`: slides (`slideUrls`, spec `{slides: [...]}`). On approval the worker joins the slides into one PDF (`approvedDocument`, `src/pdf.js`) and books it as a LinkedIn document post.
- `text`: no media.
- `firstComment` (optional): posted as LinkedIn's first comment, usually the link to the essay.

## Data model

One table, `docs(collection, id, data JSON, rev, updated_at, updated_by)`, plus `log`. Collections: `posts`, `briefs`, `ideas`, `buffer` (doc `status`), `config`. A post's fields are those in `.claude/skills/nick-petrie-social/SKILL.md` ("A post document"), with these changes for Studio:

- **Images:** use `imageUrl` / `slideUrls` / `videoUrl` (media worker URLs) everywhere. The artifact-only `imageAsset`, `slideAssets` and `videoAsset` are ignored.
- **`status`:** one of
  - `review` (shown as "Ready for review")
  - `changes` ("Claude is on it")
  - `approved` ("Approved", waiting for a Buffer slot)
  - `scheduled` ("Scheduled · <Buffer time>")
  - `posted`
  - `saved` ("Saved for later")
  - `removed`

  The old `skipped` reads as `removed`.
- **`queuePos`** (number): order in the holding queue for `approved` posts that aren't in Buffer yet. Lower goes first. Posts with a `deadline` are booked earliest-deadline-first, unless Nick has reordered them.
- **`renderedAt`** (ms): when a new version was made. If `renderedAt > reviewedAt`, show "Version N ready".
- **`needsRender: true`**: only for anything the browser can't draw. Claude renders those on its hourly check. Image posts and carousel slides are drawn in the browser when Nick saves.

Briefs: fields as in the skill, plus `status`:
- `new`, shown as "Not started · picked up by <next :15 past the hour, 08:15 to 22:15 UK>";
- `working`, shown as "In progress", with `startedAt` and `etaMinutes` written by Claude;
- `done`, shown as "Done · N posts made", with `postIds`.

Every write goes through `rev`: the client sends the `rev` it read, and the server rejects stale writes with 409 and the current doc. Every write also adds a row to `log`.

## API (all JSON, all behind Access)

Auth: the worker verifies the `Cf-Access-Jwt-Assertion` header against the team's JWKS (`https://morning-rain-97e0.cloudflareaccess.com/cdn-cgi/access/certs`) and the AUD above. `email` comes from the token. Admin is `nicholas.petrie@gmail.com`. When running locally (`wrangler dev`), the `DEV_EMAIL` var stands in.

| Method and path | Body | Returns |
|---|---|---|
| GET `/api/me` | | `{email, admin}` |
| GET `/api/state` | | `{posts:[doc], briefs:[doc], ideas:[doc], buffer:{...status}, now}`. One call loads everything; `doc` = `{id, rev, updatedAt, data}` |
| PATCH `/api/docs/:collection/:id` | `{rev, set:{...}}`. A field set to `{"__delete__":true}` is removed | the updated `doc`, or 409 with `{doc}` |
| PUT `/api/docs/:collection/:id` | `{data}`. Create only; 409 if it exists | `doc` |
| POST `/api/upload?name=<file>` | raw image bytes (`image/png` or `image/jpeg`) | `{url}`. The server converts PNG to JPEG only if trivial, otherwise stores as sent. Refuses a name that exists (409) or doesn't match `^[a-z0-9-]+-v[0-9]+[a-z]?(-s[0-9]+)?\.(png|jpg)$` |
| POST `/api/posts/:id/approve` | `{rev, version, caption}` | updated `doc`. The server pins `approvedVersion`, `approvedImage`, `approvedSlides` and `approvedCaption` from the stored doc, then calls `queue.place(post)`: book now if Buffer has room, else `approved` with a `queuePos` |
| POST `/api/posts/:id/unapprove` | `{rev}` | updated `doc`. Pulls the post from Buffer if booked; status goes back to `review` |
| POST `/api/posts/:id/pull` | `{rev}` | used when Nick edits a scheduled post: deletes the Buffer post, status goes to `review` |
| POST `/api/queue/order` | `{ids:[postId…]}` | `{ok}`. Rewrites `queuePos` |
| POST `/api/queue/make-room` | `{postId, swapOutId}` | `{ok, booked, bumped}`. Unbooks `swapOutId` (no deadline) back to the queue and books `postId` |
| GET `/api/buffer` | | `{limit:10, used, free, dueAts:[…], slots:{mon:"20:05",…}, waiting, checkedAt}` |
| POST `/api/admin/sync` | | admin only. Runs the cron job now and returns its report |
| GET `/api/admin/log?limit=` | | admin only. The latest `log` rows |

Cron (`*/15 * * * *`), with each step logged to `log` and failures saved to `config/diagnostics`:
1. `queue.reconcile()`:
   - every `scheduled` post's Buffer post still exists and matches `approvedCaption` and its images;
   - Buffer's `dueAt` is copied into `scheduledFor`;
   - posts Buffer has sent become `posted`;
   - a mismatch is deleted from Buffer and set back to `approved`, and the event is logged.
2. `queue.topUp()`: while Buffer has under 10, book the next queued post.
3. `buffer` status doc refreshed: `dueAts`, `slots` from the channel's posting schedule, and `checkedAt`.

## Buffer (`src/buffer.js`)

Buffer's public GraphQL API: `POST https://api.buffer.com` with `Authorization: Bearer ${env.BUFFER_API_KEY}` (check the endpoint against developers.buffer.com). Mutations: `createPost(input: CreatePostInput!)` and `deletePost(input:{id})`. Queries: `post(input:{id})`, `posts(input:{organizationId, filter:{channelIds, status:[scheduled,sending,sent]}})` and `channel(input:{id})` (with `postingSchedule {day times paused}`).

`CreatePostInput` must have:
- `channelId`, `schedulingType: automatic`, `mode: addToQueue`, `text`;
- `assets`: `[{image:{url, metadata:{altText}}}]` for an image post; `[{document:{url, title, thumbnailUrl}}]` for a carousel (the PDF, with slide 1 as the thumbnail); `[]` for text;
- `metadata: {linkedin: {firstComment?}}`, and `aiAssisted: true`.

The union payload returns `... on PostActionSuccess { post { id dueAt status } }`, or `... on MutationError { message }`.

Booking rules, from the skill's "Approval and Buffer" section:
- Only the approved version goes to Buffer.
- **Deadline:** if Buffer's `dueAt` is after `deadline`, delete it and re-create it `customScheduled` at the latest free slot time on or before the deadline. If there isn't one, leave it `approved` and flag "Won't go out before <date>".
- **Same brief, different days:** two posts from one brief (`briefId`) must not land on the same London day. If they would, move the later one to the next free slot (still within its deadline).
- **Mentions:** Buffer's API can't tag people; if a post has a `collaborator`, log a reminder to tag them by hand.

## Screens (`web/`)

These are vanilla HTML, CSS and JS, with no build step, served as static assets.
- **Wireframes:** the approved layout is in `/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/wf/project/*.dc.html`. Laptop is the main target: `Desktop`, `DeskEdit`, `DeskApproved`, `DeskComingUp`, `DeskDone` and `DeskBriefs`. Phone is the same flow stacked: `Main`, `Post`, `Approved`, `Edit`, `ComingUp`, `Done` and `AskClaude`.
- **Reference code:** the current artifact page, `/tmp/claude-0/-home-user-bby/fff1a996-601f-5def-b9fb-69577956b757/scratchpad/social-queue/index.html`, holds working code to reuse for the live design preview (`designPreview`, `FIELDS`, footer fields, the fit warning), carousels (`carouselView`, `slidePicker`), version pinning, `whenText`, `progress()` and the chip vocabulary. Take its logic, not its layout.
- **Templates:** `web/templates/canvas.html`, `web/assets/` (fonts, logo, photos) are copied from `.claude/skills/birth-by-you-brand/` by `build.mjs` (run before deploy), so they are never edited here.

## Working rules

- British English. Copy follows the wireframes.
- No new dependencies without a reason. Pin exact versions of any CDN script, from cdn.jsdelivr.net.
- Don't touch files owned by another part: `src/worker.js`, `src/auth.js`, `src/db.js`, `src/api.js` and `src/share.js` are the server; `src/buffer.js` and `src/queue.js` are Buffer; `web/**` is the screens.
- Never print secrets. Never deploy, and never touch live Buffer posts, unless the lead asks. For Buffer tests, use `saveToDraft: true` and delete the draft afterwards.
