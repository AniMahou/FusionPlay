// One event: settings summary, open/close switch, and its ordered question list.
import { api } from '../api.js';
import { esc, ic, TYPE, toast, confirmSheet, emptyState, switchEl } from '../ui.js';
import { openEventSheet } from './event-form.js';
import { openQuestionSheet } from './question-form.js';

export async function eventEditorView(view, id) {
  const realms = await api.get('/api/admin/realms');
  async function render() {
    const [ev, stats] = await Promise.all([api.get(`/api/admin/events/${id}`), api.get(`/api/admin/question-stats?event=${encodeURIComponent(id)}`)]);
    const stat = (qid) => stats.find((s) => s.id === qid);
    const realm = realms.find((r) => r.id === ev.realm);
    view.innerHTML = `
      <a class="crumb" href="#/events">${ic('back')}Events</a>
      <div class="page-head">
        <div><h1>${esc(ev.name)}</h1><p>${esc(realm?.name)} · ${esc(ev.theme.name || 'No theme')} · ${ev.timeLimit} seconds per question</p></div>
        <div class="toolbar">
          ${switchEl('ev-open', ev.status === 'open', ev.status === 'open' ? 'Open' : 'Closed')}
          <button class="btn btn-secondary" id="edit-event">${ic('pencil')}Settings</button>
          <a class="btn btn-secondary" href="#/leaderboards?event=${esc(ev.id)}">${ic('trophy')}Leaderboard</a>
        </div>
      </div>
      ${ev.kind === 'shiritori' ? `<section class="card card-pad">
        <h2 style="font:600 17px var(--font-display)">How Anime Shiritori works</h2>
        <p class="muted" style="margin-top:6px;max-width:70ch">Two players take turns naming an anime character or title that starts with the last letter of the previous answer. Answers are checked against a built-in index of popular anime and characters, so there are no questions to write. Use <b>Settings</b> to change the seconds per turn. Hosts can accept unknown answers with the PIN in the server's <code>.env</code> file (<code>HOST_PIN</code>). Players get 100 points per word and the winner gets 300 more, shown on the Leaderboard.</p>
      </section>` : `      <section class="card">
        <div class="card-pad" style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--sep-soft)">
          <div><h2 style="font:600 17px var(--font-display)">Questions</h2><span class="muted small">Players see them in this order. ${ev.questions.length ? '' : 'Add at least one to show this event on the kiosk.'}</span></div>
          <button class="btn btn-primary" id="add-q">${ic('plus')}Add question</button>
        </div>
        ${ev.questions.length ? ev.questions.map((q, i) => {
          const s = stat(q.id), right = q.options[q.answer];
          return `<div class="q-row">
            <span class="q-num">${i + 1}</span>
            <div style="min-width:0">
              <div class="q-prompt">${esc(q.prompt)}</div>
              <div class="q-meta">
                <span class="badge blue">${ic(TYPE[q.type].icon)}${TYPE[q.type].label}</span>
                ${q.media && q.type === 'image' ? `<img class="thumb-sm" src="${esc(q.media)}" alt="">` : ''}
                ${q.type === 'voice' ? (q.media ? '<span class="badge">Clip attached</span>' : '<span class="badge orange">No clip yet</span>') : ''}
                <span>${q.options.length} options</span>
                <span>Answer: <strong style="color:var(--green)">${esc(right?.text || (right?.image ? 'Image option' : '—'))}</strong></span>
                <span>${q.timeLimit ? `${q.timeLimit}s` : `${ev.timeLimit}s (event default)`}</span>
                ${s?.answered ? `<span>${s.pct}% correct · ${s.answered} answers</span>` : ''}
              </div>
            </div>
            <div class="q-actions">
              <button class="icon-btn" data-move="-1" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
              <button class="icon-btn" data-move="1" data-i="${i}" aria-label="Move down" ${i === ev.questions.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
              <button class="icon-btn" data-edit="${i}" aria-label="Edit question">${ic('pencil')}</button>
              <button class="icon-btn danger" data-del="${i}" aria-label="Delete question">${ic('trash')}</button>
            </div>
          </div>`;
        }).join('') : emptyState('No questions yet', 'Questions can be text, an image to reveal, or an audio clip. Options can be text or images.')}
      </section>
`}
      <h2 class="section-title">Danger zone</h2>
      <div class="card card-pad" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
        <div><strong>Delete this event</strong><div class="muted small">Removes its questions, plays and responses. This can’t be undone.</div></div>
        <button class="btn btn-danger" id="del-event">${ic('trash')}Delete event</button>
      </div>`;

    view.querySelector('#ev-open').addEventListener('change', async (e) => {
      await api.patch(`/api/admin/events/${id}/status`, { status: e.target.checked ? 'open' : 'closed' });
      toast(e.target.checked ? 'Event is open on the kiosk' : 'Event closed'); render();
    });
    view.querySelector('#edit-event').addEventListener('click', async () => { if (await openEventSheet(ev, realms)) { toast('Saved'); render(); } });
    view.querySelector('#add-q').addEventListener('click', async () => { if (await openQuestionSheet(ev, null)) { toast('Question added'); render(); } });
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => { if (await openQuestionSheet(ev, ev.questions[b.dataset.edit])) { toast('Question saved'); render(); } }));
    view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const q = ev.questions[b.dataset.del];
      if (await confirmSheet('Delete question?', `“${q.prompt}” and its responses will be removed.`)) { await api.del(`/api/admin/questions/${q.id}`); toast('Question deleted'); render(); }
    }));
    view.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
      const ids = ev.questions.map((q) => q.id), i = +b.dataset.i, j = i + +b.dataset.move;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api.post(`/api/admin/events/${id}/questions/reorder`, { ids }); render();
    }));
    view.querySelector('#del-event').addEventListener('click', async () => {
      if (await confirmSheet('Delete event?', `“${ev.name}”, its ${ev.questions.length} questions and all its results will be removed.`, 'Delete event')) {
        await api.del(`/api/admin/events/${id}`); toast('Event deleted'); location.hash = '#/events';
      }
    });
  }
  await render();
}
