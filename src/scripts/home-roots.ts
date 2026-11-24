import { rng } from "./home-scene";

type Seg = { x0: number; y0: number; x1: number; y1: number; w: number; born: number; line?: string; tip?: string };

const STEP = 10, NIB = .7;

const canvas = document.querySelector<HTMLCanvasElement>("#home-roots");
const section = document.getElementById("episodes");
const ctx = canvas?.getContext("2d");

if (canvas && section && ctx) {
  const root = document.documentElement;
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  let segs: Seg[] = [], top = 0, left = 0, right = 0, reach = 0, raf = 0;

  const build = () => {
    const box = section.getBoundingClientRect();
    const W = root.clientWidth, H = box.height;
    top = box.top + scrollY; left = box.left; right = box.right;
    const r = rng(Math.floor(Date.now() / 864e5)), out: Seg[] = [];
    const gutter = left, home = gutter > 90 ? gutter * .5 : 10, dive = (right - left) * .4 + gutter - home;
    const lanes = [1, -1].map(side => {
      const phase = r() * 6, period = 500 + r() * 400;
      return (y: number) => { const x = home + dive * Math.max(0, Math.sin(y / period + phase)) ** 3; return side > 0 ? x : W - x; };
    });
    const grow = (x: number, y: number, ang: number, w: number, length: number, lane: ((y: number) => number) | null, born: number, depth: number) => {
      let bend = 0;
      const end = Math.min(length, (H - y) * 1.3);
      for (let d = 0; d < length && y < H; d += STEP) {
        const pull = lane === null ? 0 : Math.max(-.6, Math.min(.6, (lane(y) - x) * .006));
        bend = bend * .85 + (r() - .5) * .03;
        ang = Math.max(-1.3, Math.min(1.3, ang + bend + (pull - ang) * (lane === null ? .01 : .08)));
        const x1 = x + Math.sin(ang) * STEP, y1 = y + Math.cos(ang) * STEP;
        const b = lane === null ? born + d : y, t = d / end;
        const pen = w * (.3 + .7 * Math.abs(Math.sin(ang - NIB))) * (t > .8 ? Math.max(.15, (1 - t) * 5) : 1);
        out.push({ x0: x, y0: y, x1, y1, w: pen, born: b });
        if (depth > 0 && d > 20 && r() < (lane === null ? .05 : .09)) {
          grow(x1, y1, ang + (r() < .5 ? -1 : 1) * (.6 + r() * .6), w * .55, (lane === null ? 40 : 90) + r() * 160, null, b, depth - 1);
        }
        x = x1; y = y1; w *= lane === null ? .99 : .9996;
      }
    };
    const cx = W / 2;
    lanes.forEach((lane, i) => grow(cx + (i ? 8 : -8), 0, i ? 1 : -1, 4, H, lane, 0, 2));
    grow(cx, 0, 0, 2, 320, null, 0, 1);
    segs = out;
    tint();
  };

  const tint = () => {
    const dark = root.dataset.theme === "dark", ink = dark ? [207, 201, 168] : [140, 122, 82];
    const bg = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? [0, 0, 0]).map(Number);
    const mix = (a: number) => `rgb(${ink.map((v, i) => Math.round(bg[i] + (v - bg[i]) * a)).join()})`;
    for (const s of segs) {
      const depth = Math.min(s.x1 - left, right - s.x1), a = (dark ? .5 : .65) - (dark ? .4 : .52) * Math.max(0, Math.min(1, (depth + 20) / 80));
      s.line = mix(a); s.tip = mix(Math.min(1, a * 1.8));
    }
  };

  const target = () => {
    if (calm.matches) return Infinity;
    const rest = root.scrollHeight - innerHeight - scrollY;
    const near = 1 - Math.min(1, rest / innerHeight);
    return scrollY - top + innerHeight * (.8 + .2 * near) + 400 * near;
  };

  const draw = () => {
    raf = 0;
    const dpr = Math.min(devicePixelRatio || 1, 1.5), W = Math.round(root.clientWidth * dpr), H = Math.round(innerHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const goal = target();
    reach = goal === Infinity ? 1e9 : Math.max(reach, reach + (goal - reach) * .08);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(0, top - scrollY);
    ctx.lineCap = "round";
    const y0 = scrollY - top - 20, y1 = y0 + innerHeight + 40;
    for (const s of segs) {
      if (s.born > reach || s.y1 < y0 || s.y0 > y1) continue;
      const k = Math.min(1, (reach - s.born) / STEP), x = s.x0 + (s.x1 - s.x0) * k, y = s.y0 + (s.y1 - s.y0) * k;
      ctx.strokeStyle = s.line!;
      ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(x, y); ctx.stroke();
      if (k < 1 && s.w > 1.5) { ctx.fillStyle = s.tip!; ctx.beginPath(); ctx.arc(x, y, s.w * .8, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    if (goal !== Infinity && goal - reach > .5) raf = requestAnimationFrame(draw);
  };

  const kick = () => { raf ||= requestAnimationFrame(draw); };
  const rebuild = () => { build(); kick(); };
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", rebuild);
  new ResizeObserver(rebuild).observe(section);
  new MutationObserver(() => { cancelAnimationFrame(raf); tint(); draw(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  calm.addEventListener("change", kick);
  rebuild();
}
