// Generates the app icons (sun + calendar-with-tick on sky blue) as PNGs
// using only Node built-ins, so no image library is needed.
// Run with: npm run icons

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [180, 192, 512];

// --- Minimal PNG encoder (8-bit RGBA, filter 0) ---

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing helpers (all coordinates relative to icon size 1.0) ---

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function lerp(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function inRoundedRect(x, y, x1, y1, x2, y2, r) {
  if (x < x1 || x > x2 || y < y1 || y > y2) return false;
  const cx = Math.max(x1 + r, Math.min(x2 - r, x));
  const cy = Math.max(y1 + r, Math.min(y2 - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const SKY_TOP = hex('#4fb6e8');
const SKY_BOTTOM = hex('#a5ddf6');
const SUN = hex('#ffd23e');
const RAY = hex('#ffbe2e');
const CARD = hex('#ffffff');
const HEADER = hex('#ff7a4f');
const TICK = hex('#34c27b');

const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return [0.26 + 0.17 * Math.cos(a), 0.24 + 0.17 * Math.sin(a),
          0.26 + 0.25 * Math.cos(a), 0.24 + 0.25 * Math.sin(a)];
});

// Colour of the icon at unit coordinates (x, y), painted back-to-front.
function pixel(x, y) {
  let c = lerp(SKY_TOP, SKY_BOTTOM, y);
  for (const [x1, y1, x2, y2] of RAYS) {
    if (distToSegment(x, y, x1, y1, x2, y2) <= 0.022) c = RAY;
  }
  if (inCircle(x, y, 0.26, 0.24, 0.13)) c = SUN;
  if (inRoundedRect(x, y, 0.18, 0.34, 0.82, 0.9, 0.06)) {
    c = y <= 0.46 ? HEADER : CARD;
  }
  if (distToSegment(x, y, 0.35, 0.66, 0.46, 0.77) <= 0.035
    || distToSegment(x, y, 0.46, 0.77, 0.67, 0.53) <= 0.035) c = TICK;
  return c;
}

function render(size) {
  const ss = 2; // 2x supersampling for smooth edges
  const n = size * ss;
  const big = new Float64Array(n * n * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = pixel((x + 0.5) / n, (y + 0.5) / n);
      big.set(c, (y * n + x) * 3);
    }
  }
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const sum = big[((y * ss) * n + x * ss) * 3 + ch]
          + big[((y * ss) * n + x * ss + 1) * 3 + ch]
          + big[((y * ss + 1) * n + x * ss) * 3 + ch]
          + big[((y * ss + 1) * n + x * ss + 1) * 3 + ch];
        rgba[(y * size + x) * 4 + ch] = Math.round(sum / 4);
      }
      rgba[(y * size + x) * 4 + 3] = 255; // opaque: iOS shows transparency as black
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(`wrote ${file}`);
}
