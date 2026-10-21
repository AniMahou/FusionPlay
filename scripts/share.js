// Share this laptop's copy publicly through a Cloudflare quick tunnel.
// Usage: npm run share   (builds first). Ctrl+C stops both the site and the tunnel.
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || '8080';
const kids = [];
const run = (cmd, args, opts) => { const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }); kids.push(p); return p; };
const stop = () => { kids.forEach((k) => k.kill()); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

const site = run(process.execPath, ['server/index.js'], { env: { ...process.env, PORT } });
site.stdout.on('data', (d) => process.stdout.write(`[site] ${d}`));
site.stderr.on('data', (d) => process.stderr.write(`[site] ${d}`));
site.on('exit', (c) => { console.error(`[site] stopped (${c}). Is port ${PORT} already in use?`); stop(); });

const tunnel = run('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
tunnel.on('error', () => { console.error('cloudflared is not installed. On a Mac: brew install cloudflared'); stop(); });
let shown = false;
const scan = (d) => {
  const url = !shown && /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d))?.[0];
  if (!url) return;
  shown = true;
  console.log(`\n  Public links (valid while this window stays open):\n\n    Kiosk  ${url}\n    Admin  ${url}/admin.html\n\n  Press Ctrl+C to stop sharing.\n`);
};
tunnel.stdout.on('data', scan); tunnel.stderr.on('data', scan);
tunnel.on('exit', (c) => { console.error(`[tunnel] stopped (${c}).`); stop(); });
