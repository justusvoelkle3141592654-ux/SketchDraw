/**
 * 2D geometry helpers and the canvas view transform.
 *
 * Coordinate spaces:
 * - canvas space: document pixels (0..width, 0..height)
 * - screen space: CSS pixels relative to the top-left of the viewport element
 *
 * The view maps canvas → screen as: screen = T(pan) · R(rotation) · S(zoom) · canvas
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Affine matrix in canvas `setTransform(a, b, c, d, e, f)` order. */
export type Mat2D = readonly [number, number, number, number, number, number];

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

/** Returns m1 · m2 (m2 is applied first). */
export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function invert(m: Mat2D): Mat2D {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error('Matrix is not invertible');
  const id = 1 / det;
  return [d * id, -b * id, -c * id, a * id, (c * f - d * e) * id, (b * e - a * f) * id];
}

export function apply(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function translation(x: number, y: number): Mat2D {
  return [1, 0, 0, 1, x, y];
}

export function scaling(s: number): Mat2D {
  return [s, 0, 0, s, 0, 0];
}

export function rotation(rad: number): Mat2D {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Normalises an angle to (-π, π]. */
export function normalizeAngle(rad: number): number {
  let r = rad % (Math.PI * 2);
  if (r <= -Math.PI) r += Math.PI * 2;
  if (r > Math.PI) r -= Math.PI * 2;
  return r;
}

// ---------------------------------------------------------------------------
// Rectangles

export function emptyRect(): Rect {
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function isEmptyRect(r: Rect): boolean {
  return r.w <= 0 || r.h <= 0;
}

export function unionRect(a: Rect, b: Rect): Rect {
  if (isEmptyRect(a)) return { ...b };
  if (isEmptyRect(b)) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : emptyRect();
}

/** Expands a rect to integer pixel bounds and clips it to the document. */
export function pixelBounds(r: Rect, width: number, height: number, pad = 0): Rect {
  if (isEmptyRect(r)) return emptyRect();
  const x0 = Math.floor(r.x - pad);
  const y0 = Math.floor(r.y - pad);
  const x1 = Math.ceil(r.x + r.w + pad);
  const y1 = Math.ceil(r.y + r.h + pad);
  return intersectRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { x: 0, y: 0, w: width, h: height });
}

// ---------------------------------------------------------------------------
// View transform

export interface ViewState {
  zoom: number;
  /** Radians, positive = clockwise on screen. */
  rotation: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

export function viewMatrix(v: ViewState): Mat2D {
  return multiply(translation(v.panX, v.panY), multiply(rotation(v.rotation), scaling(v.zoom)));
}

export function screenToCanvas(v: ViewState, p: Vec2): Vec2 {
  return apply(invert(viewMatrix(v)), p);
}

export function canvasToScreen(v: ViewState, p: Vec2): Vec2 {
  return apply(viewMatrix(v), p);
}

/** Computes the pan so that canvas point `c` lands on screen point `s` for the given zoom/rotation. */
function panFor(zoom: number, rot: number, c: Vec2, s: Vec2): { panX: number; panY: number } {
  const rs = apply(multiply(rotation(rot), scaling(zoom)), c);
  return { panX: s.x - rs.x, panY: s.y - rs.y };
}

/** Zooms so that the canvas point under screen point `s` stays fixed. */
export function zoomAt(v: ViewState, s: Vec2, newZoom: number): ViewState {
  const zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const c = screenToCanvas(v, s);
  return { ...v, zoom, ...panFor(zoom, v.rotation, c, s) };
}

/** Rotates around screen point `s` (the canvas point under it stays fixed). */
export function rotateAt(v: ViewState, s: Vec2, newRotation: number): ViewState {
  const rot = normalizeAngle(newRotation);
  const c = screenToCanvas(v, s);
  return { ...v, rotation: rot, ...panFor(v.zoom, rot, c, s) };
}

export function panBy(v: ViewState, dx: number, dy: number): ViewState {
  return { ...v, panX: v.panX + dx, panY: v.panY + dy };
}

/** Centers the document in the viewport at the given zoom and rotation. */
export function centeredView(
  docW: number,
  docH: number,
  vpW: number,
  vpH: number,
  zoom: number,
  rot = 0,
): ViewState {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  return {
    zoom: z,
    rotation: rot,
    ...panFor(z, rot, { x: docW / 2, y: docH / 2 }, { x: vpW / 2, y: vpH / 2 }),
  };
}

/** Fits the whole (unrotated) document into the viewport with a margin in CSS pixels. */
export function fitView(docW: number, docH: number, vpW: number, vpH: number, margin = 32): ViewState {
  const availW = Math.max(1, vpW - margin * 2);
  const availH = Math.max(1, vpH - margin * 2);
  const zoom = Math.min(availW / docW, availH / docH);
  return centeredView(docW, docH, vpW, vpH, zoom, 0);
}

/**
 * Two-finger gesture: given the start view and the two touch points at gesture start (a1, a2)
 * and now (b1, b2), returns the view that keeps the canvas point under the start midpoint
 * under the current midpoint while applying the relative scale and rotation.
 */
export function gestureView(start: ViewState, a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): ViewState {
  const da = distance(a1, a2);
  const db = distance(b1, b2);
  const scale = da > 1e-6 ? db / da : 1;
  const angA = Math.atan2(a2.y - a1.y, a2.x - a1.x);
  const angB = Math.atan2(b2.y - b1.y, b2.x - b1.x);
  const midA = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
  const midB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
  const c = screenToCanvas(start, midA);
  const zoom = clamp(start.zoom * scale, MIN_ZOOM, MAX_ZOOM);
  const rot = normalizeAngle(start.rotation + (angB - angA));
  return { zoom, rotation: rot, ...panFor(zoom, rot, c, midB) };
}

/** Axis-aligned screen bounds of the document rectangle under the view. */
export function documentScreenBounds(v: ViewState, docW: number, docH: number): Rect {
  const pts = [
    canvasToScreen(v, { x: 0, y: 0 }),
    canvasToScreen(v, { x: docW, y: 0 }),
    canvasToScreen(v, { x: 0, y: docH }),
    canvasToScreen(v, { x: docW, y: docH }),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
