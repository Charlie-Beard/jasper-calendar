// Jasper's holiday calendar — Cloudflare Worker: JSON API + static assets.

import { CALENDARS } from './schedule.js';

const TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days, lasts the summer

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message, status) {
  return json({ error: message }, status);
}

// Today's date in Europe/London (en-CA locale formats as YYYY-MM-DD).
// TEST_TODAY is a local-dev-only override from .dev.vars; never a secret in prod.
function todayISO(env) {
  if (env.TEST_TODAY && DATE_RE.test(env.TEST_TODAY)) return env.TEST_TODAY;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

// The id of the calendar (summer, halfterm, …) a date falls in, or null.
// Calendar ranges never overlap, so a date has at most one.
function calendarForDate(date) {
  if (!DATE_RE.test(date)) return null;
  for (const [id, c] of Object.entries(CALENDARS)) {
    if (date >= c.from && date <= c.to) return id;
  }
  return null;
}

function isValidDate(date) {
  return calendarForDate(date) !== null;
}

// --- Auth: HMAC-SHA-256 signed expiring token ---

const encoder = new TextEncoder();

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(env) {
  return crypto.subtle.importKey(
    'raw', encoder.encode(env.AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

async function signToken(env) {
  const payload = b64url(encoder.encode(JSON.stringify({ exp: Date.now() + TOKEN_LIFETIME_MS })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), encoder.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

async function verifyToken(env, token) {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return false;
  let sigBytes;
  try {
    sigBytes = b64urlDecode(sig);
  } catch {
    return false;
  }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), sigBytes, encoder.encode(payload));
  if (!ok) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

// Constant-time password check: compare SHA-256 digests so length leaks nothing.
async function passwordMatches(env, password) {
  if (typeof password !== 'string' || !env.ADMIN_PASSWORD) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(password)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_PASSWORD)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

async function requireAdmin(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyToken(env, token);
}

// --- Kid endpoints ---

async function getCalendar(env, calendarId) {
  const { from, to, schedule } = CALENDARS[calendarId];
  const [defaults, extras, done] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM default_activities WHERE calendar = ?').bind(calendarId),
    env.DB.prepare('SELECT date, COUNT(*) AS n FROM day_activities GROUP BY date'),
    env.DB.prepare('SELECT date, COUNT(*) AS n FROM completions GROUP BY date'),
  ]);
  const defaultCount = defaults.results[0].n;
  const extrasByDate = Object.fromEntries(extras.results.map((r) => [r.date, r.n]));
  const doneByDate = Object.fromEntries(done.results.map((r) => [r.date, r.n]));

  const days = {};
  for (let d = new Date(`${from}T12:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (date > to) break;
    const special = extrasByDate[date] || 0;
    days[date] = {
      // Deliberate trade-off: `total` uses the CURRENT default routine for
      // every day, so editing the routine mid-summer retroactively changes
      // past days (a finished day can gain/lose its star). Snapshotting
      // defaults per day would fix that but isn't worth the complexity here.
      total: defaultCount + special,
      done: doneByDate[date] || 0,
      hasSpecial: special > 0,
    };
  }
  return json({ from, to, today: todayISO(env), days, schedule });
}

async function getDay(env, date) {
  const [defaults, extras, done] = await env.DB.batch([
    env.DB.prepare('SELECT id, title FROM default_activities WHERE calendar = ? ORDER BY sort_order')
      .bind(calendarForDate(date)),
    // SELECT *: after_default arrives with migration 0006; until it's
    // applied every activity simply lands at the end, as before.
    env.DB.prepare('SELECT * FROM day_activities WHERE date = ? ORDER BY sort_order').bind(date),
    env.DB.prepare('SELECT activity_type, activity_id FROM completions WHERE date = ?').bind(date),
  ]);
  const doneSet = new Set(done.results.map((r) => `${r.activity_type}:${r.activity_id}`));
  const item = (type, r) => ({ type, id: r.id, title: r.title, done: doneSet.has(`${type}:${r.id}`) });

  // A day activity sits straight after the routine item it's anchored to
  // (after_default); unanchored ones — or ones whose anchor was deleted —
  // go at the end of the day.
  const defaultIds = new Set(defaults.results.map((r) => r.id));
  const after = new Map();
  const tail = [];
  for (const r of extras.results) {
    if (defaultIds.has(r.after_default)) {
      if (!after.has(r.after_default)) after.set(r.after_default, []);
      after.get(r.after_default).push(r);
    } else {
      tail.push(r);
    }
  }
  const items = [
    ...defaults.results.flatMap((d) => [item('default', d), ...(after.get(d.id) || []).map((r) => item('day', r))]),
    ...tail.map((r) => item('day', r)),
  ];
  return json({ date, today: todayISO(env), items });
}

async function toggleItem(env, date, request) {
  if (date > todayISO(env)) return error("You can tick these off when the day arrives!", 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body', 400);
  }
  const { type, id, done } = body || {};
  if ((type !== 'default' && type !== 'day') || !Number.isInteger(id) || typeof done !== 'boolean') {
    return error('Expected { type: "default"|"day", id, done }', 400);
  }
  const exists = type === 'default'
    ? await env.DB.prepare('SELECT 1 FROM default_activities WHERE id = ? AND calendar = ?')
      .bind(id, calendarForDate(date)).first()
    : await env.DB.prepare('SELECT 1 FROM day_activities WHERE id = ? AND date = ?').bind(id, date).first();
  if (!exists) return error('No such activity', 404);

  if (done) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO completions (date, activity_type, activity_id, completed_at) VALUES (?, ?, ?, ?)',
    ).bind(date, type, id, new Date().toISOString()).run();
  } else {
    await env.DB.prepare(
      'DELETE FROM completions WHERE date = ? AND activity_type = ? AND activity_id = ?',
    ).bind(date, type, id).run();
  }
  return json({ ok: true });
}

// --- Admin endpoints ---
// Defaults and per-day extras share the same CRUD shape; `scope` abstracts the
// table and the extra filter column (a calendar's routine, or a date's extras).

function scopeFor(date, calendarId = 'summer') {
  if (date === null) {
    return {
      table: 'default_activities',
      where: ' AND calendar = ?',
      bindWhere: [calendarId],
      completionType: 'default',
      placeCalendar: null,
      insert: (env, title, order) =>
        env.DB.prepare('INSERT INTO default_activities (title, sort_order, calendar) VALUES (?, ?, ?)')
          .bind(title, order, calendarId),
    };
  }
  return {
    table: 'day_activities',
    where: ' AND date = ?',
    bindWhere: [date],
    completionType: 'day',
    // Day activities can be placed after one of this calendar's routine items.
    placeCalendar: calendarForDate(date),
    insert: (env, title, order) =>
      env.DB.prepare('INSERT INTO day_activities (date, title, sort_order) VALUES (?, ?, ?)').bind(date, title, order),
  };
}

async function listActivities(env, scope) {
  const rows = await env.DB.prepare(
    `SELECT * FROM ${scope.table} WHERE 1=1${scope.where} ORDER BY sort_order`,
  ).bind(...scope.bindWhere).all();
  return json({ items: rows.results });
}

async function addActivity(env, scope, request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return error('Title is required', 400);
  const max = await env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${scope.table} WHERE 1=1${scope.where}`,
  ).bind(...scope.bindWhere).first();
  const result = await scope.insert(env, title, max.m + 1).run();
  return json({ id: result.meta.last_row_id, title, sort_order: max.m + 1 }, 201);
}

// Body: { title } to rename, and/or (day activities only) { after_default }
// — a routine item id from the date's calendar, or null for end of day.
async function updateActivity(env, scope, id, request) {
  const body = await request.json().catch(() => null);
  const sets = [];
  const binds = [];
  if (body?.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return error('Title is required', 400);
    sets.push('title = ?');
    binds.push(title);
  }
  if (body && 'after_default' in body) {
    if (!scope.placeCalendar) return error('Only day activities can be placed in the routine', 400);
    const anchor = body.after_default;
    if (anchor !== null) {
      const ok = Number.isInteger(anchor) && await env.DB.prepare(
        'SELECT 1 FROM default_activities WHERE id = ? AND calendar = ?',
      ).bind(anchor, scope.placeCalendar).first();
      if (!ok) return error("after_default must be one of this day's routine items", 400);
    }
    sets.push('after_default = ?');
    binds.push(anchor);
  }
  if (sets.length === 0) return error('Title is required', 400);
  const result = await env.DB.prepare(
    `UPDATE ${scope.table} SET ${sets.join(', ')} WHERE id = ?${scope.where}`,
  ).bind(...binds, id, ...scope.bindWhere).run();
  if (result.meta.changes === 0) return error('No such activity', 404);
  return json({ ok: true });
}

async function deleteActivity(env, scope, id) {
  const exists = await env.DB.prepare(
    `SELECT 1 FROM ${scope.table} WHERE id = ?${scope.where}`,
  ).bind(id, ...scope.bindWhere).first();
  if (!exists) return error('No such activity', 404);
  // One batch (= one transaction): the activity and its completions go
  // together, so a failure can't leave orphaned completions inflating counts.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${scope.table} WHERE id = ?${scope.where}`)
      .bind(id, ...scope.bindWhere),
    env.DB.prepare('DELETE FROM completions WHERE activity_type = ? AND activity_id = ?')
      .bind(scope.completionType, id),
  ]);
  return json({ ok: true });
}

async function reorderActivities(env, scope, request) {
  const body = await request.json().catch(() => null);
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) {
    return error('Expected { ids: [...] }', 400);
  }
  // The list must be a permutation of the current ids — a partial or
  // duplicated list would leave stale/duplicate sort_order values behind.
  const existing = await env.DB.prepare(
    `SELECT id FROM ${scope.table} WHERE 1=1${scope.where}`,
  ).bind(...scope.bindWhere).all();
  const current = new Set(existing.results.map((r) => r.id));
  if (ids.length !== current.size || !ids.every((id) => current.has(id))
      || new Set(ids).size !== ids.length) {
    return error('ids must contain every current activity exactly once', 400);
  }
  await env.DB.batch(ids.map((id, i) =>
    env.DB.prepare(`UPDATE ${scope.table} SET sort_order = ? WHERE id = ?${scope.where}`)
      .bind(i + 1, id, ...scope.bindWhere),
  ));
  return json({ ok: true });
}

// Brute-force protection: after MAX_LOGIN_FAILURES wrong passwords from one
// IP within LOGIN_WINDOW_MS, further attempts get a 429 until the window rolls.
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

async function handleLogin(env, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  // Fail open: if the bookkeeping table is missing (migration 0003 not yet
  // applied), log in without rate limiting rather than lock the parents out.
  const track = (stmt) => stmt.catch((e) => { console.error('login rate limit:', e); return null; });

  const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const recent = await track(env.DB.batch([
    env.DB.prepare('DELETE FROM login_failures WHERE attempted_at < ?').bind(cutoff),
    env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE ip = ?').bind(ip),
  ]));
  if (recent && recent[1].results[0].n >= MAX_LOGIN_FAILURES) {
    return error('Too many attempts — try again in a few minutes', 429);
  }

  const body = await request.json().catch(() => null);
  if (!(await passwordMatches(env, body?.password))) {
    await track(env.DB.prepare('INSERT INTO login_failures (ip, attempted_at) VALUES (?, ?)')
      .bind(ip, new Date().toISOString()).run());
    return error('Wrong password', 401);
  }
  await track(env.DB.prepare('DELETE FROM login_failures WHERE ip = ?').bind(ip).run());
  return json({ token: await signToken(env) });
}

async function handleAdmin(env, request, segments) {
  // segments: path parts after /api/admin
  if (segments[0] === 'login' && request.method === 'POST') {
    return handleLogin(env, request);
  }

  if (!(await requireAdmin(env, request))) return error('Not authorised', 401);

  let scope;
  let rest;
  if (segments[0] === 'defaults') {
    // Bare /defaults is the summer routine (what the admin page always used).
    scope = scopeFor(null);
    rest = segments.slice(1);
  } else if (Object.hasOwn(CALENDARS, segments[0]) && segments[1] === 'defaults') {
    scope = scopeFor(null, segments[0]);
    rest = segments.slice(2);
  } else if (segments[0] === 'day' && segments[2] === 'activities') {
    const date = segments[1];
    if (!isValidDate(date)) return error('Date must be within the holidays', 400);
    scope = scopeFor(date);
    rest = segments.slice(3);
  } else {
    return error('Not found', 404);
  }

  const { method } = request;
  if (rest.length === 0) {
    if (method === 'GET') return listActivities(env, scope);
    if (method === 'POST') return addActivity(env, scope, request);
  } else if (rest.length === 1) {
    if (rest[0] === 'reorder' && method === 'PUT') return reorderActivities(env, scope, request);
    const id = Number(rest[0]);
    if (Number.isInteger(id)) {
      if (method === 'PUT') return updateActivity(env, scope, id, request);
      if (method === 'DELETE') return deleteActivity(env, scope, id);
    }
  }
  return error('Not found', 404);
}

// --- Router ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const segments = url.pathname.slice(5).split('/').filter(Boolean);
    try {
      // /api/calendar is the summer calendar (old cached clients ask for it
      // by that URL); /api/calendar/<id> is any calendar in CALENDARS.
      if (segments[0] === 'calendar' && request.method === 'GET') {
        if (segments.length === 1) return await getCalendar(env, 'summer');
        if (segments.length === 2 && Object.hasOwn(CALENDARS, segments[1])) {
          return await getCalendar(env, segments[1]);
        }
        return error('No such calendar', 404);
      }
      if (segments[0] === 'day' && segments.length >= 2) {
        const date = segments[1];
        if (!isValidDate(date)) return error('Date must be within the holidays', 400);
        if (segments.length === 2 && request.method === 'GET') return await getDay(env, date);
        if (segments.length === 3 && segments[2] === 'toggle' && request.method === 'POST') {
          return await toggleItem(env, date, request);
        }
      }
      if (segments[0] === 'admin') {
        return await handleAdmin(env, request, segments.slice(1));
      }
      return error('Not found', 404);
    } catch (e) {
      console.error(e);
      return error('Something went wrong', 500);
    }
  },
};
