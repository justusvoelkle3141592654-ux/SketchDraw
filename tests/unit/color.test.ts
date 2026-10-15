import { describe, expect, it } from 'vitest';
import { hsvToRgb, normalizeHex, parseHex, rgbToHex, rgbToHsv } from '../../src/core/color';

describe('hex parsing', () => {
  it('accepts short, long and alpha notation', () => {
    expect(parseHex('#fa0')).toEqual({ r: 255, g: 170, b: 0, a: 1 });
    expect(parseHex('1F2A44')).toEqual({ r: 31, g: 42, b: 68, a: 1 });
    expect(parseHex('#00000080')?.a).toBeCloseTo(128 / 255);
  });

  it('rejects invalid input', () => {
    for (const s of ['', '#12', '#12345', 'zzzzzz', '#1234567', 'red']) expect(parseHex(s)).toBeNull();
  });

  it('normalises to lowercase #rrggbb', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('nope')).toBeNull();
    expect(rgbToHex({ r: 300, g: -5, b: 15.6 })).toBe('#ff0010');
  });
});

describe('HSV', () => {
  it('converts primaries', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBe(120);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBe(240);
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    expect(hsvToRgb({ h: 60, s: 1, v: 1 })).toEqual({ r: 255, g: 255, b: 0 });
  });

  it('round-trips RGB → HSV → RGB', () => {
    for (let r = 0; r <= 255; r += 51)
      for (let g = 0; g <= 255; g += 51)
        for (let b = 0; b <= 255; b += 51) {
          expect(hsvToRgb(rgbToHsv({ r, g, b }))).toEqual({ r, g, b });
        }
  });

  it('wraps hue', () => {
    expect(hsvToRgb({ h: 360 + 120, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 120, s: 1, v: 1 }));
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 240, s: 1, v: 1 }));
  });
});
