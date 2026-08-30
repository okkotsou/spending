/*
 * Generates the PWA icon set as real PNG files with no image dependencies.
 *
 * The mark is a three-bar ledger glyph in paper white on the deep teal accent
 * from DESIGN.md. Shapes are described as signed distance functions and
 * rendered with 4x supersampling, which gives clean antialiased edges without
 * a rasterisation library. PNGs are written by hand: IHDR, a zlib-deflated
 * IDAT of filter-0 scanlines, and IEND.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');

const ACCENT = [0x0d, 0x5c, 0x63];
const PAPER = [0xf7, 0xf6, 0xf3];

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Signed distance to a rounded rectangle centred at (cx, cy). */
function sdRoundRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    raw[p] = 0; // filter: none
    p += 1;
    rgb.copy(raw, p, y * width * 3, (y + 1) * width * 3);
    p += width * 3;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {number} size pixel dimension
 * @param {number} inset fraction of the canvas kept clear around the artwork
 *   (0 for a full-bleed maskable icon, larger for a rounded app tile)
 * @param {number} tileRadius corner radius as a fraction of size, 0 for square
 */
function renderIcon(size, inset, tileRadius) {
  const ss = 4;
  const rgb = Buffer.alloc(size * size * 3);
  const artHalf = size * (0.5 - inset);
  const c = size / 2;

  // Three left-aligned bars, descending in length: a ledger read at a glance.
  const barH = artHalf * 0.26;
  const gap = artHalf * 0.17;
  const lengths = [1, 0.66, 0.38];
  const barRadius = barH / 2;
  const totalH = lengths.length * barH + (lengths.length - 1) * gap;
  const startY = c - totalH / 2 + barH / 2;
  const left = c - artHalf * 0.82;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let tileCov = 0;
      let markCov = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const tileD = tileRadius > 0
            ? sdRoundRect(px, py, c, c, c, c, size * tileRadius)
            : -1;
          tileCov += clamp01(0.5 - tileD);
          let best = Infinity;
          for (let i = 0; i < lengths.length; i += 1) {
            const len = artHalf * 1.64 * lengths[i];
            const cy = startY + i * (barH + gap);
            const d = sdRoundRect(px, py, left + len / 2, cy, len / 2, barH / 2, barRadius);
            if (d < best) best = d;
          }
          markCov += clamp01(0.5 - best);
        }
      }
      const samples = ss * ss;
      const tileA = tileCov / samples;
      const markA = (markCov / samples) * tileA;
      const o = (y * size + x) * 3;
      for (let ch = 0; ch < 3; ch += 1) {
        const ground = PAPER[ch] * (1 - tileA) + ACCENT[ch] * tileA;
        rgb[o + ch] = Math.round(ground * (1 - markA) + PAPER[ch] * markA);
      }
    }
  }
  return encodePng(size, size, rgb);
}

mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192, 0.14, 0.22],
  ['icon-512.png', 512, 0.14, 0.22],
  ['maskable-512.png', 512, 0.26, 0],
  ['apple-touch-icon.png', 180, 0.14, 0],
];

for (const [name, size, inset, radius] of targets) {
  writeFileSync(resolve(outDir, name), renderIcon(size, inset, radius));
  console.log(`icons/${name} ${size}x${size}`);
}

// A vector favicon keeps browser tabs crisp at every density.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Misraf">
  <rect width="64" height="64" rx="14" fill="#0D5C63"/>
  <g fill="#F7F6F3">
    <rect x="14" y="19" width="36" height="7.2" rx="3.6"/>
    <rect x="14" y="30.4" width="23.8" height="7.2" rx="3.6"/>
    <rect x="14" y="41.8" width="13.7" height="7.2" rx="3.6"/>
  </g>
</svg>
`;
writeFileSync(resolve(here, '../public/favicon.svg'), svg);
console.log('favicon.svg');
