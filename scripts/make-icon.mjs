// Generates build/icon.png (256×256) from simple vector shapes – the app's own brand mark.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const N = 256;
const SS = 4; // supersampling per axis
const s = N / 32; // design grid is 32×32 (same as the in-app SVG)

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#2c2f36');
const RIM = hex('#4a4e58');
const ARC = hex('#e8894a');
const NIB = hex('#f5a36c');

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// quadratic-ish curve "M6 23 c5-9 13-13 20-12" sampled as a cubic Bézier
const P = [
  [6, 23],
  [11, 14],
  [19, 10],
  [26, 11],
];
const curve = Array.from({ length: 200 }, (_, i) => {
  const t = i / 199;
  const u = 1 - t;
  return [0, 1].map(
    (k) => u ** 3 * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t ** 3 * P[3][k],
  );
});
const nearCurve = (x, y, w) => curve.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= w * w);

const nib = [
  [17, 6],
  [23, 12],
  [16, 21],
  [12, 17],
];
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function sample(x, y) {
  // returns [r,g,b,a] in design space
  if (!inRoundRect(x, y, 1, 1, 31, 31, 8)) return [0, 0, 0, 0];
  let c = inRoundRect(x, y, 1.6, 1.6, 30.4, 30.4, 7.4) ? BG : RIM;
  if (nearCurve(x, y, 1.5)) c = ARC;
  if (inPoly(x, y, nib)) c = NIB;
  if ((x - 17.5) ** 2 + (y - 13.5) ** 2 <= 1.6 * 1.6) c = BG;
  return [...c, 255];
}

const png = new PNG({ width: N, height: N });
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const v = sample((px + (sx + 0.5) / SS) / s, (py + (sy + 0.5) / SS) / s);
        acc[0] += v[0] * v[3];
        acc[1] += v[1] * v[3];
        acc[2] += v[2] * v[3];
        acc[3] += v[3];
      }
    const i = (py * N + px) * 4;
    const a = acc[3];
    png.data[i] = a ? Math.round(acc[0] / a) : 0;
    png.data[i + 1] = a ? Math.round(acc[1] / a) : 0;
    png.data[i + 2] = a ? Math.round(acc[2] / a) : 0;
    png.data[i + 3] = Math.round(a / (SS * SS));
  }
}
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', PNG.sync.write(png));
console.log('build/icon.png written');
