// Builds server/seed/shiritori.json: popular anime titles and characters from AniList.
// Run once, offline from the game:  node scripts/build-shiritori-index.mjs
// AniList allows roughly 30–90 requests a minute, so this pauses between pages.
import { writeFileSync } from 'node:fs';

const ANIME_PAGES = 40;      // 50 per page → 2,000 titles
const CHARACTER_PAGES = 60;  // 50 per page → 3,000 characters
const PAUSE_MS = 2200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (res.status === 429) { const wait = (Number(res.headers.get('retry-after')) || 60) * 1000; console.log(`rate limited, waiting ${wait / 1000}s`); await sleep(wait); continue; }
    if (!res.ok) { console.log(`HTTP ${res.status}, retrying`); await sleep(5000); continue; }
    return (await res.json()).data;
  }
  throw new Error('AniList kept failing');
}

const ANIME_Q = `query($page:Int){ Page(page:$page, perPage:50){ media(type:ANIME, sort:POPULARITY_DESC, isAdult:false){ id popularity title{ romaji english } synonyms } } }`;
const CHAR_Q = `query($page:Int){ Page(page:$page, perPage:50){ characters(sort:FAVOURITES_DESC){ id favourites name{ full first last alternative }
  media(type:ANIME, sort:POPULARITY_DESC, perPage:1){ nodes{ title{ romaji english } } } } } }`;

const anime = [], characters = [];
for (let p = 1; p <= ANIME_PAGES; p++) {
  const d = await gql(ANIME_Q, { page: p });
  for (const m of d.Page.media) anime.push({ id: m.id, pop: m.popularity, romaji: m.title.romaji, english: m.title.english, synonyms: m.synonyms || [] });
  process.stdout.write(`anime page ${p}/${ANIME_PAGES}\r`); await sleep(PAUSE_MS);
}
console.log(`\n${anime.length} anime`);
for (let p = 1; p <= CHARACTER_PAGES; p++) {
  const d = await gql(CHAR_Q, { page: p });
  for (const c of d.Page.characters) {
    const show = c.media?.nodes?.[0]?.title;
    if (!show) continue; // characters only from non-anime media are skipped
    characters.push({ id: c.id, pop: c.favourites, full: c.name.full, first: c.name.first, last: c.name.last, alternative: c.name.alternative || [], anime: show.english || show.romaji });
  }
  process.stdout.write(`character page ${p}/${CHARACTER_PAGES}\r`); await sleep(PAUSE_MS);
}
console.log(`\n${characters.length} characters`);
writeFileSync(new URL('../server/seed/shiritori.json', import.meta.url), JSON.stringify({ source: 'AniList', builtAt: new Date().toISOString(), anime, characters }));
console.log('wrote server/seed/shiritori.json');
