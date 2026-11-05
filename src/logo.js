// Pilot's logo, the pixel-art ship's wheel, drawn once here for everything that shows it: the Windows
// icons and the README's PNG (scripts/logo.js writes them into assets/), and the UI's favicon, which
// is also the icon of Pilot's window and its taskbar button, and the logo in its menu bar.
import { encodePng } from './png.js';

export const WHEEL = [
  '.......hh.......',
  '.......hh.......',
  '....h.wwww.h....',
  '...hhwwwwwwhh...',
  '...hww.ss.wwh...',
  '..ww.s.ss.s.ww..',
  '..ww..ssss..ww..',
  'hwwssssccsssswwh',
  'hwwssssccsssswwh',
  '..ww..ssss..ww..',
  '..ww.s.ss.s.ww..',
  '...hww.ss.wwh...',
  '...hhwwwwwwhh...',
  '....h.wwww.h....',
  '.......hh.......',
  '.......hh.......',
];
export const COLOURS = { h: '#e0b060', w: '#c08030', s: '#a06828', c: '#7fd4ff' };
export const BG = '#14202c';
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

/** The wheel on a size × size square as RGBA rows: on the dark rounded square, or on transparency. */
export function draw(size, dark = true) {
  const margin = dark ? size * 0.12 : 0;
  const scale = (size - 2 * margin) / 16;
  const radius = size * 0.18;
  return Array.from({ length: size }, (_, y) => {
    const row = [];
    for (let x = 0; x < size; x++) {
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const inside = cx * cx + cy * cy <= radius * radius;
      const c = WHEEL[Math.floor((y - margin) / scale)]?.[Math.floor((x - margin) / scale)];
      row.push(...(COLOURS[c] ? hex(COLOURS[c]) : dark && inside ? hex(BG) : [0, 0, 0, 0]));
    }
    return row;
  });
}

/** The logo as a PNG of size × size. */
export function logoPng(size, dark = true) {
  const rows = draw(size, dark);
  return encodePng({ width: size, height: size, data: Buffer.from(rows.flat()) });
}

/** The wheel as SVG, one square a pixel, sharp at any size: on the dark square, or on nothing. */
export function logoSvg({ dark = false } = {}) {
  const cells = [];
  WHEEL.forEach((row, y) => [...row].forEach((c, x) => COLOURS[c] && cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${COLOURS[c]}"/>`)));
  const back = dark ? `<rect x="-2.5" y="-2.5" width="21" height="21" rx="3.8" fill="${BG}"/>` : '';
  const view = dark ? '-2.5 -2.5 21 21' : '0 0 16 16';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" shape-rendering="crispEdges">${back}${cells.join('')}</svg>`;
}
