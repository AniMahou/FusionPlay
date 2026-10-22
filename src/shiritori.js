// Anime Shiritori on the kiosk: two-player sign-up, then the 1v1 board.
// The server referees every turn; this file only shows state and sends what players type.

const RESULT_SECONDS = 15;

export function createShiritori(ctx) {
  const { app, api, esc, icon, setTheme, setMusic, realmName, reduce, setCleanup } = ctx;

  /* ---------- Sign-up: rules on the left, two players on the right ---------- */
  function setup(ev) {
    setTheme(ev.theme);
    setMusic(ev.theme.bgm, `${ev.theme.name} theme`, { src: `/media/${ev.realm}/realm.mp3`, label: `${realmName(ev.realm)} theme` });
    const field = (n, key, label, ph, req = true) => `<div class="field"><label for="p${n}-${key}">${label}</label>
      <input id="p${n}-${key}" autocomplete="off" maxlength="${key === 'contact' ? 120 : 20}" placeholder="${ph}" ${req ? 'required' : ''}></div>`;
    app.innerHTML = `
      <a class="btn btn-ghost btn-sm screen" href="#/realm/${ev.realm}"><span class="badge">${icon('back')}</span>${esc(realmName(ev.realm))} events</a>
      <section class="event-page shiri-setup screen">
        <div class="event-intro">
          <span class="eyebrow-star">${icon('wish')} 1v1 word chain</span>
          <p class="theme-name display gold-text">Shiritori</p>
          <h1 class="display">${esc(ev.name)}</h1>
          <ol class="shiri-rules">
            <li>Take turns naming an <b>anime character</b> or an <b>anime title</b>.</li>
            <li>Your answer must start with the <b>last letter</b> of the previous one.</li>
            <li>Spelling is corrected to the official name, and either name order works. The official spelling sets the next letter.</li>
            <li><b>${ev.timeLimit} seconds</b> a turn. Run out of time and you lose.</li>
            <li>No repeats. A name we don't know? Ask the host to rule.</li>
          </ol>
        </div>
        <div class="panel register">
          <h2 class="display gold-text">Two players</h2>
          <p class="sub">Both names go on today's leaderboard.</p>
          <form novalidate>
            <div class="shiri-seat"><span class="seat-tag p1">Player 1</span>${field(1, 'name', 'Name', 'Hana')}${field(1, 'contact', 'Email or phone', 'hana@example.com')}</div>
            <div class="shiri-seat"><span class="seat-tag p2">Player 2</span>${field(2, 'name', 'Name', 'Ren')}${field(2, 'contact', 'Email or phone', 'ren@example.com')}</div>
            <p class="hint err" id="form-error" hidden></p>
            <div class="form-foot"><button class="btn" type="submit"><span class="badge">${icon('wish')}</span>Start the duel</button></div>
          </form>
        </div>
      </section>`;
    const form = app.querySelector('form'), err = app.querySelector('#form-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => app.querySelector(`#${id}`).value.trim();
      const players = [1, 2].map((n) => ({ name: val(`p${n}-name`), contact: val(`p${n}-contact`) }));
      const missingField = ['p1-name', 'p1-contact', 'p2-name', 'p2-contact'].find((id) => !val(id));
      if (missingField) { err.textContent = 'Fill in a name and an email or phone for both players.'; err.hidden = false; app.querySelector(`#${missingField}`).focus(); return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; err.hidden = true;
      try {
        const g = await api('/api/shiritori/games', { eventId: ev.id, players });
        location.hash = `#/shiritori/${ev.id}/${g.id}`;
      } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    });
  }

  /* ---------- The board ---------- */
  async function board(ev, gameId) {
    setTheme(ev.theme);
    setMusic(ev.theme.bgm, `${ev.theme.name} theme`, { src: `/media/${ev.realm}/realm.mp3`, label: `${realmName(ev.realm)} theme` });
    let g, lastTyped = '', ticking = 0, slowTick = 0, frame = 0, endTimer = 0, hostOk = false;
    try { [g, { hostRuling: hostOk }] = await Promise.all([api(`/api/shiritori/games/${gameId}`), api('/api/shiritori/info')]); }
    catch (ex) { app.innerHTML = `<section class="panel result screen"><h1 class="display">${esc(ex.message)}</h1><a class="btn" href="#/event/${ev.id}"><span class="badge">${icon('wish')}</span>New game</a></section>`; return; }

    app.innerHTML = `
      <section class="shiri screen">
        <div class="shiri-players">${[0, 1].map((i) => `<div class="shiri-player p${i + 1}" data-seat="${i}"><span class="seat-tag p${i + 1}">Player ${i + 1}</span><b class="pname"></b><span class="pwords"></span></div>`).join('')}</div>
        <div class="panel shiri-core">
          <div class="shiri-letter"><span class="muted">Starts with</span><b id="letter"></b></div>
          <div class="timer" role="timer" aria-label="Seconds left"><div class="timer-track"><div class="timer-fill" id="fill"></div></div><span class="timer-num" id="secs"></span></div>
          <form class="shiri-input" novalidate>
            <label class="sr-only" for="answer">Your answer</label>
            <input id="answer" autocomplete="off" spellcheck="false" maxlength="80" placeholder="A character or an anime">
            <button class="btn" type="submit"><span class="badge">${icon('play')}</span>Play</button>
          </form>
          <p class="shiri-msg" id="msg" aria-live="polite"></p>
          <div class="shiri-choose" id="choose" hidden></div>
          <div class="shiri-actions"><button class="link" id="appeal" type="button" hidden>Ask the host to rule</button><button class="link" id="forfeit" type="button">Give up</button></div>
        </div>
        <ol class="shiri-chain" id="chain" aria-label="Words played"></ol>
      </section>`;
    const $ = (s) => app.querySelector(s);
    const input = $('#answer'), msg = $('#msg');
    const say = (text, kind = '') => { msg.textContent = text; msg.className = `shiri-msg ${kind}`; };

    function render() {
      app.querySelectorAll('.shiri-player').forEach((el, i) => {
        el.classList.toggle('active', g.status === 'playing' && g.turn === i);
        el.querySelector('.pname').textContent = g.players[i].name;
        el.querySelector('.pwords').textContent = `${g.players[i].words} ${g.players[i].words === 1 ? 'word' : 'words'}`;
      });
      $('#letter').textContent = g.letter.toUpperCase();
      $('.shiri-core').dataset.seat = g.turn;
      input.placeholder = `${g.players[g.turn].name}: a character or anime starting with ${g.letter.toUpperCase()}`;
      $('#chain').innerHTML = g.chain.slice().reverse().map((w) => `<li class="p${w.by + 1}"><b>${esc(w.text)}</b><small>${w.manual ? 'Host ruling' : w.kind === 'anime' ? 'Anime' : esc(w.anime || 'Character')}</small></li>`).join('');
      const ch = $('#choose');
      ch.hidden = !g.pending;
      ch.innerHTML = g.pending ? `<p>Which one do you mean?</p>${g.pending.map((o) => `<button type="button" data-opt="${esc(o.id)}"><b>${esc(o.text)}</b><small>${o.kind === 'anime' ? 'Anime' : esc(o.anime || 'Character')}</small></button>`).join('')}` : '';
      ch.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => send('choose', { option: b.dataset.opt })));
      startClock();
      if (g.status === 'over') finish();
    }

    // Count down locally from the server's "ms left"; when it runs out, ask the server to settle it.
    function startClock() {
      cancelAnimationFrame(frame); clearTimeout(ticking); clearInterval(slowTick);
      const fill = $('#fill'), secs = $('#secs'), timer = $('.timer');
      const until = performance.now() + g.leftMs;
      const draw = () => {
        const left = g.paused ? g.leftMs : Math.max(0, until - performance.now());
        fill.style.transform = `scaleX(${left / g.limitMs})`;
        secs.textContent = g.paused ? 'Paused' : Math.ceil(left / 1000);
        timer.classList.toggle('low', !g.paused && left <= 5000);
        if (!g.paused && g.status === 'playing' && left > 0 && !reduce.matches) frame = requestAnimationFrame(draw);
      };
      if (reduce.matches && !g.paused && g.status === 'playing') slowTick = setInterval(draw, 250);
      draw();
      if (g.status === 'playing' && !g.paused) ticking = setTimeout(async () => { g = await api(`/api/shiritori/games/${gameId}`).catch(() => g); render(); }, g.leftMs + 1700);
    }

    async function send(action, body = {}) {
      let r;
      try { r = await api(`/api/shiritori/games/${gameId}/${action}`, { player: g.turn, ...body }); }
      catch (ex) { say(ex.message, 'bad'); return null; }
      g = r.game;
      const res = r.result;
      $('#appeal').hidden = !(res.canAppeal && hostOk);
      if (res.status === 'accepted') { say(`${res.text}. Next letter: ${g.letter.toUpperCase()}`, 'good'); input.value = ''; }
      else if (res.status === 'rejected') say(res.reason, 'bad');
      else if (res.status === 'choose') say('Several names match. Pick the one you mean.');
      render();
      if (g.status === 'playing') input.focus();
      return res;
    }

    $('.shiri-input').addEventListener('submit', (e) => { e.preventDefault(); lastTyped = input.value.trim(); if (lastTyped) send('play', { text: lastTyped }); });
    $('#forfeit').addEventListener('click', () => { if (confirm(`${g.players[g.turn].name}, give up this game?`)) send('forfeit'); });
    $('#appeal').addEventListener('click', async () => { if ((await send('appeal'))?.status === 'paused') hostSheet(); });

    function hostSheet() {
      const o = document.getElementById('overlay');
      o.innerHTML = `<div class="panel board shiri-host" role="dialog" aria-modal="true" aria-labelledby="host-h">
        <h2 class="display gold-text" id="host-h">Host ruling</h2>
        <p class="muted">Is this a real anime character or title starting with ${g.letter.toUpperCase()}?</p>
        <div class="field"><label for="host-answer">Answer</label><input id="host-answer" maxlength="80" value="${esc(lastTyped)}"></div>
        <div class="field"><label for="host-pin">Host PIN</label><input id="host-pin" type="password" inputmode="numeric" autocomplete="off"></div>
        <p class="hint err" id="host-err" hidden></p>
        <div class="form-foot" style="gap:12px"><button class="btn btn-ghost" id="host-no" type="button">Reject</button><button class="btn" id="host-yes" type="button"><span class="badge">${icon('star')}</span>Accept</button></div>
      </div>`;
      o.hidden = false;
      o.querySelector('#host-pin').focus();
      const decide = async (accept) => {
        const e = o.querySelector('#host-err'); e.hidden = true;
        try {
          const r = await api(`/api/shiritori/games/${gameId}/rule`, { pin: o.querySelector('#host-pin').value, accept, text: o.querySelector('#host-answer').value });
          if (r.result.status === 'rejected') { e.textContent = r.result.reason; e.hidden = false; return; }
          g = r.game; o.hidden = true; input.value = '';
          say(accept ? `Host accepted. Next letter: ${g.letter.toUpperCase()}` : 'Host rejected that answer. Keep going.', accept ? 'good' : 'bad');
          $('#appeal').hidden = true; render(); input.focus();
        } catch (ex) { e.textContent = ex.message; e.hidden = false; }
      };
      o.querySelector('#host-yes').addEventListener('click', () => decide(true));
      o.querySelector('#host-no').addEventListener('click', () => decide(false));
    }

    function finish() {
      cancelAnimationFrame(frame); clearTimeout(ticking); clearInterval(slowTick);
      const w = g.winner, win = g.players[w], lose = g.players[1 - w];
      let left = RESULT_SECONDS;
      app.innerHTML = `
        <section class="panel result screen">
          <span class="eyebrow-star">${icon('star')} ${esc(g.reason)}</span>
          <p class="score gold-text">${esc(win.name)}</p>
          <h1 class="display">wins the duel</h1>
          <p class="muted">${esc(win.name)}: ${win.words} words, ${win.score} points · ${esc(lose.name)}: ${lose.words} words, ${lose.score} points</p>
          <p class="muted">Longest chain: ${g.chain.length} ${g.chain.length === 1 ? 'word' : 'words'}. Both scores are on today's leaderboard.</p>
          <hr class="rule" style="width:100%" />
          <div class="form-foot" style="gap:12px"><a class="btn btn-ghost" href="#/event/${ev.id}">Rematch</a><button class="btn" id="home"><span class="badge">${icon('wish')}</span>Next players</button></div>
          <p class="countdown">Returning to the start in <span id="count">${left}</span> seconds</p>
        </section>`;
      app.querySelector('#home').addEventListener('click', () => { location.hash = '#/'; });
      endTimer = setInterval(() => { left--; const c = app.querySelector('#count'); if (c) c.textContent = left; if (left <= 0) location.hash = '#/'; }, 1000);
    }

    setCleanup(() => { cancelAnimationFrame(frame); clearTimeout(ticking); clearInterval(slowTick); clearInterval(endTimer); document.getElementById('overlay').hidden = true; });
    render();
    input.focus();
  }

  return { setup, board };
}
