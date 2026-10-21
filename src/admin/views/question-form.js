// Question editor sheet: type, prompt, media, timer, 2–6 options (text and/or image), correct answer.
import { api, upload } from '../api.js';
import { esc, ic, sheet, TYPE } from '../ui.js';

const KEYS = 'ABCDEF';

export async function openQuestionSheet(ev, q) {
  const st = {
    type: q?.type || 'text', prompt: q?.prompt || '', media: q?.media || null, reveal: q?.reveal ?? true,
    timeLimit: q?.timeLimit ?? '', answer: q?.answer ?? 0,
    options: q ? q.options.map((o) => ({ ...o })) : [{ text: '', image: null }, { text: '', image: null }, { text: '', image: null }, { text: '', image: null }],
  };
  let body;

  const mediaBlock = () => {
    if (st.type === 'text') return '';
    const isImg = st.type === 'image';
    return `<div class="field"><span class="label">${isImg ? 'Picture' : 'Audio clip'}</span>
      <div class="drop${st.media ? ' has' : ''}">
        ${st.media ? (isImg ? `<img src="${esc(st.media)}" alt="">` : `<audio controls src="${esc(st.media)}"></audio>`) : `<span class="muted">${ic(isImg ? 'image' : 'audio')}</span>`}
        <div style="display:grid;gap:4px">
          <div class="toolbar"><label class="btn btn-secondary">${st.media ? 'Replace' : 'Upload'}<input type="file" id="q-media" accept="${isImg ? 'image/png,image/jpeg,image/webp,image/gif' : 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a'}" hidden></label>
          ${st.media ? '<button type="button" class="btn btn-plain" id="q-media-clear">Remove</button>' : ''}</div>
          <span class="help">${isImg ? 'PNG, JPG, WebP or GIF up to 8 MB.' : 'MP3, WAV, OGG or M4A up to 8 MB. Without a clip, players see a placeholder.'}</span>
        </div>
      </div>
      ${isImg ? `<label class="switch" style="margin-top:8px"><input type="checkbox" id="q-reveal" ${st.reveal ? 'checked' : ''}><span class="track"></span><span>Reveal the picture tile by tile</span></label>` : ''}
    </div>`;
  };

  const optionsBlock = () => `<div class="field"><span class="label">Options <span class="muted small" style="font-weight:400">· Select the correct one</span></span>
    <div class="opt-list" role="radiogroup" aria-label="Correct option">${st.options.map((o, i) => `
      <div class="opt-edit${st.answer === i ? ' correct' : ''}">
        <input type="radio" name="q-answer" value="${i}" ${st.answer === i ? 'checked' : ''} aria-label="Option ${KEYS[i]} is correct">
        <span class="key">${KEYS[i]}</span>
        <input class="input" data-opt-text="${i}" value="${esc(o.text)}" maxlength="120" placeholder="${o.image ? 'Caption (optional)' : `Option ${KEYS[i]}`}">
        <span class="opt-img-wrap" style="display:flex;align-items:center;gap:4px">
          ${o.image ? `<img class="opt-img" src="${esc(o.image)}" alt=""><button type="button" class="icon-btn" data-opt-clear="${i}" aria-label="Remove image from option ${KEYS[i]}">${ic('close')}</button>`
            : `<label class="icon-btn" title="Add an image" aria-label="Add an image to option ${KEYS[i]}">${ic('image')}<input type="file" data-opt-file="${i}" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>`}
        </span>
        <button type="button" class="icon-btn danger" data-opt-del="${i}" aria-label="Remove option ${KEYS[i]}" ${st.options.length <= 2 ? 'disabled' : ''}>${ic('trash')}</button>
      </div>`).join('')}
    </div>
    ${st.options.length < 6 ? `<button type="button" class="btn btn-plain" id="q-add-opt" style="justify-self:start">${ic('plus')}Add option</button>` : ''}
  </div>`;

  function paint() {
    body.innerHTML = `<div class="form">
      <div class="field"><span class="label">Question type</span>
        <div class="segmented" role="group" aria-label="Question type">${Object.entries(TYPE).map(([k, t]) => `<button type="button" data-type="${k}" aria-pressed="${st.type === k}">${ic(t.icon)}${t.label}</button>`).join('')}</div></div>
      <div class="field"><label for="q-prompt">Question</label><textarea class="textarea" id="q-prompt" maxlength="300" placeholder="${st.type === 'voice' ? 'Whose voice is this?' : st.type === 'image' ? 'Which anime is this frame from?' : 'Who created One Piece?'}">${esc(st.prompt)}</textarea></div>
      ${mediaBlock()}
      ${optionsBlock()}
      <div class="field" style="max-width:260px"><label for="q-time">Seconds for this question</label><input class="input" id="q-time" type="number" min="5" max="120" value="${esc(st.timeLimit)}" placeholder="${ev.timeLimit} (event default)"></div>
    </div>`;
    wire();
  }

  // Keep typed values when re-rendering.
  function capture() {
    const p = body.querySelector('#q-prompt'); if (p) st.prompt = p.value;
    body.querySelectorAll('[data-opt-text]').forEach((i) => { st.options[i.dataset.optText].text = i.value; });
    const t = body.querySelector('#q-time'); if (t) st.timeLimit = t.value;
    const r = body.querySelector('#q-reveal'); if (r) st.reveal = r.checked;
  }
  const err = (m) => { body.closest('form').querySelector('.form-error').textContent = m; };
  async function withUpload(file, apply) {
    if (!file) return;
    err('Uploading…');
    try { apply(await upload(file)); err(''); capture(); paint(); } catch (ex) { err(ex.message); }
  }

  function wire() {
    body.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { capture(); if (st.type !== b.dataset.type) { st.type = b.dataset.type; st.media = null; } paint(); }));
    body.querySelectorAll('[name=q-answer]').forEach((r) => r.addEventListener('change', () => { capture(); st.answer = +r.value; paint(); body.querySelector(`[name=q-answer][value="${st.answer}"]`).focus(); }));
    body.querySelector('#q-media')?.addEventListener('change', (e) => withUpload(e.target.files[0], (url) => { st.media = url; }));
    body.querySelector('#q-media-clear')?.addEventListener('click', () => { capture(); st.media = null; paint(); });
    body.querySelectorAll('[data-opt-file]').forEach((f) => f.addEventListener('change', (e) => withUpload(e.target.files[0], (url) => { st.options[f.dataset.optFile].image = url; })));
    body.querySelectorAll('[data-opt-clear]').forEach((b) => b.addEventListener('click', () => { capture(); st.options[b.dataset.optClear].image = null; paint(); }));
    body.querySelectorAll('[data-opt-del]').forEach((b) => b.addEventListener('click', () => {
      capture(); const i = +b.dataset.optDel; st.options.splice(i, 1);
      if (st.answer === i) st.answer = 0; else if (st.answer > i) st.answer--;
      paint();
    }));
    body.querySelector('#q-add-opt')?.addEventListener('click', () => { capture(); st.options.push({ text: '', image: null }); paint(); body.querySelector(`[data-opt-text="${st.options.length - 1}"]`).focus(); });
  }

  return sheet({
    title: q ? 'Edit question' : `New question for ${ev.name}`, wide: true, submitLabel: q ? 'Save question' : 'Add question',
    render(b) { body = b; paint(); },
    async onSubmit() {
      capture();
      const payload = { type: st.type, prompt: st.prompt, media: st.media, reveal: st.reveal, timeLimit: st.timeLimit, answer: st.answer, options: st.options };
      if (q) await api.put(`/api/admin/questions/${q.id}`, payload); else await api.post(`/api/admin/events/${ev.id}/questions`, payload);
    },
  });
}
