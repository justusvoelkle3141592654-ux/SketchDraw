import { describe, expect, it } from 'vitest';
import {
  apply,
  canvasToScreen,
  documentScreenBounds,
  fitView,
  gestureView,
  invert,
  multiply,
  normalizeAngle,
  pixelBounds,
  rotateAt,
  rotation,
  scaling,
  screenToCanvas,
  translation,
  unionRect,
  zoomAt,
  type ViewState,
} from '../../src/core/geometry';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const view: ViewState = { zoom: 1.7, rotation: 0.6, panX: 120, panY: -40 };

describe('matrices', () => {
  it('invert(m) · m is identity', () => {
    const m = multiply(translation(5, -3), multiply(rotation(1.1), scaling(2.5)));
    const id = multiply(invert(m), m);
    [1, 0, 0, 1, 0, 0].forEach((v, i) => close(id[i]!, v));
  });

  it('applies m2 before m1', () => {
    const p = apply(multiply(translation(10, 0), scaling(2)), { x: 1, y: 1 });
    expect(p).toEqual({ x: 12, y: 2 });
  });

  it('throws on singular matrices', () => {
    expect(() => invert([0, 0, 0, 0, 1, 1])).toThrow();
  });
});

describe('view transform', () => {
  it('screenToCanvas is the inverse of canvasToScreen', () => {
    const c = { x: 333.3, y: -12.5 };
    const back = screenToCanvas(view, canvasToScreen(view, c));
    close(back.x, c.x);
    close(back.y, c.y);
  });

  it('zoomAt keeps the canvas point under the cursor fixed', () => {
    const s = { x: 410, y: 270 };
    const before = screenToCanvas(view, s);
    const v2 = zoomAt(view, s, 4.2);
    const after = screenToCanvas(v2, s);
    expect(v2.zoom).toBe(4.2);
    close(after.x, before.x, 1e-7);
    close(after.y, before.y, 1e-7);
  });

  it('zoomAt clamps the zoom range', () => {
    expect(zoomAt(view, { x: 0, y: 0 }, 1e9).zoom).toBe(64);
    expect(zoomAt(view, { x: 0, y: 0 }, 0).zoom).toBe(0.02);
  });

  it('rotateAt keeps the pivot fixed and normalises the angle', () => {
    const s = { x: 300, y: 200 };
    const before = screenToCanvas(view, s);
    const v2 = rotateAt(view, s, view.rotation + 7 * Math.PI);
    const after = screenToCanvas(v2, s);
    close(after.x, before.x, 1e-7);
    close(after.y, before.y, 1e-7);
    expect(v2.rotation).toBeGreaterThan(-Math.PI);
    expect(v2.rotation).toBeLessThanOrEqual(Math.PI);
  });

  it('fitView centres and fits the document', () => {
    const v = fitView(2000, 1000, 1000, 800, 0);
    close(v.zoom, 0.5);
    const b = documentScreenBounds(v, 2000, 1000);
    close(b.x, 0);
    close(b.y, 150);
    close(b.w, 1000);
    close(b.h, 500);
  });

  it('normalizeAngle maps into (-π, π]', () => {
    close(normalizeAngle(3 * Math.PI), Math.PI);
    close(normalizeAngle(-Math.PI), Math.PI);
    close(normalizeAngle(0.5), 0.5);
  });
});

describe('two-finger gesture', () => {
  const a1 = { x: 100, y: 100 };
  const a2 = { x: 300, y: 100 };

  it('pure translation pans the view', () => {
    const v = gestureView(view, a1, a2, { x: 150, y: 130 }, { x: 350, y: 130 });
    close(v.zoom, view.zoom);
    close(v.rotation, view.rotation);
    close(v.panX, view.panX + 50, 1e-7);
    close(v.panY, view.panY + 30, 1e-7);
  });

  it('spreading the fingers zooms around the midpoint', () => {
    const v = gestureView(view, a1, a2, { x: 0, y: 100 }, { x: 400, y: 100 });
    close(v.zoom, view.zoom * 2);
    const mid = { x: 200, y: 100 };
    const c0 = screenToCanvas(view, mid);
    const c1 = screenToCanvas(v, mid);
    close(c0.x, c1.x, 1e-7);
    close(c0.y, c1.y, 1e-7);
  });

  it('twisting the fingers rotates the view', () => {
    const v = gestureView(view, a1, a2, { x: 200, y: 0 }, { x: 200, y: 200 });
    close(normalizeAngle(v.rotation - view.rotation), Math.PI / 2);
  });
});

describe('rects', () => {
  it('pixelBounds rounds outwards and clips to the document', () => {
    expect(pixelBounds({ x: -3.2, y: 4.5, w: 10, h: 2.2 }, 100, 100)).toEqual({ x: 0, y: 4, w: 7, h: 3 });
    expect(pixelBounds({ x: 200, y: 0, w: 5, h: 5 }, 100, 100).w).toBe(0);
  });

  it('unionRect ignores empty rects', () => {
    expect(unionRect({ x: 0, y: 0, w: 0, h: 0 }, { x: 1, y: 2, w: 3, h: 4 })).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    });
    expect(unionRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 })).toEqual({
      x: 0,
      y: 0,
      w: 6,
      h: 6,
    });
  });
});
