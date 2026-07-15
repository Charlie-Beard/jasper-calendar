# Jasper Calendar — Agent Guide

Read this first; it should save you exploring most of the repo. A tile
calendar PWA for a 6-year-old's iPad covering the 2026 summer holidays
(2026-07-23 → 2026-09-01, 41 days; "today" ticks over in Europe/London).
One Cloudflare Worker (JSON API + static assets) + D1. No framework, no
bundler, no TypeScript — plain ES modules, matching comment style.

## Repo map (whole codebase, one line each)

- `src/worker.js` — the whole API: router at the bottom, HMAC-token auth,
  kid endpoints (calendar/day/toggle), admin CRUD via a `scopeFor(date)`
  abstraction shared by defaults (date=null) and per-day activities
- `src/schedule.js` — THE family schedule (trips/gran/oma/dadOffExtra/
  cleanerSkip/schoolDay); served inside `/api/calendar` as `schedule`
- `public/js/calendar.js` — kid UI: grid + day modal, `dayInfo(date)`
  resolver, offline outbox integration, midnight-rollover refresh
- `public/js/admin.js` — parent portal (login, routine + special days CRUD)
- `public/js/api.js` — fetch wrapper; token in localStorage; network
  failures throw `err.network === true`, HTTP errors carry `err.status`
- `public/js/outbox.js` — offline tick queue in localStorage; flush()
  settles an entry on success or 4xx ONLY (5xx/offline retries later)
- `public/js/version.js` — fills the build-version footer on both pages
- `public/sw.js` — service worker: shell = stale-while-revalidate,
  `/api/*` + `/version.json` = network-first
- `public/index.html`, `public/admin.html`, `public/css/style.css` — UI
- `public/_headers` — CSP etc. on all assets (see Invariants)
- `migrations/` — 0001 schema+seed, 0002 emoji routine, 0003 login_failures
- `test/api.test.js` — 14 vitest tests against the real worker + D1
- `scripts/generate-version.mjs` — stamps public/version.json (gitignored);
  runs automatically via `build.command` in wrangler.jsonc
- `scripts/generate-icons.mjs` — PWA icons (`npm run icons`)

## Common tasks (do exactly this, nothing more)

**Change schedule dates (trip/gran/oma/dad/cleaner)**: edit
`src/schedule.js`, push. No cache bump, no client change, no migration.
Never invent dates — ask the user which dates apply.

**Change the daily routine**: parents do this in `/admin.html`; only write
a migration if the user asks for a permanent seed change.

**Add a new day type**:
1. Data → `SCHEDULE` in src/schedule.js
2. Flag → `dayInfo()` in calendar.js — the ONLY place priority lives
   (tile and modal both consume it; never fork the logic). Current rules:
   Gran/Oma and day-out types (rainforest, bealePark) suppress Dad;
   Cleaner is additive; modal headline order is trip > gran > oma >
   rainforest > bealePark > dad, cleaner sentence appended.
3. Badge emoji in `renderTile()` + headline in `openDay()`
4. CSS: `.tile.<type>` gradient + `.<type>-badge` position + note colour
   (`.trip-note.<type>-note`); check the 480px media block too
5. Emoji overlap rule: ALL day-type badges default to top-LEFT (Trip 🐉,
   Gran 👵👴, Oma 👩, Rainforest 🦜, Beale 🦚, Dad 👨, Cleaner 🧹);
   🎉 Special is top-RIGHT. Two
   emojis must never share a corner, so on combo days CSS pushes the
   secondary badge right: dad→right on trip days, cleaner→right on
   dad/oma days, and `.special` gets an extra right offset on those
   combos. Blend gradients exist for .trip.dad, .dad.cleaner, .oma.cleaner.
6. `npm test`, then browser-check (reload twice — see SW note)

**API change**: worker.js + a test in test/api.test.js. Kid endpoints:
`GET /api/calendar`, `GET /api/day/:date`, `POST /api/day/:date/toggle`
(future dates 403). Admin (Bearer token from `POST /api/admin/login`):
`/api/admin/defaults[/:id]`, `/api/admin/day/:date/activities[/:id]`,
`PUT .../reorder` (ids must be a full permutation of current ids).

## D1 schema (memorise, don't re-read migrations)

- `default_activities(id, title, sort_order)` — seeded routine, 10 rows
- `day_activities(id, date, title, sort_order)` — per-day specials (🎉)
- `completions(date, activity_type 'default'|'day', activity_id,
  completed_at)` — PK (date, type, id); deleted with their activity
- `login_failures(ip, attempted_at)` — rate limiting; self-pruning

