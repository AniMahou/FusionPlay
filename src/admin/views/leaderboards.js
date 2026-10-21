import { api } from '../api.js';
import { esc, when, num, emptyState } from '../ui.js';
import { openPlay } from './responses.js';

export async function leaderboardsView(view, params) {
  const events = await api.get('/api/admin/events');
  let ev = params.get('event') || '', today = false;
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Leaderboards</h1><p>Top finished scores. Ties go to whoever finished first.</p></div>
      <div class="toolbar"><div class="segmented" role="group" aria-label="Time range"><button type="button" data-range="all" aria-pressed="true">All time</button><button type="button" data-range="today" aria-pressed="false">Today</button></div></div>
    </div>
    <div class="split" style="grid-template-columns:260px minmax(0,1fr);align-items:start">
      <nav class="card" aria-label="Choose leaderboard" id="picker" style="padding:6px"></nav>
      <section class="card" id="board"><div class="loading">Loading…</div></section>
    </div>`;
  const picker = view.querySelector('#picker'), board = view.querySelector('#board');
  const paintPicker = () => {
    picker.innerHTML = [{ id: '', name: 'All events' }, ...events].map((e) => `<button type="button" class="list-row" data-ev="${esc(e.id)}" style="width:100%;border:0;border-radius:8px;background:${e.id === ev ? 'var(--fill)' : 'transparent'};cursor:pointer;text-align:left;padding:9px 12px;font-weight:${e.id === ev ? 600 : 400}">${esc(e.name)}</button>`).join('');
    picker.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => { ev = b.dataset.ev; paintPicker(); load(); }));
  };
  async function load() {
    const rows = await api.get(`/api/admin/leaderboard?limit=50${ev ? `&event=${encodeURIComponent(ev)}` : ''}${today ? '&today=1' : ''}`);
    const title = ev ? events.find((e) => e.id === ev)?.name : 'All events';
    board.innerHTML = `<div class="card-pad" style="border-bottom:1px solid var(--sep-soft)"><h2 style="font:600 17px var(--font-display)">${esc(title)}</h2><span class="muted small">${today ? 'Today' : 'All time'} · ${rows.length} players</span></div>
      ${rows.length ? rows.map((r, i) => `<button type="button" class="list-row" data-play="${r.playId}" style="width:100%;border:0;border-bottom:1px solid var(--sep-soft);background:none;text-align:left;cursor:pointer">
        <span class="rank${i < 3 ? ` r${i + 1}` : ''}">${i + 1}</span>
        <span class="grow"><span class="cell-strong">${esc(r.name)}</span>${r.team ? ` <span class="muted">· ${esc(r.team)}</span>` : ''}<span class="cell-sub">${ev ? when(r.at) : esc(r.eventName)}</span></span>
        <span class="cell-strong mono-num" style="font-size:17px">${num(r.score)}</span></button>`).join('')
        : emptyState('No scores yet', today ? 'Nobody has finished this event today.' : 'Scores appear once players finish a quiz.')}`;
    board.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => openPlay(b.dataset.play)));
  }
  view.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    today = b.dataset.range === 'today';
    view.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    load();
  }));
  paintPicker();
  await load();
  const t = setInterval(() => load().catch(() => {}), 15000);
  return () => clearInterval(t);
}
