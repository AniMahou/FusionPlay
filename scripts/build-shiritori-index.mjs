// Builds server/seed/shiritori.json: popular anime titles and characters from AniList.
// Run once, offline from the game:  node scripts/build-shiritori-index.mjs   (about 8 minutes)
// AniList caps any list at 5,000 entries, so characters come from two passes:
//   1. the 5,000 most-favourited characters, and
//   2. the casts of the most popular anime (catches well-known side characters).
// Spoiler names are included: AniList files Obito as "Tobi" and keeps "Obito Uchiha" as a spoiler name.
import { writeFileSync, renameSync } from 'node:fs';

const ANIME_PAGES = 100;          // 50 per page → 5,000 titles (AniList's maximum)
const FAVOURITE_PAGES = 100;      // 50 per page → 5,000 characters (AniList's maximum)
const CAST_ANIME = 600;           // casts of this many top anime…
const CAST_PER_ANIME = 25;        // …their 25 best-loved characters each (AniList's maximum)
const PAUSE_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (res.status === 429) { const wait = (Number(res.headers.get('retry-after')) || 60) * 1000; console.log(`rate limited, waiting ${wait / 1000}s`); await sleep(wait); continue; }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.data) { console.log(`HTTP ${res.status}: ${body?.errors?.[0]?.message || 'no data'}, retrying`); await sleep(5000); continue; }
    return body.data;
  }
  throw new Error('AniList kept failing');
}
const progress = (label, i, n) => process.stdout.write(`${label} ${i}/${n}\r`);

const ANIME_Q = `query($page:Int){ Page(page:$page, perPage:50){ media(type:ANIME, sort:POPULARITY_DESC, isAdult:false){ id popularity title{ romaji english } synonyms } } }`;
const FAV_Q = `query($page:Int){ Page(page:$page, perPage:50){ characters(sort:FAVOURITES_DESC){ id favourites name{ full first last alternative alternativeSpoiler }
  media(type:ANIME, sort:POPULARITY_DESC, perPage:1){ nodes{ title{ romaji english } } } } } }`;
const CAST_Q = `query($ids:[Int]){ Page(perPage:10){ media(id_in:$ids, type:ANIME){ title{ romaji english }
  characters(perPage:${CAST_PER_ANIME}, sort:FAVOURITES_DESC){ nodes{ id favourites name{ full first last alternative alternativeSpoiler } } } } } }`;

const anime = [], characters = [], seenA = new Set(), seenC = new Set();
const addChar = (c, show) => {
  if (!show || seenC.has(c.id) || !c.name?.full) return;
  seenC.add(c.id);
  characters.push({ id: c.id, pop: c.favourites || 0, full: c.name.full, first: c.name.first, last: c.name.last, alternative: [...(c.name.alternative || []), ...(c.name.alternativeSpoiler || [])], anime: show.english || show.romaji });
};

for (let p = 1; p <= ANIME_PAGES; p++) {
  const d = await gql(ANIME_Q, { page: p });
  for (const m of d.Page.media) if (!seenA.has(m.id) && seenA.add(m.id)) anime.push({ id: m.id, pop: m.popularity, romaji: m.title.romaji, english: m.title.english, synonyms: m.synonyms || [] });
  progress('anime page', p, ANIME_PAGES); await sleep(PAUSE_MS);
}
console.log(`\n${anime.length} anime`);
for (let p = 1; p <= FAVOURITE_PAGES; p++) {
  const d = await gql(FAV_Q, { page: p });
  for (const c of d.Page.characters) addChar(c, c.media?.nodes?.[0]?.title);
  progress('favourite characters page', p, FAVOURITE_PAGES); await sleep(PAUSE_MS);
}
console.log(`\n${characters.length} characters from favourites`);
const castIds = anime.slice(0, CAST_ANIME).map((a) => a.id);
for (let i = 0; i < castIds.length; i += 10) {
  const d = await gql(CAST_Q, { ids: castIds.slice(i, i + 10) });
  for (const m of d.Page.media) for (const c of m.characters.nodes) addChar(c, m.title);
  progress('anime casts', Math.min(i + 10, castIds.length), castIds.length); await sleep(PAUSE_MS);
}
console.log(`\n${characters.length} characters in total`);

const out = new URL('../server/seed/shiritori.json', import.meta.url), tmp = new URL('../server/seed/shiritori.json.tmp', import.meta.url);
writeFileSync(tmp, JSON.stringify({ source: 'AniList', builtAt: new Date().toISOString(), anime, characters }));
renameSync(tmp, out); // atomic: a failed run never replaces a good index
console.log('wrote server/seed/shiritori.json');
