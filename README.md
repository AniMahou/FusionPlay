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

## Admin sign-in

Only `admin@admin.com` with password `9876` can sign in (set in `server/app.js`).
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
