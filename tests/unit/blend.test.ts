import { describe, expect, it } from 'vitest';
import {
  BLEND_MODES,
  blendColor,
  compositeOperation,
  compositePixel,
  isBlendMode,
  type Pixel,
} from '../../src/core/blend';

const near = (a: Pixel, b: Pixel, eps = 1e-6) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(eps));

describe('composite operation mapping', () => {
  it('maps every mode to a canvas operation', () => {
    for (const m of BLEND_MODES) expect(typeof compositeOperation(m)).toBe('string');
    expect(compositeOperation('normal')).toBe('source-over');
    expect(compositeOperation('add')).toBe('lighter');
    expect(compositeOperation('multiply')).toBe('multiply');
  });

  it('validates mode names', () => {
    expect(isBlendMode('overlay')).toBe(true);
    expect(isBlendMode('dissolve')).toBe(false);
    expect(isBlendMode(3)).toBe(false);
  });
});

describe('compositePixel', () => {
  const red: Pixel = [1, 0, 0, 1];
  const gray: Pixel = [0.5, 0.5, 0.5, 1];

  it('normal: opaque source replaces backdrop', () => {
    near(compositePixel(gray, red, 'normal'), red);
  });

  it('normal with opacity mixes linearly', () => {
    near(compositePixel([0, 0, 0, 1], [1, 1, 1, 1], 'normal', 0.25), [0.25, 0.25, 0.25, 1]);
  });

  it('source over transparent backdrop keeps the source colour', () => {
    near(compositePixel([0, 0, 0, 0], [0.2, 0.4, 0.6, 0.5], 'multiply'), [0.2, 0.4, 0.6, 0.5]);
  });

  it('multiply with white and screen with black are identities', () => {
    near(compositePixel(gray, [1, 1, 1, 1], 'multiply'), gray);
    near(compositePixel(gray, [0, 0, 0, 1], 'screen'), gray);
    near(compositePixel([0.5, 0.2, 1, 1], [0.5, 0.5, 0.5, 1], 'multiply'), [0.25, 0.1, 0.5, 1]);
  });

  it('overlay is hard-light with swapped arguments', () => {
    // backdrop 0.25 ≤ 0.5 → 2·cb·cs
    near(compositePixel([0.25, 0.25, 0.25, 1], [0.6, 0.6, 0.6, 1], 'overlay'), [0.3, 0.3, 0.3, 1]);
    // backdrop 0.75 > 0.5 → screen(cs, 2cb−1)
    const v = 0.6 + 0.5 - 0.6 * 0.5;
    near(compositePixel([0.75, 0.75, 0.75, 1], [0.6, 0.6, 0.6, 1], 'overlay'), [v, v, v, 1]);
  });

  it('add sums and clamps', () => {
    near(compositePixel([0.6, 0.2, 0, 1], [0.6, 0.2, 0, 1], 'add'), [1, 0.4, 0, 1]);
  });

  it('difference of identical colours is black', () => {
    near(compositePixel(gray, gray, 'difference'), [0, 0, 0, 1]);
  });

  it('opacity 0 leaves the backdrop untouched for every mode', () => {
    for (const m of BLEND_MODES) near(compositePixel([0.3, 0.6, 0.9, 1], red, m, 0), [0.3, 0.6, 0.9, 1]);
  });

  it('non-separable modes keep the luminosity relationships', () => {
    const lum = (c: number[]) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
    const cb: [number, number, number] = [0.2, 0.5, 0.3];
    const cs: [number, number, number] = [0.9, 0.1, 0.4];
    expect(lum(blendColor('color', cb, cs))).toBeCloseTo(lum(cb));
    expect(lum(blendColor('luminosity', cb, cs))).toBeCloseTo(lum(cs));
    expect(lum(blendColor('hue', cb, cs))).toBeCloseTo(lum(cb));
    // gray source removes saturation
    const desat = blendColor('saturation', cb, [0.5, 0.5, 0.5]);
    expect(Math.max(...desat) - Math.min(...desat)).toBeCloseTo(0);
  });
});
