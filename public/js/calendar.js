import { api } from './api.js';
import { outbox } from './outbox.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The family schedule (trips, grandparent days, …) lives in src/schedule.js
// on the server and arrives inside /api/calendar as `cal.schedule` — so
// schedule edits don't need a client redeploy to reach the iPad.

// The one place a date resolves to its day types — the tile and the modal
// both use this, so they can never disagree. Priority: Grandma/Oma and
// day-out days (rainforest, Beale Park) take the tile over from Dad; the
// cleaner is additive.
function dayInfo(date) {
  const s = cal.schedule;
  const dow = parseDate(date).getUTCDay();
  const trip = s.trips.find((t) => date >= t.from && date <= t.to) || null;
  const gran = s.grandparentDays.includes(date);
  const oma = s.omaDays.includes(date);
  const rainforest = (s.rainforestDays || []).includes(date);
  const bealePark = (s.bealeParkDays || []).includes(date);
  const dad = !gran && !oma && !rainforest && !bealePark
    && (dow === 0 || dow === 6 || s.dadOffExtra.includes(date));
  const cleaner = dow === 2 && !s.cleanerSkip.includes(date);
  return { trip, gran, oma, rainforest, bealePark, dad, cleaner };
}

const grid = document.getElementById('grid');
const progressEl = document.getElementById('progress');
const offlinePill = document.getElementById('offline-pill');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalNote = document.getElementById('modal-note');
const modalTrip = document.getElementById('modal-trip');
const modalList = document.getElementById('modal-list');

let cal = null; // { from, to, today, days: { date: { total, done, hasSpecial } } }
let openDate = null;
let fetchedOn = null; // iPad-clock date when `cal` was fetched, for midnight rollover

// Same formula the server uses for "today" (worker.js todayISO).
function londonToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

function parseDate(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function* dateRange(from, to) {
  const d = parseDate(from);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > to) return;
    yield iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function tileStatus(date) {
  const { total, done, hasSpecial } = cal.days[date];
  const allDone = total > 0 && done === total;
  let status = '';
  if (date <= cal.today && allDone) {
    status = '<span class="star">⭐</span>';
  } else if (date <= cal.today && done > 0) {
    status = `<span class="count">${done}/${total}</span>`;
  }
  const badge = hasSpecial ? '<span class="special" title="Something special!">🎉</span>' : '';
  return `<span class="tile-status">${status}</span>${badge}`;
}

function renderTile(btn, date) {
  const d = parseDate(date);
  const dayNum = d.getUTCDate();
  const { trip, gran, oma, rainforest, bealePark, dad, cleaner } = dayInfo(date);
  const monthLabel = (date === cal.from || dayNum === 1)
    ? `<span class="month">${MONTHS[d.getUTCMonth()]}</span>` : '';
  const todayLabel = date === cal.today ? '<span class="today-label">Today</span>' : '';
  const badges = (trip ? `<span class="trip-badge">${trip.emoji}</span>` : '')
    + (gran ? '<span class="gran-badge">👵👴</span>' : '')
    + (oma ? '<span class="oma-badge">👩</span>' : '')
    + (rainforest ? '<span class="rainforest-badge">🦜</span>' : '')
    + (bealePark ? '<span class="beale-badge">🦚</span>' : '')
    + (dad ? '<span class="dad-badge">👨</span>' : '')
    + (cleaner ? '<span class="cleaner-badge">🧹</span>' : '');
  const tripLabel = trip && date === trip.from ? `<span class="trip-label">${trip.label}</span>` : '';
  btn.className = 'tile'
    + (date === cal.today ? ' today' : '')
    + (date < cal.today ? ' past' : '')
    + (date > cal.today ? ' future' : '')
    + (trip ? ' trip' : '')
    + (gran ? ' gran' : '')
    + (oma ? ' oma' : '')
    + (rainforest ? ' rainforest' : '')
    + (bealePark ? ' beale' : '')
    + (dad ? ' dad' : '')
    + (cleaner ? ' cleaner' : '');
  btn.innerHTML = `${monthLabel}${badges}<span class="day-num">${dayNum}</span>${tripLabel}${todayLabel}${tileStatus(date)}`;
}

function renderGrid() {
  grid.innerHTML = '';
  const mondayIndex = (parseDate(cal.from).getUTCDay() + 6) % 7; // Mon = 0
  for (let i = 0; i < mondayIndex; i++) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'tile blank' }));
  }
  for (const date of dateRange(cal.from, cal.to)) {
    const btn = document.createElement('button');
    btn.dataset.date = date;
    btn.setAttribute('aria-label', friendlyDate(date));
    btn.addEventListener('click', () => openDay(date));
    renderTile(btn, date);
    grid.appendChild(btn);
  }
  grid.appendChild(renderSchoolTile());
}

