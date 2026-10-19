// Draws icon.png (128x128, the Marketplace and Open VSX need a PNG) from the
// shapes of cloudpin's logomark: a dark rounded square, a blue cloud and a white
// map pin with a blue dot. Only node:zlib and node:fs; run `node scripts/icon.mjs`.
import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const SIZE = 128;
const SCALE = SIZE / 64; // the logomark is drawn on a 64x64 grid
const SAMPLES = 4; // 4x4 supersampling for smooth edges

const BG = [0x0d, 0x11, 0x17];
const BLUE = [0x2f, 0x81, 0xf7];
const WHITE = [0xf0, 0xf6, 0xfc];

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function inRoundedSquare(x, y) {
  const r = 14;
  const cx = Math.min(Math.max(x, r), 64 - r);
  const cy = Math.min(Math.max(y, r), 64 - r);
  return x >= 0 && x <= 64 && y >= 0 && y <= 64 && inCircle(x, y, cx, cy, r);
}

// The cloud: three circles over a flat base.
function inCloud(x, y) {
  if (y > 40) return false;
  return (
    inCircle(x, y, 21, 31, 9) ||
    inCircle(x, y, 32.6, 25, 12) ||
    inCircle(x, y, 44, 32, 8) ||
    (x >= 21 && x <= 44 && y >= 30 && y <= 40)
  );
}

// The pin: a circle on top of a tip at (32, 50); `grow` widens it for the outline.
function inPin(x, y, grow) {
  const cx = 32;
  const cy = 33.6;
  const r = 9 + grow;
  if (inCircle(x, y, cx, cy, r)) return true;
  const tip = 50 + grow * 1.6;
  if (y < cy || y > tip) return false;
  const t = (y - cy) / (tip - cy); // 0 at the circle's middle, 1 at the tip
  return Math.abs(x - cx) <= r * Math.sqrt(1 - t) * (1 - 0.15 * t);
}

function colourAt(x, y) {
  if (!inRoundedSquare(x, y)) return null;
  if (inCircle(x, y, 32, 33.5, 3.4)) return BLUE;
  if (inPin(x, y, 0)) return WHITE;
  if (inPin(x, y, 1.25)) return BG;
  if (inCloud(x, y)) return BLUE;
  return BG;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let py = 0; py < SIZE; py++) {
  const row = py * (SIZE * 4 + 1);
  raw[row] = 0; // filter: none
  for (let px = 0; px < SIZE; px++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const c = colourAt((px + (sx + 0.5) / SAMPLES) / SCALE, (py + (sy + 0.5) / SAMPLES) / SCALE);
        if (c === null) continue;
        r += c[0];
        g += c[1];
        b += c[2];
        a++;
      }
    }
    const o = row + 1 + px * 4;
    if (a > 0) {
      raw[o] = Math.round(r / a);
      raw[o + 1] = Math.round(g / a);
      raw[o + 2] = Math.round(b / a);
    }
    raw[o + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
  }
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../icon.png", import.meta.url), png);
console.log(`icon.png: ${SIZE}x${SIZE}, ${png.length} bytes`);
