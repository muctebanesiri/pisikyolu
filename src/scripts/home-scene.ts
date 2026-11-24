type RGB = number[];
type Ctx = CanvasRenderingContext2D;
interface Light { at: number; lean: number; spread: number; room: number }
interface Geo extends Light { w: number; h: number; ox: number; oy: number; s: number; dpr: number; day: boolean }

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - Math.pow(1 - x, 3);
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const C = { sky: "#0F120B", soil: "#080A06", root: "#CFC9A8", ink: "#F2ECD2", leaf: "#7FDB6A", hot: "#F0BE4A" };
const PALE = "#F1E3A0";
const hx = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixc = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const tri = (c: RGB[], t: number) => t < .5 ? mixc(c[0], c[1], t * 2) : mixc(c[1], c[2], t * 2 - 1);
const LOW = ["#DE7F2A", "#E9C552", "#9BC24A"].map(hx);
const HIGH = ["#A5D860", "#55C48A", "#3FB7B0"].map(hx);
const MID = ["#2E4A1A", "#9BC24A", PALE].map(hx);
const DUST = ["#6B4526", "#8A7030", "#35603C", "#4A3320", "#7A6A3A", "#2C4A52"].map(hx);
const K = 110, PT = .85, LOOP = 14, END = 2.2, PASS = 1800;
const LEAF_DARK = css(mixc(hx(C.soil), hx(C.leaf), .55));

let clock = Infinity;
let idle: number | null = null;
let idleK = 0;
let wave: { t: number; dir: number } | null = null;
const span = ([a, b]: number[], d = 0) => clock === Infinity ? 1 : ease(clamp01((clock - a - d) / (b - a)));
const turn = (n = 1, ph = 0) => idle === null ? 0 : idleK * Math.sin(TAU * n * idle + ph);

function leafPath(ctx: Ctx, L: number, w: number) {
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.bezierCurveTo(L * .12, -w * 1.15, L * .62, -w * 1.25, L, 0);
  ctx.bezierCurveTo(L * .78, w * .7, L * .3, w * .85, 0, 0);
}

