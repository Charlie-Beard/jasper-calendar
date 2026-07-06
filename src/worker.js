// Jasper's holiday calendar — Cloudflare Worker: JSON API + static assets.

const HOLIDAY_START = '2026-07-23';
const HOLIDAY_END = '2026-09-01';
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

function isValidDate(date) {
  return DATE_RE.test(date) && date >= HOLIDAY_START && date <= HOLIDAY_END;
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

async function getCalendar(env) {
  const [defaults, extras, done] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM default_activities'),
    env.DB.prepare('SELECT date, COUNT(*) AS n FROM day_activities GROUP BY date'),
    env.DB.prepare('SELECT date, COUNT(*) AS n FROM completions GROUP BY date'),
  ]);
  const defaultCount = defaults.results[0].n;
  const extrasByDate = Object.fromEntries(extras.results.map((r) => [r.date, r.n]));
  const doneByDate = Object.fromEntries(done.results.map((r) => [r.date, r.n]));

  const days = {};
  for (let d = new Date(`${HOLIDAY_START}T12:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (date > HOLIDAY_END) break;
    const special = extrasByDate[date] || 0;
    days[date] = {
      total: defaultCount + special,
      done: doneByDate[date] || 0,
      hasSpecial: special > 0,
    };
  }
  return json({ from: HOLIDAY_START, to: HOLIDAY_END, today: todayISO(env), days });
}

async function getDay(env, date) {
  const [defaults, extras, done] = await env.DB.batch([
    env.DB.prepare('SELECT id, title FROM default_activities ORDER BY sort_order'),
    env.DB.prepare('SELECT id, title FROM day_activities WHERE date = ? ORDER BY sort_order').bind(date),
    env.DB.prepare('SELECT activity_type, activity_id FROM completions WHERE date = ?').bind(date),
  ]);
  const doneSet = new Set(done.results.map((r) => `${r.activity_type}:${r.activity_id}`));
  const items = [
    ...defaults.results.map((r) => ({ type: 'default', id: r.id, title: r.title, done: doneSet.has(`default:${r.id}`) })),
    ...extras.results.map((r) => ({ type: 'day', id: r.id, title: r.title, done: doneSet.has(`day:${r.id}`) })),
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
    ? await env.DB.prepare('SELECT 1 FROM default_activities WHERE id = ?').bind(id).first()
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
// table and the extra date column/filter.

function scopeFor(date) {
  if (date === null) {
    return {
      table: 'default_activities',
      where: '',
      bindWhere: [],
      completionType: 'default',
      insert: (env, title, order) =>
        env.DB.prepare('INSERT INTO default_activities (title, sort_order) VALUES (?, ?)').bind(title, order),
    };
  }
  return {
    table: 'day_activities',
    where: ' AND date = ?',
    bindWhere: [date],
    completionType: 'day',
    insert: (env, title, order) =>
      env.DB.prepare('INSERT INTO day_activities (date, title, sort_order) VALUES (?, ?, ?)').bind(date, title, order),
  };
}

async function listActivities(env, scope) {
  const rows = await env.DB.prepare(
    `SELECT id, title, sort_order FROM ${scope.table} WHERE 1=1${scope.where} ORDER BY sort_order`,
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

async function updateActivity(env, scope, id, request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return error('Title is required', 400);
  const result = await env.DB.prepare(
    `UPDATE ${scope.table} SET title = ? WHERE id = ?${scope.where}`,
  ).bind(title, id, ...scope.bindWhere).run();
  if (result.meta.changes === 0) return error('No such activity', 404);
  return json({ ok: true });
}

async function deleteActivity(env, scope, id) {
  const result = await env.DB.prepare(
    `DELETE FROM ${scope.table} WHERE id = ?${scope.where}`,
  ).bind(id, ...scope.bindWhere).run();
  if (result.meta.changes === 0) return error('No such activity', 404);
  await env.DB.prepare(
    'DELETE FROM completions WHERE activity_type = ? AND activity_id = ?',
  ).bind(scope.completionType, id).run();
  return json({ ok: true });
}

async function reorderActivities(env, scope, request) {
  const body = await request.json().catch(() => null);
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) {
    return error('Expected { ids: [...] }', 400);
  }
  await env.DB.batch(ids.map((id, i) =>
    env.DB.prepare(`UPDATE ${scope.table} SET sort_order = ? WHERE id = ?${scope.where}`)
      .bind(i + 1, id, ...scope.bindWhere),
  ));
  return json({ ok: true });
}

async function handleAdmin(env, request, segments) {
  // segments: path parts after /api/admin
  if (segments[0] === 'login' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!(await passwordMatches(env, body?.password))) {
      return error('Wrong password', 401);
    }
    return json({ token: await signToken(env) });
  }

  if (!(await requireAdmin(env, request))) return error('Not authorised', 401);

  let scope;
  let rest;
  if (segments[0] === 'defaults') {
    scope = scopeFor(null);
    rest = segments.slice(1);
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
      if (segments[0] === 'calendar' && segments.length === 1 && request.method === 'GET') {
        return await getCalendar(env);
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
