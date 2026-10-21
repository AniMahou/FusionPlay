// Create / edit an event's settings in a sheet.
import { api } from '../api.js';
import { esc, sheet, switchEl } from '../ui.js';
import { SCENES, sceneThumb } from '../../scenes.js';

const SCENE_LABELS = { home: 'Night ridges', 'realm-anime': 'Anime dusk city', 'realm-hoyoverse': 'Floating island', onepiece: 'Open sea (One Piece)', demonslayer: 'Wisteria night (Demon Slayer)', naruto: 'Sunset village (Naruto)', aot: 'The walls (Attack on Titan)', yourname: 'Comet lake (Your Name)', jjk: 'Cursed city (Jujutsu Kaisen)', mondstadt: 'Mondstadt', liyue: 'Liyue', inazuma: 'Inazuma', sumeru: 'Sumeru', fontaine: 'Fontaine', starrail: 'Astral Express' };

/** Resolves to the event id when saved, otherwise false. */
export async function openEventSheet(ev, realms) {
  let savedId = false;
  const ok = await sheet({
    title: ev ? 'Event settings' : 'New event', submitLabel: ev ? 'Save' : 'Create event', wide: true,
    render(b) {
      b.innerHTML = `<div class="form">
        <div class="form-row">
          <div class="field"><label for="f-name">Name</label><input class="input" id="f-name" maxlength="80" value="${esc(ev?.name)}" placeholder="Guess the Opening"></div>
          <div class="field"><label for="f-realm">Realm</label><select class="select" id="f-realm">${realms.map((r) => `<option value="${r.id}" ${ev?.realm === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="f-blurb">Short description</label><input class="input" id="f-blurb" maxlength="200" value="${esc(ev?.blurb)}" placeholder="Shown on the event card and event page"></div>
        <div class="form-row">
          <div class="field"><label for="f-theme">Theme title</label><input class="input" id="f-theme" maxlength="40" value="${esc(ev?.theme.name)}" placeholder="Naruto, Inazuma…"><span class="help">The large title on the event page.</span></div>
          <div class="field"><label for="f-time">Seconds per question</label><input class="input" id="f-time" type="number" min="5" max="120" value="${ev?.timeLimit ?? 20}"><span class="help">Default for every question. Questions can override it.</span></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="f-scene">Live background</label><select class="select" id="f-scene">${Object.keys(SCENES).map((k) => `<option value="${k}" ${(ev?.theme.scene || 'home') === k ? 'selected' : ''}>${esc(SCENE_LABELS[k] || k)}</option>`).join('')}</select>
            <div class="field" style="margin-top:10px"><span class="label">Accent colours</span><div class="color-pair"><input type="color" id="f-t1" value="${ev?.theme.tint[0] || '#14284A'}" aria-label="Dark colour"><input type="color" id="f-t2" value="${ev?.theme.tint[1] || '#D3BC8E'}" aria-label="Light colour"><span class="help">Used for the card and page tint.</span></div></div></div>
          <div class="field"><span class="label">Preview</span><div class="scene-preview" id="f-preview"></div></div>
        </div>
        ${switchEl('f-open', (ev?.status ?? 'open') === 'open', 'Open on the kiosk')}
      </div>`;
      const prev = b.querySelector('#f-preview'), sel = b.querySelector('#f-scene');
      const paint = () => { prev.innerHTML = sceneThumb(sel.value); };
      sel.addEventListener('change', paint); paint();
    },
    async onSubmit(b) {
      const v = (id) => b.querySelector(id).value;
      const body = { name: v('#f-name'), realm: v('#f-realm'), blurb: v('#f-blurb'), themeName: v('#f-theme'), timeLimit: v('#f-time'), scene: v('#f-scene'), tint1: v('#f-t1'), tint2: v('#f-t2'), status: b.querySelector('#f-open').checked ? 'open' : 'closed' };
      if (!body.name.trim()) { b.querySelector('#f-name').classList.add('invalid'); throw new Error('Enter an event name.'); }
      savedId = ev ? (await api.put(`/api/admin/events/${ev.id}`, body)).id : (await api.post('/api/admin/events', body)).id;
    },
  });
  return ok && savedId;
}
