// HTTP API. Mounted inside Vite during development (see vite.config.js)
// and served by server/index.js in production.
import express from 'express';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, tx } from './db.js';

const UPLOADS = fileURLToPath(new URL('./uploads/', import.meta.url));
// The only admin credential comes from the environment (or a local .env file, never committed).
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* no .env: use real env vars */ }
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASS_SHA = process.env.ADMIN_PASSWORD ? createHash('sha256').update(process.env.ADMIN_PASSWORD).digest() : null;
if (!ADMIN_EMAIL || !ADMIN_PASS_SHA) console.warn('[admin] ADMIN_EMAIL and ADMIN_PASSWORD are not set, so admin sign-in is disabled. Copy .env.example to .env.');
const SESSION_HOURS = 12;
const COOKIE = 'am_admin';

export const app = express();
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '1d' }));

const q = (sql) => db.prepare(sql);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => { throw new HttpError(400, msg); };
const need = (v, msg) => (v === undefined || v === null || String(v).trim() === '' ? bad(msg) : String(v).trim());
const route = (fn) => (req, res, next) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { next(e); } };

/* ---------- Shared readers ---------- */
const eventRow = (e) => e && ({
  id: e.id, realm: e.realm_id, name: e.name, blurb: e.blurb, status: e.status, timeLimit: e.time_limit, sort: e.sort,
  theme: { name: e.theme_name, scene: e.scene, tint: [e.tint1, e.tint2], bg: `/media/${e.realm_id}/${e.id}.jpg`, video: `/media/${e.realm_id}/${e.id}.mp4`, bgm: `/media/${e.realm_id}/${e.id}.mp3`, char: `/media/${e.realm_id}/${e.id}-char.webp` },
  questionCount: e.qn ?? undefined, joined: e.joined ?? undefined,
});
const EVENTS_SQL = `SELECT e.*, (SELECT COUNT(*) FROM questions WHERE event_id = e.id) qn,
  (SELECT COUNT(*) FROM plays WHERE event_id = e.id) joined FROM events e`;
function questionsFor(eventId, withAnswers) {
  const qs = q('SELECT * FROM questions WHERE event_id = ? ORDER BY sort, id').all(eventId);
  const opts = q('SELECT o.* FROM options o JOIN questions qq ON qq.id = o.question_id WHERE qq.event_id = ? ORDER BY o.sort').all(eventId);
  return qs.map((x) => ({
    id: x.id, type: x.type, prompt: x.prompt, media: x.media, reveal: !!x.reveal, timeLimit: x.time_limit, sort: x.sort,
    ...(withAnswers ? { answer: x.answer } : {}),
    options: opts.filter((o) => o.question_id === x.id).map((o) => ({ text: o.text, image: o.image })),
  }));
}
const leaderboard = (eventId, limit = 10, todayOnly = false) => q(`
  SELECT p.id playId, pa.name, pa.team, p.event_id event, e.name eventName, p.score, p.finished_at at
  FROM plays p JOIN participants pa ON pa.id = p.participant_id JOIN events e ON e.id = p.event_id
  WHERE p.finished_at IS NOT NULL ${eventId ? 'AND p.event_id = :ev' : ''} ${todayOnly ? "AND date(p.finished_at) = date('now')" : ''}
  ORDER BY p.score DESC, p.finished_at ASC LIMIT :lim`).all(eventId ? { ev: eventId, lim: limit } : { lim: limit });

/* ========== Public (kiosk) ========== */
app.get('/api/catalog', route(() => ({
  realms: q('SELECT * FROM realms ORDER BY sort').all().map((r) => ({ id: r.id, name: r.name, blurb: r.blurb, tint: [r.tint1, r.tint2] })),
  events: q(`${EVENTS_SQL} WHERE e.status = 'open' ORDER BY e.sort, e.name`).all().map(eventRow).filter((e) => e.questionCount > 0),
})));

app.get('/api/leaderboard', route((req) => leaderboard(req.query.event || null, 8, req.query.today === '1')));

