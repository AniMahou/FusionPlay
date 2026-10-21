import { api } from '../api.js';
import { esc, ic, when, num, emptyState, eventSelect, sheet } from '../ui.js';

export async function responsesView(view, params, playId) {
  const events = await api.get('/api/admin/events');
  let filter = params.get('event') || '';
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Responses</h1><p>Every quiz played. Select one to see each answer.</p></div>
      <div class="toolbar"><a class="btn btn-secondary" href="/api/admin/export/plays.csv">${ic('download')}Export CSV</a></div>
    </div>
    <div class="toolbar" style="margin-bottom:16px">${eventSelect(events, filter)}</div>
    <section id="stats"></section>
    <section class="card" id="list"><div class="loading">Loading…</div></section>`;
  const list = view.querySelector('#list'), statsEl = view.querySelector('#stats');

  async function load() {
    const [rows, stats] = await Promise.all([
      api.get(`/api/admin/plays${filter ? `?event=${encodeURIComponent(filter)}` : ''}`),
      filter ? api.get(`/api/admin/question-stats?event=${encodeURIComponent(filter)}`) : Promise.resolve(null),
    ]);
    statsEl.innerHTML = stats?.length ? `<div class="card" style="margin-bottom:16px"><div class="card-pad" style="padding-bottom:4px"><h2 class="section-title" style="margin:0">How each question went</h2></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Question</th><th>Answers</th><th>Correct</th><th class="num">Avg time</th></tr></thead>
      <tbody>${stats.map((s, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(s.prompt)}</td><td class="mono-num">${s.answered}</td>
        <td><div style="display:flex;gap:10px;align-items:center"><div class="bar" style="width:100px"><i style="width:${s.pct || 0}%;background:${(s.pct ?? 0) < 40 ? 'var(--red)' : 'var(--green)'}"></i></div><span class="mono-num">${s.pct == null ? '—' : `${s.pct}%`}</span></div></td>
        <td class="num">${s.avgSec == null ? '—' : `${s.avgSec}s`}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    list.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Player</th><th>Event</th><th>Correct</th><th class="num">Score</th><th>Status</th><th>Started</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="clickable" data-id="${r.id}">
        <td><span class="cell-strong">${esc(r.name)}</span><span class="cell-sub">${esc(r.team || r.contact)}</span></td><td>${esc(r.eventName)}</td>
        <td class="mono-num">${r.correct ?? 0} / ${r.answered}</td><td class="num cell-strong">${num(r.score)}</td>
        <td>${r.finished_at ? '<span class="badge green">Finished</span>' : '<span class="badge orange">Unfinished</span>'}</td><td class="muted">${when(r.started_at)}</td></tr>`).join('')}</tbody>
    </table></div>` : emptyState('No responses yet', 'Answers appear here as players finish questions.');
    list.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openPlay(tr.dataset.id)));
  }
  view.querySelector('#event-filter').addEventListener('change', (e) => { filter = e.target.value; load(); });
  await load();
  if (playId) openPlay(playId).then(() => { if (location.hash.startsWith('#/responses/')) history.replaceState(null, '', '#/responses'); });
}

export async function openPlay(id) {
  const p = await api.get(`/api/admin/plays/${id}`);
  return sheet({
    title: `${p.name} · ${p.eventName}`, wide: true,
    render(b) {
      b.innerHTML = `
        <div class="grid-4" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
          <div class="card stat"><div class="label">Score</div><div class="value">${num(p.score)}</div></div>
          <div class="card stat"><div class="label">Correct</div><div class="value">${p.responses.filter((r) => r.correct).length} / ${p.responses.length}</div></div>
          <div class="card stat"><div class="label">Played</div><div class="value" style="font-size:20px">${when(p.started_at)}</div><div class="foot">${p.finished_at ? 'Finished' : 'Did not finish'}</div></div>
        </div>
        <p class="muted small" style="margin-bottom:10px">${esc(p.contact)}${p.team ? ` · Team ${esc(p.team)}` : ''}</p>
        ${p.responses.length ? `<div class="card"><table class="table"><thead><tr><th>Question</th><th>Answer given</th><th class="num">Time</th><th class="num">Points</th></tr></thead><tbody>
          ${p.responses.map((r) => `<tr><td>${esc(r.prompt)}</td>
            <td>${r.correct ? `<span class="badge green">${esc(r.chosen)}</span>` : `${r.chosen ? `<span class="badge red">${esc(r.chosen)}</span>` : '<span class="badge">No answer</span>'}<span class="cell-sub">Correct: ${esc(r.right)}</span>`}</td>
            <td class="num">${(r.ms / 1000).toFixed(1)}s</td><td class="num cell-strong">${r.points}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('No answers', 'This player registered but didn’t answer any questions.')}`;
    },
  });
}
