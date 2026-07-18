// savor PWA icon generator — no external deps.
//
// Renders the "Cellar" app mark: a wine-plum field carrying a gold tasting seal (the score-
// badge motif) around a single ember tasting bead (the rating motif). The two brand gestures
// — gold quality seal + ember bead — stacked into one medallion. Anti-aliased via 4x4
// supersampling; encoded to PNG by hand using Node's built-in zlib (no canvas/sharp).
//
// Run:  node scripts/generate-icons.mjs
// Emits: public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
//
// The mark is full-bleed (plum to every edge) with all content inside the central ~62% —
// well within a maskable icon's 80% safe zone, so the same render serves "any" and
// "maskable" purposes and looks correct under iOS's rounded mask.

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "..", "public");

// ── Cellar palette (RGB) ────────────────────────────────────────────────────
const PLUM = [122, 46, 67]; // --color-plum      #7a2e43
const PLUM_DEEP = [94, 34, 52]; // --color-plum-deep #5e2234 (edge vignette)
const GOLD = [156, 111, 24]; // --color-gold      #9c6f18
const GOLD_HI = [201, 160, 66]; // lifted gold for the seal's top face
const EMBER = [210, 85, 28]; // --color-ember     #d2551c
const EMBER_DEEP = [181, 71, 15]; // --color-ember-deep #b5470f
const GOLD_TINT = [245, 233, 207]; // --color-gold-tint #f5e9cf (bead highlight)

// Geometry as fractions of the icon edge.
const OUTER_R = 0.31; // gold seal outer radius
const INNER_R = 0.245; // gold seal inner radius (plum gap shows through below)
const BEAD_R = 0.185; // ember bead radius

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [
  lerp(c1[0], c2[0], t),
  lerp(c1[1], c2[1], t),
  lerp(c1[2], c2[2], t),
];

// Color at a single normalized point (nx, ny both in [0, 1]).
function sample(nx, ny) {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const r = Math.hypot(dx, dy);

  // Radial plum vignette across the whole field.
  let col = mix(PLUM, PLUM_DEEP, clamp01((r - 0.15) / 0.55));

  if (r <= OUTER_R && r >= INNER_R) {
    // Gold seal ring — brighter toward the top edge for a struck-metal read.
    col = mix(GOLD_HI, GOLD, clamp01((dy / OUTER_R + 1) / 2));
  } else if (r < BEAD_R) {
    // Ember bead — vertical gradient, then a soft top-left highlight.
    col = mix(EMBER, EMBER_DEEP, clamp01((dy / BEAD_R + 1) / 2));
    const hd = Math.hypot(dx + 0.055, dy + 0.06);
    if (hd < 0.06) col = mix(col, GOLD_TINT, 0.55 * (1 - hd / 0.06));
  }

  return col;
}

function render(size) {
  const SS = 4; // supersampling factor per axis (16 samples/pixel)
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// ── minimal PNG encoder (truecolor + alpha, 8-bit, no interlace) ─────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  // 10–12: compression, filter, interlace all 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── emit ─────────────────────────────────────────────────────────────────────
mkdirSync(PUBLIC_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  const png = encodePng(size, render(size));
  writeFileSync(resolve(PUBLIC_DIR, file), png);
  console.log(`wrote public/${file} (${size}x${size}, ${png.length} bytes)`);
}
