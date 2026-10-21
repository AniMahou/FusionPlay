import { api } from '../api.js';
import { esc, ic, emptyState, eventStatus, toast } from '../ui.js';
import { sceneThumb } from '../../scenes.js';
import { openEventSheet } from './event-form.js';

export async function eventsView(view) {
  const [events, realms] = await Promise.all([api.get('/api/admin/events'), api.get('/api/admin/realms')]);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Events & questions</h1><p>Open an event to write its questions. Closed events are hidden from the kiosk.</p></div>
      <div class="toolbar"><button class="btn btn-primary" id="new-event">${ic('plus')}New event</button></div>
    </div>
    ${realms.map((r) => {
      const list = events.filter((e) => e.realm === r.id);
      return `<h2 class="section-title">${esc(r.name)} <span class="muted small">${list.length} events</span></h2>
        ${list.length ? `<div class="event-grid">${list.map((e) => `
          <a class="card event-card" href="#/events/${esc(e.id)}" style="color:inherit;text-decoration:none">
            <div class="art">${sceneThumb(e.theme.scene)}${eventStatus(e.status)}</div>
            <div class="body"><h3>${esc(e.name)}</h3><span class="muted small">${esc(e.theme.name || 'No theme')}</span>
              <div class="meta"><span>${e.questionCount} questions</span><span>${e.timeLimit}s per question</span><span>${e.joined} plays</span></div>
              ${e.questionCount ? '' : '<span class="badge orange" style="justify-self:start;margin-top:6px">Needs questions to appear on the kiosk</span>'}</div>
          </a>`).join('')}</div>` : `<div class="card">${emptyState('No events yet', `Create the first ${r.name} event.`)}</div>`}`;
    }).join('')}`;
  view.querySelector('#new-event').addEventListener('click', async () => {
    const id = await openEventSheet(null, realms);
    if (id) { toast('Event created'); location.hash = `#/events/${id}`; }
  });
}
