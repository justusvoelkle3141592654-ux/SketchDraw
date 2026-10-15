import { clamp, lerp, type Rect } from '../geometry';
import { applyPressureCurve } from './pressure';
import type { BrushSettings } from './types';

export interface InputPoint {
  x: number;
  y: number;
  /** 0..1 */
  pressure: number;
}

export interface Dab {
  x: number;
  y: number;
  /** Diameter in document pixels. */
  size: number;
  /** Per-dab alpha 0..1. */
  alpha: number;
}

export const MIN_DAB_SIZE = 0.5;

/** Diameter of a dab for the given raw pressure. */
export function dabSize(brush: BrushSettings, pressure: number): number {
  if (!brush.pressureSize) return Math.max(MIN_DAB_SIZE, brush.size);
  const p = applyPressureCurve(pressure, brush.pressureCurve);
  return Math.max(MIN_DAB_SIZE, brush.size * lerp(clamp(brush.minSize, 0, 1), 1, p));
}

export function dabAlpha(brush: BrushSettings, pressure: number): number {
  if (!brush.pressureOpacity) return clamp(brush.flow, 0, 1);
  const p = applyPressureCurve(pressure, brush.pressureCurve);
  return clamp(brush.flow * lerp(0.08, 1, p), 0, 1);
}

/** Distance to the next dab for a given diameter. */
export function dabStep(brush: BrushSettings, size: number): number {
  return Math.max(0.25, size * clamp(brush.spacing, 0.02, 1));
}

export function dabBounds(d: Dab): Rect {
  const r = d.size / 2 + 1;
  return { x: d.x - r, y: d.y - r, w: r * 2, h: r * 2 };
}

/**
 * Converts a sequence of input points into evenly spaced dabs.
 * - stabilisation: exponential "lazy" smoothing of position and pressure
 * - spacing: dabs are interpolated along the smoothed path, so fast strokes have no gaps
 * The engine is pure (no DOM) so it is unit-testable.
 */
export class StrokeEngine {
  private smoothed: InputPoint | null = null;
  private lastPath: InputPoint | null = null;
  private lastRaw: InputPoint | null = null;
  /** Path length travelled since the last emitted dab. */
  private sinceLast = 0;

  constructor(private readonly brush: BrushSettings) {}

  begin(p: InputPoint): Dab[] {
    this.smoothed = { ...p };
    this.lastPath = { ...p };
    this.lastRaw = { ...p };
    this.sinceLast = 0;
    return [this.makeDab(p.x, p.y, p.pressure)];
  }

  add(p: InputPoint): Dab[] {
    if (!this.smoothed || !this.lastPath) return this.begin(p);
    this.lastRaw = { ...p };
    const a = this.smoothingFactor();
    const pa = Math.max(a, 0.35);
    this.smoothed = {
      x: this.smoothed.x + (p.x - this.smoothed.x) * a,
      y: this.smoothed.y + (p.y - this.smoothed.y) * a,
      pressure: this.smoothed.pressure + (p.pressure - this.smoothed.pressure) * pa,
    };
    return this.segment(this.lastPath, this.smoothed);
  }

  /** Catches the smoothed path up with the last raw point so the line ends where the pen lifted. */
  end(): Dab[] {
    if (!this.lastPath || !this.lastRaw) return [];
    const dabs = this.segment(this.lastPath, this.lastRaw);
    this.smoothed = null;
    this.lastPath = null;
    this.lastRaw = null;
    return dabs;
  }

  private smoothingFactor(): number {
    return 1 - clamp(this.brush.stabilization, 0, 1) * 0.92;
  }

  private segment(a: InputPoint, b: InputPoint): Dab[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const dabs: Dab[] = [];
    if (len < 1e-6) {
      this.lastPath = { ...b };
      return dabs;
    }
    let travelled = 0;
    // safety bound against pathological spacing values
    for (let guard = 0; guard < 100000; guard++) {
      const t = travelled / len;
      const size = dabSize(this.brush, lerp(a.pressure, b.pressure, t));
      const need = dabStep(this.brush, size) - this.sinceLast;
      if (need > len - travelled) {
        this.sinceLast += len - travelled;
        break;
      }
      travelled += need;
      this.sinceLast = 0;
      const tt = travelled / len;
      dabs.push(this.makeDab(a.x + dx * tt, a.y + dy * tt, lerp(a.pressure, b.pressure, tt)));
    }
    this.lastPath = { ...b };
    return dabs;
  }

  private makeDab(x: number, y: number, pressure: number): Dab {
    return { x, y, size: dabSize(this.brush, pressure), alpha: dabAlpha(this.brush, pressure) };
  }
}
