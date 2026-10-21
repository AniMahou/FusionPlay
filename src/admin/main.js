// Admin entry: auth guard, shell layout, hash router.
import { api } from './api.js';
import { esc, ic } from './ui.js';
import { loginView } from './views/login.js';
import { dashboardView } from './views/dashboard.js';
import { eventsView } from './views/events.js';
import { eventEditorView } from './views/event-editor.js';
import { registrationsView } from './views/registrations.js';
import { responsesView } from './views/responses.js';
import { leaderboardsView } from './views/leaderboards.js';

const root = document.getElementById('root');
const NAV = [
  { href: '#/', label: 'Overview', icon: 'grid', match: /^#\/?$/ },
  { href: '#/events', label: 'Events & questions', icon: 'calendar', match: /^#\/events/ },
  { href: '#/registrations', label: 'Registrations', icon: 'people', match: /^#\/registrations/ },
  { href: '#/responses', label: 'Responses', icon: 'checklist', match: /^#\/responses/ },
  { href: '#/leaderboards', label: 'Leaderboards', icon: 'trophy', match: /^#\/leaderboards/ },
];
let me = null, teardown = () => {};

function shell() {
  root.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><span class="brand-mark">A</span><span>AniMahou<small>Admin</small></span></div>
      <span class="nav-label">Manage</span>
      <nav class="nav" aria-label="Admin">${NAV.map((n) => `<a href="${n.href}">${ic(n.icon)}${esc(n.label)}</a>`).join('')}</nav>
      <div class="side-foot">
        <a class="btn btn-plain" href="/" target="_blank" rel="noopener">${ic('external')}Open kiosk</a>
        <button class="btn btn-plain" id="logout">${ic('logout')}Sign out</button>
        <span class="who">${esc(me.email)}</span>
      </div>
    </aside>
    <main class="main" id="view" tabindex="-1"></main>
  </div>`;
  root.querySelector('#logout').addEventListener('click', async () => { await api.post('/api/admin/logout').catch(() => {}); me = null; location.hash = '#/login'; });
}

async function route() {
  teardown(); teardown = () => {};
  const hash = location.hash || '#/';
  if (!me) me = await api.get('/api/admin/me').catch(() => null);
  if (hash === '#/login') { if (me) { location.hash = '#/'; return; } return loginView(root, async () => { me = await api.get('/api/admin/me'); location.hash = '#/'; }); }
  if (!me) { location.hash = '#/login'; return; }
  if (!root.querySelector('.shell')) shell();
  root.querySelectorAll('.nav a').forEach((a, i) => (NAV[i].match.test(hash) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const view = root.querySelector('#view');
  view.innerHTML = '<div class="loading">Loading…</div>';
  const [path, qs] = hash.slice(1).split('?');
  const [, page = '', id] = path.split('/');
  const params = new URLSearchParams(qs);
  const views = { '': dashboardView, events: id ? (v) => eventEditorView(v, id) : eventsView, registrations: registrationsView, responses: (v) => responsesView(v, params, id), leaderboards: (v) => leaderboardsView(v, params) };
  try {
    teardown = (await (views[page] || dashboardView)(view, params)) || (() => {});
  } catch (e) {
    view.innerHTML = `<div class="empty"><strong>Couldn’t load this page</strong>${esc(e.message)}</div>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

addEventListener('hashchange', route);
route();
