import { describe, expect, it } from 'vitest';
import { DOC_PRESETS, orient, validateNewDoc } from '../../src/core/docPresets';

const ok = { title: 'Test', width: 1920, height: 1080, dpi: 72, background: '#fff', transparent: false };

describe('new document validation', () => {
  it('accepts presets', () => {
    for (const p of DOC_PRESETS) {
      expect(validateNewDoc({ ...ok, width: p.width, height: p.height, dpi: p.dpi }).errors).toEqual([]);
    }
  });

  it('rejects bad sizes, dpi and empty names', () => {
    expect(validateNewDoc({ ...ok, width: 0 }).errors).toHaveLength(1);
    expect(validateNewDoc({ ...ok, height: 20000 }).errors).toHaveLength(1);
    expect(validateNewDoc({ ...ok, width: 100.5 }).errors).toHaveLength(1);
    expect(validateNewDoc({ ...ok, width: Number.NaN }).errors).toHaveLength(1);
    expect(validateNewDoc({ ...ok, dpi: 0 }).errors).toHaveLength(1);
    expect(validateNewDoc({ ...ok, title: '  ' }).errors).toHaveLength(1);
  });

  it('warns about very large canvases', () => {
    const r = validateNewDoc({ ...ok, width: 10000, height: 8000 });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/MB/);
  });

  it('swaps dimensions for orientation', () => {
    expect(orient(1920, 1080, 'portrait')).toEqual({ width: 1080, height: 1920 });
    expect(orient(1920, 1080, 'landscape')).toEqual({ width: 1920, height: 1080 });
    expect(orient(800, 1200, 'landscape')).toEqual({ width: 1200, height: 800 });
  });
});