app.post('/api/plays', route((req) => {
  const { eventId, name, contact, team = '' } = req.body || {};
  const ev = q("SELECT * FROM events WHERE id = ? AND status = 'open'").get(String(eventId));
  if (!ev) throw new HttpError(404, 'This event is closed.');
  const n = need(name, 'Enter a name.').slice(0, 20), c = need(contact, 'Enter an email or phone number.').slice(0, 120);
  return tx(() => {
    const pid = q('INSERT INTO participants (name, contact, team) VALUES (?, ?, ?)').run(n, c, String(team).trim().slice(0, 24)).lastInsertRowid;
    const playId = q('INSERT INTO plays (participant_id, event_id) VALUES (?, ?)').run(pid, ev.id).lastInsertRowid;
    return { playId: Number(playId), event: eventRow(ev), questions: questionsFor(ev.id, false) };
  });
}));

app.post('/api/plays/:id/answer', route((req) => {
  const play = q('SELECT * FROM plays WHERE id = ?').get(Number(req.params.id));
  if (!play || play.finished_at) throw new HttpError(409, 'This play has already finished.');
  const ques = q('SELECT qq.*, e.time_limit ev_limit FROM questions qq JOIN events e ON e.id = qq.event_id WHERE qq.id = ? AND qq.event_id = ?').get(Number(req.body?.questionId), play.event_id);
  if (!ques) bad('Unknown question.');
  const limit = ques.time_limit || ques.ev_limit;
  const choice = Number.isInteger(req.body?.choice) ? req.body.choice : -1;
  const ms = Math.max(0, Math.min(limit * 1000, Number(req.body?.ms) || 0));
  const correct = choice === ques.answer ? 1 : 0;
  const points = correct ? 100 + Math.round((limit - ms / 1000) / limit * 200) : 0;
  const prev = q('SELECT points FROM responses WHERE play_id = ? AND question_id = ?').get(play.id, ques.id);
  if (prev) return { correct: !!correct, answer: ques.answer, points: prev.points, duplicate: true };
  tx(() => {
    q('INSERT INTO responses (play_id, question_id, choice, correct, points, ms) VALUES (?, ?, ?, ?, ?, ?)').run(play.id, ques.id, choice, correct, points, ms);
    q('UPDATE plays SET score = score + ? WHERE id = ?').run(points, play.id);
  });
  return { correct: !!correct, answer: ques.answer, points };
}));

app.post('/api/plays/:id/finish', route((req) => {
  const id = Number(req.params.id);
  q("UPDATE plays SET finished_at = COALESCE(finished_at, datetime('now')) WHERE id = ?").run(id);
  const play = q('SELECT score, event_id FROM plays WHERE id = ?').get(id);
  if (!play) throw new HttpError(404, 'Play not found.');
  const n = q('SELECT COUNT(*) n FROM questions WHERE event_id = ?').get(play.event_id).n;
  const rank = q('SELECT COUNT(*) + 1 r FROM plays WHERE event_id = ? AND finished_at IS NOT NULL AND score > ?').get(play.event_id, play.score).r;
  return { score: play.score, max: n * 300, rank };
}));

/* ========== Admin auth ========== */
const cookieToken = (req) => (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
function requireAdmin(req, res, next) {
  const t = cookieToken(req);
  const s = t && q('SELECT * FROM sessions WHERE token = ?').get(t);
  if (!s || s.expires_at < Date.now()) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}
// A 4-digit password is easy to guess, so slow down repeated failures.
const failures = new Map(); // ip -> { n, until }
app.post('/api/admin/login', route((req, res) => {
  // Behind Cloudflare Tunnel every request arrives from this machine; the real visitor is in CF-Connecting-IP.
  const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
  const ip = (local && req.headers['cf-connecting-ip']) || req.socket.remoteAddress || 'local', f = failures.get(ip);
  if (f?.until > Date.now()) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.');
  const fail = () => { const n = (f?.n || 0) + 1; failures.set(ip, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 60e3 : 0 }); };
  if (!ADMIN_PASS_SHA) throw new HttpError(503, 'Admin sign-in isn’t set up on this computer. Add ADMIN_EMAIL and ADMIN_PASSWORD to the .env file.');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const pass = createHash('sha256').update(String(req.body?.password || '')).digest();
  if (email !== ADMIN_EMAIL || !timingSafeEqual(pass, ADMIN_PASS_SHA)) { fail(); throw new HttpError(401, 'That email and password don’t match.'); }
  failures.delete(ip);
  const token = randomBytes(32).toString('hex');
  q('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  q('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, Date.now() + SESSION_HOURS * 3600e3);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
  return { email: ADMIN_EMAIL };
}));
app.post('/api/admin/logout', route((req, res) => {
  const t = cookieToken(req); if (t) q('DELETE FROM sessions WHERE token = ?').run(t);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  return { ok: true };
}));
app.use('/api/admin', requireAdmin);
app.get('/api/admin/me', route(() => ({ email: ADMIN_EMAIL })));

