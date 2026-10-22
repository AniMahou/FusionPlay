// Name matching for Shiritori: turns whatever a player typed into one anime or character.
// No AI: an alias index built from AniList data, then exact → loose → word-order → fuzzy matching.
import { readFileSync, existsSync } from 'node:fs';

/** Lowercase, strip accents and punctuation, collapse spaces. "Rintarō  Okabe!" → "rintaro okabe". */
export function normalize(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Forgiving key: long vowels and doubled letters collapse. "rintarou" and "rintaro" → "rintaro". */
export const loosen = (k) => k.split(' ').filter((t) => t.length > 1).join(' ') // lone initials: "Monkey D Luffy"
  .replace(/ou/g, 'o').replace(/([a-z])\1+/g, '$1');
const sortedKey = (k) => k.split(' ').sort().join(' ');
/** The letters that count for the chain (digits and spaces ignored). */
export const chainLetters = (s) => normalize(s).replace(/[^a-z]/g, '');
// "Mugiwara no Luffy (麦わらのルフィ)" → "Mugiwara no Luffy"
const clean = (s) => String(s || '').replace(/\s*[(（][^)）]*[)）]/g, '').trim();
const isLatin = (s) => /[a-z]/i.test(s) && /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(s);

function editDistance(a, b, cap) {
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
// Typos allowed grow with length: short names must be exact.
const allowedTypos = (len) => (len < 5 ? 0 : len < 9 ? 1 : 2);

export class Matcher {
  constructor(entities) {
    this.entities = new Map();
    this.byKey = new Map(); this.byLoose = new Map(); this.bySorted = new Map();
    this.byFirst = new Map(); // first letter → aliases, for fuzzy search
    const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
    for (const e of entities) {
      this.entities.set(e.id, e);
      const seen = new Set();
      for (const text of e.aliases) {
        const key = normalize(text);
        if (!key || seen.has(key) || !chainLetters(text)) continue;
        seen.add(key);
        const alias = { entity: e.id, text, key, lkey: loosen(key) };
        add(this.byKey, key, alias); add(this.byLoose, alias.lkey, alias); add(this.bySorted, sortedKey(key), alias);
        add(this.byFirst, alias.lkey[0], alias);
      }
    }
  }

  static fromSeed(path) {
    if (!existsSync(path)) return new Matcher([]);
    const { anime, characters } = JSON.parse(readFileSync(path, 'utf8'));
    const entities = [];
    for (const a of anime) {
      const full = [a.english, a.romaji, ...a.synonyms].map(clean).filter((n) => n && isLatin(n));
      // "Demon Slayer: Kimetsu no Yaiba" can also be played as "Demon Slayer".
      const short = full.map((n) => n.split(/:\s| - /)[0].trim()).filter((n) => chainLetters(n).length >= 4);
      const names = [...full, ...short];
      if (names.length) entities.push({ id: `a${a.id}`, kind: 'anime', name: a.english || a.romaji, pop: a.pop, aliases: names });
    }
    for (const c of characters) {
      if (!c.full || !isLatin(c.full)) continue;
      const parts = c.full.split(/\s+/);
      const names = [c.full];
      if (parts.length === 2) names.push(`${parts[1]} ${parts[0]}`); // either name order
      if (c.first && c.first.length >= 3 && isLatin(c.first)) names.push(c.first);
      for (const alt of c.alternative.map(clean)) if (alt && isLatin(alt)) names.push(alt);
      entities.push({ id: `c${c.id}`, kind: 'character', name: c.full, anime: c.anime, pop: c.pop, aliases: names });
    }
    return new Matcher(entities);
  }

  get size() { return this.entities.size; }

  /**
   * Resolve `input`. Returns the best matches, grouped by entity, best first:
   * [{ entity, alias, quality }] where quality 0 = exact, 1 = loose, 2 = word order, 3+ = typos.
   */
  lookup(input) {
    const key = normalize(input);
    if (!key) return [];
    const lkey = loosen(key);
    const hits = [];
    for (const a of this.byKey.get(key) || []) hits.push([a, 0]);
    for (const a of this.byLoose.get(lkey) || []) hits.push([a, 1]);
    for (const a of this.bySorted.get(sortedKey(key)) || []) hits.push([a, 2]);
    if (!hits.length) {
      const cap = allowedTypos(lkey.length);
      if (cap) for (const a of this.byFirst.get(lkey[0]) || []) {
        const d = editDistance(lkey, a.lkey, cap);
        if (d <= cap) hits.push([a, 2 + d]);
      }
    }
    // One row per entity, keeping its best alias; prefer the alias spelled in the player's word order.
    const best = new Map();
    for (const [alias, q] of hits) {
      const cur = best.get(alias.entity);
      const orderBonus = alias.key.split(' ')[0] === key.split(' ')[0] ? 0 : 0.5;
      const score = q + orderBonus;
      if (!cur || score < cur.score) best.set(alias.entity, { entity: this.entities.get(alias.entity), alias, quality: q, score });
    }
    return [...best.values()].sort((x, y) => x.score - y.score || y.entity.pop - x.entity.pop);
  }
}
