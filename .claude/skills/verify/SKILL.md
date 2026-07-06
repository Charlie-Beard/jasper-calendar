---
name: verify
description: Build, launch, and drive Jasper's holiday calendar (Cloudflare Worker + D1) to verify changes end-to-end.
---

# Verifying jasper-calendar

## Launch

```sh
npm install
printf 'ADMIN_PASSWORD=summer-fun-2026\nAUTH_SECRET=local-dev-secret\nTEST_TODAY=2026-08-05\n' > .dev.vars
npx wrangler d1 migrations apply jasper-calendar --local
nohup npx wrangler dev --port 8787 > /tmp/wrangler-dev.log 2>&1 &
# wait for "Ready", then: curl http://localhost:8787/api/calendar
```

`TEST_TODAY` (local-only) pins "today" so past/today/future tile logic is
observable regardless of the real date; drop it to test the pre-holiday
countdown. Holiday range: 2026-07-23 (Thu) … 2026-09-01 (Tue), 41 days.

Gotcha: killing the dev server with `pkill -f "wrangler dev"` matches your own
compound shell command; use `pkill -f '[.]bin/wrangler'; pkill -f '[w]orkerd'`.

## Drive

- API: `GET /api/calendar`, `GET /api/day/:date`, `POST /api/day/:date/toggle`
  (future date must 403), `POST /api/admin/login` → Bearer token for
  `/api/admin/defaults` and `/api/admin/day/:date/activities` CRUD/reorder.
- UI: Playwright with the preinstalled browser —
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`
  (install `playwright-core` in the scratchpad, not the repo).
  Viewport 820×1180 ≈ iPad portrait. Flows worth driving: grid alignment
  (3 leading blanks, 41 tiles), today ring, tick items in today's modal and
  reload for persistence, locked future-day modal, admin login (wrong + right
  password), add special activity → 🎉 badge appears on the kid view.
- Deploy config check without deploying: `npx wrangler deploy --dry-run`.
