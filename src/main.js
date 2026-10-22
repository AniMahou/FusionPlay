import lottie from 'lottie-web/build/player/lottie_light';
import { mountScene, sceneThumb } from './scenes.js';
import { createShiritori } from './shiritori.js';

const app = document.getElementById('app');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const RETURN_AFTER = 12; // seconds on the result screen before the kiosk resets
const HOME_THEME = { scene: 'home', tint: ['#14284A', '#D3BC8E'], bg: '/media/home/bg.jpg', video: '/media/home/bg.mp4', bgm: '/media/home/bgm.mp3', name: 'AniMahou' };

let realms = [], events = [];
let session = null; // { playId, event, questions } for the current participant only
let cleanup = () => {};

/* ---------- API ---------- */
async function api(url, body) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The quiz server did not respond. Tell the stall host.');
  return data;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const realmIcon = { anime: 'wish', hoyoverse: 'compass' };
const KEYS = 'ABCDEF';

/* ---------- Background: tint fallback, optional image / looping video ---------- */
const bgImg = document.getElementById('bg-img'), bgVideo = document.getElementById('bg-video');
let bgToken = 0;
const sceneHost = document.getElementById('scene-host');
let sceneKey = null, unmountScene = () => {};
function setTheme({ scene, tint, bg, video }) {
  if (scene !== sceneKey) { unmountScene(); unmountScene = mountScene(sceneHost, scene); sceneKey = scene; }
  const root = document.documentElement.style;
  root.setProperty('--t1', tint[0]); root.setProperty('--t2', tint[1]);
  const token = ++bgToken;
  bgImg.classList.remove('on');
  document.body.classList.remove('wallpaper');
  const showing = () => { if (token === bgToken) document.body.classList.add('wallpaper'); };
  if (bg) { const im = new Image(); im.onload = () => { if (token !== bgToken) return; bgImg.style.backgroundImage = `url("${bg}")`; bgImg.classList.add('on'); showing(); }; im.src = bg; }
  bgVideo.classList.remove('on'); bgVideo.pause();
  if (video && !reduce.matches) {
    bgVideo.oncanplay = () => { if (token !== bgToken) return; bgVideo.classList.add('on'); showing(); bgVideo.play().catch(() => {}); };
    bgVideo.onerror = () => bgVideo.classList.remove('on');
    if (!bgVideo.src.endsWith(video)) { bgVideo.src = video; bgVideo.load(); } else if (bgVideo.readyState >= 3) bgVideo.oncanplay();
  }
}
const preload = (src, cb) => { const im = new Image(); im.onload = () => cb(src); im.src = src; };

/* ---------- Music: one looping track per page, user can mute ---------- */
const audio = document.getElementById('bgm'), nowPlaying = document.getElementById('now-playing'), musicBtn = document.getElementById('btn-music');
let musicOn = true, trackLabel = '', fallback = null;
// `alt` is tried when `src` is missing (an event without its own track uses its section's music).
function setMusic(src, label, alt = null) {
  trackLabel = label; fallback = alt;
  if (audio.getAttribute('src') === src) { if (musicOn) audio.play().catch(() => {}); return; }
  nowPlaying.hidden = true;
  audio.setAttribute('src', src);
  if (musicOn) audio.play().catch(() => {});
}
audio.addEventListener('playing', () => { nowPlaying.textContent = `♪ ${trackLabel}`; nowPlaying.hidden = false; });
audio.addEventListener('error', () => {
  nowPlaying.hidden = true;
  if (fallback) { const f = fallback; fallback = null; trackLabel = f.label; audio.setAttribute('src', f.src); if (musicOn) audio.play().catch(() => {}); }
});
musicBtn.addEventListener('click', () => {
  musicOn = !musicOn;
  musicBtn.setAttribute('aria-pressed', musicOn); musicBtn.setAttribute('aria-label', musicOn ? 'Turn music off' : 'Turn music on');
  musicBtn.innerHTML = icon(musicOn ? 'note' : 'mute');
  if (musicOn) audio.play().catch(() => {}); else { audio.pause(); nowPlaying.hidden = true; }
});


