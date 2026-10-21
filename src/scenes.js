// Live, code-drawn backgrounds. Each scene = CSS sky + layered SVG silhouettes
// (a few CSS-animated parts) + one canvas for particles and effects.
// All artwork is original: places and moods, never copyrighted characters.

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const W = 1600, H = 900;

/* ---------- Silhouette helpers (return SVG markup) ---------- */
function ridge(s, base, amp, n, color, op = 1) {
  seed = s;
  const pts = Array.from({ length: n + 1 }, (_, i) => [(i / n) * W, base - rnd() * amp]);
  let d = `M0 ${H} L0 ${pts[0][1].toFixed(0)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [x2, y2] = pts[i + 1];
    d += ` Q${x.toFixed(0)} ${y.toFixed(0)} ${((x + x2) / 2).toFixed(0)} ${((y + y2) / 2).toFixed(0)}`;
  }
  return `<path d="${d} L${W} ${pts[n][1].toFixed(0)} L${W} ${H}Z" fill="${color}" opacity="${op}"/>`;
}
function skyline(s, base, color, lit, pointy = false) {
  seed = s; let x = -20, out = '', wins = '';
  while (x < W) {
    const w = 40 + rnd() * 80, h = 60 + rnd() * 240, top = base - h;
    out += pointy && rnd() > .55
      ? `<path d="M${x} ${base} V${top + 30} L${x + w / 2} ${top - 50} L${x + w} ${top + 30} V${base}Z"/>`
      : `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${w.toFixed(0)}" height="${h + 200}"/>`;
    if (lit) for (let wy = top + 14; wy < base - 10; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16)
      if (rnd() > .72) wins += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="6" height="9" style="--d:${(rnd() * 6).toFixed(1)}s"/>`;
    x += w + 2;
  }
  return `<g fill="${color}">${out}</g>${lit ? `<g class="windows" fill="${lit}">${wins}</g>` : ''}`;
}
function karst(s, base, color, count, minH, maxH) {
  seed = s; let out = '';
  for (let i = 0; i < count; i++) {
    const x = rnd() * W, w = 50 + rnd() * 90, top = base - (minH + rnd() * (maxH - minH)), r = w * .45;
    out += `<path d="M${x} ${H} V${top + r} Q${x} ${top} ${x + w / 2} ${top - 6} Q${x + w} ${top} ${x + w} ${top + r} V${H}Z"/>`;
  }
  return `<g fill="${color}">${out}</g>`;
}
function wall(base, height, color) {
  let crenels = '';
  for (let x = 0; x < W; x += 36) crenels += `<rect x="${x}" y="${base - height - 14}" width="20" height="16"/>`;
  return `<g fill="${color}"><rect x="0" y="${base - height}" width="${W}" height="${height + 300}"/>${crenels}
    <rect x="300" y="${base - height - 70}" width="70" height="80"/><rect x="1180" y="${base - height - 90}" width="80" height="100"/></g>
    <rect x="0" y="${base - height + 30}" width="${W}" height="3" fill="#000" opacity=".15"/>`;
}
const torii = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}">
  <path d="M-130 -150 Q0 -175 130 -150 L136 -132 Q0 -152 -136 -132Z"/><rect x="-108" y="-112" width="216" height="14"/>
  <rect x="-92" y="-140" width="18" height="140"/><rect x="74" y="-140" width="18" height="140"/><rect x="-8" y="-130" width="16" height="22"/></g>`;
const windmill = (x, y, s, c, blade) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-34 0 L-20 -170 L20 -170 L34 0Z" fill="${c}"/><path d="M-28 -170 L0 -205 L28 -170Z" fill="${c}"/>
  <g class="spin" style="transform-origin:0px -175px" fill="${blade}">
    ${[0, 90, 180, 270].map((a) => `<g transform="rotate(${a} 0 -175)"><rect x="-4" y="-330" width="8" height="155"/><rect x="4" y="-320" width="34" height="130" opacity=".85"/></g>`).join('')}
    <circle cx="0" cy="-175" r="10" fill="${c}"/></g></g>`;
const ship = (x, y, s, hull, sail) => `<g class="bob" transform="translate(${x} ${y}) scale(${s})">
  <g><path d="M-150 -10 Q-140 40 -90 50 L100 50 Q150 30 170 -20 Z" fill="${hull}"/>
  <rect x="-6" y="-230" width="10" height="220" fill="${hull}"/>
  <path d="M-110 -190 Q0 -170 110 -190 Q120 -110 110 -40 Q0 -55 -110 -40 Q-118 -110 -110 -190Z" fill="${sail}"/>
  <path d="M0 -230 L60 -218 L0 -206Z" fill="${hull}"/></g></g>`;
const pavilion = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}">
  ${[0, 1, 2].map((k) => { const w = 150 - k * 38, yy = -k * 70; return `<path d="M${-w - 30} ${yy - 40} Q0 ${yy - 78} ${w + 30} ${yy - 40} Q${w} ${yy - 46} ${w - 10} ${yy - 32} L${-w + 10} ${yy - 32} Q${-w} ${yy - 46} ${-w - 30} ${yy - 40}Z"/><rect x="${-w + 20}" y="${yy - 32}" width="${(w - 20) * 2}" height="40"/>`; }).join('')}
  <path d="M-6 -250 L0 -290 L6 -250Z"/></g>`;
function bigTree(x, base, trunk, leaves, glow) {
  seed = 9; let blobs = '';
  for (let i = 0; i < 26; i++) blobs += `<circle cx="${(x + (rnd() - .5) * 900).toFixed(0)}" cy="${(140 + rnd() * 260).toFixed(0)}" r="${(80 + rnd() * 120).toFixed(0)}"/>`;
  return `<path d="M${x - 70} ${base} C${x - 40} 600 ${x - 60} 420 ${x - 20} 300 L${x + 20} 300 C${x + 60} 420 ${x + 40} 600 ${x + 70} ${base}Z" fill="${trunk}"/>
    <g fill="${leaves}">${blobs}</g><g fill="${glow}" opacity=".5">${blobs.replace(/r="(\d+)"/g, (_, r) => `r="${Math.round(r * .35)}"`)}</g>`;
}
function arches(base, height, color) {
  let d = `M0 ${base - height} H${W} V${H} H0Z`;
  for (let x = 30; x < W; x += 140) d += ` M${x} ${base} V${base - height + 90} A50 50 0 0 1 ${x + 100} ${base - height + 90} V${base}Z`;
  return `<path d="${d}" fill="${color}" fill-rule="evenodd"/>`;
}
function wisteria(colorA, colorB) {
  seed = 4; let out = '';
  for (let x = -20; x < W + 20; x += 28) {
    const len = 4 + Math.floor(rnd() * 9);
    for (let k = 0; k < len; k++) out += `<ellipse cx="${(x + Math.sin(k) * 4).toFixed(0)}" cy="${(k * 18 + rnd() * 8).toFixed(0)}" rx="${(13 - k * .9).toFixed(1)}" ry="10" fill="${k % 2 ? colorA : colorB}" opacity="${(1 - k / len * .6).toFixed(2)}"/>`;
  }
  return `<g class="sway">${out}</g>`;
}
function waves(base, color, amp, dur, op = 1) {
  let d = `M0 ${base}`;
  for (let x = 0; x <= W * 2; x += 100) d += ` Q${x + 50} ${base - amp} ${x + 100} ${base}`;
  return `<g class="drift-x" style="--dur:${dur}s"><path d="${d} V${H} H0Z" fill="${color}" opacity="${op}"/></g>`;
}
const orb = (x, y, r, c, glow = 3) => `<circle cx="${x}" cy="${y}" r="${r * glow}" fill="${c}" opacity=".18"/><circle cx="${x}" cy="${y}" r="${r * 1.6}" fill="${c}" opacity=".25"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
function stars(s, n, maxY) { seed = s; let o = ''; for (let i = 0; i < n; i++) o += `<circle class="tw" style="--d:${(rnd() * 4).toFixed(1)}s" cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * maxY).toFixed(0)}" r="${(rnd() * 1.6 + .4).toFixed(1)}" fill="#fff"/>`; return o; }
function clouds(s, n, color, maxY) { seed = s; let o = ''; for (let i = 0; i < n; i++) { const x = rnd() * W, y = 60 + rnd() * maxY, w = 120 + rnd() * 200; o += `<g class="drift-cloud" style="--dur:${(90 + rnd() * 80).toFixed(0)}s;--off:${(-rnd() * 120).toFixed(0)}s"><ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * .22}" fill="${color}"/><ellipse cx="${x - w * .3}" cy="${y - w * .12}" rx="${w * .45}" ry="${w * .25}" fill="${color}"/><ellipse cx="${x + w * .25}" cy="${y - w * .18}" rx="${w * .4}" ry="${w * .28}" fill="${color}"/></g>`; } return o; }
const island = () => `<g class="float"><path d="M1060 250 Q1180 220 1330 245 Q1300 270 1260 300 L1220 420 L1190 330 L1150 380 L1130 300 Q1090 280 1060 250Z" fill="#1E3358"/>
  <path d="M1060 250 Q1180 220 1330 245 Q1200 238 1060 250Z" fill="#9FC7A8"/><path d="M1180 236 L1190 150 L1200 236Z" fill="#E8F1FF" opacity=".9"/>
  <path d="M1172 236 L1190 120 L1208 236Z" fill="none" stroke="#E8F1FF" stroke-width="2" opacity=".5"/></g>`;