/* ---------- Overview ---------- */
app.get('/api/admin/overview', route(() => ({
  events: q('SELECT COUNT(*) n, SUM(status = \'open\') open FROM events').get(),
  questions: q('SELECT COUNT(*) n FROM questions').get().n,
  participants: q("SELECT COUNT(*) n, SUM(date(created_at) = date('now')) today FROM participants").get(),
  plays: q("SELECT COUNT(*) n, SUM(finished_at IS NOT NULL) finished, ROUND(AVG(CASE WHEN finished_at IS NOT NULL THEN score END)) avg FROM plays").get(),
  accuracy: q('SELECT ROUND(AVG(correct) * 100) pct FROM responses').get().pct,
  recent: q(`SELECT p.id, pa.name, pa.team, e.name event, p.score, p.started_at, p.finished_at FROM plays p
    JOIN participants pa ON pa.id = p.participant_id JOIN events e ON e.id = p.event_id ORDER BY p.id DESC LIMIT 8`).all(),
  perEvent: q(`SELECT e.id, e.name, e.status, COUNT(p.id) plays, ROUND(AVG(p.score)) avg FROM events e
    LEFT JOIN plays p ON p.event_id = e.id AND p.finished_at IS NOT NULL GROUP BY e.id ORDER BY e.sort`).all(),
})));

/* ---------- Realms & events ---------- */
app.get('/api/admin/realms', route(() => q('SELECT * FROM realms ORDER BY sort').all()));
app.get('/api/admin/events', route(() => q(`${EVENTS_SQL} ORDER BY e.sort, e.name`).all().map(eventRow)));
app.get('/api/admin/events/:id', route((req) => {
  const e = q(`${EVENTS_SQL} WHERE e.id = ?`).get(req.params.id);
  if (!e) throw new HttpError(404, 'Event not found.');
  return { ...eventRow(e), questions: questionsFor(e.id, true) };
}));
const SCENES = ['home', 'realm-anime', 'realm-hoyoverse', 'onepiece', 'demonslayer', 'naruto', 'aot', 'yourname', 'jjk', 'mondstadt', 'liyue', 'inazuma', 'sumeru', 'fontaine', 'starrail'];
const HEX = /^#[0-9a-f]{6}$/i;
function readEvent(b) {
  const out = {
    realm_id: need(b.realm, 'Choose a realm.'), name: need(b.name, 'Enter an event name.').slice(0, 80), blurb: String(b.blurb || '').trim().slice(0, 200),
    theme_name: String(b.themeName || '').trim().slice(0, 40), scene: SCENES.includes(b.scene) ? b.scene : 'home',
    tint1: HEX.test(b.tint1) ? b.tint1 : '#14284A', tint2: HEX.test(b.tint2) ? b.tint2 : '#D3BC8E',
    time_limit: Math.min(120, Math.max(5, parseInt(b.timeLimit, 10) || 20)), status: b.status === 'closed' ? 'closed' : 'open',
  };
  if (!q('SELECT 1 FROM realms WHERE id = ?').get(out.realm_id)) bad('Unknown realm.');
  return out;
}
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'event';
app.post('/api/admin/events', route((req) => {
  const e = readEvent(req.body || {});
  let id = slug(req.body.id || e.name), n = 2;
  while (q('SELECT 1 FROM events WHERE id = ?').get(id)) id = `${slug(e.name)}-${n++}`;
  const sort = q('SELECT COALESCE(MAX(sort), 0) + 1 s FROM events').get().s;
  q(`INSERT INTO events (id, realm_id, name, blurb, theme_name, scene, tint1, tint2, time_limit, status, sort)
     VALUES (:id, :realm_id, :name, :blurb, :theme_name, :scene, :tint1, :tint2, :time_limit, :status, :sort)`).run({ ...e, id, sort });
  return { id };
}));
app.put('/api/admin/events/:id', route((req) => {
  const e = readEvent(req.body || {});
  const r = q(`UPDATE events SET realm_id = :realm_id, name = :name, blurb = :blurb, theme_name = :theme_name, scene = :scene,
     tint1 = :tint1, tint2 = :tint2, time_limit = :time_limit, status = :status WHERE id = :id`).run({ ...e, id: req.params.id });
  if (!r.changes) throw new HttpError(404, 'Event not found.');
  return { id: req.params.id };
}));
app.patch('/api/admin/events/:id/status', route((req) => {
  q('UPDATE events SET status = ? WHERE id = ?').run(req.body?.status === 'closed' ? 'closed' : 'open', req.params.id);
  return { ok: true };
}));
app.delete('/api/admin/events/:id', route((req) => { q('DELETE FROM events WHERE id = ?').run(req.params.id); return { ok: true }; }));
app.post('/api/admin/events/reorder', route((req) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : bad('Missing order.');
  tx(() => ids.forEach((id, i) => q('UPDATE events SET sort = ? WHERE id = ?').run(i, String(id))));
  return { ok: true };
}));

