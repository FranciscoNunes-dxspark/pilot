// Draws Pilot's icon into assets/: logo.ico (the Windows executable's icon, on the dark rounded
// square), logo-transparent.ico and logo.png, from the pixel-art ship's wheel in src/logo.js.
//   node scripts/logo.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { draw, logoPng } from '../src/logo.js';

// Uncompressed 32-bit bitmaps (BGRA bottom-up, then the 1-bit mask) up to 128 px, a PNG at 256.
function dib(rows) {
  const w = rows[0].length / 4;
  const h = rows.length;
  const maskRow = Math.ceil(w / 32) * 4;
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(w, 4);
  head.writeInt32LE(h * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  head.writeUInt32LE(w * h * 4 + maskRow * h, 20);
  const pixels = Buffer.alloc(w * h * 4);
  const mask = Buffer.alloc(maskRow * h);
  for (let y = 0; y < h; y++) {
    const src = rows[h - 1 - y];
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = src.slice(x * 4, x * 4 + 4);
      pixels.set([b, g, r, a], (y * w + x) * 4);
      if (a === 0) mask[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([head, pixels, mask]);
}

function ico(dark) {
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((s) => (s >= 256 ? logoPng(s, dark) : dib(draw(s, dark))));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((img, i) => {
    const e = Buffer.alloc(16);
    e[0] = sizes[i] >= 256 ? 0 : sizes[i];
    e[1] = sizes[i] >= 256 ? 0 : sizes[i];
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

const out = new URL('../assets/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('logo.ico', out), ico(true));
writeFileSync(new URL('logo-transparent.ico', out), ico(false));
writeFileSync(new URL('logo.png', out), logoPng(256));
console.log('assets/logo.ico, assets/logo-transparent.ico, assets/logo.png');