Known trade-off (deliberate, don't "fix"): calendar totals use the
CURRENT default routine for every day, so editing the routine mid-summer
retroactively changes past days' star status.

## Dev, test, verify

```sh
npm run dev            # wrangler dev :8787 (needs .dev.vars; TEST_TODAY=2026-08-05 pins "today")
npm test               # vitest, ~5s, runs in the Workers runtime with real D1
npm run migrate:local  # after adding a migration
npx wrangler deploy --dry-run   # config sanity check without deploying
```

- Restart wrangler dev after `.dev.vars` changes. Kill it with
  `pkill -f '[.]bin/wrangler'; pkill -f '[w]orkerd'` (plain pkill matches
  your own compound command).
- UI verification: use the `verify` skill (Playwright with
  `executablePath: '/opt/pw-browsers/chromium'`, viewport 820×1180).

**Test-suite gotchas (cost real debugging time — trust them):**
- Config is `vitest.config.mjs` — must stay `.mjs` (package.json has no
  `"type": "module"`, and a `.js` config gets required as CJS and fails).
- `@cloudflare/vitest-pool-workers` ≥0.18 (vitest 4): the old
  `.../config` subpath and `defineWorkersConfig` are GONE. Use the
  `cloudflareTest({...})` Vite plugin from the package root, options
  (wrangler.configPath, miniflare.bindings) unchanged.
- Tests call `worker.fetch(request, env)` directly (unit style — avoids
  the ASSETS binding). Bindings incl. TEST_TODAY are set in vitest.config.
- There is NO per-test storage isolation: a `beforeEach` wipes
  completions/day_activities/login_failures. Keep tests self-contained;
  give each rate-limit test its own `CF-Connecting-IP`.

## Invariants — do not break

- **CSP** (`public/_headers`): `default-src 'self'` — NO inline
  `<script>`, no inline event handlers, no style="" attributes, no CDN
  imports. Everything ships as same-origin files.
- **SW model**: shell is stale-while-revalidate → changes appear on the
  SECOND load; no `CACHE` version bump needed (bump only to force-flush).
  `/api/*` and `/version.json` stay network-first. Don't reintroduce
  cache-first for anything that updates.
- **Outbox settle rule**: only success or 4xx removes a pending tick.
  A 5xx or network failure must retry later — never drop a kid's tick.
- **Login rate limit fails OPEN**: if login_failures is missing/broken,
  log the error and let the password check decide — never lock parents
  out. (Remote DB needs `npm run migrate:remote` once for 0003.)
- **XSS discipline**: activity titles are user data — render via
  `textContent` only; `innerHTML` is reserved for trusted literals.
- **version.json is generated** (gitignored) — never commit it; the
  footer must keep working when it's absent (shows "local dev build").
- Server and client both validate: date in range, future-day toggle 403,
  kid-friendly error messages (they surface in `alert()`).

## Deploying — "push it" means "make it live" (learned the hard way)

Live app: https://jasper-calendar.charlesjohnbeard.workers.dev/ (the
iPad points here). Cloudflare Workers Builds deploys **`main` only** —
a pushed feature branch is invisible on the iPad. So when the user asks
to push/ship a change, finish the job all the way to production:

1. Push the session branch, open a PR, merge it into `main`.
2. Confirm the "Workers Builds: jasper-calendar" check run is green
   (GitHub MCP `pull_request_read` → `get_check_runs`).
3. Remote sessions have NO Cloudflare credentials (`wrangler deploy`
   can't run) and the sandbox network policy blocks `*.workers.dev`,
   so you cannot curl the live site — verify via the check run.
4. Tell the user: the SW shows a new deploy on the SECOND launch —
   fully close and reopen the PWA. The footer version (`/version.json`)
   is network-first and updates immediately; if the footer sha is still
   old after a relaunch, the deploy genuinely didn't happen — check
   Cloudflare dashboard → Workers → jasper-calendar → Builds.

## Judgement rules (learned the hard way)

- Never invent schedule data (dates/emoji/colours) — ask the user.
- Confirm intent for new day types: which dates, which emoji, what
  colour, how it combines with existing indicators.
- The footer (`v<sha> · built <time>`, Europe/London) tells you which
  build is deployed — check it before debugging "my change isn't live".
  Wrangler's `build.command` stamps it in CI too (WORKERS_CI_COMMIT_SHA).

## Current schedule state (see src/schedule.js for truth)

Cleaners every Tue except Aug 25 (🧹 orange); Oma Aug 4 (👩 purple);
Grandparents Jul 24, Aug 1/6/14/20 (👵👴 pink); Dad weekends + Jul 28,
Aug 11, Aug 17 (👨 indigo; Tuesdays blend into cleaner orange);
Living Rainforest Jul 27 (🦜 leafy green); Beale Park Jul 29 (🦚 teal);
Wales trip Aug 21–28 (🐉 green); school day Sep 2 (🎒).
