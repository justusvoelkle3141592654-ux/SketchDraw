import type { RGB } from '../core/color';

/**
 * Pre-rendered round brush tips. A tip is rendered once per (hardness, colour, size bucket)
 * and then scaled with drawImage for each dab.
 */
const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 48;

function bucket(diameter: number): number {
  let s = 16;
  while (s < diameter && s < 1024) s *= 2;
  return s;
}

export function getStamp(hardness: number, color: RGB, diameter: number): HTMLCanvasElement {
  const size = bucket(diameter);
  const h = Math.round(Math.max(0, Math.min(1, hardness)) * 50) / 50;
  const key = `${h}|${color.r},${color.g},${color.b}|${size}`;
  const hit = cache.get(key);
  if (hit) {
    // refresh LRU position
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const rgb = `${color.r}, ${color.g}, ${color.b}`;
  // keep ~1.2 source px of antialiased edge even for fully hard tips
  const inner = Math.min(h, 1 - 1.2 / r);
  g.addColorStop(0, `rgba(${rgb}, 1)`);
  if (inner > 0) g.addColorStop(inner, `rgba(${rgb}, 1)`);
  if (h < 0.999) {
    // soft falloff (smoothstep-like) between the hard core and the rim
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const pos = Math.max(inner, 0) + (1 - Math.max(inner, 0)) * t;
      const a = 1 - t * t * (3 - 2 * t);
      g.addColorStop(pos, `rgba(${rgb}, ${a.toFixed(4)})`);
    }
  }
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, c);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return c;
}

// ---------------------------------------------------------------------------
// Paper grain

let grainTile: HTMLCanvasElement | null = null;

/** Deterministic value-noise tile (256×256) used as a paper texture mask. */
export function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const n = 256;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const octave = (cell: number) => {
    const g = Math.ceil(n / cell);
    const grid = Array.from({ length: g * g }, rand);
    const at = (x: number, y: number) => grid[((y + g) % g) * g + ((x + g) % g)]!;
    return (x: number, y: number) => {
      const fx = x / cell;
      const fy = y / cell;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const o1 = octave(2);
  const o2 = octave(4);
  const o3 = octave(16);
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = o1(x, y) * 0.5 + o2(x, y) * 0.3 + o3(x, y) * 0.2;
      const a = Math.max(0, Math.min(1, (v - 0.42) * 2.4));
      const i = (y * n + x) * 4;
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}
