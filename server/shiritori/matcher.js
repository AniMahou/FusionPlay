// Name matching for Shiritori: turns whatever a player typed into anime titles or characters.
// No AI. An alias index built from AniList data, then progressively looser passes:
//   exact → romanization-loose → any word order → typos (scaled to length) → word-by-word for long titles.
import { readFileSync, existsSync } from 'node:fs';

/** Lowercase, strip accents and punctuation, collapse spaces. "Rintarō  Okabe!" → "rintaro okabe". */
export function normalize(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Forgiving key for romanized Japanese: the same name spelled different ways collapses to one key.
 * Rintarou/Rintaro, Gojou/Gojo, Tsunade/Tunade, Shimbun/Shinbun, Ohno/Ono, Seiya/Seya, Yuuki/Yuki.
 * Both the player's input and every alias go through it, so it only ever widens matches symmetrically.
 */
export function loosen(k) {
  return k.split(' ').filter((t) => t.length > 1).join(' ') // lone initials: "Monkey D Luffy"
    .replace(/tsu/g, 'tu').replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/dzu/g, 'zu').replace(/ji/g, 'zi').replace(/fu/g, 'hu')
    .replace(/sh/g, 's').replace(/ch/g, 't')
    .replace(/m(?=[bp])/g, 'n')
    .replace(/oh(?![aeiou])/g, 'o').replace(/ou/g, 'o').replace(/ei/g, 'e')
    .replace(/([a-z])\1+/g, '$1');
}
const sortedKey = (k) => k.split(' ').sort().join(' ');
/** The letters that count for the chain (digits and spaces ignored). */
export const chainLetters = (s) => normalize(s).replace(/[^a-z]/g, '');
// "Mugiwara no Luffy (麦わらのルフィ)" → "Mugiwara no Luffy"
const clean = (s) => String(s || '').replace(/\s*[(（][^)）]*[)）]/g, '').replace(/[.。]+$/, '').trim();
const isLatin = (s) => /[a-z]/i.test(s) && /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(s);

export function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Typos allowed grow with length: short names must be (loosely) exact.
const allowedTypos = (len) => (len < 5 ? 0 : len < 9 ? 1 : len < 16 ? 2 : len < 30 ? 3 : 4);
// Two words count as the same word if equal, a close typo, or one is a clear prefix of the other ("come"/"comedy").
function sameWord(a, b) {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  const cap = min >= 8 ? 2 : min >= 4 ? 1 : 0;
  return cap > 0 && editDistance(a, b, cap) <= cap;
}
// Share of words that line up between two multi-word names, in order-insensitive fashion.
function wordOverlap(ta, tb) {
  const used = new Set(); let hits = 0;
  for (const a of ta) { const j = tb.findIndex((b, i) => !used.has(i) && sameWord(a, b)); if (j >= 0) { used.add(j); hits++; } }
  return hits / Math.max(ta.length, tb.length);
}