const domainRing = () => `<g class="spin-slow" style="transform-origin:800px 520px" fill="none" stroke="#7A5CFF" opacity=".28">
  <circle cx="800" cy="520" r="330" stroke-width="2" stroke-dasharray="4 18"/><circle cx="800" cy="520" r="250" stroke-width="1" stroke-dasharray="60 20"/></g>`;
const railPath = 'M-100 820 C 300 700, 700 640, 1000 600 S 1500 520, 1750 470';

/* ---------- Scene definitions ---------- */
export const SCENES = {
  home: { sky: ['#0B1230', '#1C2A55', '#3A3F6E'], svg: () => stars(1, 90, 520) + ridge(2, 640, 140, 9, '#1A2348') + ridge(3, 740, 90, 8, '#121A38') + ridge(5, 830, 60, 7, '#0B1128'), p: { type: 'mote', n: 50, color: '255,236,190' }, fx: ['shooting'] },
  'realm-anime': { sky: ['#140B2E', '#3D2463', '#E07A9A'], svg: () => stars(7, 70, 380) + orb(1200, 600, 120, '#FFB7A0', 2.2) + skyline(11, 780, '#1F1238', '#FFC7E0') + ridge(12, 880, 50, 8, '#0E0820'), p: { type: 'petal', n: 46, color: '244,182,198' }, fx: ['shooting'] },
  'realm-hoyoverse': { sky: ['#0B1838', '#24477A', '#8FC0DE'], svg: () => stars(13, 60, 300) + island() + ridge(14, 650, 160, 7, '#2C4F7E', .8) + ridge(15, 740, 110, 8, '#1C3560') + ridge(16, 840, 60, 8, '#0F2042'), p: { type: 'mote', n: 50, color: '200,230,255' }, fx: ['rays'] },
  // Anime
  onepiece: { sky: ['#2A7CC7', '#7CC4EE', '#FFE6A8'], svg: () => clouds(21, 6, '#FFFFFF', 260) + orb(1250, 520, 80, '#FFF3C4', 2.5) + `<rect y="600" width="${W}" height="300" fill="#2E73B8"/>` + waves(620, '#3B86C8', 10, 26, .9) + ship(560, 650, .9, '#3A2A1E', '#F3EBD6') + waves(700, '#2560A0', 16, 18) + waves(800, '#1A4A86', 22, 12), p: { type: 'glint', n: 40, color: '255,255,240', minY: .7 }, fx: ['gulls'] },
  demonslayer: { sky: ['#0C0716', '#22122F', '#4A2450'], svg: () => stars(31, 60, 420) + orb(1180, 230, 70, '#F6E7C8', 2.4) + ridge(32, 620, 200, 7, '#2A1638') + ridge(33, 740, 120, 8, '#1A0D26') + ridge(34, 850, 50, 9, '#0E0716') + wisteria('#B993E0', '#8E6AC8'), p: { type: 'petal', n: 60, color: '201,160,232' }, fx: [] },
  naruto: { sky: ['#2B1408', '#B2481F', '#F2A85A'], svg: () => orb(800, 560, 150, '#FFD27A', 1.8) + ridge(41, 520, 60, 4, '#7A3618', .9) + karst(42, 560, '#5A2A14', 5, 120, 220) + skyline(43, 800, '#3A1A0C', '#FFC46A', true) + ridge(44, 880, 30, 9, '#220F06'), p: { type: 'leaf', n: 40, color: '127,178,74' }, fx: [] },
  aot: { sky: ['#1E1A17', '#6E5236', '#E2B475'], svg: () => orb(1300, 640, 110, '#FFD9A0', 2) + wall(720, 260, '#4A3B2E') + skyline(51, 860, '#2A211A', '#FFB46A', true), p: { type: 'dust', n: 50, color: '232,207,160' }, fx: ['birds'] },
  yourname: { sky: ['#0A1040', '#3E3488', '#F28C6E'], svg: () => stars(61, 140, 600) + ridge(62, 640, 120, 6, '#1E1A52') + `<rect y="700" width="${W}" height="200" fill="#2A2A6E" opacity=".9"/><rect y="700" width="${W}" height="200" fill="url(#lakeShine)"/>` + ridge(63, 860, 40, 8, '#0E0C2E'), p: { type: 'twinkle', n: 30, color: '255,240,220' }, fx: ['comet'] },
  jjk: { sky: ['#05050C', '#10102A', '#24163E'], svg: () => domainRing() + skyline(71, 820, '#0B0B1A', '#9A82FF') + ridge(72, 890, 20, 9, '#05050C'), p: { type: 'ember', n: 70, color: '138,92,255' }, fx: ['flames'] },
  // HoYoverse nations
  mondstadt: { sky: ['#3D7EC2', '#8DC9EA', '#EAF4E4'], svg: () => clouds(81, 5, '#FFFFFF', 220).replace(/rx="(\d+(\.\d+)?)"/g, (m, r) => `rx="${(r * .7).toFixed(0)}"`) + ridge(82, 640, 120, 6, '#8DBE6A') + skyline(83, 680, '#6E8FA8', null, true).replace('<g fill="#6E8FA8">', '<g fill="#6E8FA8" transform="translate(-900 0) scale(.6 1)">') + windmill(1380, 700, .75, '#5C4A3A', '#F3EBD6') + ridge(84, 760, 70, 7, '#6FA24E') + ridge(85, 860, 40, 8, '#4E8436'), p: { type: 'dandelion', n: 40, color: '255,255,255' }, fx: ['wind'] },
  liyue: { sky: ['#2A1308', '#A9551F', '#F2C27A'], svg: () => orb(400, 420, 90, '#FFE0A0', 2) + karst(91, 640, '#8A4E28', 7, 200, 380) + karst(92, 760, '#5A2E14', 6, 160, 300) + pavilion(1150, 780, 1, '#2A1408') + ridge(93, 860, 40, 8, '#1E0E05'), p: { type: 'lantern', n: 18, color: '255,170,80' }, fx: [] },
  inazuma: { sky: ['#120826', '#341A5A', '#7A4AA6'], svg: () => stars(101, 50, 360) + ridge(102, 600, 140, 6, '#2A1648') + `<rect y="690" width="${W}" height="210" fill="#1E1240"/>` + torii(1050, 760, 1.1, '#8A2A3A') + ridge(103, 700, 40, 7, '#24123E') + waves(780, '#160C30', 8, 30), p: { type: 'petal', n: 50, color: '244,182,198' }, fx: ['lightning'] },
  sumeru: { sky: ['#0C2216', '#245A34', '#9ACB6A'], svg: () => ridge(111, 640, 160, 7, '#1E4A2C') + bigTree(800, 900, '#2A1E12', '#16361F', '#7FD15A') + ridge(112, 820, 80, 9, '#0F2A18'), p: { type: 'firefly', n: 45, color: '200,240,122' }, fx: ['rays'] },
  fontaine: { sky: ['#0C2647', '#2C6AA8', '#BFE3F5'], svg: () => clouds(121, 4, '#E8F4FF', 220) + skyline(122, 640, '#3A5E88', '#FFE7A8', true) + arches(760, 170, '#1E3A5C') + `<rect y="760" width="${W}" height="140" fill="#1A4A7A"/>` + waves(780, '#2A6AA8', 8, 20, .8) + waves(830, '#163E6A', 12, 14), p: { type: 'bubble', n: 40, color: '220,240,255' }, fx: [] },
  starrail: { sky: ['#04040C', '#0E0E26', '#261C48'], svg: () => stars(131, 220, 900) + `<ellipse cx="1100" cy="300" rx="420" ry="160" fill="#6A4AC8" opacity=".12"/><ellipse cx="1000" cy="320" rx="260" ry="90" fill="#E8C77A" opacity=".08"/>` + `<path d="${railPath}" stroke="#E8C77A" stroke-width="3" fill="none" opacity=".7"/><path d="${railPath}" stroke="#E8C77A" stroke-width="10" fill="none" opacity=".12"/><circle class="train" r="7" fill="#FFF3C4" style="offset-path:path('${railPath}')"/>`, p: { type: 'twinkle', n: 30, color: '255,240,200' }, fx: ['shooting'] },
};

