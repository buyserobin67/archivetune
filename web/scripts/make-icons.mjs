// Generates the PWA icons without any image dependency (pure Node + zlib).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const BARS = [0.34, 0.62, 0.9, 0.5, 0.72]; // relative heights
// scale < 1 shrinks the glyph for the maskable safe zone
function icon(size, { scale = 1, rounded = true } = {}) {
  return png(size, (u, v) => {
    // rounded-square mask (iOS masks the apple-touch-icon itself, so keep it square there)
    if (rounded) {
      const r = 0.22, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
      if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
    }
    const t = (u + v) / 2;
    let col = [lerp(18, 124, t * t), lerp(6, 58, t * t), lerp(44, 237, t * t)];
    const gx = (u - 0.5) / scale + 0.5, gy = (v - 0.5) / scale + 0.5;
    const span = 0.56, x0 = 0.5 - span / 2, bw = span / (BARS.length * 2 - 1);
    const i = Math.floor((gx - x0) / bw);
    if (i >= 0 && i % 2 === 0 && i / 2 < BARS.length) {
      const h = BARS[i / 2] * 0.5, cyc = 0.5;
      const bx = x0 + i * bw + bw / 2;
      const dx = gx - bx, dy = Math.max(Math.abs(gy - cyc) - (h / 2 - bw / 2), 0);
      if (dx * dx + dy * dy <= (bw / 2) ** 2) col = [245, 240, 255];
    }
    return [col[0] | 0, col[1] | 0, col[2] | 0, 255];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192));
writeFileSync('public/icons/icon-512.png', icon(512));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, { scale: 0.72, rounded: false }));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, { rounded: false }));
console.log('icons written');
