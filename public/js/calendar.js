import { api } from './api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const grid = document.getElementById('grid');
const progressEl = document.getElementById('progress');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalNote = document.getElementById('modal-note');
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
  const monthLabel = (date === cal.from || dayNum === 1)
    ? `<span class="month">${MONTHS[d.getUTCMonth()]}</span>` : '';
  const todayLabel = date === cal.today ? '<span class="today-label">Today</span>' : '';
  btn.className = 'tile'
    + (date === cal.today ? ' today' : '')
    + (date < cal.today ? ' past' : '')
    + (date > cal.today ? ' future' : '');
  btn.innerHTML = `${monthLabel}<span class="day-num">${dayNum}</span>${todayLabel}${tileStatus(date)}`;
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
  li.className = 'check-row' + (item.done ? ' done' : '') + (item.type === 'day' ? ' special-item' : '');
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
