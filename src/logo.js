// Pilot's logo, a small map of nodes: a page at the top, branching to the views, scripts and styles it
// reaches, in the colours Pilot's graph gives those kinds. It's drawn once here for everything that
// shows it: the Windows icons and the README's PNG (scripts/logo.js writes them into assets/), and the
// UI's icons, which are also the icon of Pilot's window and its taskbar button, and the logo in its
// menu bar. The logo is a few shapes on a 100-unit square: logoSvg writes them as SVG, and draw paints
// the same shapes into pixels, antialiased, for the PNG and ICO files.
import { encodePng } from './png.js';

export const BG = '#14202c';
const EDGE = '#5b6b80';
// The nodes: [x, y, r, colour]; the page, then a view and a partial, then a style, a script and a layout.
const NODES = [
  [50, 28, 11, '#e0b060'],
  [28, 56, 8, '#3b82f6'],
  [72, 56, 8, '#0ea5b7'],
  [28, 78, 6, '#e64980'],
  [50, 78, 6, '#c9a227'],
  [78, 78, 6, '#8b5cf6'],
];
const EDGES = [[0, 1], [0, 2], [1, 3], [2, 4], [2, 5]];

/**
 * The logo's shapes, in painting order, on a 100 × 100 square: a rounded square ({ rect: [x, y, w, h, r] }),
 * circles ({ circle: [cx, cy, r] }) and rounded strokes ({ line: [x1, y1, x2, y2, width] }). Without the
 * dark square (the UI, on its own background) the nodes are drawn larger, filling the square.
 */
export function shapes({ dark = true } = {}) {
  const k = dark ? 1 : 1.25;
  const p = (x, y) => [50 + k * (x - 50), 53 + k * (y - 53) - (dark ? 0 : 3)];
  const out = [];
  if (dark) out.push({ rect: [0, 0, 100, 100, 22], fill: BG });
  for (const [a, b] of EDGES) out.push({ line: [...p(NODES[a][0], NODES[a][1]), ...p(NODES[b][0], NODES[b][1]), k * 4], fill: EDGE });
  for (const [x, y, r, fill] of NODES) out.push({ circle: [...p(x, y), k * r], fill });
  return out;
}

/** The logo as SVG: on the dark rounded square, or the nodes alone (for the UI, on its own background). */
export function logoSvg({ dark = false } = {}) {
  const n = (v) => +v.toFixed(2);
  const body = shapes({ dark }).map((s) => {
    if (s.rect) return `<rect x="${s.rect[0]}" y="${s.rect[1]}" width="${s.rect[2]}" height="${s.rect[3]}" rx="${s.rect[4]}" fill="${s.fill}"/>`;
    if (s.circle) return `<circle cx="${n(s.circle[0])}" cy="${n(s.circle[1])}" r="${n(s.circle[2])}" fill="${s.fill}"/>`;
    if (s.ring) return `<circle cx="${n(s.ring[0])}" cy="${n(s.ring[1])}" r="${n(s.ring[2])}" fill="none" stroke="${s.fill}" stroke-width="${n(s.ring[3])}"/>`;
    const [x1, y1, x2, y2, w] = s.line;
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${s.fill}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body.join('')}</svg>`;
}

// Whether a point (in the square's 100 units) is inside a shape.
function inside(s, x, y) {
  if (s.rect) {
    const [rx, ry, w, h, r] = s.rect;
    const dx = Math.max(rx + r - x, x - (rx + w - r), 0);
    const dy = Math.max(ry + r - y, y - (ry + h - r), 0);
    return x >= rx && x <= rx + w && y >= ry && y <= ry + h && dx * dx + dy * dy <= r * r;
  }
  if (s.circle) {
    const [cx, cy, r] = s.circle;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }
  if (s.ring) {
    const [cx, cy, r, w] = s.ring;
    return Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2;
  }
  const [x1, y1, x2, y2, w] = s.line;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)));
  return (x - x1 - t * vx) ** 2 + (y - y1 - t * vy) ** 2 <= (w / 2) ** 2;
}

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * The logo as size × size RGBA rows, antialiased: each pixel is 4 × 4 samples, each sample the colour
 * of the topmost shape over it, and the pixel their average (colour weighted by coverage).
 */
export function draw(size, dark = true) {
  const list = shapes({ dark }).map((s) => ({ ...s, rgb: rgb(s.fill) }));
  const N = 4;
  const top = (x, y) => {
    for (let i = list.length - 1; i >= 0; i--) if (inside(list[i], x, y)) return i;
    return -1;
  };
  return Array.from({ length: size }, (_, py) => {
    const row = [];
    for (let px = 0; px < size; px++) {
      // From 64 px up, a pixel whose corners and centre all fall in the same shape is that shape's
      // colour, and only the pixels on an edge are sampled 16 times. Smaller, the lines are thinner
      // than a pixel and could pass between those points, so every pixel is sampled.
      const u = (v) => (v / size) * 100;
      const c = top(u(px + 0.5), u(py + 0.5));
      if (size >= 64 && [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => top(u(px + dx), u(py + dy)) === c)) {
        row.push(...(c < 0 ? [0, 0, 0, 0] : [...list[c].rgb, 255]));
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const x = ((px + (sx + 0.5) / N) / size) * 100;
          const y = ((py + (sy + 0.5) / N) / size) * 100;
          for (let i = list.length - 1; i >= 0; i--) {
            if (!inside(list[i], x, y)) continue;
            r += list[i].rgb[0];
            g += list[i].rgb[1];
            b += list[i].rgb[2];
            a++;
            break;
          }
        }
      }
      // Colour averaged over the covered samples (no dark fringe at the edges), alpha the coverage.
      row.push(a ? Math.round(r / a) : 0, a ? Math.round(g / a) : 0, a ? Math.round(b / a) : 0, Math.round((a / (N * N)) * 255));
    }
    return row;
  });
}

/** The logo as a PNG of size × size. */
export function logoPng(size, dark = true) {
  const rows = draw(size, dark);
  return encodePng({ width: size, height: size, data: Buffer.from(rows.flat()) });
}
