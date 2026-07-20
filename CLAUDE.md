# Jasper Calendar — Maintainer Guide

A PWA for an iPad Home Screen: a tile calendar of the 2026 school summer
holidays. Jasper taps a day to see a checklist; parents manage activities at
`/admin.html`. One Cloudflare Worker serves the static app and the JSON API,
backed by D1 (SQLite). ~2k lines total, no frameworks, no build step for the
client. `npm test` runs the API suite; the `verify` skill
(.claude/skills/verify) launches and drives the whole app locally.

## Architecture — where things live

| File | Role |
|---|---|
| `src/schedule.js` | **All family dates**: holiday range, trips, grandparent/Oma/rainforest days, dad-off extras, cleaner skips, school day. Served to the client inside `/api/calendar`, so editing it needs only a worker deploy — never a cache bump. |
| `src/worker.js` | The whole backend: router, auth (HMAC token + login rate limit), kid endpoints, admin CRUD. |
| `public/js/day-types.js` | **The day-type registry** — defines every kind of day (key, emoji, modal note, match rule, priority). Tiles and modal notes are derived entirely from this list. |
| `public/js/calendar.js` | Kid view: grid + day modal rendering, offline handling, midnight rollover. `dayInfo(date)` is the single date→types resolver (tile and modal both use it, so they can never disagree). |
| `public/js/api.js` | Fetch wrapper; flags connection failures with `err.network` so callers can tell "offline" from "server said no". |
| `public/js/outbox.js` | Offline ticks queued in localStorage until the server has them. |
| `public/js/admin.js` | Parent portal (login, routine + special-day CRUD). |
| `public/css/style.css` | Kid-friendly styling. Per-day-type gradients (`.tile.<key>`) and note tints (`.<key>-note`); generic badge slots (`.badge-left` / `.badge-right`). |
| `public/sw.js` | Service worker. Shell = stale-while-revalidate; `/api/*` and `/version.json` = network-first. |
| `migrations/` | D1 schema. Add new numbered files; never edit applied ones. |
| `test/api.test.js` | Vitest suite against the real worker + isolated D1. "Today" pinned to 2026-08-05. |

## Adding a new day type (the most common change)

Three touch points, all declarative:

1. **`src/schedule.js`** — add the dates array to `SCHEDULE`. Ask the user for
   the real dates/emoji/colours — NEVER invent them.
2. **`public/js/day-types.js`** — add one entry to `DAY_TYPES`, in priority
   order (the first matching non-additive entry wins the tile; `additive: true`
   types stack on top; `side: 'right'` pins the badge to the right slot). The
   file's header comment documents the semantics.
3. **`public/css/style.css`** — add a `.tile.<key>` gradient and a
   `.<key>-note` tint (plus a `.tile.<a>.<b>` rule only if two types genuinely
   co-occur, like oma+cleaner). Combo tiles use the hard vertical split
   described under "Invariants" — never a smooth blend.

Badges position themselves: `renderTile()` fills a top-left then a top-right
slot, so two emojis can never overlap. Then run `npm test` and check the
browser (reload twice — see caching below).

## Changing schedule dates only

Edit the arrays in `src/schedule.js` and deploy. Nothing else — the client
picks it up on the next `/api/calendar` fetch.

## Caching model (read before debugging "my change isn't showing")

- Shell files (HTML/CSS/JS) are **stale-while-revalidate**: an update appears
  on the NEXT page load. When testing, reload twice or hard-reload.
- `/api/*` and `/version.json` are network-first: always fresh online.
- New client file? Add it to `SHELL` in `public/sw.js`. Bump `CACHE` only to
  force-flush everything (rare).
- Every page footer shows `v<sha> · built <time>` (from `/version.json`) —
  use it to confirm which deploy you're looking at.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD, AUTH_SECRET
npm run migrate:local
npm run dev                      # http://localhost:8787
npm test
```

- `TEST_TODAY=YYYY-MM-DD` in `.dev.vars` pins "today" (local-only override).
  Changing `.dev.vars` requires restarting `wrangler dev`.
- End-to-end verification (launch, API drive, Playwright): follow
  `.claude/skills/verify/SKILL.md`.

## Invariants to preserve

- **Never make up data** (dates, emoji, colours) — ask the user.
- `dayInfo()` in calendar.js is the only date→day-types resolver; keep any
  priority logic in `day-types.js` order, not scattered in rendering code.
- Two emojis on one tile must never overlap (the badge-slot system guarantees
  this — don't bypass it with absolutely-positioned per-type badges).
- Future days are locked: the server 403s toggles on them (`toggleItem`), and
  the client greys them out. Keep both sides in agreement.
- Offline behaviour is a feature (the iPad goes to Wales): don't drop queued
  ticks on server errors (see `outbox.flush`), and keep `/api/*` network-first
  with a cache fallback.
- The admin API trusts `scopeFor()` to isolate per-day activities from
  defaults; any new admin route should go through the same scope shape.
- Run `npm test` before pushing; add a test when you touch `src/worker.js`.
- Combo days (two types on one tile) use a HARD vertical two-colour split
  (`linear-gradient(90deg, A 50%, B 50%)`, left half = the left-corner
  badge's colour). Never blend/fade two day colours — the user dislikes it.

## Deploying — "push it" means "make it live" (learned the hard way)

Live app: https://jasper-calendar.charlesjohnbeard.workers.dev/ (the
iPad points here). Cloudflare Workers Builds deploys **`main` only** —
a pushed feature branch is invisible on the iPad. So when the user asks
to push/ship/deploy a change, finish the job all the way to production:

1. Push the session branch, open a PR, merge it into `main`.
2. Confirm the "Workers Builds: jasper-calendar" check run is green
   (GitHub MCP `pull_request_read` → `get_check_runs`).
3. Merging is NOT the end. The build only uploads a new version; it
   does NOT go live until someone PROMOTES it to production (confirmed
   2026-07-15: the user had to promote by hand). Remote sessions have
   NO Cloudflare credentials, so after merging you must tell the user:
   "merged and built — now promote it in Cloudflare dashboard →
   Workers → jasper-calendar → Deployments → promote the new version"
   (or they run `npx wrangler versions deploy` locally). Durable fixes
   to offer: add CLOUDFLARE_API_TOKEN to the session environment so
   the agent can promote, or switch the Workers Builds deploy command
   to plain `npx wrangler deploy` so merges go live automatically.
4. The sandbox network policy also blocks `*.workers.dev`, so you
   cannot curl the live site — verify via the check run + the footer.
5. Tell the user: the SW shows a new deploy on the SECOND launch —
   fully close and reopen the PWA. The footer version (`/version.json`)
   is network-first and updates immediately; if the footer sha is still
   old after a relaunch, the new version wasn't promoted — see step 3.

## Current schedule state (2026 summer)

Holiday range 2026-07-23 → 2026-09-01 (41 days), school day 2026-09-02.
Day types: cleaners every Tuesday except skips (🧹 orange, additive), Oma
(👩 purple), grandparents (👵👴 pink), rainforest (🦜 green), Beale Park
(🦚 teal), dad off weekends + extras (👨 indigo, right badge), Wales trip
Aug 21–28 (🐉 green).
The live dates are whatever `src/schedule.js` says — treat that file, not
this paragraph, as the source of truth.