const defs = `<defs><linearGradient id="lakeShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F28C6E" stop-opacity=".35"/><stop offset="1" stop-color="#0A1040" stop-opacity="0"/></linearGradient></defs>`;
const skyCss = (c) => `linear-gradient(180deg, ${c[0]} 0%, ${c[1]} 55%, ${c[2]} 100%)`;

/** Static thumbnail markup for cards. */
export function sceneThumb(key) {
  const s = SCENES[key] || SCENES.home;
  return `<span class="thumb" style="background:${skyCss(s.sky)}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">${defs}${s.svg()}</svg></span>`;
}

/** Mount a live scene into `host`; returns a destroy function. */
export function mountScene(host, key) {
  const s = SCENES[key] || SCENES.home;
  const el = document.createElement('div');
  el.className = 'scene';
  el.style.background = skyCss(s.sky);
  el.innerHTML = `<svg class="scene-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">${defs}${s.svg()}</svg>
    ${s.fx.includes('rays') ? '<div class="fx-rays"></div>' : ''}${s.fx.includes('flames') ? '<div class="fx-flames"></div>' : ''}
    ${s.fx.includes('comet') ? '<div class="fx-comet"><i></i><i></i></div>' : ''}<div class="fx-flash"></div><canvas></canvas>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const stop = particles(el.querySelector('canvas'), s, el.querySelector('.fx-flash'));
  return () => { stop(); el.classList.remove('on'); setTimeout(() => el.remove(), 1200); };
}

/* ---------- Canvas: particles + effects ---------- */
function particles(c, s, flash) {
  const ctx = c.getContext('2d');
  let w, h, ps = [], raf = 0, alive = true, bolt = null, birds = [], streaks = [], shoot = null;
  const P = s.p;
  const spawn = (fresh) => {
    const p = { x: Math.random() * w, y: fresh ? Math.random() * h : 0, r: 1 + Math.random() * 2.5, a: Math.random() * 6.28, v: .3 + Math.random() * .7, s: .6 + Math.random() * .8, ph: Math.random() * 6.28 };
    const rising = ['ember', 'bubble', 'lantern', 'mote', 'firefly'].includes(P.type);
    if (!fresh) p.y = rising ? h + 20 : -20;
    if (P.type === 'glint') p.y = h * (P.minY + Math.random() * (1 - P.minY));
    return p;
  };
  const size = () => { const d = Math.min(devicePixelRatio, 1.5); w = innerWidth; h = innerHeight; c.width = w * d; c.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); ps = Array.from({ length: Math.round(P.n * Math.min(1, w / 1200) + 8) }, () => spawn(true)); };
  const col = (a) => `rgba(${P.color},${a})`;

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      const sway = Math.sin(t / 1400 + p.ph);
      switch (P.type) {
        case 'petal': case 'leaf': case 'dust': case 'dandelion':
          p.y += p.v * (P.type === 'dust' ? .4 : 1); p.x += sway * .8 + (P.type === 'dandelion' ? .9 : .3); p.a += .02;
          if (p.y > h + 20 || p.x > w + 20) Object.assign(p, spawn(false), { x: Math.random() * w * (P.type === 'dandelion' ? .6 : 1) });
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          if (P.type === 'petal') { ctx.fillStyle = col(.85); ctx.beginPath(); ctx.ellipse(0, 0, 6 * p.s, 3.5 * p.s, 0, 0, 6.28); ctx.fill(); }
          else if (P.type === 'leaf') { ctx.fillStyle = col(.9); ctx.beginPath(); ctx.moveTo(-8 * p.s, 0); ctx.quadraticCurveTo(0, -6 * p.s, 8 * p.s, 0); ctx.quadraticCurveTo(0, 6 * p.s, -8 * p.s, 0); ctx.fill(); }
          else if (P.type === 'dust') { ctx.fillStyle = col(.35); ctx.beginPath(); ctx.arc(0, 0, p.r * .8, 0, 6.28); ctx.fill(); }
          else { ctx.strokeStyle = col(.8); ctx.lineWidth = .8; for (let k = 0; k < 8; k++) { ctx.rotate(.785); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5 * p.s, 0); ctx.stroke(); } }
          ctx.restore(); break;
        case 'ember': case 'bubble': case 'lantern': case 'mote': case 'firefly': {
          const sp = { ember: 1.2, bubble: .6, lantern: .35, mote: .3, firefly: .15 }[P.type];
          p.y -= p.v * sp; p.x += sway * (P.type === 'firefly' ? 1.2 : .4);
          if (p.y < -30) Object.assign(p, spawn(false));
          const fl = .5 + Math.sin(t / 300 + p.ph) * .5;
          if (P.type === 'bubble') { ctx.strokeStyle = col(.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.5, 0, 6.28); ctx.stroke(); ctx.fillStyle = col(.5); ctx.beginPath(); ctx.arc(p.x - p.r, p.y - p.r, p.r * .5, 0, 6.28); ctx.fill(); }
          else if (P.type === 'lantern') { const lw = 10 * p.s, lh = 14 * p.s; ctx.shadowColor = col(.9); ctx.shadowBlur = 20; ctx.fillStyle = col(.85); ctx.beginPath(); ctx.roundRect(p.x - lw / 2, p.y - lh / 2, lw, lh, 4); ctx.fill(); ctx.shadowBlur = 0; }
          else { ctx.shadowColor = col(1); ctx.shadowBlur = P.type === 'ember' ? 10 : 14; ctx.fillStyle = col(P.type === 'firefly' ? .3 + fl * .7 : .5 + fl * .4); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (P.type === 'ember' ? .9 : .8), 0, 6.28); ctx.fill(); ctx.shadowBlur = 0; }
          break; }
        case 'glint': case 'twinkle': {
          const a = Math.max(0, Math.sin(t / 500 + p.ph * 3)) ; ctx.fillStyle = col(a * .9);
          if (P.type === 'glint') { ctx.fillRect(p.x - 6, p.y, 12 * a, 1.5); }
          else { ctx.save(); ctx.translate(p.x, p.y * .7); ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.rotate(1.5708); ctx.moveTo(0, 0); ctx.lineTo(0, 6 * a * p.s); } ctx.strokeStyle = col(a); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); }
          break; }
      }
    }
    fx(t);
    if (alive && !reduce.matches) raf = requestAnimationFrame(draw);
  }

  function fx(t) {
    if (s.fx.includes('lightning')) {
      if (!bolt && Math.random() < .004) { const x = w * (.2 + Math.random() * .6); let y = 0, pts = [[x, 0]]; while (y < h * .55) { y += 20 + Math.random() * 30; pts.push([pts.at(-1)[0] + (Math.random() - .5) * 60, y]); } bolt = { pts, life: 14 }; flash.classList.add('on'); setTimeout(() => flash.classList.remove('on'), 120); }
      if (bolt) { ctx.strokeStyle = `rgba(220,190,255,${bolt.life / 14})`; ctx.lineWidth = 2.5; ctx.shadowColor = '#C9A0FF'; ctx.shadowBlur = 18; ctx.beginPath(); bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.shadowBlur = 0; if (--bolt.life <= 0) bolt = null; }
    }
    if (s.fx.includes('birds') || s.fx.includes('gulls')) {
      if (birds.length < 9 && Math.random() < .02) birds.push({ x: -30, y: h * (.15 + Math.random() * .3), v: 1 + Math.random(), ph: Math.random() * 6 });
      ctx.strokeStyle = s.fx.includes('gulls') ? 'rgba(255,255,255,.9)' : 'rgba(30,20,12,.8)'; ctx.lineWidth = 2;
      birds = birds.filter((b) => b.x < w + 40);
      for (const b of birds) { b.x += b.v; b.y += Math.sin(t / 900 + b.ph) * .3; const f = Math.sin(t / 120 + b.ph) * 5; ctx.beginPath(); ctx.moveTo(b.x - 9, b.y - f); ctx.quadraticCurveTo(b.x - 4, b.y - 3, b.x, b.y); ctx.quadraticCurveTo(b.x + 4, b.y - 3, b.x + 9, b.y - f); ctx.stroke(); }
    }
    if (s.fx.includes('wind')) {
      if (streaks.length < 6 && Math.random() < .03) streaks.push({ x: -200, y: h * Math.random() * .7, len: 120 + Math.random() * 200, v: 4 + Math.random() * 3 });
      streaks = streaks.filter((k) => k.x < w + 300);
      for (const k of streaks) { k.x += k.v; const g = ctx.createLinearGradient(k.x, 0, k.x + k.len, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.quadraticCurveTo(k.x + k.len / 2, k.y - 12, k.x + k.len, k.y); ctx.stroke(); }
    }
    if (s.fx.includes('shooting')) {
      if (!shoot && Math.random() < .004) shoot = { x: w * Math.random(), y: h * Math.random() * .3, life: 40 };
      if (shoot) { const k = 1 - shoot.life / 40, x = shoot.x + k * 260, y = shoot.y + k * 120; const g = ctx.createLinearGradient(x - 120, y - 55, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,250,230,${shoot.life / 40})`); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 120, y - 55); ctx.lineTo(x, y); ctx.stroke(); if (--shoot.life <= 0) shoot = null; }
    }
  }

  size(); addEventListener('resize', size);
  raf = requestAnimationFrame(draw);
  return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); };
}