/* ---------- HUD: clock, fullscreen, leaderboard ---------- */
const clock = document.getElementById('clock');
const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 15000);
document.getElementById('btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
});
const overlay = document.getElementById('overlay');
document.getElementById('btn-board').addEventListener('click', openBoard);
async function openBoard() {
  const top = await api('/api/leaderboard?today=1').catch(() => []);
  overlay.innerHTML = `<div class="panel board" role="dialog" aria-modal="true" aria-labelledby="board-h">
    <button class="hud-btn close" aria-label="Close">${icon('close')}</button>
    <h2 class="display gold-text" id="board-h">Today's leaderboard</h2>
    ${top.length ? `<ol>${top.map((p, i) => `<li><span class="rank">${i + 1}</span><span>${esc(p.name)}<small>${esc(p.eventName)}</small></span><b>${p.score}</b></li>`).join('')}</ol>`
      : '<p class="empty">No scores yet today. The first player sets the bar.</p>'}
  </div>`;
  overlay.hidden = false;
  const close = () => { overlay.hidden = true; removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  overlay.querySelector('.close').addEventListener('click', close);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  addEventListener('keydown', esc_);
  overlay.querySelector('.close').focus();
}

/* ---------- Router ---------- */
async function load() {
  ({ realms, events } = await api('/api/catalog'));
}
async function route() {
  // Refresh the catalog on browsing screens so admin changes show up for the next player.
  if (!/^#\/quiz/.test(location.hash)) await load().catch(() => {});
  cleanup(); cleanup = () => {};
  overlay.hidden = true;
  const [, page, id] = location.hash.slice(1).split('/');
  const views = { realm: () => realmPage(id), event: () => eventPage(id), quiz: () => quiz(id), shiritori: () => shiritoriBoard(id) };
  document.body.dataset.screen = views[page] ? page : 'home';
  (views[page] || home)();
  window.scrollTo(0, 0);
  if (views[page]) app.focus({ preventScroll: true });
}

/* ---------- 1. Home ---------- */
function home() {
  session = null;
  setTheme(HOME_THEME);
  setMusic(HOME_THEME.bgm, 'Main theme');
  const title = 'AniMahou'.split('').map((c, i) => `<span class="letter gold-text" style="--i:${i}">${c}</span>`).join('');
  app.innerHTML = `
    <section class="home screen">
      <div class="emblem-wrap"><div class="emblem" id="emblem" role="img" aria-label="AniMahou emblem. Click it."></div></div>
      <div class="home-title">
        <h1 class="display" aria-label="AniMahou">${title}</h1>
        <p>Choose a realm to begin your trial</p>
      </div>
      <div class="realms">
        ${realms.map((r, i) => `
          <button class="realm" data-id="${r.id}" style="--r1:${r.tint[0]};--r2:${r.tint[1]};--d:${900 + i * 150}ms">
            <span class="realm-art" style="background-image:url('/media/${r.id}/realm.jpg')"></span>
            <video class="preview" muted loop playsinline preload="none" data-src="/media/${r.id}/realm.mp4"></video>
            <svg class="sigil"><use href="#i-${realmIcon[r.id]}"/></svg>
            <span class="count">${icon('star')} ${events.filter((e) => e.realm === r.id).length} events</span>
            <h2 class="display">${esc(r.name)}</h2>
            <p>${esc(r.blurb)}</p>
            <span class="btn btn-sm"><span class="badge">${icon(realmIcon[r.id])}</span>Enter ${esc(r.name)}</span>
          </button>`).join('')}
      </div>
      <div class="home-foot"><span class="tap-hint">Tap a realm to enter</span><span class="ver">Stall 14, Hall B &nbsp; Ver. 1.0 &nbsp; <a class="admin-link" href="/admin.html">Admin</a></span></div>
    </section>`;
  app.querySelectorAll('.realm').forEach((b) => b.addEventListener('click', () => { location.hash = `#/realm/${b.dataset.id}`; }));
  if (!reduce.matches) app.querySelectorAll('.realm').forEach((card) => {
    const v = card.querySelector('.preview');
    const start = () => { if (!v.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('on')).catch(() => {}); };
    const end = () => { v.classList.remove('on'); v.pause(); };
    card.addEventListener('pointerenter', start); card.addEventListener('focus', start);
    card.addEventListener('pointerleave', end); card.addEventListener('blur', end);
  });
  mountEmblem(app.querySelector('#emblem'));
}

function mountEmblem(el) {
  let anim;
  fetch('/lottie/emblem.json').then((r) => r.json()).then((data) => {
    anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: !reduce.matches, animationData: data });
    if (reduce.matches) anim.goToAndStop(60, true);
  });
  // Interactive: tilts toward the pointer, spins up on hover, bursts on click.
  let speed = 1, target = 1, raf = 0;
  const loop = () => { speed += (target - speed) * .06; anim?.setSpeed(speed); target += (1 - target) * .02; raf = requestAnimationFrame(loop); };
  const onMove = (e) => {
    const r = el.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
    el.style.transform = `rotateY(${dx * 30}deg) rotateX(${-dy * 30}deg)`;
  };
  if (!reduce.matches) {
    raf = requestAnimationFrame(loop);
    addEventListener('pointermove', onMove);
    el.addEventListener('pointerenter', () => { target = 2.2; });
    el.addEventListener('click', () => { target = 6; el.animate([{ scale: 1 }, { scale: 1.12 }, { scale: 1 }], { duration: 500, easing: 'cubic-bezier(.2,.7,.2,1)' }); });
  }
  cleanup = () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); anim?.destroy(); };
}

