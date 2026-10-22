// Anime Shiritori rooms: anyone creates a room, others join with its code, everyone readies up,
// the room host starts. Turns go round the table; whoever runs out of time is knocked out.
// The server is the only referee: it owns the turn order, the clock and every ruling.
import { randomBytes, randomInt } from 'node:crypto';
import { normalize, chainLetters } from './matcher.js';

const GRACE_MS = 1200;           // network slack after a player's visible timer hits zero
const MAX_PLAYERS = 12;
const ROOM_TTL_MS = 3 * 3600e3;  // idle rooms are cleared after three hours
const WORD_POINTS = 100, WIN_BONUS = 300;
const START_LETTERS = 'abcdeghikmnorstuy';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L to avoid misreads

export class ShiritoriRooms {
  constructor({ matcher, db }) {
    this.matcher = matcher; this.db = db; this.rooms = new Map();
    this.timer = setInterval(() => this.tick(), 400); this.timer.unref?.();
  }

  /* ---------- Lobby ---------- */
  #newCode() {
    let code;
    do { code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (this.rooms.has(code));
    return code;
  }
  #addPlayer(room, name, contact) {
    const p = { id: randomBytes(4).toString('hex'), token: randomBytes(16).toString('hex'), name, contact, ready: false, alive: true, words: 0, out: null, playId: null };
    room.players.push(p); room.version++;
    return p;
  }
  create(event, name, contact) {
    const room = { code: this.#newCode(), eventId: event.id, limitMs: event.time_limit * 1000, status: 'lobby', players: [], hostId: null,
      turnId: null, letter: null, deadline: 0, pausedLeft: null, used: new Set(), chain: [], pending: null, winnerId: null, reason: '', log: '', version: 1, touched: Date.now() };
    const p = this.#addPlayer(room, name, contact);
    room.hostId = p.id;
    this.rooms.set(room.code, room);
    return { room, player: p };
  }
  join(room, name, contact) {
    if (room.status !== 'lobby') throw new Error('This game has already started.');
    if (room.players.length >= MAX_PLAYERS) throw new Error(`This room is full (${MAX_PLAYERS} players).`);
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Someone in this room already uses that name.');
    return this.#addPlayer(room, name, contact);
  }
  get(code) { const r = this.rooms.get(String(code || '').toUpperCase()); if (r) r.touched = Date.now(); return r; }
  player(room, token) { return room.players.find((p) => p.token === token); }

  setReady(room, p, ready) {
    if (room.status !== 'lobby') return;
    p.ready = !!ready; room.version++;
  }
  /** Leaving the lobby removes you; leaving mid-game knocks you out. */
  leave(room, p) {
    if (room.status === 'lobby') {
      room.players = room.players.filter((x) => x !== p);
      if (!room.players.length) { this.rooms.delete(room.code); return; }
      if (room.hostId === p.id) room.hostId = room.players[0].id; // host passes to the next player
      room.version++;
    } else if (room.status === 'playing' && p.alive) {
      this.#knockOut(room, p, `${p.name} left the game`);
    }
  }
  canStart(room) {
    const others = room.players.filter((p) => p.id !== room.hostId);
    return room.status === 'lobby' && room.players.length >= 2 && others.every((p) => p.ready);
  }
  start(room, p) {
    if (p.id !== room.hostId) throw new Error('Only the room host can start.');
    if (room.players.length < 2) throw new Error('You need at least two players.');
    if (!this.canStart(room)) throw new Error('Wait until everyone is ready.');
    const ins = this.db.prepare('INSERT INTO participants (name, contact) VALUES (?, ?)');
    const play = this.db.prepare('INSERT INTO plays (participant_id, event_id) VALUES (?, ?)');
    for (const x of room.players) x.playId = Number(play.run(ins.run(x.name, x.contact).lastInsertRowid, room.eventId).lastInsertRowid);
    room.status = 'playing';
    room.letter = START_LETTERS[randomInt(START_LETTERS.length)];
    room.turnId = room.players[0].id;
    room.deadline = Date.now() + room.limitMs;
    room.log = `${room.players[0].name} goes first.`;
    room.version++;
  }

  /* ---------- Turns ---------- */
  #alive(room) { return room.players.filter((p) => p.alive); }
  #nextAfter(room, id) {
    const n = room.players.length, i = room.players.findIndex((p) => p.id === id);
    for (let k = 1; k <= n; k++) { const p = room.players[(i + k) % n]; if (p.alive) return p; }
    return null;
  }
  #save(p, room, won = false) {
    this.db.prepare("UPDATE plays SET score = ?, finished_at = datetime('now') WHERE id = ?").run(p.words * WORD_POINTS + (won ? WIN_BONUS : 0), p.playId);
  }
  #knockOut(room, p, why) {
    const wasTurn = room.turnId === p.id;
    p.alive = false; p.out = room.players.filter((x) => !x.alive).length; // 1 = first out
    this.#save(p, room);
    room.log = why;
    const left = this.#alive(room);
    if (left.length <= 1) {
      room.status = 'over'; room.pending = null; room.pausedLeft = null;
      const w = left[0];
      if (w) { room.winnerId = w.id; this.#save(w, room, true); room.reason = `${w.name} is the last one standing`; }
    } else if (wasTurn) {
      // The next player gets the same letter and a fresh clock.
      room.turnId = this.#nextAfter(room, p.id).id;
      room.pending = null; room.pausedLeft = null; room.deadline = Date.now() + room.limitMs;
    }
    room.version++;
  }
  tick() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === 'playing' && room.pausedLeft === null && now > room.deadline + GRACE_MS) {
        const p = room.players.find((x) => x.id === room.turnId);
        this.#knockOut(room, p, `${p.name} ran out of time and is out`);
      }
      if (now - room.touched > ROOM_TTL_MS) this.rooms.delete(room.code);
    }
  }
  #accept(room, p, entry) {
    for (const k of [].concat(entry.usedKey)) room.used.add(k);
    room.chain.push({ by: p.id, name: p.name, text: entry.text, kind: entry.kind, anime: entry.anime || null, manual: !!entry.manual });
    p.words++;
    room.letter = chainLetters(entry.text).at(-1);
    room.turnId = this.#nextAfter(room, p.id).id;
    room.pending = null; room.pausedLeft = null; room.deadline = Date.now() + room.limitMs;
    room.log = `${p.name} played ${entry.text}.`;
    room.version++;
    return { status: 'accepted', text: entry.text };
  }
  #onTurn(room, p) {
    if (room.status !== 'playing') return 'The game is not running.';
    if (!p.alive) return "You're out of this game.";
    if (room.turnId !== p.id) return "It's not your turn.";
    return null;
  }

  /** The current player submits an answer. */
  play(room, p, text) {
    const no = this.#onTurn(room, p); if (no) return { status: 'rejected', reason: no };
    if (room.pausedLeft !== null) return { status: 'rejected', reason: 'Waiting for the host ruling.' };
    const typed = String(text || '').trim().slice(0, 80);
    if (!chainLetters(typed)) return { status: 'rejected', reason: 'Type a character or anime name.' };
    const all = this.matcher.lookup(typed);
    if (!all.length) return { status: 'rejected', reason: `We couldn't find "${typed}". Check the spelling, or ask the host to rule.`, canAppeal: true };
    const fits = all.filter((m) => chainLetters(m.alias.text)[0] === room.letter);
    if (!fits.length) return { status: 'rejected', reason: `${all[0].alias.text} doesn't start with "${room.letter.toUpperCase()}".` };
    // Every season of an anime counts as the same answer.
    const titleKey = (m) => `t:${m.alias.key}`;
    const isUsed = (m) => room.used.has(m.entity.id) || (m.entity.kind === 'anime' && room.used.has(titleKey(m)));
    const fresh = fits.filter((m) => !isUsed(m));
    if (!fresh.length) return { status: 'rejected', reason: `${fits[0].alias.text} has already been played.` };
    const top = fresh[0].quality, seen = new Set();
    const tied = fresh.filter((m) => m.quality === top)
      .filter((m) => m.entity.kind !== 'anime' || (!seen.has(m.alias.key) && seen.add(m.alias.key))).slice(0, 4);
    const option = (m) => ({ id: m.entity.id, text: m.alias.text, kind: m.entity.kind, anime: m.entity.anime || null, usedKey: m.entity.kind === 'anime' ? [m.entity.id, titleKey(m)] : m.entity.id });
    if (tied.length > 1) { room.pending = tied.map(option); room.version++; return { status: 'choose' }; }
    return this.#accept(room, p, option(tied[0]));
  }
  choose(room, p, optionId) {
    const no = this.#onTurn(room, p); if (no) return { status: 'rejected', reason: no };
    const o = room.pending?.find((x) => x.id === optionId);
    if (!o) return { status: 'rejected', reason: 'Pick one of the listed options.' };
    return this.#accept(room, p, o);
  }
  /** Pause the clock while event staff rule on an answer the index doesn't know. */
  appeal(room, p) {
    const no = this.#onTurn(room, p); if (no) return { status: 'rejected', reason: no };
    if (room.pausedLeft === null) { room.pausedLeft = Math.max(0, room.deadline - Date.now()); room.log = `${p.name} asked the host for a ruling.`; room.version++; }
    return { status: 'paused' };
  }
  rule(room, accept, text) {
    if (room.status !== 'playing' || room.pausedLeft === null) return { status: 'rejected', reason: 'No ruling is pending.' };
    const p = room.players.find((x) => x.id === room.turnId);
    if (!accept) { room.deadline = Date.now() + room.pausedLeft; room.pausedLeft = null; room.log = 'The host rejected that answer.'; room.version++; return { status: 'resumed' }; }
    const typed = String(text || '').trim().slice(0, 80), letters = chainLetters(typed);
    if (!letters || letters[0] !== room.letter) return { status: 'rejected', reason: `It must start with "${room.letter.toUpperCase()}".` };
    const usedKey = `m:${normalize(typed)}`;
    if (room.used.has(usedKey)) return { status: 'rejected', reason: 'That answer has already been played.' };
    return this.#accept(room, p, { usedKey, text: typed, kind: 'manual', manual: true });
  }

  /** What every screen in the room sees. `you` is filled in for the player asking. */
  view(room, me) {
    const leftMs = room.status !== 'playing' ? 0 : room.pausedLeft ?? Math.max(0, room.deadline - Date.now());
    return {
      code: room.code, eventId: room.eventId, status: room.status, version: room.version, limitMs: room.limitMs, leftMs, paused: room.pausedLeft !== null,
      letter: room.letter, turnId: room.turnId, hostId: room.hostId, canStart: this.canStart(room), log: room.log, reason: room.reason, winnerId: room.winnerId,
      players: room.players.map((p) => ({ id: p.id, name: p.name, ready: p.ready, alive: p.alive, words: p.words, out: p.out,
        score: p.words * WORD_POINTS + (room.winnerId === p.id ? WIN_BONUS : 0) })),
      chain: room.chain.slice(-40),
      pending: me && room.turnId === me.id && room.pending ? room.pending.map(({ usedKey, ...o }) => o) : null,
      you: me ? { id: me.id, isHost: me.id === room.hostId } : null,
    };
  }
}
