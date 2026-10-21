import { api } from '../api.js';
import { esc, ic, when, num, emptyState, eventSelect } from '../ui.js';

export async function registrationsView(view, params) {
  const events = await api.get('/api/admin/events');
  let filter = params.get('event') || '', search = '';
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Registrations</h1><p>Everyone who signed up at the kiosk, newest first.</p></div>
      <div class="toolbar"><a class="btn btn-secondary" href="/api/admin/export/participants.csv">${ic('download')}Export CSV</a></div>
    </div>
    <div class="toolbar" style="margin-bottom:16px">${eventSelect(events, filter)}
      <input class="input" id="search" type="search" placeholder="Search name, contact or team" style="width:280px" aria-label="Search registrations"></div>
    <section class="card" id="list"><div class="loading">Loading…</div></section>`;
  const list = view.querySelector('#list');
  let rows = [];
  const paint = () => {
    const s = search.toLowerCase();
    const shown = rows.filter((r) => !s || [r.name, r.contact, r.team].some((v) => v?.toLowerCase().includes(s)));
    list.innerHTML = shown.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Player</th><th>Contact</th><th>Team</th><th>Event</th><th class="num">Score</th><th>Registered</th></tr></thead>
      <tbody>${shown.map((r) => `<tr${r.playId ? ` class="clickable" data-href="#/responses/${r.playId}"` : ''}>
        <td class="cell-strong">${esc(r.name)}</td><td>${esc(r.contact)}</td><td>${esc(r.team) || '<span class="muted">Solo</span>'}</td>
        <td>${esc(r.eventName || '—')}</td><td class="num">${r.finished_at ? num(r.score) : '<span class="badge orange">Unfinished</span>'}</td><td class="muted">${when(r.created_at)}</td></tr>`).join('')}</tbody>
    </table></div><div class="card-pad muted small" style="border-top:1px solid var(--sep-soft)">${shown.length} of ${rows.length} registrations</div>`
      : emptyState(rows.length ? 'No matches' : 'No registrations yet', rows.length ? 'Try a different search.' : 'Players appear here after they register at the kiosk.');
    list.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  };
  const load = async () => { rows = await api.get(`/api/admin/participants${filter ? `?event=${encodeURIComponent(filter)}` : ''}`); paint(); };
  view.querySelector('#event-filter').addEventListener('change', (e) => { filter = e.target.value; load(); });
  view.querySelector('#search').addEventListener('input', (e) => { search = e.target.value; paint(); });
  await load();
}
