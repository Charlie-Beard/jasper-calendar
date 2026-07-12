# Jasper's Summer Holiday Calendar ☀️

A little PWA for the iPad Home Screen: a tile calendar of the school summer
holidays (23 July – 1 September 2026). Jasper taps a day to see his plan — an
ordered checklist he can tick off on today or past days. Parents manage the
daily routine and add special activities at `/admin.html`.

Built as a single Cloudflare Worker (static PWA + JSON API) with a D1 (SQLite)
database. Free tier covers everything. See [PLAN.md](PLAN.md) for the full spec.

## One-time setup

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com)
2. `npm install`
3. `npx wrangler login`
4. `npx wrangler d1 create jasper-calendar` — paste the printed `database_id`
   into `wrangler.jsonc`
5. `npm run migrate:remote` — creates the tables and seeds the default routine
6. `npx wrangler secret put ADMIN_PASSWORD` — the shared parent password
7. `npx wrangler secret put AUTH_SECRET` — any long random string
   (e.g. `openssl rand -hex 32`)
8. `npm run deploy` — prints your `https://jasper-calendar.<you>.workers.dev` URL

Optional: in the Cloudflare dashboard, connect this GitHub repo (Workers →
your worker → Settings → Builds) so every push deploys automatically.

Every page shows the deployed build (`v<git-sha> · built <time>`) in the
footer, so you can tell at a glance whether the latest push is live.

## Put it on the iPad

Open the workers.dev URL in **Safari** → Share button → **Add to Home Screen**.
It launches full-screen like an app.

Parents: bookmark `/admin.html`, sign in once with the shared password and the
device stays signed in for ~90 days.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then edit the password/secret
npm run migrate:local
npm run dev                      # http://localhost:8787
npm test                         # API test suite (runs in the Workers runtime)
```

Tip: set `TEST_TODAY=2026-08-05` in `.dev.vars` to preview what the calendar
looks like mid-holidays. Icons are generated with `npm run icons`.

The family schedule (trips, grandparent days, dad's days off, …) lives in
[src/schedule.js](src/schedule.js) — edit it and push; no other steps needed.
