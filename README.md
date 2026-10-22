# AniMahou

Anime and HoYoverse quiz kiosk for an event stall, plus an admin app to run it.

## Run

```bash
npm install
npm run dev
```

- Kiosk: http://localhost:5173
- Admin: http://localhost:5173/admin.html (also linked as "Admin" in the home page footer)

`npm run dev` starts one process: Vite serves the pages, and the API (`server/app.js`) runs inside it.
For the stall laptop, `npm run preview` builds the site and serves everything from `server/index.js`.

## Share a public link (Cloudflare quick tunnel)

```bash
brew install cloudflared   # once
npm run share
```

This builds the site, serves it on port 8080, and prints a public `https://….trycloudflare.com` link for the kiosk and admin.
The link works while that terminal stays open and the laptop is awake. It changes every time you run the command.

## Admin sign-in

The one admin account is set on each computer, not in the code. Copy the example file and fill it in:

```bash
cp .env.example .env
```

Then set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` and restart the server. `.env` is git-ignored.
Without it, admin sign-in is disabled. For hosting, set the same two environment variables instead.
Sessions last 12 hours. After 5 wrong attempts, sign-in is blocked for one minute.

## Data

- Database: `server/animahou.db` (SQLite, built into Node 22+). Created and seeded from `server/seed/*.json` on first run.
- To start over, stop the server and delete `server/animahou.db*`.
- Uploaded question images and audio go to `server/uploads/`.
- Back up both before and after the event. The admin can export registrations and plays as CSV.

## Layout

| Path | What |
|---|---|
| `server/db.js` | Schema, seed |
| `server/app.js` | API: public kiosk routes, `/api/admin/*` (signed in only) |
| `src/main.js`, `src/scenes.js` | Kiosk |
| `src/admin/main.js` | Admin router and shell |
| `src/admin/api.js`, `src/admin/ui.js` | Admin API client and UI kit (sheets, toasts, switches) |
| `src/admin/views/*` | One file per admin page |

The server grades answers. The kiosk never receives the correct option.

## Anime Shiritori (multiplayer rooms)

An Anime event where players name an anime character or anime title that starts with the last letter of the previous answer. Anyone creates a room and gets a 5-letter code; others join with it on their own phone or laptop. Everyone presses Ready, then the room host starts. Turns go round the room, and whoever runs out of time is out. The last player standing wins. Rooms live in server memory: all players must use the same address, and a restart clears games in progress.

- **Referee:** the server (`server/shiritori/`). Answers are matched against `server/seed/shiritori.json`, an index of 5,000 anime and about 11,000 characters from AniList (the most-favourited characters plus the casts of the 600 most popular anime, including spoiler names). There's no AI, and nothing is called over the network during play.
- **Matching:** spelling, accents, long vowels (Rintarou = Rintaro), romanization variants (tsu/tu, shi/si, Shimbun/Shinbun), name order, first or last name alone, and typos scaled to the name's length are all forgiven. Long titles typed from memory match word by word. The official spelling decides the next letter. When a name matches several entries ("Sakura"), the player picks from a list. Every season of an anime counts as the same answer.
- **Unknown answers:** the player taps "Ask the host". The clock pauses, and the host accepts or rejects with `HOST_PIN` from `.env`.
- **Scoring:** 100 points per word, plus 300 for the winner. Running out of time knocks you out, and the next player gets the same letter.
- **Refreshing the index:** run `node scripts/build-shiritori-index.mjs` (about 8 minutes, because of AniList's rate limit), then restart the server.
- **Testing answers:** `node scripts/test-shiritori.mjs` plays 270 typical answers through the real referee and lists any that fail; add `-v` to see what each one resolved to.
- **Music:** the site is silent except during a Shiritori game, which plays `public/media/anime/shiritori.mp3`.