function paintSprout(ctx: Ctx, x: number, y: number, k: number, lw: number, grow: number, dirn: number) {
  if (grow <= 0) return;
  const st = clamp01(grow / .45), lf = ease(clamp01((grow - .25) / .75));
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = C.leaf; ctx.fillStyle = C.leaf; ctx.lineWidth = lw * 1.35 / k; ctx.lineCap = "round";
  ctx.save(); ctx.scale(1, st); ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(.02, -.14, -.05, -.26, -.03, -.42); ctx.restore(); ctx.stroke();
  if (lf > 0) {
    const r = rng(19), n = Math.hypot(dirn, .8), lx = dirn / n, ly = -.8 / n;
    const leaves = [[-.03, -.4 * st, -.03 - .83 * lf, -.4 * st - .98 * lf, .36 * lf], [-.01, -.26 * st, -.01 + 1.09 * lf, -.26 * st - .62 * lf, .3 * lf]];
    for (const [bx, by, tx, ty, w] of leaves) {
      const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const side = -Math.sin(th) * lx + Math.cos(th) * ly, sh = (t: number) => Math.sin(Math.PI * Math.min(1, t)) * .85;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(th);
      ctx.globalAlpha = 1; ctx.fillStyle = C.leaf; leafPath(ctx, L, w); ctx.fill();
      leafPath(ctx, L, w); ctx.clip();
      for (let j = 0; j < 30; j++) {
        const v = -1.1 + r() * 1.8, b = .5 + .5 * v * side / 1.1 + (r() - .5) * .3, t0 = r() * .35, t1 = .6 + r() * .5;
        if (b < .45) { ctx.strokeStyle = LEAF_DARK; ctx.globalAlpha = Math.min(PT, .8) * (.45 - b) / .45 * .6; }
        else if (b > .58) { ctx.strokeStyle = PALE; ctx.globalAlpha = PT * Math.min(1, (b - .58) / .4) * .85; }
        else continue;
        ctx.lineWidth = w * (.16 + r() * .14);
        ctx.beginPath(); ctx.moveTo(L * t0, v * w * sh(t0)); ctx.quadraticCurveTo(L * (t0 + t1) / 2, v * w * 1.05, L * Math.min(1, t1), v * w * sh(t1)); ctx.stroke();
      }
      ctx.strokeStyle = LEAF_DARK; ctx.globalAlpha = PT * .35; ctx.lineWidth = w * .07;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * .5, -w * .12, L * .92, 0); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

const ROOTS = (() => {
  type Pt = number[];
  const r = rng(31), segs: number[][] = [], lines: [Pt, Pt, number, number][] = [];
  const todo = [-.95, 0, .95].map(a0 => [0, 0, a0, a0 ? 150 : 104, 11, 4, -1]);
  const cross = (a: Pt, b: Pt, p: Pt, q: Pt) => {
    const d = (u: Pt, v: Pt, w: Pt) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    return d(a, b, p) * d(a, b, q) < 0 && d(p, q, a) * d(p, q, b) < 0;
  };
  const near = (pt: Pt, a: Pt, b: Pt) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(pt[0] - a[0] - vx * t, pt[1] - a[1] - vy * t);
  };
  while (todo.length) {
    const [x, y, ang0, len0, w, d, from] = todo.shift()!;
    for (let tries = 0; tries < 14; tries++) {
      const ang = ang0 + (tries ? (r() - .5) * .25 * tries : 0), len = len0 * (1 - tries * .05);
      const x1 = x + Math.sin(ang) * len, y1 = y + Math.cos(ang) * len, bend = (r() - .5) * len * .5;
      const qx = (x + x1) / 2 + Math.cos(ang) * bend, qy = (y + y1) / 2 - Math.sin(ang) * bend;
      const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8, m = 1 - t; return [m * m * x + 2 * m * t * qx + t * t * x1, m * m * y + 2 * m * t * qy + t * t * y1]; });
      const hit = y1 < 6 || lines.some(([a, b, id, par]) => id !== from && pts.some((pt, i) => i > 0 && (cross(pts[i - 1], pt, a, b) || ((par !== from || i > 3) && near(pt, a, b) < 9))));
      if (hit) continue;
      const id = segs.push([x, y, qx, qy, x1, y1, w, d]) - 1;
      pts.forEach((pt, i) => { if (i) lines.push([pts[i - 1], pt, id, from]); });
      if (d > 1) for (const side of [-1, 1]) todo.push([x1, y1, ang * .55 + side * (.32 + r() * .4), len * (.62 + r() * .16), w * .66, d - 1, id]);
      break;
    }
  }
  return { segs, depth: Math.max(...segs.map(q => Math.max(q[3], q[5]))) };
})();

