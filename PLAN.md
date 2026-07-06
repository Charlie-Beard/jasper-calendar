# Jasper's Summer Holiday Calendar — Implementation Plan

## Overview

A calendar web app for Jasper, installed to an iPad Home Screen as a PWA. It shows the school summer holidays (**23 July – 1 September 2026**) as a grid of day tiles, 7 per row. Tapping a day opens a modal with that day's plan — an ordered checklist ("Wake up", "Brush teeth", "Get dressed", …) that Jasper ticks off. Most days share the same default routine; his parents add extra activities to specific days through a password-protected admin portal. Jasper can see every day, but can only check items off on **today or past days**.

**Implementer notes:** this plan is written to be implemented in full by Claude Opus 4.8. Keep the stack deliberately simple — **vanilla HTML/CSS/JS with no build step and no frontend framework** — so a parent can maintain it. Everything below is specified; where a detail is unstated, choose the simplest kid-friendly option.

## Hosting & architecture (free)

A single **Cloudflare Worker** serves both the static PWA (via Workers Static Assets) and a JSON API, backed by a **D1 (SQLite) database**.

Why this over GitHub Pages: Pages can't store data. Cloudflare's free tier easily covers a family app (100,000 requests/day, 5M D1 row reads/day), never sleeps, requires no credit card, deploys with one command, and provides a free `https://….workers.dev` URL — HTTPS is required for PWA installation and service workers.

**One-time setup (for the parents):**
1. Create a free Cloudflare account at dash.cloudflare.com
2. `npm install` then `npx wrangler login`
3. `npx wrangler d1 create jasper-calendar` → paste the returned `database_id` into `wrangler.jsonc`
4. `npx wrangler d1 migrations apply jasper-calendar --remote`
5. `npx wrangler secret put ADMIN_PASSWORD` (the shared parent password) and `npx wrangler secret put AUTH_SECRET` (any long random string)
6. `npx wrangler deploy`
7. Optional: connect this GitHub repo in the Cloudflare dashboard (Workers Builds) so every push auto-deploys.

## Repo structure

```
wrangler.jsonc          # Worker config: static assets dir, D1 binding, compatibility date
package.json            # wrangler devDependency; scripts: dev, deploy, migrate:local, migrate:remote
migrations/
  0001_init.sql         # schema + seed routine
src/
  worker.js             # API routes + auth + falls through to static assets
public/
  index.html            # kid calendar view
  admin.html            # parent portal
  css/style.css
  js/api.js             # shared fetch helpers
  js/calendar.js        # kid view logic
  js/admin.js           # admin portal logic
  manifest.webmanifest
  sw.js                 # service worker
  icons/                # icon-180.png, icon-192.png, icon-512.png (cheerful sun/calendar motif)
```

## Data model (`migrations/0001_init.sql`)

```sql
CREATE TABLE default_activities (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE day_activities (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,            -- 'YYYY-MM-DD'
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE INDEX idx_day_activities_date ON day_activities(date);

CREATE TABLE completions (
  date TEXT NOT NULL,            -- 'YYYY-MM-DD'
  activity_type TEXT NOT NULL CHECK (activity_type IN ('default','day')),
  activity_id INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (date, activity_type, activity_id)
);
```

A row in `completions` exists if and only if that item is checked for that date. Seed `default_activities` with a starter routine (parents edit it later): Wake up, Brush teeth, Get dressed, Breakfast, Morning activity, Lunch, Afternoon activity, Dinner, Bath, Story, Bed.

## API (JSON, under `/api`)

**Kid endpoints (no auth):**
- `GET /api/calendar?from=2026-07-23&to=2026-09-01` → `{ from, to, today, days: { "2026-07-23": { total, done, hasSpecial }, … } }` — per-date counts so tiles can show progress, plus `today` computed server-side in **Europe/London**.
- `GET /api/day/:date` → merged ordered list `[{ type: 'default'|'day', id, title, done }]` — defaults first, then that day's extras, each ordered by `sort_order`.
- `POST /api/day/:date/toggle` with `{ type, id, done }` → inserts/deletes the completion row. **Server-side rule: return 403 if `:date` is after today in Europe/London** — never trust the client clock. (Compute today with `new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())`, which yields `YYYY-MM-DD`.)