/* ---------- Questions ---------- */
function readQuestion(b) {
  const type = ['text', 'image', 'voice'].includes(b.type) ? b.type : 'text';
  const options = Array.isArray(b.options) ? b.options.map((o) => ({ text: String(o?.text || '').trim().slice(0, 120), image: o?.image ? String(o.image) : null })) : [];
  if (options.length < 2 || options.length > 6) bad('Add between 2 and 6 options.');
  options.forEach((o, i) => { if (!o.text && !o.image) bad(`Option ${i + 1} needs text or an image.`); });
  const answer = parseInt(b.answer, 10);
  if (!(answer >= 0 && answer < options.length)) bad('Mark the correct option.');
  if (type === 'image' && !b.media) bad('Image questions need an image.');
  const tl = b.timeLimit === '' || b.timeLimit == null ? null : Math.min(120, Math.max(5, parseInt(b.timeLimit, 10) || 20));
  return { type, prompt: need(b.prompt, 'Write the question.').slice(0, 300), media: b.media ? String(b.media) : null, reveal: b.reveal === false ? 0 : 1, time_limit: tl, answer, options };
}
function saveOptions(qid, options) {
  q('DELETE FROM options WHERE question_id = ?').run(qid);
  const ins = q('INSERT INTO options (question_id, sort, text, image) VALUES (?, ?, ?, ?)');
  options.forEach((o, i) => ins.run(qid, i, o.text, o.image));
}
app.post('/api/admin/events/:id/questions', route((req) => {
  if (!q('SELECT 1 FROM events WHERE id = ?').get(req.params.id)) throw new HttpError(404, 'Event not found.');
  const x = readQuestion(req.body || {});
  return tx(() => {
    const sort = q('SELECT COALESCE(MAX(sort), 0) + 1 s FROM questions WHERE event_id = ?').get(req.params.id).s;
    const id = q('INSERT INTO questions (event_id, sort, type, prompt, media, reveal, time_limit, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.params.id, sort, x.type, x.prompt, x.media, x.reveal, x.time_limit, x.answer).lastInsertRowid;
    saveOptions(id, x.options);
    return { id: Number(id) };
  });
}));
app.put('/api/admin/questions/:id', route((req) => {
  const x = readQuestion(req.body || {}), id = Number(req.params.id);
  return tx(() => {
    const r = q('UPDATE questions SET type = ?, prompt = ?, media = ?, reveal = ?, time_limit = ?, answer = ? WHERE id = ?').run(x.type, x.prompt, x.media, x.reveal, x.time_limit, x.answer, id);
    if (!r.changes) throw new HttpError(404, 'Question not found.');
    saveOptions(id, x.options);
    return { id };
  });
}));
app.delete('/api/admin/questions/:id', route((req) => { q('DELETE FROM questions WHERE id = ?').run(Number(req.params.id)); return { ok: true }; }));
app.post('/api/admin/events/:id/questions/reorder', route((req) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : bad('Missing order.');
  tx(() => ids.forEach((qid, i) => q('UPDATE questions SET sort = ? WHERE id = ? AND event_id = ?').run(i, Number(qid), req.params.id)));
  return { ok: true };
}));