function renderSchoolTile() {
  const schoolDay = cal.schedule.schoolDay;
  const btn = document.createElement('button');
  btn.className = 'tile school';
  btn.dataset.date = schoolDay;
  btn.setAttribute('aria-label', `${friendlyDate(schoolDay)} — back to school`);
  btn.innerHTML = `<span class="day-num">${parseDate(schoolDay).getUTCDate()}</span>`
    + '<span class="school-emoji">🎒</span>'
    + '<span class="school-label">School</span>';
  btn.addEventListener('click', openSchoolDay);
  return btn;
}

function openSchoolDay() {
  const schoolDay = cal.schedule.schoolDay;
  openDate = schoolDay;
  modalTitle.textContent = friendlyDate(schoolDay);
  modalNote.classList.add('hidden');
  modalTrip.classList.add('hidden');
  modalList.innerHTML = '<li class="school-scene">'
    + '<span class="scene-big">🏫</span>'
    + '<span class="scene-row">🎒 📚 ✏️</span>'
    + '<span class="scene-text">Back to school!</span>'
    + '</li>';
  modal.classList.remove('hidden');
}

function renderProgress() {
  if (cal.today < cal.from) {
    const n = daysBetween(cal.today, cal.from);
    progressEl.textContent = n === 1
      ? 'The holidays start tomorrow! 🎉'
      : `The holidays start in ${n} days! 🎉`;
    return;
  }
  if (cal.today > cal.to) {
    progressEl.textContent = 'What an amazing summer! 🌟';
    return;
  }
  const starDays = Object.entries(cal.days)
    .filter(([date, d]) => date <= cal.today && d.total > 0 && d.done === d.total).length;
  const dayNo = daysBetween(cal.from, cal.today) + 1;
  progressEl.textContent = `Day ${dayNo} of the holidays — ${starDays} ⭐ so far!`;
}

function refreshTile(date) {
  const btn = grid.querySelector(`[data-date="${date}"]`);
  if (btn) renderTile(btn, date);
  renderProgress();
}

// --- Day modal ---