**Admin endpoints (require `Authorization: Bearer <token>`):**
- `POST /api/admin/login` `{ password }` → constant-time compare against the `ADMIN_PASSWORD` secret; on success return an HMAC-signed expiring token: payload `exp` timestamp ~90 days out, signed with `AUTH_SECRET` using WebCrypto (`crypto.subtle`, HMAC-SHA-256), encoded `base64url(payload) + '.' + base64url(sig)`. Client stores it in localStorage. All admin routes verify signature + expiry.
- `GET /api/admin/defaults`, `POST /api/admin/defaults` `{ title }`, `PUT /api/admin/defaults/:id` `{ title }`, `DELETE /api/admin/defaults/:id`, `PUT /api/admin/defaults/reorder` `{ ids: […] }`
- Same shape for a specific day: `GET/POST /api/admin/day/:date/activities`, `PUT/DELETE /api/admin/day/:date/activities/:id`, `PUT /api/admin/day/:date/activities/reorder`
- Deleting an activity also deletes its `completions` rows.

Validate `:date` everywhere as `YYYY-MM-DD` within the holiday range. Any non-`/api` request falls through to static assets.

## Kid calendar view (`index.html`)

- Header: **"Jasper's Summer Holidays"** plus a fun progress line (e.g. "12 days done ⭐").
- CSS Grid, **7 columns, Monday–Sunday** (UK convention) with a weekday header row. The range runs 23 Jul 2026 (**Wednesday**) to 1 Sep 2026 (**Tuesday**); render leading/trailing cells outside the range as empty so weekday alignment is correct.
- Each tile shows the day number (add the short month name on the 1st of a month). **Today gets a bold highlight ring and a "Today" label.** Past days show a ⭐ when everything was checked off, otherwise a small progress dot (e.g. "3/11"). Days with parent-added extras show a badge (e.g. 🎉) so Jasper can spot special days.
- Tap any tile → modal: date heading, ordered checklist with large touch-friendly checkboxes (≥44px targets), a satisfying check animation, and tap-anywhere-on-row to toggle. **Future days: the list is fully visible but checkboxes are disabled**, with a friendly note like "You can tick these when the day arrives!". Mirror the server rule client-side using the `today` value from the API, but rely on the server 403 as the real enforcement.
- Design: bright and kid-friendly — large rounded tiles, big type, system font stack (no external fonts, so it works offline), plenty of colour. Must work in both portrait and landscape on iPad.

## Admin portal (`admin.html`)

- Password gate on first visit; on success store the token in localStorage and go straight to the portal on revisits (with a logout button).
- Two sections:
  1. **Daily routine** — the list of default activities with add / edit / delete / reorder (up/down arrow buttons are fine; drag is optional).
  2. **Special days** — a date picker limited to the holiday range; selecting a date shows that day's extra activities with the same add/edit/delete/reorder controls.
- Plain, functional UI — this is for the parents, not Jasper.

## PWA / iPad Home Screen

- `manifest.webmanifest`: `name`/`short_name`, `display: "standalone"`, `start_url: "/"`, theme + background colours, 192 & 512 icons.
- iOS-specific tags in `index.html`: `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style`, and `<link rel="apple-touch-icon" href="/icons/icon-180.png">`.
- `sw.js`: precache the app shell (HTML, CSS, JS, icons, manifest) with a versioned cache name; **cache-first for the shell, network-first for `/api/*`** so data stays fresh; bump the cache version on deploys.
- Generate the icons as simple, cheerful PNGs (sun/calendar motif) — no external assets.
- Install instructions (put in README or PLAN follow-up): open the workers.dev URL in Safari on the iPad → Share → **Add to Home Screen**.

## Verification (for the implementer)

- Run locally with `npx wrangler dev` (local D1; apply migrations with `migrate:local` first) and exercise the real flows:
  - Calendar renders with correct weekday alignment: 23 Jul 2026 lands on Wednesday, 1 Sep 2026 on Tuesday.
  - Today's tile is highlighted; tapping it opens the checklist; toggling an item persists across a reload.
  - Toggling an item on a **future** date is rejected server-side — prove it with a direct `curl` POST, not just the disabled UI.
  - Admin login with a wrong password is rejected; with the right password the routine can be added/edited/reordered/deleted.
  - Add a special activity to a date and confirm it appears in the kid view with the special-day badge and in the right order.
- PWA check: manifest is valid, service worker registers, app is installable (Lighthouse or manual check).
- After `npx wrangler deploy`, smoke-test the live workers.dev URL end-to-end.

## Out of scope / future ideas

Per-day hiding of a single default activity; multiple children; emoji or photos per activity; a rewards/streaks screen.
