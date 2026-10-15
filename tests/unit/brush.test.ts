import { describe, expect, it } from 'vitest';
import {
  dabAlpha,
  dabSize,
  dabStep,
  StrokeEngine,
  type Dab,
  type InputPoint,
} from '../../src/core/brush/engine';
import { applyPressureCurve, SimulatedPressure } from '../../src/core/brush/pressure';
import { DEFAULT_BRUSHES, type BrushSettings } from '../../src/core/brush/types';

const base = (patch: Partial<BrushSettings> = {}): BrushSettings => ({
  ...DEFAULT_BRUSHES.find((b) => b.id === 'ink')!,
  ...patch,
});

function run(brush: BrushSettings, pts: InputPoint[]): Dab[] {
  const e = new StrokeEngine(brush);
  return [...e.begin(pts[0]!), ...pts.slice(1).flatMap((p) => e.add(p)), ...e.end()];
}

describe('pressure curve', () => {
  it('keeps endpoints and is monotonic', () => {
    for (const curve of [-1, -0.3, 0, 0.5, 1]) {
      expect(applyPressureCurve(0, curve)).toBe(0);
      expect(applyPressureCurve(1, curve)).toBe(1);
      let prev = -1;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const v = applyPressureCurve(p, curve);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('soft curves give more output for light pressure', () => {
    expect(applyPressureCurve(0.3, -1)).toBeGreaterThan(applyPressureCurve(0.3, 0));
    expect(applyPressureCurve(0.3, 1)).toBeLessThan(applyPressureCurve(0.3, 0));
  });
});

describe('simulated pressure', () => {
  it('tapers in at the start of a stroke', () => {
    const sim = new SimulatedPressure();
    const first = sim.next(0, 0, 0);
    let later = first;
    for (let i = 1; i <= 30; i++) later = sim.next(i * 2, 0, i * 8);
    expect(first).toBeLessThan(later);
  });

  it('fast movement yields lower pressure than slow movement', () => {
    const slow = new SimulatedPressure();
    const fast = new SimulatedPressure();
    let ps = 0;
    let pf = 0;
    for (let i = 1; i <= 60; i++) {
      ps = slow.next(i * 1, 0, i * 16);
      pf = fast.next(i * 60, 0, i * 16);
    }
    expect(pf).toBeLessThan(ps);
    expect(pf).toBeGreaterThan(0);
    expect(ps).toBeLessThanOrEqual(1);
  });
});

describe('dab mapping', () => {
  it('maps pressure to size between minSize and size', () => {
    const b = base({ size: 20, minSize: 0.25, pressureCurve: 0 });
    expect(dabSize(b, 1)).toBe(20);
    expect(dabSize(b, 0)).toBe(5);
    expect(dabSize({ ...b, pressureSize: false }, 0)).toBe(20);
  });

  it('never returns a dab smaller than half a pixel', () => {
    expect(dabSize(base({ size: 1, minSize: 0 }), 0)).toBe(0.5);
  });

  it('maps pressure to flow when enabled', () => {
    const b = base({ flow: 0.5, pressureOpacity: true });
    expect(dabAlpha(b, 1)).toBeCloseTo(0.5);
    expect(dabAlpha(b, 0)).toBeLessThan(0.1);
    expect(dabAlpha({ ...b, pressureOpacity: false }, 0)).toBe(0.5);
  });
});

describe('stroke engine', () => {
  it('leaves no gaps on a very fast stroke', () => {
    const brush = base({ size: 10, spacing: 0.1, stabilization: 0 });
    // three points 400px apart: like a flick with very few input events
    const dabs = run(brush, [
      { x: 0, y: 0, pressure: 1 },
      { x: 400, y: 0, pressure: 1 },
      { x: 400, y: 400, pressure: 1 },
    ]);
    const step = dabStep(brush, 10);
    for (let i = 1; i < dabs.length; i++) {
      const d = Math.hypot(dabs[i]!.x - dabs[i - 1]!.x, dabs[i]!.y - dabs[i - 1]!.y);
      expect(d).toBeLessThanOrEqual(step + 1e-6);
    }
    expect(dabs.length).toBeGreaterThan(800 / step - 2);
  });

  it('spacing scales with brush size and pressure', () => {
    const brush = base({ size: 20, minSize: 0.1, spacing: 0.25, stabilization: 0 });
    const line = (p: number) =>
      run(brush, [
        { x: 0, y: 0, pressure: p },
        { x: 200, y: 0, pressure: p },
      ]).length;
    expect(line(0.2)).toBeGreaterThan(line(1));
  });

  it('ends exactly at the last input point even with strong stabilisation', () => {
    const brush = base({ stabilization: 1, spacing: 0.05 });
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 0, pressure: 1 }));
    const dabs = run(brush, pts);
    const last = dabs.at(-1)!;
    expect(Math.hypot(last.x - 190, last.y)).toBeLessThanOrEqual(dabStep(brush, last.size) + 1e-6);
  });

  it('stabilisation smooths jitter', () => {
    const jitter = Array.from({ length: 200 }, (_, i) => ({ x: i * 3, y: i % 2 ? 6 : -6, pressure: 1 }));
    const spread = (stab: number) => {
      const ys = run(base({ stabilization: stab, spacing: 0.1 }), jitter)
        .slice(10, -10)
        .map((d) => d.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread(0.8)).toBeLessThan(spread(0) * 0.5);
  });

  it('a click without movement produces a single dab', () => {
    const dabs = run(base(), [{ x: 5, y: 5, pressure: 0.7 }]);
    expect(dabs).toHaveLength(1);
    expect(dabs[0]!.x).toBe(5);
  });
});