function friendlyDate(date) {
  const d = parseDate(date);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

async function openDay(date) {
  openDate = date;
  modalTitle.textContent = friendlyDate(date);
  modalList.innerHTML = '<li class="loading">Loading…</li>';
  modalNote.classList.add('hidden');
  const info = dayInfo(date);
  // One headline note, same priority the tile colours use; the cleaner
  // is additive, so it tags along on whatever note is showing.
  const notes = [];
  if (info.trip) notes.push(`${info.trip.emoji} We're on holiday in ${info.trip.label}!`);
  else if (info.gran) notes.push("👵👴 You're with Grandma and Grandpa today!");
  else if (info.oma) notes.push("👩 You're at Oma's today!");
  else if (info.rainforest) notes.push("🦜 You're off to the Living Rainforest today!");
  else if (info.bealePark) notes.push("🦚 You're off to Beale Park today!");
  else if (info.dad) notes.push("👨 Daddy's off work today!");
  if (info.cleaner) notes.push('🧹 The cleaners are coming today!');
  modalTrip.textContent = notes.join(' ');
  modalTrip.classList.toggle('gran-note', !info.trip && info.gran);
  modalTrip.classList.toggle('oma-note', !info.trip && !info.gran && info.oma);
  modalTrip.classList.toggle('rainforest-note', !info.trip && !info.gran && !info.oma && info.rainforest);
  modalTrip.classList.toggle('beale-note', !info.trip && !info.gran && !info.oma && !info.rainforest && info.bealePark);
  modalTrip.classList.toggle('dad-note', !info.trip && !info.gran && !info.oma && !info.rainforest && !info.bealePark && info.dad);
  modalTrip.classList.toggle('cleaner-note', notes.length === 1 && info.cleaner);
  modalTrip.classList.toggle('hidden', notes.length === 0);
  modal.classList.remove('hidden');

  const day = await api.get(`/api/day/${date}`).catch(() => null);
  if (openDate !== date) return;
  if (!day) {
    modalList.innerHTML = '<li class="loading">Couldn\'t load — try again!</li>';
    return;
  }
  const locked = date > cal.today;
  if (locked) {
    modalNote.textContent = 'You can tick these off when the day arrives!';
    modalNote.classList.remove('hidden');
  }
  // Offline: the day may come from the service worker cache — lay any
  // still-unsent ticks on top, and recount so the tile matches the list.
  for (const item of day.items) {
    const pending = outbox.find(date, item.type, item.id);
    if (pending) item.done = pending.done;
  }
  cal.days[date].total = day.items.length;
  cal.days[date].done = day.items.filter((i) => i.done).length;
  refreshTile(date);
  if (day.items.length === 0) {
    modalList.innerHTML = '<li class="loading">Nothing planned yet!</li>';
    return;
  }
  modalList.innerHTML = '';
  for (const item of day.items) {
    modalList.appendChild(renderItem(date, item, locked));
  }
}

function renderItem(date, item, locked) {
  const li = document.createElement('li');
  li.className = 'check-row' + (item.done ? ' done' : '') + (item.type === 'day' ? ' special-item' : '')
    + (locked ? ' locked' : '');
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = item.done;
  box.disabled = locked;
  const text = document.createElement('span');
  text.className = 'check-title';
  text.textContent = item.type === 'day' ? `🎉 ${item.title}` : item.title;
  label.append(box, text);
  li.appendChild(label);

  box.addEventListener('change', async () => {
    const done = box.checked;
    box.disabled = true;
    try {
      await api.post(`/api/day/${date}/toggle`, { type: item.type, id: item.id, done });
      li.classList.toggle('done', done);
      cal.days[date].done += done ? 1 : -1;
      refreshTile(date);
    } catch (e) {
      if (e.network) {
        // No internet — keep the tick and send it once we're back online
        outbox.add({ date, type: item.type, id: item.id, done });
        li.classList.toggle('done', done);
        cal.days[date].done += done ? 1 : -1;
        refreshTile(date);
        updateOfflinePill();
      } else {
        box.checked = !done; // server said no — put it back
        alert(e.message);
      }
    } finally {
      box.disabled = locked;
    }
  });
  return li;
}

function closeModal() {
  openDate = null;
  modal.classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// --- Offline sync + boot ---

function updateOfflinePill() {
  const offline = !navigator.onLine;
  const pending = outbox.size() > 0;
  offlinePill.textContent = offline
    ? '📴 No internet — your ticks are saved!'
    : '☁️ Sending your ticks…';
  offlinePill.classList.toggle('hidden', !offline && !pending);
}

// Tile counts come from the server (or its cached copy); nudge them by any
// ticks that haven't reached the server yet so the grid matches reality.
function applyPendingToCounts() {
  for (const e of outbox.all()) {
    const day = cal.days[e.date];
    if (!day) continue;
    day.done = Math.min(day.total, Math.max(0, day.done + (e.done ? 1 : -1)));
  }
}

// Warm the service worker cache with every remaining day's checklist so the
// modal still opens when the iPad has no internet (e.g. away in Wales).
let prefetched = false;
async function prefetchDays() {
  if (prefetched || !navigator.onLine) return;
  prefetched = true;
  const start = cal.today > cal.from ? cal.today : cal.from;
  if (start > cal.to) return;
  for (const date of dateRange(start, cal.to)) {
    try {
      await api.get(`/api/day/${date}`); // sequential — a gentle background trickle
    } catch {
      prefetched = false; // connection dropped mid-way; retry on next load
      return;
    }
  }
}

async function load() {
  let fresh;
  try {
    fresh = await api.get('/api/calendar');
  } catch {
    if (!cal) {
      progressEl.textContent = 'Couldn\'t load the calendar — check the internet and refresh!';
      return;
    }
    // Can't reach the server or its cache, but we already have data:
    // roll "today" forward from the iPad's clock until we can re-ask.
    fresh = { ...cal, today: londonToday() };
  }
  cal = fresh;
  // A service-worker-cached response from before the schedule moved
  // server-side won't have `schedule` — fall back to an empty one rather
  // than crash (the next online fetch brings the real thing).
  cal.schedule = cal.schedule || {
    trips: [], grandparentDays: [], omaDays: [], rainforestDays: [], bealeParkDays: [],
    dadOffExtra: [], cleanerSkip: [],
    schoolDay: '2026-09-02',
  };
  // Offline overnight: the cached response still says yesterday.
  if (!navigator.onLine && cal.today < londonToday()) cal.today = londonToday();
  fetchedOn = londonToday();
  applyPendingToCounts();
  renderGrid();
  renderProgress();
  updateOfflinePill();
  prefetchDays();
}

// Push pending ticks to the server; once they all land, re-fetch so the
// grid shows the server's truth instead of our local guesses.
let syncing = false;
async function sync() {
  updateOfflinePill();
  if (syncing || outbox.size() === 0) return;
  syncing = true;
  try {
    if (await outbox.flush(api)) await load();
  } finally {
    syncing = false;
    updateOfflinePill();
  }
}

// The iPad keeps the app open for days — re-fetch after midnight so the
// "Today" ring moves and the new day unlocks without a manual refresh.
async function refreshIfStale() {
  if (cal && fetchedOn !== londonToday()) {
    await load();
    sync();
  }
}

window.addEventListener('online', sync);
window.addEventListener('offline', updateOfflinePill);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshIfStale();
});
window.addEventListener('pageshow', refreshIfStale);
setInterval(refreshIfStale, 60000);

load().then(sync);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