/* ---------- 2. Realm: list of events ---------- */
function realmPage(id) {
  const realm = realms.find((r) => r.id === id);
  if (!realm) return missing();
  setTheme({ scene: `realm-${realm.id}`, tint: realm.tint, video: `/media/${realm.id}/realm.mp4`, bg: `/media/${realm.id}/realm.jpg` });
  setMusic(`/media/${realm.id}/realm.mp3`, `${realm.name} theme`);
  const list = events.filter((e) => e.realm === id);
  app.innerHTML = `
    <section class="screen">
      <a class="btn btn-ghost btn-sm" href="#/"><span class="badge">${icon('back')}</span>All realms</a>
      <div class="page-head">
        <div><h1 class="display gold-text">${esc(realm.name)}</h1><p>${esc(realm.blurb)}</p></div>
        <span class="eyebrow-star">${icon('star')} ${list.length} events open today</span>
      </div>
      <div class="events">
        ${list.map((e, i) => `
          <button class="event" data-id="${e.id}" style="--e1:${e.theme.tint[0]};--e2:${e.theme.tint[1]};--d:${i * 70}ms">
            <span class="art" data-bg="${esc(e.theme.bg)}">${sceneThumb(e.theme.scene)}</span>
            <video class="preview" muted loop playsinline preload="none" data-src="${esc(e.theme.video)}"></video>
            <svg class="seal"><use href="#i-${realm.id === 'anime' ? 'wish' : 'gem'}"/></svg>
            <span class="theme">${icon('star')} ${esc(e.theme.name)}</span>
            <h2>${esc(e.name)}</h2>
            <p>${esc(e.blurb)}</p>
            <span class="meta"><span>${e.kind === 'shiritori' ? `Multiplayer, ${e.timeLimit}s a turn` : `${e.questionCount} questions, ${e.timeLimit}s each`}</span><span>${e.joined} joined</span></span>
          </button>`).join('')}
      </div>
    </section>`;
  app.querySelectorAll('.art').forEach((a) => preload(a.dataset.bg, (src) => { a.style.backgroundImage = `linear-gradient(transparent, transparent), url("${src}")`; a.classList.add('has-img'); }));
  app.querySelectorAll('.event').forEach((b) => b.addEventListener('click', () => { location.hash = `#/event/${b.dataset.id}`; }));
  // A muted preview of the event's wallpaper plays while the card is hovered or focused.
  if (!reduce.matches) app.querySelectorAll('.event').forEach((card) => {
    const v = card.querySelector('.preview');
    const start = () => { if (!card.querySelector('.art.has-img')) return; if (!v.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('on')).catch(() => {}); };
    const end = () => { v.classList.remove('on'); v.pause(); };
    card.addEventListener('pointerenter', start); card.addEventListener('focus', start);
    card.addEventListener('pointerleave', end); card.addEventListener('blur', end);
  });
}