/* ---------- Uploads (data URL in, file URL out) ---------- */
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a' };
app.post('/api/admin/upload', route((req) => {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(req.body?.dataUrl || ''));
  if (!m || !MIME[m[1]]) bad('Upload a PNG, JPG, WebP, GIF, MP3, WAV, OGG or M4A file.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) bad('Files must be under 8 MB.');
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${MIME[m[1]]}`;
  writeFileSync(UPLOADS + name, buf);
  return { url: `/uploads/${name}` };
}));

/* ---------- Registrations, responses, leaderboards ---------- */
app.get('/api/admin/participants', route((req) => q(`
  SELECT pa.id, pa.name, pa.contact, pa.team, pa.created_at, p.id playId, p.event_id event, e.name eventName, p.score, p.finished_at
  FROM participants pa LEFT JOIN plays p ON p.participant_id = pa.id LEFT JOIN events e ON e.id = p.event_id
  WHERE 1 = 1 ${req.query.event ? 'AND p.event_id = :ev' : ''} ORDER BY pa.id DESC LIMIT 500`).all(req.query.event ? { ev: req.query.event } : {})));

app.get('/api/admin/plays', route((req) => q(`
  SELECT p.id, pa.name, pa.team, pa.contact, p.event_id event, e.name eventName, p.score, p.started_at, p.finished_at,
    (SELECT COUNT(*) FROM responses r WHERE r.play_id = p.id) answered, (SELECT SUM(correct) FROM responses r WHERE r.play_id = p.id) correct
  FROM plays p JOIN participants pa ON pa.id = p.participant_id JOIN events e ON e.id = p.event_id
  WHERE 1 = 1 ${req.query.event ? 'AND p.event_id = :ev' : ''} ORDER BY p.id DESC LIMIT 500`).all(req.query.event ? { ev: req.query.event } : {})));

app.get('/api/admin/plays/:id', route((req) => {
  const play = q(`SELECT p.*, pa.name, pa.contact, pa.team, e.name eventName FROM plays p JOIN participants pa ON pa.id = p.participant_id JOIN events e ON e.id = p.event_id WHERE p.id = ?`).get(Number(req.params.id));
  if (!play) throw new HttpError(404, 'Play not found.');
  const rows = q(`SELECT r.*, qq.prompt, qq.answer FROM responses r JOIN questions qq ON qq.id = r.question_id WHERE r.play_id = ? ORDER BY qq.sort`).all(play.id);
  const opts = q('SELECT question_id, sort, text, image FROM options WHERE question_id IN (SELECT question_id FROM responses WHERE play_id = ?) ORDER BY sort').all(play.id);
  const label = (qid, k) => { const o = opts.find((x) => x.question_id === qid && x.sort === k); return o ? (o.text || 'Image option') : null; };
  return { ...play, responses: rows.map((r) => ({ prompt: r.prompt, chosen: r.choice < 0 ? null : label(r.question_id, r.choice), right: label(r.question_id, r.answer), correct: !!r.correct, points: r.points, ms: r.ms })) };
}));

app.get('/api/admin/question-stats', route((req) => q(`
  SELECT qq.id, qq.prompt, qq.sort, COUNT(r.id) answered, ROUND(AVG(r.correct) * 100) pct, ROUND(AVG(r.ms) / 1000.0, 1) avgSec
  FROM questions qq LEFT JOIN responses r ON r.question_id = qq.id WHERE qq.event_id = ? GROUP BY qq.id ORDER BY qq.sort`).all(String(req.query.event))));

app.get('/api/admin/leaderboard', route((req) => leaderboard(req.query.event || null, Math.min(200, Number(req.query.limit) || 50), req.query.today === '1')));

app.get('/api/admin/export/:kind.csv', (req, res, next) => {
  try {
    const rows = req.params.kind === 'plays'
      ? q(`SELECT p.id, pa.name, pa.contact, pa.team, e.name event, p.score, p.started_at, p.finished_at FROM plays p JOIN participants pa ON pa.id = p.participant_id JOIN events e ON e.id = p.event_id ORDER BY p.id`).all()
      : q(`SELECT id, name, contact, team, created_at FROM participants ORDER BY id`).all();
    const cols = rows[0] ? Object.keys(rows[0]) : ['id'];
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="animahou-${req.params.kind}.csv"`);
    res.send([cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
  } catch (e) { next(e); }
});

/* ---------- Errors ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : 'Something went wrong on the server.' });
});
