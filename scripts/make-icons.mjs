// Rasterizes the WTP mark (geometry mirrored from public/wtp-mark.svg) to PNG with no extra deps.
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

const STOPS = [[0, [0x6c, 0xd7, 0xff]], [0.48, [0x00, 0x7a, 0xff]], [1, [0x55, 0x51, 0xc7]]];
const gradient = (x, y) => { // linear from (3,2) to (29,31) in 32-unit space
  const dx = 26, dy = 29; const t = Math.max(0, Math.min(1, ((x - 3) * dx + (y - 2) * dy) / (dx * dx + dy * dy)));
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) { const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i]; const u = (t - t0) / (t1 - t0); return c0.map((v, k) => v + (c1[k] - v) * u); }
  return STOPS[2][1];
};
const PATH = [[8, 22.5], [8, 10.4], [8.4, 9.4], [9.65, 8.75], [10.6, 9.1], [11, 9.5], [15.07, 15.55], [19.15, 9.5], [19.55, 9.1], [20.5, 8.75], [21.75, 9.4], [22.2, 10.4], [22.2, 22.5]];
const segDist = (px, py, [ax, ay], [bx, by]) => { const vx = bx - ax, vy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
const roundRectIn = (x, y) => { const r = 10, x0 = 1, x1 = 31; const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(x0 + r, Math.min(x1 - r, y)); return x >= x0 && x <= x1 && y >= x0 && y <= x1 && Math.hypot(x - cx, y - cy) <= r; };

function sample(x, y, { maskable }) { // x,y in 32-space -> [r,g,b,a] premultiplied-free
  let bg = maskable ? 1 : (roundRectIn(x, y) ? 1 : 0);
  if (!bg) return [0, 0, 0, 0];
  let c = gradient(x, y), a = 1;
  let mx = x, my = y;
  if (maskable) { mx = 16 + (x - 16) / 0.68; my = 16 + (y - 16) / 0.68; }
  const inside = (cond, alpha, rgb) => { if (cond) { c = c.map((v, k) => v + (rgb[k] - v) * alpha); } };
  const d = Math.min(...PATH.slice(1).map((p, i) => segDist(mx, my, PATH[i], p)));
  inside(d <= 1.275, 0.95, [255, 255, 255]);
  inside(segDist(mx, my, [9.15, 22.6], [22.85, 22.6]) <= 0.675, 0.55, [255, 255, 255]);
  inside(Math.hypot(mx - 24.3, my - 8.4) <= 1.45, 0.83, [255, 255, 255]);
  return [c[0], c[1], c[2], a * 255];
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4), SS = 3, k = 32 / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const s = sample((px + (sx + 0.5) / SS) * k, (py + (sy + 0.5) / SS) * k, opts);
      r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3];
    }
    const o = (py * size + px) * 4;
    if (a > 0) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a; buf[o + 3] = a / (SS * SS); }
  }
  return png(size, size, buf);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, {}));
writeFileSync(new URL('icon-512.png', out), render(512, {}));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { maskable: true }));
console.log('icons written');
