// Offline outbox: ticks made with no internet, kept until the server has them.
// One localStorage map keyed by "date:type:id" — repeated toggles of the same
// item coalesce, last write wins.

const KEY = 'jasper-outbox';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function write(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export const outbox = {
  add({ date, type, id, done }) {
    const map = read();
    map[`${date}:${type}:${id}`] = { date, type, id, done, ts: Date.now() };
    write(map);
  },

  find(date, type, id) {
    return read()[`${date}:${type}:${id}`] || null;
  },

  all() {
    return Object.values(read()).sort((a, b) => a.ts - b.ts);
  },

  size() {
    return Object.keys(read()).length;
  },

  // Replay pending ticks in order. An answer from the server (ok or a
  // refusal like 403/404) settles an entry; a network failure keeps the
  // rest for next time. Returns true once the outbox is empty.
  async flush(api) {
    for (const e of this.all()) {
      try {
        await api.post(`/api/day/${e.date}/toggle`, { type: e.type, id: e.id, done: e.done });
      } catch (err) {
        if (err.status === undefined) return false; // still offline
      }
      const map = read();
      delete map[`${e.date}:${e.type}:${e.id}`];
      write(map);
    }
    return true;
  },
};
