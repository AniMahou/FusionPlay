// Small UI kit shared by every admin view.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PATHS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4 0 4 1.5 4.5 4"/>',
  checklist: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M15 5l-7 7 7 7"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5.5-5L6 19"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  text: '<path d="M5 6h14M12 6v13"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
};
export const ic = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;

export const TYPE = { text: { label: 'Text', icon: 'text' }, image: { label: 'Image', icon: 'image' }, voice: { label: 'Audio', icon: 'audio' } };

/** SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; show it in local time. */
export function when(ts, withDate = true) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString([], withDate && !today ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { hour: 'numeric', minute: '2-digit' });
}
export const num = (n) => (n == null ? '—' : Number(n).toLocaleString());

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/**
 * Open a modal sheet. `render(body)` fills the body; `onSubmit` returns a promise
 * (throw to show the message and keep the sheet open). Resolves true when submitted.
 */
export function sheet({ title, render, submitLabel = 'Save', onSubmit, wide = false, danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<form class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" novalidate>
      <div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ic('close')}</button></div>
      <div class="sheet-body"></div>
      <div class="sheet-foot"><p class="form-error" role="alert"></p>
        ${onSubmit ? `<button type="button" class="btn btn-secondary" data-close>${esc(cancelLabel)}</button><button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>` : `<button type="button" class="btn btn-secondary" data-close>Done</button>`}
      </div></form>`;
    document.body.appendChild(scrim);
    const form = scrim.querySelector('form'), body = scrim.querySelector('.sheet-body'), err = scrim.querySelector('.form-error');
    const prevFocus = document.activeElement;
    const close = (val) => { scrim.remove(); removeEventListener('keydown', onKey); prevFocus?.focus?.(); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    addEventListener('keydown', onKey);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(false); });
    scrim.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(false)));
    render?.(body);
    (body.querySelector('input:not([type=hidden]), textarea, select') || scrim.querySelector('[type=submit]') || scrim.querySelector('[data-close]'))?.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close(true);
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; err.textContent = '';
      try { await onSubmit(body); close(true); } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  });
}

export const confirmSheet = (title, message, label = 'Delete') =>
  sheet({ title, submitLabel: label, danger: true, render: (b) => { b.innerHTML = `<p>${esc(message)}</p>`; }, onSubmit: async () => {} });

export function emptyState(title, text, action = '') {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
}

export const switchEl = (id, checked, label) =>
  `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="track"></span><span>${esc(label)}</span></label>`;

export const eventStatus = (s) => (s === 'open' ? '<span class="badge green"><span class="dot"></span>Open</span>' : '<span class="badge"><span class="dot"></span>Closed</span>');

export function eventSelect(events, value, allLabel = 'All events') {
  return `<select class="select" id="event-filter" style="width:auto;min-width:220px"><option value="">${esc(allLabel)}</option>
    ${events.map((e) => `<option value="${esc(e.id)}" ${e.id === value ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`;
}
