import { centeredView, fitView, rotateAt, zoomAt, type ViewState } from '../core/geometry';
import type { DocSession } from './DocSession';

/** Size of the canvas viewport in CSS pixels (updated by CanvasView). */
export const viewport = { width: 800, height: 600 };

export const ZOOM_STEPS = [
  0.02, 0.03, 0.05, 0.0625, 0.08, 0.1, 0.125, 0.167, 0.2, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.5, 2, 3, 4, 6,
  8, 12, 16, 24, 32, 48, 64,
];

export function nextZoomStep(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom * 1.001) ?? ZOOM_STEPS.at(-1)!;
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom * 0.999) ?? ZOOM_STEPS[0]!;
}

function center() {
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

export function ensureView(s: DocSession): ViewState {
  if (!s.view) s.view = fitView(s.width, s.height, viewport.width, viewport.height);
  return s.view;
}

export function setView(s: DocSession, v: ViewState): void {
  s.view = v;
  s.requestRender();
  s.notify();
}

export function zoomStep(s: DocSession, dir: 1 | -1): void {
  const v = ensureView(s);
  setView(s, zoomAt(v, center(), nextZoomStep(v.zoom, dir)));
}

export function zoomTo(s: DocSession, zoom: number): void {
  setView(s, zoomAt(ensureView(s), center(), zoom));
}

export function fitToWindow(s: DocSession): void {
  setView(s, fitView(s.width, s.height, viewport.width, viewport.height));
}

export function actualPixels(s: DocSession): void {
  const v = ensureView(s);
  setView(s, centeredView(s.width, s.height, viewport.width, viewport.height, 1, v.rotation));
}

export function resetView(s: DocSession): void {
  setView(s, centeredView(s.width, s.height, viewport.width, viewport.height, 1, 0));
}

export function rotateBy(s: DocSession, deg: number): void {
  const v = ensureView(s);
  setView(s, rotateAt(v, center(), v.rotation + (deg * Math.PI) / 180));
}

export function resetRotation(s: DocSession): void {
  setView(s, rotateAt(ensureView(s), center(), 0));
}