// Painted in the cover's own units: the sprout stands at (500, 400) and one unit is `s` pixels.
// Sky and soil run out to the canvas edges, so any shape of canvas gets the same plant.
function paint(ctx: Ctx, { w, h, ox, oy, s, dpr, at, lean, spread, room, day }: Geo) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox - 500 * s), dpr * (oy - 400 * s));
  const U0 = 500 - ox / s, U1 = 500 + (w - ox) / s, V0 = 400 - oy / s, V1 = 400 + (h - oy) / s, wide = (U1 - U0) / 1000;
  const hy = 400, cx = 500, up = span([.1, 1.2]);
  const clear = (x: number, y: number) => Math.abs(x - cx) < K * 1.4 && y > hy - K * 1.9;
  const hem = (u: number) => { const hill = Math.exp(-(((u - .5) / .2) ** 2)); return hy + (1 - hill) * (44 + Math.sin(u * 5.2 + 1) * 20 + Math.sin(u * 11 + 2) * 8); };
  const base = hy + 80, near = (x: number) => clamp01((Math.abs(x - cx) - K * .85) / (K * .9));
  const reach = Math.max(1, (306 - V0) / 375);
  const Hh = (u: number) => (232 + 46 * Math.sin(u * 7 + .5)) * up * reach;
  const lit = (u: number) => Math.exp(-(((u - at) / spread) ** 2));
  const ww = Math.max(90, (U1 - U0) * .11), wt = wave ? wave.t * wave.t * (3 - 2 * wave.t) : 0;
  const wc = wave ? U0 - ww * 2.5 + (U1 - U0 + ww * 5) * (wave.dir > 0 ? wt : 1 - wt) : 0;
  const swell = (x: number) => wave ? Math.exp(-(((x - wc) / ww) ** 2)) : 0;

  ctx.save(); ctx.beginPath(); ctx.rect(U0, V0, U1 - U0, base - V0); ctx.clip();
  if (!day) {
    ctx.globalAlpha = 1; ctx.fillStyle = C.sky; ctx.fillRect(U0, V0, U1 - U0, V1 - V0);
    ctx.globalAlpha = .5; ctx.fillStyle = "#000"; ctx.fillRect(U0, V0, U1 - U0, base - V0);

    const g = ctx.createRadialGradient(cx, hy - 100, 0, cx, hy - 100, 160);
    g.addColorStop(0, "rgba(74,88,38,.42)"); g.addColorStop(.5, "rgba(74,88,38,.1)"); g.addColorStop(1, "rgba(74,88,38,0)");
    ctx.globalAlpha = up; ctx.fillStyle = g; ctx.fillRect(cx - 160, hy - 260, 320, 320);
  }
  const N = 200, step = 1000 / N, q0 = Math.floor(U0 / step) - 1, q1 = Math.ceil(U1 / step) + 1;
  ctx.lineCap = "butt";
  [[1, .25], [.72, .1], [.34, 0]].forEach(([tall, floor], pi) => {
    for (let q = q0; q < q1; q++) {
      const r = rng(41 + q * 7919 + pi * 104729); r();
      const u = (q + r()) / N, frac = ((q * .618) % 1 + 1) % 1;
      const gq = span([0, .9], Math.abs(u - at) * .5 + frac * .25 + pi * .12);
      const wv = idle !== null ? 1 + .42 * turn(4, -u * 16) + .22 * turn(1, -u * 5 + pi) : clock === Infinity ? 1 : 1 + .45 * Math.sin(u * 16 - clock * 6) * (1 - span([1.2, 2.2]));
      const x = u * 1000, hm = hem(u), light = lit(u), sw = swell(x);
      const top = (day ? .5 : 1) * Hh(u) * (.5 + r() * .6) * tall * 1.5 * (.3 + .7 * light) * (1 + .6 * (r() - .6) * .9) * (.2 + .8 * gq) * (1 + .22 * sw);
      const vw = (1 + .6 * r() ** 3 * 4) * (r() < .6 * .22 ? 0 : 1), va = .62 + .38 * Math.sin(u * 41 + pi * 2) * Math.sin(u * 13 + 1);
      const gap = pi ? near(x) : 1;
      if (!gap || (day && !pi) || (light < floor * 2 && pi === 2) || !vw || top < 2) continue;
      const rc = rng(977 + q * 31 + pi * 613);
      const tb = clamp01((.5 + .5 * Math.sin(u * 9.3 + pi) * Math.sin(u * 3.1 + 2)) * .7 + rc() * .7 - .2);
      const tt = clamp01((.5 + .5 * Math.sin(u * 6.1 + 4 + pi * 2)) * .6 + rc() * .8 - .2);
      const dim = pi ? 1 : .45, pale = pi === 2 ? .5 : 0, tone = (c: RGB) => mixc(c.map(v => v * dim), MID[2], pale);
      const lo = tone(tri(LOW, tb)), hi = tone(tri(HIGH, tt));
      const g = ctx.createLinearGradient(0, hm, 0, hm - top);
      g.addColorStop(0, css(lo)); g.addColorStop(.07 + rc() * .2, css(mixc(MID[pi], lo, .25))); g.addColorStop(.5 + rc() * .15, css(hi)); g.addColorStop(1, css(hi, 0));
      ctx.globalAlpha = (day ? .8 : 1) * Math.max(0, Math.min(1, Math.min(1, (floor + light) * (.45 + r() * .55)) * (pi === 2 ? light : 1) * va * gq * wv * gap * (1 + (day ? 0 : 2.6) * sw)));
      ctx.strokeStyle = g; ctx.lineWidth = step * (1 + r() * .6) * vw;
      ctx.beginPath(); ctx.moveTo(x, hm); ctx.lineTo(x + (u - .5) * 60 * top / 300 + (day && wave ? wave.dir * sw * top * .35 : 0), hm - top); ctx.stroke();
    }
  });
  if (!day) {
  const vh = (hy - V0) * .4, vg = ctx.createLinearGradient(0, V0, 0, V0 + vh);
  vg.addColorStop(0, C.sky); vg.addColorStop(1, C.sky + "00");
  ctx.globalAlpha = .85; ctx.fillStyle = vg; ctx.fillRect(U0, V0, U1 - U0, vh);
  ctx.globalCompositeOperation = "lighter";
  const gz = rng(71), GH = 306 - V0, GW = U1 - U0, ax = U0 + GW * .06, ay = V0 + GH * .1, bx = U0 + GW * .92, by = V0 + GH * .6;
  const band = (k: number) => { const t = gz(), off = (gz() + gz() + gz() - 1.5) * GH * k; return [ax + (bx - ax) * t - off * .35, ay + (by - ay) * t + off]; };
  for (let q = 0, n = Math.round(24 * wide) + 8; q < n; q++) {
    const [x, y] = band(.2), rad = GH * (.07 + gz() * .17), c = DUST[Math.floor(gz() * DUST.length)], g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, css(c, 1)); g.addColorStop(1, css(c, 0));
    ctx.globalAlpha = up * (.16 + gz() * .2); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let q = 0, n = Math.round(80 * wide); q < n; q++) {
    const [x, y] = band(.12), rad = .5 + gz() ** 3 * 1.4, a = .2 + gz() * .55, tw = gz();
    ctx.globalAlpha = a * up * (1 + .3 * turn(3, tw * TAU)); ctx.fillStyle = q % 4 ? C.ink : "#FFDDA0";
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  {
    const x = ax + (bx - ax) * .27, y = ay + (by - ay) * .27 - GH * .1, k = 1 + .18 * turn(2), g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    g.addColorStop(0, "rgba(255,244,214,.9)"); g.addColorStop(.18, "rgba(255,236,190,.28)"); g.addColorStop(1, "rgba(255,236,190,0)");
    ctx.globalAlpha = up; ctx.fillStyle = g; ctx.fillRect(x - 16, y - 16, 32, 32);
    ctx.strokeStyle = "#FFF4D6"; ctx.lineCap = "round"; ctx.lineWidth = .9; ctx.globalAlpha = up * .6;
    ctx.beginPath(); ctx.moveTo(x - 13 * k, y); ctx.lineTo(x + 13 * k, y); ctx.moveTo(x, y - 17 * k); ctx.lineTo(x, y + 17 * k); ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  const sr = rng(61); ctx.fillStyle = C.ink;
  for (let q = 0, n = Math.round(46 * wide * reach); q < n; q++) {
    const u = U0 / 1000 + sr() * wide, y = V0 + sr() ** 1.4 * (hem(u) - 150 - V0), rad = .7 + sr() ** 3 * 1.3, a = .16 + sr() * .34, tw = sr();
    ctx.globalAlpha = a * up * (1 + .35 * turn(3, tw * TAU));
    ctx.beginPath(); ctx.arc(u * 1000, y, rad, 0, TAU); ctx.fill();
  }
  if (idle !== null && !day) {
    const m = rng(5);
    for (let q = 0, n = Math.round(34 * wide); q < n; q++) {
      const u = U0 / 1000 + m() * wide, sd = m(), ph = (idle * (1 + (q % 2)) + sd) % 1;
      const x = u * 1000 + 18 * Math.sin(TAU * (idle * 2 + sd)) + ph * (u - .5) * 60, y = hem(u) - 6 - ph * (150 + m() * 190), rad = 1.6 + m() * 2.6;
      ctx.globalAlpha = Math.max(0, idleK * Math.sin(Math.PI * ph) ** 1.5 * (.55 + .45 * Math.sin(TAU * (idle * 5 + sd * 3))) * .9 * Math.min(1, (.35 + .65 * lit(u)) * (1 + swell(x))));
      ctx.fillStyle = q % 3 ? PALE : C.hot;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
  }
  const rm = rng(43); ctx.lineCap = "round"; ctx.strokeStyle = PALE;
  for (let q = 0, n = Math.round(90 * wide); q < n; q++) {
    const u = U0 / 1000 + rm() * wide, x = u * 1000, l = .008 + rm() * .02, a = rm(), lw = rm(), lift = rm();
    if (clear(x, hem(u))) continue;
    ctx.globalAlpha = Math.min(1, span([.1, .8], Math.abs(u - at) * .4) * lit(u) ** 1.5 * .8 * (.3 + a * .7) * (1 + swell(x))); ctx.lineWidth = 1.5 + lw * 3;
    ctx.beginPath(); ctx.moveTo(x - l * 1000, hem(u - l) - 1); ctx.quadraticCurveTo(x, hem(u) - 1 - lift * 2, x + l * 1000, hem(u + l) - 1); ctx.stroke();
  }
  }
  ctx.restore();

  const soil = ctx.createLinearGradient(0, hy, 0, hy + 480);
  if (day) { soil.addColorStop(0, "rgba(140,110,60,.22)"); soil.addColorStop(.5, "rgba(140,110,60,.06)"); soil.addColorStop(1, "rgba(140,110,60,0)"); }
  else { soil.addColorStop(0, "#3D2F1A"); soil.addColorStop(.35, "#261E12"); soil.addColorStop(1, C.soil); }
  ctx.globalAlpha = 1; ctx.fillStyle = soil; ctx.beginPath(); ctx.moveTo(U0, V1);
  for (let x = U0; x < U1 + 8; x += 8) ctx.lineTo(x, hem(x / 1000));
  ctx.lineTo(U1, V1); ctx.fill();
  const sm = rng(59), SOILS = ["#6A5230", "#54401F", "#120E08"]; ctx.lineCap = "round";
  for (let i = 0, n = day ? 0 : Math.round(90 * wide); i < n; i++) {
    const x = U0 + sm() * wide * 1000, d = sm() ** 1.6 * 440, l = 36 + sm() * 130, y0 = hem((x - l) / 1000) + 16 + d, y1 = hem((x + l) / 1000) + 16 + d;
    ctx.strokeStyle = SOILS[Math.floor(sm() * 3)]; ctx.globalAlpha = (.1 + sm() * .16) * (1 - d / 440); ctx.lineWidth = 4 + sm() * 11;
    ctx.beginPath(); ctx.moveTo(x - l, y0); ctx.quadraticCurveTo(x, hem(x / 1000) + 16 + d + (sm() - .5) * 8, x + l, y1); ctx.stroke();
  }
  const hr = rng(53); ctx.lineCap = "round"; ctx.strokeStyle = "#3D2F1A";
  for (let i = 0, n = Math.round(140 * wide); i < n; i++) {
    const x = U0 + hr() * wide * 1000, l = 8 + hr() * 26, y = hem(x / 1000) - hr() * 9 * PT;
    ctx.globalAlpha = (day ? .35 : 1) * (.5 + hr() * .5); ctx.lineWidth = 3 + hr() * 5;
    ctx.beginPath(); ctx.moveTo(x - l, y); ctx.lineTo(x + l, y + (hr() - .5) * 3); ctx.stroke();
  }

  ctx.save(); ctx.translate(cx, hy);
  const ink = day ? "#8C7A52" : C.root, fit = room / ROOTS.depth, dirn = (lean - .5) * 2;
  ctx.scale(fit, fit);
  const rr = rng(77), lg = ctx.createLinearGradient(0, 0, 0, room / fit * .62);
  lg.addColorStop(0, PALE); lg.addColorStop(1, PALE + "00");
  const line = (q: number[], o = 0) => { ctx.beginPath(); ctx.moveTo(q[0] + o, q[1]); ctx.quadraticCurveTo(q[2] + o, q[3] + o * .4, q[4] + o, q[5]); ctx.stroke(); };
  for (const q of ROOTS.segs) {
    const d = q[7], a = span([.4 + (4 - d) * .12, 1 + (4 - d) * .12]) * (1 - .8 * clamp01(q[5] * fit / room)), lw = Math.max(q[6], 2.4 / fit) * 3;
    for (const b of [-1, 0, 1]) {
      ctx.strokeStyle = ink; ctx.globalAlpha = a * (b ? .5 + rr() * .35 : 1); ctx.lineWidth = lw * (b ? .55 : 1 - .15 * PT);
      ctx.setLineDash(b ? [18 + rr() * 60, (3 + rr() * 12) * PT] : []); line(q, b * lw * .32);
    }
    ctx.setLineDash([]); if (day) continue; ctx.strokeStyle = lg; ctx.globalAlpha = a * PT * .8; ctx.lineWidth = lw * .45; line(q, dirn * lw * .3);
  }
  ctx.restore();

  ctx.globalAlpha = 1;
  paintSprout(ctx, cx, hy, K, K * .067, span([.9, 1.8]), dirn);
  ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, hy, 11, 0, TAU); ctx.fill();
}

