// SQLite storage (Node's built-in driver). One file: server/animahou.db
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const db = new DatabaseSync(process.env.ANIMAHOU_DB || here('./animahou.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS realms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, blurb TEXT NOT NULL DEFAULT '',
  tint1 TEXT NOT NULL, tint2 TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  realm_id TEXT NOT NULL REFERENCES realms(id),
  name TEXT NOT NULL, blurb TEXT NOT NULL DEFAULT '',
  theme_name TEXT NOT NULL DEFAULT '', scene TEXT NOT NULL DEFAULT 'home',
  tint1 TEXT NOT NULL DEFAULT '#14284A', tint2 TEXT NOT NULL DEFAULT '#D3BC8E',
  time_limit INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'voice')),
  prompt TEXT NOT NULL,
  media TEXT,              -- image url (image type) or audio url (voice type)
  reveal INTEGER NOT NULL DEFAULT 1, -- image type: uncover tile by tile
  time_limit INTEGER,      -- null = use the event's limit
  answer INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  image TEXT
);
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, contact TEXT NOT NULL, team TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id INTEGER NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice INTEGER NOT NULL,  -- -1 = ran out of time
  correct INTEGER NOT NULL, points INTEGER NOT NULL, ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (play_id, question_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_q_event ON questions(event_id, sort);
CREATE INDEX IF NOT EXISTS idx_opt_q ON options(question_id, sort);
CREATE INDEX IF NOT EXISTS idx_plays_event ON plays(event_id, score);
`);

/** Run fn inside a transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ---------- First-run seed from server/seed/*.json ---------- */
if (!db.prepare('SELECT COUNT(*) n FROM events').get().n) {
  const read = (f) => JSON.parse(readFileSync(here(`./seed/${f}.json`), 'utf8'));
  const realms = read('realms'), events = read('events'), questions = read('questions');
  tx(() => {
    const r = db.prepare('INSERT INTO realms (id, name, blurb, tint1, tint2, sort) VALUES (?, ?, ?, ?, ?, ?)');
    realms.forEach((x, i) => r.run(x.id, x.name, x.blurb, x.tint[0], x.tint[1], i));
    const e = db.prepare(`INSERT INTO events (id, realm_id, name, blurb, theme_name, scene, tint1, tint2, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    events.forEach((x, i) => e.run(x.id, x.realm, x.name, x.blurb, x.theme.name, x.theme.scene, x.theme.tint[0], x.theme.tint[1], i));
    const q = db.prepare('INSERT INTO questions (event_id, sort, type, prompt, answer) VALUES (?, ?, ?, ?, ?)');
    const o = db.prepare('INSERT INTO options (question_id, sort, text) VALUES (?, ?, ?)');
    const seen = {};
    for (const x of questions) {
      seen[x.event] = (seen[x.event] || 0) + 1;
      const { lastInsertRowid } = q.run(x.event, seen[x.event], x.type, x.prompt, x.answer);
      x.options.forEach((t, k) => o.run(lastInsertRowid, k, t));
    }
  });
  console.log('[db] seeded from server/seed');
}

/* ---------- Migrations (safe to run on every start) ---------- */
const eventCols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
if (!eventCols.includes('kind')) db.exec("ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'quiz'");
// Anime Shiritori: a 1v1 word-chain event that needs no questions.
if (!db.prepare("SELECT 1 FROM events WHERE id = 'shiritori'").get()) {
  db.prepare(`INSERT INTO events (id, realm_id, name, blurb, theme_name, scene, tint1, tint2, time_limit, kind, sort)
    VALUES ('shiritori', 'anime', 'Anime Shiritori', '1v1. Name a character or anime that starts with the last letter.', 'Shiritori', 'realm-anime', '#1A1030', '#F4B6C6', 20, 'shiritori', -1)`).run();
}
