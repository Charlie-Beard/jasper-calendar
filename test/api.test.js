// API tests — run against the real worker with an isolated D1 per test
// (migrations applied in test/apply-migrations.js). "Today" is pinned to
// 2026-08-05 via TEST_TODAY in vitest.config.js.

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';

const TODAY = '2026-08-05';

// Tests share one D1 — reset the mutable tables so each test starts clean.
// (default_activities is left alone: it's the migration-seeded routine.)
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM completions'),
    env.DB.prepare('DELETE FROM day_activities'),
    env.DB.prepare('DELETE FROM login_failures'),
  ]);
});

function call(path, { method = 'GET', body, token, ip } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (ip) headers['CF-Connecting-IP'] = ip;
  return worker.fetch(new Request(`https://test.local${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }), env);
}

async function login(password = 'test-password', ip) {
  return call('/api/admin/login', { method: 'POST', body: { password }, ip });
}

async function adminToken() {
  const res = await login();
  return (await res.json()).token;
}

describe('calendar', () => {
  it('returns the full holiday range with per-day counts and the schedule', async () => {
    const res = await call('/api/calendar');
    expect(res.status).toBe(200);
    const cal = await res.json();
    expect(cal.from).toBe('2026-07-23');
    expect(cal.to).toBe('2026-09-01');
    expect(cal.today).toBe(TODAY);
    expect(Object.keys(cal.days)).toHaveLength(41);
    expect(cal.days[TODAY]).toEqual({ total: 10, done: 0, hasSpecial: false });
    expect(cal.schedule.schoolDay).toBe('2026-09-02');
    expect(Array.isArray(cal.schedule.trips)).toBe(true);
  });
});

describe('day + toggle', () => {
  it('lists the default routine for a day', async () => {
    const res = await call(`/api/day/${TODAY}`);
    expect(res.status).toBe(200);
    const day = await res.json();
    expect(day.items).toHaveLength(10);
    expect(day.items.every((i) => i.type === 'default' && i.done === false)).toBe(true);
  });

  it('rejects dates outside the holidays', async () => {
    expect((await call('/api/day/2026-06-01')).status).toBe(400);
    expect((await call('/api/day/not-a-date')).status).toBe(400);
  });

  it('ticks and unticks an item, and the calendar counts follow', async () => {
    const { items } = await (await call(`/api/day/${TODAY}`)).json();
    const first = items[0];

    let res = await call(`/api/day/${TODAY}/toggle`, {
      method: 'POST', body: { type: first.type, id: first.id, done: true },
    });
    expect(res.status).toBe(200);
    let day = await (await call(`/api/day/${TODAY}`)).json();
    expect(day.items.find((i) => i.id === first.id).done).toBe(true);
    let cal = await (await call('/api/calendar')).json();
    expect(cal.days[TODAY].done).toBe(1);

    res = await call(`/api/day/${TODAY}/toggle`, {
      method: 'POST', body: { type: first.type, id: first.id, done: false },
    });
    expect(res.status).toBe(200);
    cal = await (await call('/api/calendar')).json();
    expect(cal.days[TODAY].done).toBe(0);
  });

  it('refuses ticks on future days', async () => {
    const res = await call('/api/day/2026-08-06/toggle', {
      method: 'POST', body: { type: 'default', id: 1, done: true },
    });
    expect(res.status).toBe(403);
  });

  it('404s on an unknown activity and 400s on a bad body', async () => {
    expect((await call(`/api/day/${TODAY}/toggle`, {
      method: 'POST', body: { type: 'default', id: 9999, done: true },
    })).status).toBe(404);
    expect((await call(`/api/day/${TODAY}/toggle`, {
      method: 'POST', body: { type: 'nope', id: 1, done: true },
    })).status).toBe(400);
  });
});

describe('auth', () => {
  it('rejects a wrong password and accepts the right one', async () => {
    expect((await login('wrong')).status).toBe(401);
    const res = await login();
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBeTruthy();
  });

  it('requires a valid token for admin routes', async () => {
    expect((await call('/api/admin/defaults')).status).toBe(401);
    expect((await call('/api/admin/defaults', { token: 'garbage.token' })).status).toBe(401);
    const token = await adminToken();
    expect((await call('/api/admin/defaults', { token })).status).toBe(200);
  });

  it('rate limits after repeated failures, even with the right password', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i++) expect((await login('wrong', ip)).status).toBe(401);
    expect((await login('wrong', ip)).status).toBe(429);
    expect((await login('test-password', ip)).status).toBe(429);
    // …but only for that IP.
    expect((await login('test-password', '203.0.113.8')).status).toBe(200);
  });
});

describe('admin CRUD', () => {
  it('adds, renames and deletes a default activity', async () => {
    const token = await adminToken();
    const added = await call('/api/admin/defaults', { method: 'POST', token, body: { title: '🦷 Floss' } });
    expect(added.status).toBe(201);
    const { id } = await added.json();

    expect((await call(`/api/admin/defaults/${id}`, {
      method: 'PUT', token, body: { title: '🦷 Floss Teeth' },
    })).status).toBe(200);
    let { items } = await (await call('/api/admin/defaults', { token })).json();
    expect(items.find((i) => i.id === id).title).toBe('🦷 Floss Teeth');

    expect((await call(`/api/admin/defaults/${id}`, { method: 'DELETE', token })).status).toBe(200);
    ({ items } = await (await call('/api/admin/defaults', { token })).json());
    expect(items.find((i) => i.id === id)).toBeUndefined();
  });

  it('deleting an activity also deletes its completions', async () => {
    const token = await adminToken();
    const { id } = await (await call('/api/admin/defaults', {
      method: 'POST', token, body: { title: 'Temp' },
    })).json();
    await call(`/api/day/${TODAY}/toggle`, { method: 'POST', body: { type: 'default', id, done: true } });
    expect((await (await call('/api/calendar')).json()).days[TODAY].done).toBe(1);

    await call(`/api/admin/defaults/${id}`, { method: 'DELETE', token });
    expect((await (await call('/api/calendar')).json()).days[TODAY].done).toBe(0);
  });

  it('manages special day activities and flags the day', async () => {
    const token = await adminToken();
    const res = await call(`/api/admin/day/${TODAY}/activities`, {
      method: 'POST', token, body: { title: 'Trip to the zoo' },
    });
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const cal = await (await call('/api/calendar')).json();
    expect(cal.days[TODAY]).toMatchObject({ total: 11, hasSpecial: true });
    const day = await (await call(`/api/day/${TODAY}`)).json();
    expect(day.items.find((i) => i.type === 'day' && i.id === id).title).toBe('Trip to the zoo');

    // A day activity is scoped to its date — a different date must not touch it.
    expect((await call(`/api/admin/day/2026-08-06/activities/${id}`, {
      method: 'DELETE', token,
    })).status).toBe(404);
    expect((await call(`/api/admin/day/${TODAY}/activities/${id}`, {
      method: 'DELETE', token,
    })).status).toBe(200);
  });

  it('rejects out-of-range dates for special activities', async () => {
    const token = await adminToken();
    expect((await call('/api/admin/day/2026-06-01/activities', {
      method: 'POST', token, body: { title: 'Nope' },
    })).status).toBe(400);
  });
});

describe('reorder', () => {
  it('accepts only a full permutation of the current ids', async () => {
    const token = await adminToken();
    const { items } = await (await call('/api/admin/defaults', { token })).json();
    const ids = items.map((i) => i.id);

    const put = (body) => call('/api/admin/defaults/reorder', { method: 'PUT', token, body });
    expect((await put({ ids: ids.slice(1) })).status).toBe(400); // partial
    expect((await put({ ids: [...ids.slice(1), ids[1]] })).status).toBe(400); // duplicate
    expect((await put({ ids: 'nope' })).status).toBe(400);

    const reversed = [...ids].reverse();
    expect((await put({ ids: reversed })).status).toBe(200);
    const after = await (await call('/api/admin/defaults', { token })).json();
    expect(after.items.map((i) => i.id)).toEqual(reversed);
  });
});
