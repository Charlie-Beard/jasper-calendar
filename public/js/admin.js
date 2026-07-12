import { api, getToken, setToken, clearToken } from './api.js';

const loginSection = document.getElementById('login-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const portal = document.getElementById('portal');
const defaultsList = document.getElementById('defaults-list');
const defaultsAdd = document.getElementById('defaults-add');
const specialDate = document.getElementById('special-date');
const specialList = document.getElementById('special-list');
const specialAdd = document.getElementById('special-add');

let range = null; // { from, to } from /api/calendar

function showLogin() {
  clearToken();
  portal.classList.add('hidden');
  loginSection.classList.remove('hidden');
}

function showPortal() {
  loginSection.classList.add('hidden');
  portal.classList.remove('hidden');
}

// Wraps admin calls: an expired/invalid token bounces back to the login form.
async function guarded(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.status === 401) {
      showLogin();
      return null;
    }
    alert(e.message);
    return null;
  }
}

function basePath(listEl) {
  return listEl === defaultsList
    ? '/api/admin/defaults'
    : `/api/admin/day/${specialDate.value}/activities`;
}

async function refresh(listEl) {
  const data = await guarded(() => api.get(basePath(listEl)));
  if (!data) return;
  listEl.innerHTML = '';
  data.items.forEach((item, i) => listEl.appendChild(renderRow(listEl, data.items, item, i)));
  if (data.items.length === 0) {
    listEl.innerHTML = '<li class="hint">Nothing here yet.</li>';
  }
}

function renderRow(listEl, items, item, index) {
  const li = document.createElement('li');
  li.className = 'admin-row';

  const up = rowBtn('↑', 'Move up', index === 0, () => move(listEl, items, index, -1));
  const down = rowBtn('↓', 'Move down', index === items.length - 1, () => move(listEl, items, index, 1));
  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = item.title;
  const edit = rowBtn('✏️', 'Edit', false, async () => {
    const next = prompt('Edit activity:', item.title);
    if (next === null || !next.trim()) return;
    await guarded(() => api.put(`${basePath(listEl)}/${item.id}`, { title: next.trim() }));
    refresh(listEl);
  });
  const del = rowBtn('🗑', 'Delete', false, async () => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    await guarded(() => api.del(`${basePath(listEl)}/${item.id}`));
    refresh(listEl);
  });

  li.append(up, down, title, edit, del);
  return li;
}

function rowBtn(text, label, disabled, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn row-btn';
  b.textContent = text;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

async function move(listEl, items, index, delta) {
  const ids = items.map((i) => i.id);
  [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
  await guarded(() => api.put(`${basePath(listEl)}/reorder`, { ids }));
  refresh(listEl);
}

function wireAddForm(form, listEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    const added = await guarded(() => api.post(basePath(listEl), { title }));
    if (added) {
      input.value = '';
      refresh(listEl);
    }
  });
}

wireAddForm(defaultsAdd, defaultsList);
wireAddForm(specialAdd, specialList);
specialDate.addEventListener('change', () => refresh(specialList));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  try {
    const { token } = await api.post('/api/admin/login', {
      password: document.getElementById('password').value,
    });
    setToken(token);
    document.getElementById('password').value = '';
    showPortal();
    loadPortal();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

document.getElementById('logout').addEventListener('click', showLogin);

async function loadPortal() {
  refresh(defaultsList);
  refresh(specialList);
}

async function boot() {
  range = await api.get('/api/calendar').catch(() => null);
  if (range) {
    specialDate.min = range.from;
    specialDate.max = range.to;
    specialDate.value = range.today >= range.from && range.today <= range.to
      ? range.today : range.from;
  } else {
    // Couldn't load the holiday range — fall back to today so the special-days
    // panel still points at a real date instead of requesting /day//activities.
    specialDate.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' })
      .format(new Date());
  }
  if (getToken()) {
    showPortal();
    loadPortal();
  } else {
    showLogin();
  }
}

boot();