// Words that make nicknames ("Straw Hat", "Masked Man") rather than names; never split those into aliases.
const COMMON_WORDS = new Set('the man men girl boy lady lord king queen prince princess hero demon devil god master captain doctor dark black white red blue green golden silver straw hat mask masked little big great old young first last mister miss sister brother saint knight witch hunter killer slayer beast angel'.split(' '));
const titleCase = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export class Matcher {
  constructor(entities) {
    this.entities = new Map();
    this.byKey = new Map(); this.byLoose = new Map(); this.bySorted = new Map();
    this.byFirst = new Map();      // first letter → aliases, for typo search
    this.byFirstWord = new Map();  // first loose word's first two letters → multi-word aliases
    this.surnames = new Map();     // loose surname → set of anime that have a character with it
    const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
    for (const e of entities) {
      this.entities.set(e.id, e);
      if (e.kind === 'character' && e.last && e.anime) add(this.surnames, loosen(normalize(e.last)), e.anime);
      const seen = new Set();
      for (const text of e.aliases) {
        const key = normalize(text);
        if (!key || seen.has(key) || chainLetters(text).length < 2) continue;
        seen.add(key);
        const lkey = loosen(key);
        if (!lkey) continue;
        const alias = { entity: e.id, text, key, lkey, words: lkey.split(' ') };
        add(this.byKey, key, alias); add(this.byLoose, lkey, alias); add(this.bySorted, sortedKey(lkey), alias);
        add(this.byFirst, lkey[0], alias);
        if (alias.words.length >= 3) for (const w of alias.words) if (w.length >= 3) add(this.byFirstWord, w.slice(0, 2), alias);
      }
    }
  }

  static fromSeed(path) {
    if (!existsSync(path)) return new Matcher([]);
    const { anime, characters } = JSON.parse(readFileSync(path, 'utf8'));
    const entities = [];
    for (const a of anime) {
      const full = [a.english, a.romaji, ...(a.synonyms || [])].map(clean).filter((n) => n && isLatin(n));
      // "Demon Slayer: Kimetsu no Yaiba" can also be played as "Demon Slayer"; "The Promised Neverland" as "Promised Neverland".
      const short = full.map((n) => n.split(/:\s| - /)[0].trim()).filter((n) => chainLetters(n).length >= 4);
      const noThe = full.filter((n) => /^the\s/i.test(n)).map((n) => n.replace(/^the\s+/i, ''));
      const names = [...full, ...short, ...noThe];
      if (names.length) entities.push({ id: `a${a.id}`, kind: 'anime', name: clean(a.english) || clean(a.romaji), pop: a.pop, aliases: names });
    }
    for (const c of characters) {
      const full = clean(c.full);
      if (!full || !isLatin(full)) continue;
      const parts = full.split(/\s+/);
      const names = [full];
      if (parts.length === 2) names.push(`${parts[1]} ${parts[0]}`); // either name order
      if (parts.length > 2) names.push(`${parts.at(-1)} ${parts[0]}`, `${parts[0]} ${parts.at(-1)}`);
      for (const n of [c.first, c.last].map(clean)) if (n && chainLetters(n).length >= 3 && isLatin(n)) names.push(n); // first or last name alone
      for (const alt of (c.alternative || []).map(clean)) {
        if (!alt || !isLatin(alt)) continue;
        names.push(alt);
        // Two-word alternative names that look like a person's name ("Uchiha Obito") also work reversed and in parts.
        const w = alt.split(/\s+/);
        if (w.length === 2 && w.every((x) => /^[A-Z][a-z]+$/.test(x) && !COMMON_WORDS.has(x.toLowerCase()))) {
          names.push(`${w[1]} ${w[0]}`);
          for (const x of w) if (x.length >= 4) names.push(x);
        }
      }
      entities.push({ id: `c${c.id}`, kind: 'character', name: full, anime: c.anime, pop: c.pop, last: clean(c.last) || null, aliases: names });
    }
    return new Matcher(entities);
  }

  get size() { return this.entities.size; }

  /**
   * Resolve `input`. Returns matches grouped by entity, best first:
   * [{ entity, alias, quality }] — 0 exact, 1 loose spelling, 2 word order, 3–6 typos, 7+ word-by-word.
   */
  lookup(input) {
    const key = normalize(input);
    if (!key) return [];
    const lkey = loosen(key);
    if (!lkey) return [];
    const hits = [];
    for (const a of this.byKey.get(key) || []) hits.push([a, 0]);
    for (const a of this.byLoose.get(lkey) || []) hits.push([a, 1]);
    for (const a of this.bySorted.get(sortedKey(lkey)) || []) hits.push([a, 2]);
    if (!hits.length) {
      const cap = allowedTypos(lkey.replace(/ /g, '').length);
      if (cap) for (const a of this.byFirst.get(lkey[0]) || []) {
        const d = editDistance(lkey, a.lkey, cap);
        if (d <= cap) hits.push([a, 2 + d]);
      }
    }
    const words = lkey.split(' ');
    if (!hits.length && words.length >= 2) {
      // "Levi Ackerman": one word is a known name, the other is a surname used in that character's anime.
      for (const [given, family] of [[words[0], words.at(-1)], [words.at(-1), words[0]]]) {
        const shows = this.surnames.get(family);
        if (!shows) continue;
        for (const a of this.byLoose.get(given) || []) {
          const e = this.entities.get(a.entity);
          if (e.kind === 'character' && shows.includes(e.anime)) hits.push([{ ...a, text: `${given === words[0] ? `${a.text} ${titleCase(family)}` : `${titleCase(family)} ${a.text}`}`, key: lkey }, 3]);
        }
      }
    }
    if (!hits.length && words.length >= 3) {
      // Long titles typed from memory: line them up word by word.
      const pool = new Set();
      for (const w of words) if (w.length >= 3) for (const a of this.byFirstWord.get(w.slice(0, 2)) || []) pool.add(a);
      for (const a of pool) {
        const s = wordOverlap(words, a.words);
        if (s >= 0.75) hits.push([a, 7 + (1 - s) * 4]);
      }
    }
    // One row per entity, keeping its best alias; prefer the alias spelled in the player's word order.
    const best = new Map();
    for (const [alias, q] of hits) {
      const orderBonus = alias.lkey.split(' ')[0] === words[0] ? 0 : 0.5;
      const score = q + orderBonus, cur = best.get(alias.entity);
      if (!cur || score < cur.score) best.set(alias.entity, { entity: this.entities.get(alias.entity), alias, quality: Math.floor(q), score });
    }
    return [...best.values()].sort((x, y) => x.score - y.score || y.entity.pop - x.entity.pop);
  }
}