/* ---------- 3. Event page: themed intro + registration ---------- */
function eventPage(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return missing();
  if (ev.kind === 'shiritori') return shiritori.setup(ev);
  setTheme(ev.theme);
  setMusic(ev.theme.bgm, `${ev.theme.name} theme`, { src: `/media/${ev.realm}/realm.mp3`, label: `${realms.find((r) => r.id === ev.realm)?.name || ''} theme` });
  const realm = realms.find((r) => r.id === ev.realm);
  app.innerHTML = `
    <a class="btn btn-ghost btn-sm screen" href="#/realm/${realm.id}"><span class="badge">${icon('back')}</span>${esc(realm.name)} events</a>
    <section class="event-page screen">
      <div class="event-intro">
        <span class="eyebrow-star">${icon(realmIcon[realm.id])} ${esc(realm.name)}</span>
        <p class="theme-name display gold-text">${esc(ev.theme.name)}</p>
        <h1 class="display">${esc(ev.name)}</h1>
        <p>${esc(ev.blurb)}</p>
        <ul class="facts">
          <li>${icon('scroll')} ${ev.questionCount} questions</li>
          <li>${icon('star')} ${ev.timeLimit} seconds each</li>
          <li>${icon('gem')} ${ev.joined} joined</li>
        </ul>
      </div>
      <img class="char" alt="" hidden data-src="${esc(ev.theme.char)}" />
      <div class="panel register">
        <h2 class="display gold-text">Register to play</h2>
        <p class="sub">Your name goes on today's leaderboard.</p>
        <form novalidate>
          <div class="field"><label for="name">Traveler name</label><input id="name" autocomplete="off" maxlength="20" placeholder="Lumine" required /><p class="hint" id="name-hint">Up to 20 characters.</p></div>
          <div class="field"><label for="contact">Email or phone</label><input id="contact" autocomplete="off" placeholder="lumine@example.com" required /><p class="hint" id="contact-hint">Only used to reach prize winners.</p></div>
          <div class="field"><label for="team">Team (optional)</label><input id="team" autocomplete="off" maxlength="24" placeholder="Leave blank to play solo" /></div>
          <p class="hint err" id="form-error" hidden></p>
          <div class="form-foot"><button class="btn" type="submit"><span class="badge">${icon('wish')}</span>Begin the trial</button></div>
        </form>
      </div>
    </section>`;
  showChar();
  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim(), contact = form.contact.value.trim();
    let first = null;
    [[name, 'name', 'Enter a name for the leaderboard.'], [contact, 'contact', 'Enter an email or phone number.']].forEach(([val, fid, msg]) => {
      const hint = app.querySelector(`#${fid}-hint`);
      hint.classList.toggle('err', !val);
      if (!val) { hint.textContent = msg; first ||= form[fid]; }
    });
    if (first) return first.focus();
    const btn = form.querySelector('[type=submit]'), err = app.querySelector('#form-error');
    btn.disabled = true; err.hidden = true;
    try {
      session = await api('/api/plays', { eventId: ev.id, name, contact, team: form.team.value.trim() });
      session.player = { name, team: form.team.value.trim() };
      location.hash = `#/quiz/${ev.id}`;
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
}

/* ---------- 4. Quiz (the server grades every answer) ---------- */
function quiz(id) {
  if (!session || session.event.id !== id) { location.hash = `#/event/${id}`; return; }
  const { event: ev, questions: set, playId, player } = session;
  setTheme(ev.theme);
  setMusic(ev.theme.bgm, `${ev.theme.name} theme`, { src: `/media/${ev.realm}/realm.mp3`, label: `${realms.find((r) => r.id === ev.realm)?.name || ''} theme` });
  let i = 0, score = 0, timers = [], onKey = null, clip = null;
  const stop = () => { timers.forEach(clearInterval); timers = []; if (onKey) removeEventListener('keydown', onKey); onKey = null; clip?.pause(); };
  cleanup = stop;

  function show() {
    stop();
    const q = set[i], limit = q.timeLimit || ev.timeLimit, started = performance.now();
    const pics = q.options.some((o) => o.image);
    let left = limit, locked = false;
    app.innerHTML = `
      <section class="panel quiz screen">
        <div class="quiz-top">
          <span class="who">${esc(player.name)}, ${esc(ev.theme.name)}</span>
          <span class="count">${i + 1} / ${set.length}</span>
          <span class="pts">${score} pts</span>
        </div>
        <div class="timer" role="timer" aria-label="Seconds left"><div class="timer-track"><div class="timer-fill"></div></div><span class="timer-num">${left}</span></div>
        <hr class="rule" />
        <h1 class="q">${esc(q.prompt)}</h1>
        ${media(q)}
        <ul class="options${pics ? ' pics' : ''}">${q.options.map((o, k) => `<li><button class="opt${o.image ? ' has-img' : ''}" data-k="${k}">
          ${o.image ? `<img src="${esc(o.image)}" alt="${esc(o.text || `Option ${KEYS[k]}`)}">` : ''}<span class="opt-row"><span class="key">${KEYS[k]}</span><span>${esc(o.text)}</span></span></button></li>`).join('')}</ul>
        <div class="quiz-foot"><p class="verdict" aria-live="polite"></p><span id="next-slot"></span></div>
      </section>`;
    const fill = app.querySelector('.timer-fill'), num = app.querySelector('.timer-num'), timerEl = app.querySelector('.timer');
    if (!reduce.matches) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = `transform ${limit}s linear`; fill.style.transform = 'scaleX(0)'; }));
    timers.push(setInterval(() => {
      left--; num.textContent = left;
      if (reduce.matches) fill.style.transform = `scaleX(${left / limit})`;
      timerEl.classList.toggle('low', left <= 5);
      if (left <= 0) answer(-1);
    }, 1000));
    const opts = [...app.querySelectorAll('.opt')];
    opts.forEach((b) => b.addEventListener('click', () => answer(+b.dataset.k)));
    onKey = (e) => { const k = KEYS.toLowerCase().indexOf(e.key.toLowerCase()); if (k >= 0 && k < opts.length && !locked) answer(k); };
    addEventListener('keydown', onKey);
    if (q.type === 'voice') wireVoice(q);
    if (q.type === 'image' && q.reveal) wireReveal(limit);

    async function answer(k) {
      if (locked) return; locked = true;
      const ms = Math.round(performance.now() - started);
      stop();
      const w = fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width;
      fill.style.transition = 'none'; fill.style.transform = `scaleX(${w})`;
      opts.forEach((b) => { b.disabled = true; });
      if (k >= 0) opts[k].classList.add('picked');
      const v = app.querySelector('.verdict');
      v.textContent = 'Checking';
      let r;
      try { r = await api(`/api/plays/${playId}/answer`, { questionId: q.id, choice: k, ms }); }
      catch (ex) { v.className = 'verdict bad'; v.textContent = ex.message; r = { correct: false, answer: -1, points: 0 }; }
      score += r.points;
      opts.forEach((b, j) => { if (j === r.answer) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
      app.querySelectorAll('.tiles i').forEach((t) => t.classList.add('gone'));
      app.querySelector('.pts').textContent = `${score} pts`;
      if (r.answer !== -1) { v.className = `verdict ${r.correct ? 'good' : 'bad'}`; v.textContent = k < 0 ? "Time's up" : r.correct ? `Correct, +${r.points}` : 'Not quite'; }
      const last = i === set.length - 1;
      app.querySelector('#next-slot').innerHTML = `<button class="btn btn-sm" id="next"><span class="badge">${icon(last ? 'trophy' : 'play')}</span>${last ? 'See result' : 'Next question'}</button>`;
      const next = app.querySelector('#next');
      next.addEventListener('click', () => { i++; last ? result() : show(); });
      next.focus();
    }
  }

  function media(q) {
    if (q.type === 'voice') {
      const bars = Array.from({ length: 64 }, (_, k) => `<i style="height:${(14 + Math.abs(Math.sin(k * 1.7) * Math.cos(k * .37)) * 86).toFixed(0)}%"></i>`).join('');
      return `<div class="voice"><button class="play" aria-pressed="false" aria-label="Play clip">${icon('play')}</button><div class="wave" aria-hidden="true">${bars}</div><span class="clip-time">0:00</span></div>`;
    }
    if (q.type === 'image') {
      const pic = q.media ? `<img class="frame" src="${esc(q.media)}" alt="The picture for this question">`
        : `<svg class="frame" viewBox="0 0 160 70" preserveAspectRatio="xMidYMid slice"><rect width="160" height="70" fill="hsl(212 45% 62%)"/><path d="M0 46 C30 34 50 40 75 32 C100 24 130 38 160 34 V70 H0Z" fill="hsl(212 30% 42%)"/></svg>`;
      return `<div class="reveal">${pic}${q.reveal ? `<div class="tiles">${'<i></i>'.repeat(60)}</div>` : ''}</div>`;
    }
    return '';
  }

  // Plays the uploaded clip if there is one; otherwise runs a 5 s placeholder.
  function wireVoice(q) {
    const btn = app.querySelector('.play'), bars = [...app.querySelectorAll('.wave i')], time = app.querySelector('.clip-time');
    const fmt = (t) => `0:${String(Math.floor(t)).padStart(2, '0')}`;
    const paint = (t, d) => { const on = Math.round((t / d) * bars.length); bars.forEach((b, k) => b.classList.toggle('on', k < on)); time.textContent = `${fmt(t)} / ${fmt(d)}`; };
    const setBtn = (playing) => { btn.setAttribute('aria-pressed', playing); btn.innerHTML = icon(playing ? 'pause' : 'play'); btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip'); };
    if (q.media) {
      clip = new Audio(q.media);
      clip.addEventListener('timeupdate', () => paint(clip.currentTime, clip.duration || 1));
      clip.addEventListener('ended', () => setBtn(false));
      btn.addEventListener('click', () => { if (clip.paused) { audio.volume = .25; clip.play(); setBtn(true); } else { clip.pause(); setBtn(false); } });
      clip.addEventListener('pause', () => { audio.volume = 1; });
      return;
    }
    let t = 0, iv = null; const d = 5;
    paint(0, d);
    btn.addEventListener('click', () => {
      if (iv) { clearInterval(iv); iv = null; return setBtn(false); }
      if (t >= d) t = 0;
      setBtn(true);
      iv = setInterval(() => { t = Math.min(d, t + .1); paint(t, d); if (t >= d) { clearInterval(iv); iv = null; setBtn(false); } }, 100);
      timers.push(iv);
    });
  }

  function wireReveal(limit) {
    const tiles = shuffle([...app.querySelectorAll('.tiles i')]);
    const perTick = Math.max(1, Math.ceil((tiles.length * .7) / limit));
    let n = 0;
    timers.push(setInterval(() => { for (let k = 0; k < perTick && n < tiles.length * .7; k++) tiles[n++].classList.add('gone'); }, 1000));
  }

  async function result() {
    stop();
    let r = null;
    try { r = await api(`/api/plays/${playId}/finish`, {}); } catch { /* shown below */ }
    const final = r?.score ?? score, ratio = r ? final / r.max : 0;
    const stars = ratio >= .6 ? 3 : ratio >= .3 ? 2 : final > 0 ? 1 : 0;
    let left = RETURN_AFTER;
    app.innerHTML = `
      <section class="panel result screen">
        <span class="eyebrow-star">${icon('star')} ${esc(ev.theme.name)} trial complete</span>
        <div class="stars" aria-label="${stars} of 3 stars">${[0, 1, 2].map((k) => `<svg class="i${k < stars ? ' lit' : ''}" style="--d:${300 + k * 200}ms"><use href="#i-star"/></svg>`).join('')}</div>
        <p class="score gold-text">${final}</p>
        <h1 class="display">${stars ? 'Well played' : 'Good try'}, ${esc(player.name)}</h1>
        <p class="muted">${r ? `You're ranked #${r.rank} in ${esc(ev.name)}.` : 'This score could not be saved. Please tell the stall host.'}</p>
        <hr class="rule" style="width:100%" />
        <button class="btn" id="home"><span class="badge">${icon('wish')}</span>Next player</button>
        <p class="countdown">Returning to the start in <span id="count">${left}</span> seconds</p>
      </section>`;
    session = null;
    const count = app.querySelector('#count');
    timers.push(setInterval(() => { left--; count.textContent = left; if (left <= 0) location.hash = '#/'; }, 1000));
    app.querySelector('#home').addEventListener('click', () => { location.hash = '#/'; });
    app.querySelector('#home').focus();
  }

  show();
}

// Optional character art (transparent PNG/WebP/GIF you have rights to) beside the panel.
function showChar() {
  const img = app.querySelector('.char');
  if (!img) return;
  preload(img.dataset.src, (src) => { img.src = src; img.hidden = false; });
}

/* ---------- Anime Shiritori (see shiritori.js) ---------- */
const shiritori = createShiritori({
  app, esc, icon, setTheme, setMusic, reduce,
  realmName: (id) => realms.find((r) => r.id === id)?.name || '',
  setCleanup: (fn) => { cleanup = fn; },
});
function shiritoriBoard(eventId) {
  const ev = events.find((e) => e.id === eventId);
  const code = location.hash.split('/')[3];
  if (!ev || !code) return missing();
  shiritori.room(ev, code);
}

function missing() {
  setTheme(HOME_THEME);
  app.innerHTML = `<section class="panel result screen"><h1 class="display gold-text">This page could not be found</h1>
    <p class="muted">The link may be out of date.</p><a class="btn" href="#/"><span class="badge">${icon('back')}</span>Back to the start</a></section>`;
}

function shuffle(a) { let s = 5; return a.map((v) => [((s = (s * 9301 + 49297) % 233280) / 233280), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]); }

addEventListener('hashchange', route);
load().then(route);
