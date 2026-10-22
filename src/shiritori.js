// Anime Shiritori rooms on the kiosk or any phone: create or join a room with a code,
// ready up in the lobby, then play round the table until one player is left.
// The server referees everything; this file shows the room and sends what this player does.

const POLL_MS = 1000;
const SEAT_COLOURS = ['#F28BB0', '#6FD3C6', '#F2C46B', '#9AA8FF', '#9BE3B0', '#FF9D6B', '#D59BFF', '#7FD1F2', '#F7A1C4', '#B5E86F', '#FFD08A', '#A0C4FF'];
const tokenKey = (code) => `shiritori:${code}`;
const loadToken = (code) => { try { return localStorage.getItem(tokenKey(code)); } catch { return null; } };
const saveToken = (code, t) => { try { localStorage.setItem(tokenKey(code), t); } catch { /* private mode: token lives for this page only */ } };
const dropToken = (code) => { try { localStorage.removeItem(tokenKey(code)); } catch { /* ignore */ } };

export function createShiritori(ctx) {
  const { app, esc, icon, setTheme, setMusic, realmName, reduce, setCleanup } = ctx;
  const memoryTokens = new Map();

  async function call(method, url, body, token) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'The game server did not respond. Check your connection.'), { status: res.status });
    return data;
  }
  const theme = (ev) => {
    setTheme(ev.theme);
    setMusic(ev.theme.bgm, `${ev.theme.name} theme`, { src: `/media/${ev.realm}/realm.mp3`, label: `${realmName(ev.realm)} theme` });
  };
  const rules = (ev) => `<ol class="shiri-rules">
    <li>Name an <b>anime character</b> or an <b>anime title</b> that starts with the <b>last letter</b> of the previous answer.</li>
    <li>Turns go round the room in join order. You get <b>${ev.timeLimit} seconds</b>.</li>
    <li>Run out of time and you're <b>out</b>. The next player gets the same letter.</li>
    <li>Spelling is corrected to the official name, which sets the next letter. Either name order works.</li>
    <li>No repeats. The last player standing wins.</li>
  </ol>`;

  /* ---------- Create or join ---------- */
  function setup(ev, presetCode = '') {
    theme(ev);
    app.innerHTML = `
      <a class="btn btn-ghost btn-sm screen" href="#/realm/${ev.realm}"><span class="badge">${icon('back')}</span>${esc(realmName(ev.realm))} events</a>
      <section class="event-page shiri-setup screen">
        <div class="event-intro">
          <span class="eyebrow-star">${icon('wish')} Multiplayer word chain</span>
          <p class="theme-name display gold-text">Shiritori</p>
          <h1 class="display">${esc(ev.name)}</h1>
          ${rules(ev)}
        </div>
        <div class="panel register">
          <h2 class="display gold-text">${presetCode ? `Join room ${esc(presetCode)}` : 'Play together'}</h2>
          <p class="sub">Everyone plays on their own phone or laptop. Your name goes on today's leaderboard.</p>
          <form novalidate id="who">
            <div class="field"><label for="s-name">Your name</label><input id="s-name" autocomplete="off" maxlength="20" placeholder="Hana"></div>
            <div class="field"><label for="s-contact">Email or phone</label><input id="s-contact" autocomplete="off" placeholder="hana@example.com"><p class="hint">Only used to reach prize winners.</p></div>
            <div class="shiri-join">
              <div class="field"><label for="s-code">Room code</label><input id="s-code" autocomplete="off" maxlength="5" placeholder="ABCDE" value="${esc(presetCode)}" class="code-input"></div>
              <button class="btn" type="submit" data-act="join"><span class="badge">${icon('play')}</span>Join room</button>
            </div>
            ${presetCode ? '' : `<div class="shiri-or"><span>or</span></div>
            <button class="btn btn-ghost shiri-create" type="button" data-act="create"><span class="badge">${icon('wish')}</span>Create a new room</button>`}
            <p class="hint err" id="form-error" hidden></p>
          </form>
        </div>
      </section>`;
    const $ = (s) => app.querySelector(s), err = $('#form-error');
    const fail = (m, focus) => { err.textContent = m; err.hidden = false; focus?.focus(); };
    const codeInput = $('#s-code');
    codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    (presetCode ? $('#s-name') : $('#s-name')).focus();
    async function go(kind) {
      err.hidden = true;
      const name = $('#s-name').value.trim(), contact = $('#s-contact').value.trim(), code = codeInput.value.trim();
      if (!name) return fail('Enter your name.', $('#s-name'));
      if (!contact) return fail('Enter an email or phone number.', $('#s-contact'));
      if (kind === 'join' && code.length !== 5) return fail('Enter the 5-character room code.', codeInput);
      app.querySelectorAll('[data-act]').forEach((b) => { b.disabled = true; });
      try {
        const r = kind === 'create'
          ? await call('POST', '/api/shiritori/rooms', { eventId: ev.id, name, contact })
          : await call('POST', `/api/shiritori/rooms/${code}/join`, { name, contact });
        saveToken(r.code, r.token); memoryTokens.set(r.code, r.token);
        location.hash = `#/shiritori/${ev.id}/${r.code}`;
      } catch (ex) { fail(ex.message); app.querySelectorAll('[data-act]').forEach((b) => { b.disabled = false; }); }
    }
    $('#who').addEventListener('submit', (e) => { e.preventDefault(); go('join'); });
    $('[data-act="create"]')?.addEventListener('click', () => go('create'));
  }

  /* ---------- The room: lobby, game, results ---------- */
  function room(ev, code) {
    code = String(code || '').toUpperCase();
    const token = memoryTokens.get(code) || loadToken(code);
    if (!token) return setup(ev, code);
    theme(ev);
    let r = null, shown = '', poll = 0, frame = 0, slowTick = 0, lastTyped = '', hostOk = false, myTurnBefore = false, busy = false;
    const $ = (s) => app.querySelector(s);
    const colour = (id) => SEAT_COLOURS[Math.max(0, r.players.findIndex((p) => p.id === id)) % SEAT_COLOURS.length];
    const nameOf = (id) => r.players.find((p) => p.id === id)?.name || '';
    const shareUrl = () => `${location.origin}${location.pathname}#/shiritori/${ev.id}/${code}`;

    async function refresh() {
      try { const next = await call('GET', `/api/shiritori/rooms/${code}`, null, token); apply(next); }
      catch (ex) {
        if (ex.status === 404 || ex.status === 403) { stop(); dropToken(code); app.innerHTML = gone(ex.message); }
      }
    }
    function apply(next) {
      const changed = !r || next.version !== r.version || next.status !== r.status;
      r = next;
      if (!r.you) { stop(); dropToken(code); setup(ev, code); return; }
      if (r.status !== shown) { shown = r.status; ({ lobby: drawLobby, playing: drawGame, over: drawOver })[r.status](); }
      else if (changed) ({ lobby: fillLobby, playing: fillGame, over: () => {} })[r.status]();
      if (r.status === 'playing') startClock();
    }
    const gone = (m) => `<section class="panel result screen"><h1 class="display">This room has closed</h1><p class="muted">${esc(m)}</p>
      <a class="btn" href="#/event/${ev.id}"><span class="badge">${icon('wish')}</span>Back to Shiritori</a></section>`;
    async function send(action, body = {}) {
      if (busy) return null; busy = true;
      try { const res = await call('POST', `/api/shiritori/rooms/${code}/${action}`, body, token); apply(res.room); return res.result; }
      catch (ex) { say(ex.message, 'bad'); return null; }
      finally { busy = false; }
    }
    function say(text, kind = '') { const m = $('#msg'); if (m) { m.textContent = text; m.className = `shiri-msg ${kind}`; } }

    /* Lobby */
    function drawLobby() {
      app.innerHTML = `
        <section class="shiri-lobby screen">
          <div class="panel shiri-codecard">
            <span class="muted">Room code</span>
            <p class="shiri-code" aria-label="Room code ${code.split('').join(' ')}">${esc(code)}</p>
            <p class="muted shiri-share">Others join at <b>${esc(location.host)}</b> → Anime → Anime Shiritori, with this code.</p>
            <button class="btn btn-ghost btn-sm" id="copy" type="button"><span class="badge">${icon('scroll')}</span>Copy invite link</button>
          </div>
          <div class="panel shiri-roster">
            <h2 class="display gold-text">Players</h2>
            <ul id="roster"></ul>
            <p class="shiri-msg" id="msg" aria-live="polite"></p>
            <div class="form-foot" id="lobby-actions"></div>
            <button class="link" id="leave" type="button">Leave room</button>
          </div>
        </section>`;
      $('#copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(shareUrl()); say('Invite link copied.', 'good'); } catch { say(shareUrl()); }
      });
      $('#leave').addEventListener('click', async () => { await send('leave'); stop(); dropToken(code); location.hash = `#/event/${ev.id}`; });
      fillLobby();
    }
    function fillLobby() {
      const host = r.you.isHost, others = r.players.filter((p) => p.id !== r.hostId), waiting = others.filter((p) => !p.ready).length;
      $('#roster').innerHTML = r.players.map((p) => `<li style="--seat:${colour(p.id)}"><span class="dot"></span><b>${esc(p.name)}</b>
        ${p.id === r.hostId ? '<span class="tag">Host</span>' : p.ready ? '<span class="tag ok">Ready</span>' : '<span class="tag">Not ready</span>'}
        ${p.id === r.you.id ? '<span class="you">You</span>' : ''}</li>`).join('');
      const me = r.players.find((p) => p.id === r.you.id);
      const box = $('#lobby-actions');
      if (host) {
        const why = r.players.length < 2 ? 'Waiting for at least one more player to join.' : waiting ? `Waiting for ${waiting} ${waiting === 1 ? 'player' : 'players'} to get ready.` : 'Everyone is ready.';
        box.innerHTML = `<p class="muted">${why}</p><button class="btn" id="start" type="button" ${r.canStart ? '' : 'disabled'}><span class="badge">${icon('play')}</span>Start the game</button>`;
        $('#start').addEventListener('click', () => send('start'));
      } else {
        box.innerHTML = `<p class="muted">${me.ready ? 'Waiting for the host to start.' : 'Press Ready when you are set.'}</p>
          <button class="btn${me.ready ? ' btn-ghost' : ''}" id="ready" type="button"><span class="badge">${icon(me.ready ? 'close' : 'star')}</span>${me.ready ? 'Not ready' : "I'm ready"}</button>`;
        $('#ready').addEventListener('click', () => send('ready', { ready: !me.ready }));
      }
    }

    /* Game */
    function drawGame() {
      app.innerHTML = `
        <section class="shiri screen">
          <ol class="shiri-table" id="table" aria-label="Players"></ol>
          <div class="panel shiri-core">
            <p class="shiri-turn" id="turn" aria-live="polite"></p>
            <div class="shiri-letter"><span class="muted">Starts with</span><b id="letter"></b></div>
            <div class="timer" role="timer" aria-label="Seconds left"><div class="timer-track"><div class="timer-fill" id="fill"></div></div><span class="timer-num" id="secs"></span></div>
            <form class="shiri-input" novalidate>
              <label class="sr-only" for="answer">Your answer</label>
              <input id="answer" autocomplete="off" spellcheck="false" maxlength="80">
              <button class="btn" type="submit" id="playbtn"><span class="badge">${icon('play')}</span>Play</button>
            </form>
            <p class="shiri-msg" id="msg" aria-live="polite"></p>
            <div class="shiri-choose" id="choose" hidden></div>
            <div class="shiri-actions"><button class="link" id="appeal" type="button" hidden>Ask the host to rule</button><button class="link" id="leave" type="button">Leave game</button></div>
          </div>
          <ol class="shiri-chain" id="chain" aria-label="Words played"></ol>
        </section>`;
      $('.shiri-input').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $('#answer'); lastTyped = input.value.trim();
        if (!lastTyped) return;
        const res = await send('play', { text: lastTyped });
        if (!res) return;
        $('#appeal').hidden = !(res.canAppeal && hostOk);
        if (res.status === 'accepted') { input.value = ''; say(`${res.text}. Nice.`, 'good'); }
        else if (res.status === 'rejected') say(res.reason, 'bad');
        else if (res.status === 'choose') say('Several names match. Pick the one you mean.');
      });
      $('#leave').addEventListener('click', async () => {
        if (!confirm('Leave the game? You will be out.')) return;
        await send('leave');
      });
      $('#appeal').addEventListener('click', async () => { if ((await send('appeal'))?.status === 'paused') hostSheet(); });
      fillGame();
    }
    function fillGame() {
      const mine = r.turnId === r.you.id, meAlive = r.players.find((p) => p.id === r.you.id)?.alive;
      $('#table').innerHTML = r.players.map((p) => `<li class="${p.id === r.turnId ? 'turn' : ''} ${p.alive ? '' : 'out'}" style="--seat:${colour(p.id)}">
        <b>${esc(p.name)}${p.id === r.you.id ? ' <small>(you)</small>' : ''}</b><span>${p.alive ? `${p.words} ${p.words === 1 ? 'word' : 'words'}` : 'Out'}</span></li>`).join('');
      $('#letter').textContent = r.letter.toUpperCase();
      $('.shiri-core').style.setProperty('--seat', colour(r.turnId));
      $('#turn').innerHTML = !meAlive ? `You're out. Watching <b>${esc(nameOf(r.turnId))}</b>.` : mine ? '<b>Your turn!</b>' : `<b>${esc(nameOf(r.turnId))}</b>'s turn`;
      const input = $('#answer'), btn = $('#playbtn');
      input.disabled = btn.disabled = !mine;
      input.placeholder = mine ? `A character or anime starting with ${r.letter.toUpperCase()}` : `Waiting for ${nameOf(r.turnId)}…`;
      if (mine && !myTurnBefore) { input.value = ''; input.focus(); say(r.log); navigator.vibrate?.(120); $('#appeal').hidden = true; }
      if (!mine) { say(r.log); $('#appeal').hidden = true; }
      myTurnBefore = mine;
      $('#chain').innerHTML = r.chain.slice().reverse().map((w) => `<li style="--seat:${colour(w.by)}"><b>${esc(w.text)}</b>
        <small>${esc(w.name)} · ${w.manual ? 'Host ruling' : w.kind === 'anime' ? 'Anime' : esc(w.anime || 'Character')}</small></li>`).join('');
      const ch = $('#choose');
      ch.hidden = !r.pending;
      ch.innerHTML = r.pending ? `<p>Which one do you mean?</p>${r.pending.map((o) => `<button type="button" data-opt="${esc(o.id)}"><b>${esc(o.text)}</b><small>${o.kind === 'anime' ? 'Anime' : esc(o.anime || 'Character')}</small></button>`).join('')}` : '';
      ch.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => send('choose', { option: b.dataset.opt })));
    }
    // Count down locally from the server's "ms left", re-anchored on every poll.
    function startClock() {
      cancelAnimationFrame(frame); clearInterval(slowTick);
      const fill = $('#fill'), secs = $('#secs'), timer = $('.timer');
      if (!fill) return;
      const until = performance.now() + r.leftMs;
      const draw = () => {
        const left = r.paused ? r.leftMs : Math.max(0, until - performance.now());
        fill.style.transform = `scaleX(${left / r.limitMs})`;
        secs.textContent = r.paused ? 'Paused' : Math.ceil(left / 1000);
        timer.classList.toggle('low', !r.paused && left <= 5000);
        if (!r.paused && left > 0 && !reduce.matches) frame = requestAnimationFrame(draw);
      };
      if (reduce.matches) slowTick = setInterval(draw, 250);
      draw();
    }
    function hostSheet() {
      const o = document.getElementById('overlay');
      o.innerHTML = `<div class="panel board shiri-host" role="dialog" aria-modal="true" aria-labelledby="host-h">
        <h2 class="display gold-text" id="host-h">Host ruling</h2>
        <p class="muted">Ask event staff. Is this a real anime character or title starting with ${r.letter.toUpperCase()}?</p>
        <div class="field"><label for="host-answer">Answer</label><input id="host-answer" maxlength="80" value="${esc(lastTyped)}"></div>
        <div class="field"><label for="host-pin">Host PIN</label><input id="host-pin" type="password" inputmode="numeric" autocomplete="off"></div>
        <p class="hint err" id="host-err" hidden></p>
        <div class="form-foot" style="gap:12px"><button class="btn btn-ghost" id="host-no" type="button">Reject</button><button class="btn" id="host-yes" type="button"><span class="badge">${icon('star')}</span>Accept</button></div>
      </div>`;
      o.hidden = false; o.querySelector('#host-pin').focus();
      const decide = async (accept) => {
        const e = o.querySelector('#host-err'); e.hidden = true;
        try {
          const res = await call('POST', `/api/shiritori/rooms/${code}/rule`, { pin: o.querySelector('#host-pin').value, accept, text: o.querySelector('#host-answer').value }, token);
          if (res.result.status === 'rejected') { e.textContent = res.result.reason; e.hidden = false; return; }
          o.hidden = true; apply(res.room);
        } catch (ex) { e.textContent = ex.message; e.hidden = false; }
      };
      o.querySelector('#host-yes').addEventListener('click', () => decide(true));
      o.querySelector('#host-no').addEventListener('click', () => decide(false));
    }

    /* Results */
    function drawOver() {
      cancelAnimationFrame(frame); clearInterval(slowTick); stop(); dropToken(code);
      document.getElementById('overlay').hidden = true;
      const winner = r.players.find((p) => p.id === r.winnerId);
      // Winner first, then whoever lasted longest.
      const ranked = r.players.slice().sort((a, b) => (b.id === r.winnerId) - (a.id === r.winnerId) || (b.out ?? 99) - (a.out ?? 99));
      app.innerHTML = `
        <section class="panel result screen">
          <span class="eyebrow-star">${icon('star')} ${esc(r.reason || 'Game over')}</span>
          <p class="score gold-text">${esc(winner?.name || 'No winner')}</p>
          <h1 class="display">${winner?.id === r.you.id ? 'You win!' : 'wins the room'}</h1>
          <ol class="shiri-rank">${ranked.map((p, i) => `<li><span class="rank">${i + 1}</span><b>${esc(p.name)}</b><span>${p.words} ${p.words === 1 ? 'word' : 'words'}</span><b>${p.score}</b></li>`).join('')}</ol>
          <p class="muted">Chain length: ${r.chain.length}. Scores are on today's leaderboard.</p>
          <div class="form-foot" style="gap:12px"><a class="btn btn-ghost" href="#/realm/${ev.realm}">Back to events</a><a class="btn" href="#/event/${ev.id}"><span class="badge">${icon('wish')}</span>New room</a></div>
        </section>`;
    }

    function stop() { clearInterval(poll); poll = 0; }
    setCleanup(() => { stop(); cancelAnimationFrame(frame); clearInterval(slowTick); document.getElementById('overlay').hidden = true; });
    app.innerHTML = '<section class="panel result screen"><p class="muted">Joining the room…</p></section>';
    call('GET', '/api/shiritori/info').then((i) => { hostOk = i.hostRuling; }).catch(() => {});
    refresh();
    poll = setInterval(refresh, POLL_MS);
  }

  return { setup, room };
}
