import { clamp } from '../geometry';

/**
 * Maps raw pressure (0..1) through the brush pressure curve.
 * `curve` ranges from -1 (soft: little pressure gives a lot) to +1 (hard: needs firm pressure).
 */
export function applyPressureCurve(pressure: number, curve: number): number {
  const p = clamp(pressure, 0, 1);
  const gamma = Math.pow(2, clamp(curve, -1, 1) * 1.6);
  return Math.pow(p, gamma);
}

/**
 * Simulated pressure for devices without a pressure sensor (mouse, some touch screens).
 * Fast movement thins the line, slow movement thickens it, and the stroke tapers in at the start.
 * Values are deterministic for a given input sequence so the behaviour is testable.
 */
export class SimulatedPressure {
  private last: { x: number; y: number; t: number } | null = null;
  private value = 0.55;
  private travelled = 0;

  constructor(
    private readonly taperInPx = 18,
    private readonly fastSpeed = 2.2, // CSS px per ms considered "fast"
  ) {}

  reset(): void {
    this.last = null;
    this.value = 0.55;
    this.travelled = 0;
  }

  /** `x`/`y` in screen pixels, `t` in milliseconds. */
  next(x: number, y: number, t: number): number {
    if (!this.last) {
      this.last = { x, y, t };
      return this.taper(0.55);
    }
    const d = Math.hypot(x - this.last.x, y - this.last.y);
    const dt = Math.max(1, t - this.last.t);
    this.travelled += d;
    const speed = d / dt;
    const target = clamp(1 - (speed / this.fastSpeed) * 0.55, 0.4, 1);
    // smooth so the width does not jitter with event timing noise
    this.value += (target - this.value) * 0.18;
    this.last = { x, y, t };
    return this.taper(this.value);
  }

  private taper(v: number): number {
    const k = clamp(this.travelled / this.taperInPx, 0, 1);
    return clamp(v * (0.35 + 0.65 * k), 0, 1);
  }
}
