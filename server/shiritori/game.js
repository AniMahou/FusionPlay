// Anime Shiritori: 1v1 games, refereed on the server. Games live in memory; results go to the plays table.
import { randomBytes } from 'node:crypto';
import { normalize, chainLetters } from './matcher.js';

const GRACE_MS = 1500;          // network slack after the visible timer hits zero
const WORD_POINTS = 100, WIN_BONUS = 300;
// Starting letters that have plenty of answers.
const START_LETTERS = 'abcdeghikmnorstuy';

export class ShiritoriGames {
  constructor({ matcher, db }) { this.matcher = matcher; this.db = db; this.games = new Map(); }

  create(event, players) {
    const id = randomBytes(8).toString('hex');
    const ins = this.db.prepare('INSERT INTO participants (name, contact, team) VALUES (?, ?, ?)');
    const play = this.db.prepare('INSERT INTO plays (participant_id, event_id) VALUES (?, ?)');
    const ps = players.map((p) => {
      const pid = ins.run(p.name, p.contact, p.team || '').lastInsertRowid;
      return { name: p.name, playId: Number(play.run(pid, event.id).lastInsertRowid), words: 0 };
    });
    const g = { id, eventId: event.id, limitMs: event.time_limit * 1000, players: ps, turn: 0,
      letter: START_LETTERS[Math.floor(Math.random() * START_LETTERS.length)],
      deadline: 0, pausedLeft: null, used: new Set(), chain: [], pending: null, status: 'playing', winner: null, reason: '' };
    g.deadline = Date.now() + g.limitMs;
    this.games.set(id, g);
    return g;
  }

  get(id) { const g = this.games.get(id); if (g) this.#checkClock(g); return g; }

  #checkClock(g) {
    if (g.status === 'playing' && g.pausedLeft === null && Date.now() > g.deadline + GRACE_MS) this.#end(g, 1 - g.turn, `${g.players[g.turn].name} ran out of time`);
  }