const scene = document.querySelector<HTMLCanvasElement>("#home-scene");
const plot = document.getElementById("home-plot");
const brand = document.getElementById("home-brand");
const taglines = Array.from(brand?.querySelectorAll<HTMLElement>(".brand-taglines li") ?? []);
const ctx = scene?.getContext("2d");

if (scene && plot && brand && ctx) {
  const root = document.documentElement;
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const desk = matchMedia("(min-width: 960px)");
  const SKIES = [.58, .44, .68, .5];
  let geo: Geo | null = null;
  let raf = 0;
  let start: number | null = null;
  let sky = SKIES[0], skyFrom = sky, passAt: number | null = null, passDir = 1;

  const skyNow = (now: number) => {
    const p = passAt === null || calm.matches ? 1 : clamp01((now - passAt) / PASS);
    return [skyFrom + (sky - skyFrom) * p * p * (3 - 2 * p), p];
  };

  const measure = () => {
    const p = plot.getBoundingClientRect(), s = p.width / 560;
    const big = desk.matches, full = big && root.dataset.theme === "dark";
    const w = !big || full ? root.clientWidth : Math.round(p.right + 40);
    const h = big ? innerHeight : Math.round(brand.getBoundingClientRect().bottom + scrollY);
    const room = p.height * .5 / s - 6;
    if (!(s > 0) || room <= 0) { geo = null; return; }
    const dpr = Math.min(devicePixelRatio || 1, 1.5), W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (scene.width !== W || scene.height !== H) { scene.width = W; scene.height = H; }
    scene.style.width = `${w}px`; scene.style.height = `${h}px`;
    geo = { w, h, ox: p.left + scrollX + p.width / 2, oy: p.top + scrollY + p.height * .5, s, dpr, at: sky, lean: .58, spread: full ? 1.5 : .8, room, day: root.dataset.theme !== "dark" };
  };

  const frame = (now: number) => {
    raf = 0;
    if (!geo) return;
    const [at, pass] = skyNow(now);
    wave = pass < 1 ? { t: pass, dir: passDir } : null;
    geo.at = at;
    if (calm.matches) { clock = Infinity; idle = null; }
    else {
      start ??= now;
      const t = (now - start) / 1000;
      if (t < END) { clock = t; idle = null; }
      else { clock = Infinity; idle = (t - END) / LOOP % 1; idleK = ease(clamp01((t - END) / 1.5)); }
    }
    paint(ctx, geo);
    if (!calm.matches && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const kick = () => { measure(); raf ||= requestAnimationFrame(frame); };
  let line = 0, sayTimer = 0;
  const say = (next: number) => {
    line = next % taglines.length;
    taglines.forEach((item, i) => item.toggleAttribute("data-on", i === line));
    clearTimeout(sayTimer);
    if (!calm.matches) sayTimer = window.setTimeout(() => say(line + 1), 7000);
  };
  say(0);

  document.addEventListener("home:moment", (event) => {
    const { index, direction } = (event as CustomEvent<{ index: number; direction: number }>).detail;
    const now = performance.now();
    skyFrom = skyNow(now)[0]; sky = SKIES[index % SKIES.length]; passAt = now; passDir = direction;
    say(index);
    kick();
  });
  new MutationObserver(kick).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  new ResizeObserver(kick).observe(brand);
  calm.addEventListener("change", kick);
  addEventListener("resize", kick);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  kick();
}
