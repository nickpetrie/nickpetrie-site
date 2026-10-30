# Runbook: how nickpetrie.co fits together, and how to rebuild or restore it

Last checked 30 October 2026. No secrets here: secret *names* only. Values live in Cloudflare (Worker secrets) and can be regenerated at the service that issued them.

## The pieces

| Piece | Where | Notes |
|---|---|---|
| Website | Cloudflare Worker `nickpetrie-site`, built from this repo by Workers Builds on every push to `main` | Astro site in `src/`, Worker in `worker/` (redirects, 410s, `/api/subscribe`) |
| Newsletter | beehiiv, publication `pub_dc13bc61-8017-4e9f-9827-57bbd16ff777` (Free plan) | Issue template "WNMP issue (v0.3)"; welcome email in Settings → Emails |
| Studio | Cloudflare Worker `nickpetrie-studio` at `studio.nickpetrie.co`, deployed with `node studio/deploy.mjs` | Spec: `studio/CONTRACT.md` |
| Social scheduling | Buffer, Nick's own account (organisation "My Organization"), LinkedIn channel `nick-elliot-petrie` | Never Birth By You's Buffer |
| Email | Cloudflare Email Routing: `nick@` and `hello@nickpetrie.co` forward to Nick's Gmail | Sending as nick@ is set up in Gmail ("Send mail as" through Gmail's SMTP) |
| Booking | SavvyCal, `savvycal.com/NickPetrie/0977e9aa` | Linked from the mentoring page |
| Brand and social designs | `.claude/skills/nick-petrie-brand` (template, renderer, voice guide) | `brand/v0.3/` holds the marks and tokens |
| Old site | Ghost(Pro), cancelled; data deleted 24 November 2026 | Export (28 Oct 2026) is in Nick's Drive folder `nick-petrie_1793184018` |

## Cloudflare

Account `97b38e997c8ed5ed5eb3264ef052e31f`, zone `nickpetrie.co` (`260472b9edb00f470f7b5d3221036779`).

**DNS** (before the switch from Ghost):

| Type | Name | Points to | Proxied |
|---|---|---|---|
| A | nickpetrie.co | 192.0.2.1 (placeholder for the redirect rule) | yes |
| CNAME | www | nick-petrie.ghost.io | no |
| MX ×3 | nickpetrie.co | route1/2/3.mx.cloudflare.net | no |
| TXT | nickpetrie.co | SPF: Cloudflare Email Routing and Google | no |
| TXT | cf2024-1._domainkey | DKIM for Email Routing | no |
| TXT | _dmarc | `v=DMARC1; p=none` | no |
| AAAA | studio | 100:: (Workers custom domain) | yes |

**At the switch:** delete the `www` CNAME, add `www.nickpetrie.co` and `nickpetrie.co` as custom domains on the `nickpetrie-site` Worker (Cloudflare creates the records), and remove the bare-domain redirect rule (the Worker redirects `nickpetrie.co` to `www` itself). Never touch the MX and TXT records: they are email.

**Redirect rule** (zone): "Bare domain to www (301)" while Ghost is live.

**Access** (Zero Trust team `misty-hall-b273.cloudflareaccess.com`):
- "Studio (nickpetrie.co)" on `studio.nickpetrie.co`: Allow, `nicholas.petrie@gmail.com` and `nicholaspetrie@gmail.com`, one-time PIN by email. Its AUD is `ACCESS_AUD` in `studio/wrangler.jsonc`.
- "Studio images (public, for Buffer)" on `studio.nickpetrie.co/p`: Bypass, everyone.

**Storage:** D1 `nickpetrie-studio` (`c6080381-5b9b-44c0-bee0-19de01eff234`); R2 `nickpetrie-social` (Studio images and PDFs at the root, Studio's screens under `studio-web/`, backups under `backups/`).

**Other:** Web Analytics site for nickpetrie.co (token in `src/site.ts`, public by design). Turnstile: not yet created (needs Turnstile: Edit on the API token); when it is, the site key goes in `src/site.ts` and the secret in `TURNSTILE_SECRET`.

**Secrets:**

| Worker | Secret | Comes from |
|---|---|---|
| nickpetrie-site | `BEEHIIV_API_KEY` | beehiiv → Settings → API |
| nickpetrie-site | `TURNSTILE_SECRET` (once Turnstile is set up) | Cloudflare → Turnstile → the widget |
| nickpetrie-studio | `BUFFER_API_KEY` | publish.buffer.com/settings/api |

Set one with `npx wrangler secret put NAME` (add `--config studio/wrangler.jsonc` for Studio), or in the dashboard under the Worker's Settings → Variables and secrets.

## Backups

| What | How | Restore |
|---|---|---|
| Site code, posts, pages, images | Git (GitHub `nickpetrie/nickpetrie-site`, full history); Cloudflare keeps earlier Worker versions | Redeploy from any commit, or roll back in Workers → Deployments |
| Studio database | Weekly, Sunday 03:00 UTC: `backups/studio-0..3.json.gz` in R2 (four rolling copies, a few KB each; `studio/src/backup.js`). D1 also has Cloudflare's built-in point-in-time restore for recent days | D1: `npx wrangler d1 time-travel restore nickpetrie-studio --timestamp=<ISO>`. From a snapshot: download it, gunzip, and `put` each doc back with `studio/claude_db.py` |
| Studio images | Not backed up, on purpose: cards redraw from their saved specs, and posted ones are on LinkedIn | Re-render from `spec` with the brand skill |
| Newsletter subscribers | beehiiv. Export a CSV every few months (Subscribers → Export) and keep it somewhere private: never in this repo | Import the CSV into beehiiv or any other newsletter tool |
| Newsletter issues | beehiiv, and every issue is also a post in this repo | |
| Ghost | Final export in Drive | Not needed again after the switch |

## Rebuilding from scratch

1. Clone the repo; `npm ci`.
2. Site: create a Worker from the repo in Workers & Pages (build: none, deploy: `npx wrangler deploy`; `wrangler.jsonc` runs the build). Set `BEEHIIV_API_KEY`. Add the custom domains.
3. Studio: create D1 `nickpetrie-studio` and run `studio/schema.sql`; create R2 `nickpetrie-social`; update the ids in `studio/wrangler.jsonc`; create the two Access apps above and put the new AUD in `ACCESS_AUD`; set `BUFFER_API_KEY`; `node studio/deploy.mjs`; restore the latest backup.
4. Check: `node scripts/check-urls.mjs https://www.nickpetrie.co <old-urls file>`, a sign-up, a Studio login.