  #end(g, winner, reason) {
    g.status = 'over'; g.winner = winner; g.reason = reason; g.pending = null;
    const upd = this.db.prepare("UPDATE plays SET score = ?, finished_at = datetime('now') WHERE id = ?");
    g.players.forEach((p, i) => upd.run(p.words * WORD_POINTS + (i === winner ? WIN_BONUS : 0), p.playId));
  }

  #accept(g, entry) {
    const p = g.players[g.turn];
    for (const k of [].concat(entry.usedKey)) g.used.add(k);
    g.chain.push({ by: g.turn, text: entry.text, kind: entry.kind, anime: entry.anime || null, manual: !!entry.manual });
    p.words++;
    const letters = chainLetters(entry.text);
    g.letter = letters.at(-1);
    g.turn = 1 - g.turn; g.pending = null; g.pausedLeft = null;
    g.deadline = Date.now() + g.limitMs;
    return { status: 'accepted', text: entry.text };
  }

  /** A player submits text. Returns accepted / choose / rejected with a reason the player can act on. */
  play(g, player, text) {
    this.#checkClock(g);
    if (g.status !== 'playing') return { status: 'over' };
    if (player !== g.turn) return { status: 'rejected', reason: "It's not your turn." };
    if (g.pausedLeft !== null) return { status: 'rejected', reason: 'Waiting for the host ruling.' };
    const typed = String(text || '').trim().slice(0, 80);
    if (!chainLetters(typed)) return { status: 'rejected', reason: 'Type a character or anime name.' };

    const all = this.matcher.lookup(typed);
    if (!all.length) return { status: 'rejected', reason: `We couldn't find "${typed}". Check the spelling, or ask the host to rule.`, canAppeal: true };
    // Keep matches of the best quality that start with the required letter and haven't been used.
    const fits = all.filter((m) => chainLetters(m.alias.text)[0] === g.letter);
    if (!fits.length) return { status: 'rejected', reason: `${all[0].alias.text} doesn't start with "${g.letter.toUpperCase()}".` };
    // Anime with the same name (every "Demon Slayer" season) count as one answer.
    const titleKey = (m) => `t:${m.alias.key}`;
    const isUsed = (m) => g.used.has(m.entity.id) || (m.entity.kind === 'anime' && g.used.has(titleKey(m)));
    const fresh = fits.filter((m) => !isUsed(m));
    if (!fresh.length) return { status: 'rejected', reason: `${fits[0].alias.text} has already been played.` };
    const top = fresh[0].quality;
    const seenTitle = new Set();
    const tied = fresh.filter((m) => m.quality === top)
      .filter((m) => m.entity.kind !== 'anime' || (!seenTitle.has(m.alias.key) && seenTitle.add(m.alias.key)))
      .slice(0, 4);
    if (tied.length > 1) {
      g.pending = tied.map((m) => ({ id: m.entity.id, text: m.alias.text, kind: m.entity.kind, anime: m.entity.anime || null, usedKey: m.entity.kind === 'anime' ? [m.entity.id, titleKey(m)] : m.entity.id }));
      return { status: 'choose', options: g.pending.map(({ usedKey, ...o }) => o) };
    }
    const m = tied[0];
    return this.#accept(g, { usedKey: m.entity.kind === 'anime' ? [m.entity.id, titleKey(m)] : m.entity.id, text: m.alias.text, kind: m.entity.kind, anime: m.entity.anime });
  }

  /** The player picks one of several equally good matches. */
  choose(g, player, optionId) {
    this.#checkClock(g);
    if (g.status !== 'playing' || player !== g.turn || !g.pending) return { status: 'rejected', reason: 'Nothing to choose.' };
    const o = g.pending.find((x) => x.id === optionId);
    if (!o) return { status: 'rejected', reason: 'Pick one of the listed options.' };
    return this.#accept(g, { usedKey: o.usedKey, text: o.text, kind: o.kind, anime: o.anime });
  }

  /** Pause the clock while the host rules on an answer the index doesn't know. */
  appeal(g, player) {
    this.#checkClock(g);
    if (g.status !== 'playing' || player !== g.turn) return { status: 'rejected', reason: 'Only the current player can ask.' };
    if (g.pausedLeft === null) g.pausedLeft = Math.max(0, g.deadline - Date.now());
    return { status: 'paused' };
  }

  rule(g, accept, text) {
    if (g.status !== 'playing' || g.pausedLeft === null) return { status: 'rejected', reason: 'No ruling is pending.' };
    const typed = String(text || '').trim().slice(0, 80);
    const letters = chainLetters(typed);
    if (accept) {
      if (!letters || letters[0] !== g.letter) return { status: 'rejected', reason: `It must start with "${g.letter.toUpperCase()}".` };
      const usedKey = `m:${normalize(typed)}`;
      if (g.used.has(usedKey)) return { status: 'rejected', reason: 'That answer has already been played.' };
      return this.#accept(g, { usedKey, text: typed, kind: 'manual', manual: true });
    }
    g.deadline = Date.now() + g.pausedLeft; g.pausedLeft = null;
    return { status: 'resumed' };
  }

  forfeit(g, player) {
    if (g.status === 'playing') this.#end(g, 1 - player, `${g.players[player].name} gave up`);
    return { status: 'over' };
  }

  /** What the screen needs. Timer is sent as milliseconds left, so client clocks don't matter. */
  view(g) {
    return {
      id: g.id, status: g.status, turn: g.turn, letter: g.letter, limitMs: g.limitMs,
      leftMs: g.pausedLeft ?? Math.max(0, g.deadline - Date.now()), paused: g.pausedLeft !== null,
      players: g.players.map((p, i) => ({ name: p.name, words: p.words, score: p.words * WORD_POINTS + (g.winner === i ? WIN_BONUS : 0) })),
      chain: g.chain.slice(-40), pending: g.pending && g.pending.map(({ usedKey, ...o }) => o), winner: g.winner, reason: g.reason,
    };
  }

  // Drop finished games after an hour so memory stays small.
  sweep() { const cutoff = Date.now() - 3600e3; for (const [id, g] of this.games) if (g.deadline < cutoff) this.games.delete(id); }
}
