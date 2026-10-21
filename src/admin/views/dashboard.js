import { api } from '../api.js';
import { esc, ic, when, num, emptyState, eventStatus } from '../ui.js';

const REFRESH_MS = 15000; // live during the event

export async function dashboardView(view) {
  async function render() {
    const d = await api.get('/api/admin/overview');
    const maxPlays = Math.max(1, ...d.perEvent.map((e) => e.plays));
    view.innerHTML = `
      <div class="page-head">
        <div><h1>Overview</h1><p>Live numbers from the stall. Updates every 15 seconds.</p></div>
        <div class="toolbar"><a class="btn btn-secondary" href="#/events">${ic('calendar')}Manage events</a></div>
      </div>
      <div class="grid-4">
        <div class="card stat"><div class="label">Players today</div><div class="value">${num(d.participants.today)}</div><div class="foot">${num(d.participants.n)} registered in total</div></div>
        <div class="card stat"><div class="label">Quizzes finished</div><div class="value">${num(d.plays.finished)}</div><div class="foot">${num(d.plays.n - d.plays.finished)} left unfinished</div></div>
        <div class="card stat"><div class="label">Average score</div><div class="value">${num(d.plays.avg)}</div><div class="foot">Across finished quizzes</div></div>
        <div class="card stat"><div class="label">Answer accuracy</div><div class="value">${d.accuracy == null ? '—' : `${d.accuracy}%`}</div><div class="foot">${num(d.questions)} questions in ${num(d.events.n)} events</div></div>
      </div>
      <div class="split" style="margin-top:16px">
        <section class="card">
          <div class="card-pad" style="padding-bottom:4px"><h2 class="section-title" style="margin:0">Events</h2></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Event</th><th>Status</th><th>Plays</th><th class="num">Avg score</th></tr></thead>
            <tbody>${d.perEvent.map((e) => `<tr class="clickable" data-href="#/events/${esc(e.id)}">
              <td class="cell-strong">${esc(e.name)}</td><td>${eventStatus(e.status)}</td>
              <td><div style="display:flex;gap:10px;align-items:center"><div class="bar" style="width:90px"><i style="width:${(e.plays / maxPlays) * 100}%"></i></div><span class="mono-num">${e.plays}</span></div></td>
              <td class="num">${num(e.avg)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="card">
          <div class="card-pad" style="padding-bottom:4px"><h2 class="section-title" style="margin:0">Latest activity <a class="btn btn-plain" href="#/responses">See all</a></h2></div>
          ${d.recent.length ? d.recent.map((r) => `<a class="list-row" href="#/responses/${r.id}" style="color:inherit;text-decoration:none">
            <div class="grow"><div class="cell-strong">${esc(r.name)}${r.team ? ` <span class="muted">· ${esc(r.team)}</span>` : ''}</div><span class="cell-sub">${esc(r.event)}</span></div>
            <div style="text-align:right">${r.finished_at ? `<div class="cell-strong mono-num">${num(r.score)}</div>` : '<span class="badge orange">Playing</span>'}<span class="cell-sub">${when(r.finished_at || r.started_at)}</span></div></a>`).join('')
            : emptyState('No plays yet', 'Activity shows up here as soon as someone starts a quiz.')}
        </section>
      </div>`;
    view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }
  await render();
  const t = setInterval(() => render().catch(() => {}), REFRESH_MS);
  return () => clearInterval(t);
}
