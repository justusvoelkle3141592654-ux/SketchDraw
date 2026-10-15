/**
 * Layer blend modes.
 *
 * On screen and on export, layers are composited with Canvas 2D `globalCompositeOperation`,
 * which implements the W3C Compositing and Blending Level 1 formulas. The pure functions below
 * implement the same formulas for unit tests and as an oracle for the end-to-end test.
 */

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'add',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export const BLEND_LABELS: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiplizieren',
  screen: 'Negativ multiplizieren',
  overlay: 'Ineinanderkopieren',
  add: 'Addieren',
  darken: 'Abdunkeln',
  lighten: 'Aufhellen',
  'color-dodge': 'Farbig abwedeln',
  'color-burn': 'Farbig nachbelichten',
  'hard-light': 'Hartes Licht',
  'soft-light': 'Weiches Licht',
  difference: 'Differenz',
  exclusion: 'Ausschluss',
  hue: 'Farbton',
  saturation: 'Sättigung',
  color: 'Farbe',
  luminosity: 'Luminanz',
};

export function isBlendMode(v: unknown): v is BlendMode {
  return typeof v === 'string' && (BLEND_MODES as readonly string[]).includes(v);
}

export function compositeOperation(mode: BlendMode): GlobalCompositeOperation {
  switch (mode) {
    case 'normal':
      return 'source-over';
    case 'add':
      return 'lighter';
    default:
      return mode;
  }
}

// ---------------------------------------------------------------------------
// Reference implementation (channels 0..1, straight / non-premultiplied alpha)

type C3 = [number, number, number];

function separable(mode: BlendMode, cb: number, cs: number): number {
  switch (mode) {
    case 'normal':
      return cs;
    case 'multiply':
      return cb * cs;
    case 'screen':
      return cb + cs - cb * cs;
    case 'overlay':
      return separable('hard-light', cs, cb);
    case 'darken':
      return Math.min(cb, cs);
    case 'lighten':
      return Math.max(cb, cs);
    case 'color-dodge':
      if (cb === 0) return 0;
      if (cs >= 1) return 1;
      return Math.min(1, cb / (1 - cs));
    case 'color-burn':
      if (cb >= 1) return 1;
      if (cs <= 0) return 0;
      return 1 - Math.min(1, (1 - cb) / cs);
    case 'hard-light':
      return cs <= 0.5 ? cb * 2 * cs : separable('screen', cb, 2 * cs - 1);
    case 'soft-light': {
      if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cb + (2 * cs - 1) * (d - cb);
    }
    case 'difference':
      return Math.abs(cb - cs);
    case 'exclusion':
      return cb + cs - 2 * cb * cs;
    default:
      throw new Error(`not separable: ${mode}`);
  }
}

const lum = (c: C3): number => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColor(c: C3): C3 {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out: C3 = [...c];
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as C3;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as C3;
  return out;
}

function setLum(c: C3, l: number): C3 {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

const sat = (c: C3): number => Math.max(...c) - Math.min(...c);

function setSat(c: C3, s: number): C3 {
  const idx = [0, 1, 2].sort((a, b) => c[a]! - c[b]!) as [number, number, number];
  const [iMin, iMid, iMax] = idx;
  const min = c[iMin]!;
  const mid = c[iMid]!;
  const max = c[iMax]!;
  const out: C3 = [0, 0, 0];
  if (max > min) {
    out[iMid] = ((mid - min) * s) / (max - min);
    out[iMax] = s;
  }
  return out;
}

export function blendColor(mode: BlendMode, cb: C3, cs: C3): C3 {
  switch (mode) {
    case 'hue':
      return setLum(setSat(cs, sat(cb)), lum(cb));
    case 'saturation':
      return setLum(setSat(cb, sat(cs)), lum(cb));
    case 'color':
      return setLum(cs, lum(cb));
    case 'luminosity':
      return setLum(cb, lum(cs));
    default:
      return [separable(mode, cb[0], cs[0]), separable(mode, cb[1], cs[1]), separable(mode, cb[2], cs[2])];
  }
}

export type Pixel = [number, number, number, number];

/**
 * Composites a source pixel over a backdrop pixel (both straight alpha, channels 0..1)
 * using the given blend mode and layer opacity. Returns a straight-alpha pixel.
 */
export function compositePixel(backdrop: Pixel, source: Pixel, mode: BlendMode, opacity = 1): Pixel {
  const ab = backdrop[3];
  const as = source[3] * opacity;
  const cb: C3 = [backdrop[0], backdrop[1], backdrop[2]];
  const cs: C3 = [source[0], source[1], source[2]];

  if (mode === 'add') {
    // 'lighter': premultiplied sum, clamped
    const ao = Math.min(1, as + ab);
    const co = [0, 1, 2].map((i) => Math.min(1, cs[i]! * as + cb[i]! * ab));
    return ao === 0
      ? [0, 0, 0, 0]
      : ([co[0]! / ao, co[1]! / ao, co[2]! / ao, ao].map((v) => Math.min(1, v)) as Pixel);
  }

  const b = blendColor(mode, cb, cs);
  const ao = as + ab * (1 - as);
  if (ao === 0) return [0, 0, 0, 0];
  const out = [0, 1, 2].map((i) => {
    const csMixed = (1 - ab) * cs[i]! + ab * b[i]!;
    const premul = as * csMixed + (1 - as) * ab * cb[i]!;
    return premul / ao;
  });
  return [out[0]!, out[1]!, out[2]!, ao];
}
