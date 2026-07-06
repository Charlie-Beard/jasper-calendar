import { api } from './api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Family trips: tiles in these ranges get the green "away" look.
const TRIPS = [
  { from: '2026-08-21', to: '2026-08-28', label: 'Wales', emoji: '🐉' },
];

function tripFor(date) {
  return TRIPS.find((t) => date >= t.from && date <= t.to) || null;
}

// The day after the holidays — no tasks, just the big moment.
const SCHOOL_DAY = '2026-09-02';

// Days Dad is off work: every weekend, plus one-off days.
const DAD_OFF_EXTRA = ['2026-07-28', '2026-08-17'];

function dadOff(date) {
  const dow = parseDate(date).getUTCDay();
  return dow === 0 || dow === 6 || DAD_OFF_EXTRA.includes(date);
}

const grid = document.getElementById('grid');
const progressEl = document.getElementById('progress');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalNote = document.getElementById('modal-note');
const modalTrip = document.getElementById('modal-trip');
const modalList = document.getElementById('modal-list');

let cal = null; // { from, to, today, days: { date: { total, done, hasSpecial } } }
let openDate = null;

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
  const trip = tripFor(date);
  const dad = dadOff(date);
  const monthLabel = (date === cal.from || dayNum === 1)
    ? `<span class="month">${MONTHS[d.getUTCMonth()]}</span>` : '';
  const todayLabel = date === cal.today ? '<span class="today-label">Today</span>' : '';
  const badges = (trip ? `<span class="trip-badge">${trip.emoji}</span>` : '')
    + (dad ? '<span class="dad-badge">👨‍👦</span>' : '');
  const tripLabel = trip && date === trip.from ? `<span class="trip-label">${trip.label}</span>` : '';
  btn.className = 'tile'
    + (date === cal.today ? ' today' : '')
    + (date < cal.today ? ' past' : '')
    + (date > cal.today ? ' future' : '')
    + (trip ? ' trip' : '')
    + (dad ? ' dad' : '');
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
    btn.addEventListener('click', () => openDay(date));
    renderTile(btn, date);
    grid.appendChild(btn);
  }
  grid.appendChild(renderSchoolTile());
}

function renderSchoolTile() {
  const btn = document.createElement('button');
  btn.className = 'tile school';
  btn.dataset.date = SCHOOL_DAY;
  btn.setAttribute('aria-label', 'Wednesday 2 September — back to school');
  btn.innerHTML = '<span class="day-num">2</span>'
    + '<span class="school-emoji">🎒</span>'
    + '<span class="school-label">School</span>';
  btn.addEventListener('click', openSchoolDay);
  return btn;
}

function openSchoolDay() {
  openDate = SCHOOL_DAY;
  modalTitle.textContent = friendlyDate(SCHOOL_DAY);
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
  const trip = tripFor(date);
  const dad = !trip && dadOff(date);
  modalTrip.textContent = trip ? `${trip.emoji} We're on holiday in ${trip.label}!`
    : dad ? "👨‍👦 Daddy's off work today!" : '';
  modalTrip.classList.toggle('dad-note', dad);
  modalTrip.classList.toggle('hidden', !trip && !dad);
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
  modalList.innerHTML = '';
  for (const item of day.items) {
    modalList.appendChild(renderItem(date, item, locked));
  }
  if (day.items.length === 0) {
    modalList.innerHTML = '<li class="loading">Nothing planned yet!</li>';
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
      box.checked = !done; // server said no — put it back
      alert(e.message);
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

// --- Boot ---

async function load() {
  try {
    cal = await api.get('/api/calendar');
  } catch {
    progressEl.textContent = 'Couldn\'t load the calendar — check the internet and refresh!';
    return;
  }
  renderGrid();
  renderProgress();
}

load();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
