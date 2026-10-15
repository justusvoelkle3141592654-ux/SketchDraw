import { create } from 'zustand';
import { SimulatedPressure } from '../core/brush/pressure';
import type { BrushSettings } from '../core/brush/types';
import { parseHex, rgbToHex } from '../core/color';
import {
  documentScreenBounds,
  gestureView,
  multiply,
  normalizeAngle,
  panBy,
  rotateAt,
  scaling,
  screenToCanvas,
  viewMatrix,
  zoomAt,
  type Vec2,
  type ViewState,
} from '../core/geometry';
import { activeBrush, useApp } from '../store/appStore';
import { ctx2d } from '../render/surface';
import { stepBrushSize } from './commands';
import type { DocSession } from './DocSession';
import { StrokeController } from './stroke';
import { ensureView, viewport } from './viewOps';

/** Live status shown in the status bar. */
export interface CanvasStatus {
  cursor: Vec2 | null;
  latencyMs: number | null;
  fps: number | null;
  inputType: string | null;
  pressure: number | null;
}

export const useCanvasStatus = create<CanvasStatus>()(() => ({
  cursor: null,
  latencyMs: null,
  fps: null,
  inputType: null,
  pressure: null,
}));

type Mode =
  | { kind: 'idle' }
  | { kind: 'stroke'; pointerId: number; stroke: StrokeController; simulated: SimulatedPressure | null }
  | { kind: 'pan'; pointerId: number; last: Vec2 }
  | { kind: 'rotate'; pointerId: number; startAngle: number; startView: ViewState }
  | { kind: 'zoom'; pointerId: number; start: Vec2; startView: ViewState; moved: boolean; out: boolean }
  | { kind: 'gesture'; startView: ViewState; a1: Vec2; a2: Vec2; ids: [number, number] }
  | { kind: 'eyedropper'; pointerId: number };

const WORKSPACE_BG = '#1b1c20';

export class CanvasController {
  private readonly ctx: CanvasRenderingContext2D;
  private session: DocSession | null = null;
  private unsubRender: (() => void) | null = null;
  private frameRequested = false;
  private mode: Mode = { kind: 'idle' };
  private touches = new Map<number, Vec2>();
  private hover: Vec2 | null = null;
  private spaceHeld = false;
  private altHeld = false;
  private shiftHeld = false;
  private dpr = 1;
  private rect: DOMRect;
  private checker: CanvasPattern | null = null;
  private lastInputTs: number | null = null;
  private frameTimes: number[] = [];
  private lastStatusAt = 0;
  private latencySamples: number[] = [];
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
    this.rect = canvas.getBoundingClientRect();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    this.resize();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelInteraction();
    this.unsubRender?.();
    this.resizeObserver.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerCancel);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }

  setSession(s: DocSession | null): void {
    if (s === this.session) return;
    this.cancelInteraction();
    this.unsubRender?.();
    this.session = s;
    this.unsubRender = s ? s.onRender(() => this.requestFrame()) : null;
    if (s) ensureView(s);
    this.requestFrame();
  }

  /** Re-evaluates cursor/tool related drawing (e.g. after brush size change). */
  refresh(): void {
    this.updateCursor();
    this.requestFrame();
  }

  // -------------------------------------------------------------------------
  // Layout / rendering

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const s = this.session;
    if (s?.view && (viewport.width !== w || viewport.height !== h)) {
      // keep the canvas point at the viewport centre fixed while resizing
      s.view = panBy(s.view, (w - viewport.width) / 2, (h - viewport.height) / 2);
    }
    viewport.width = w;
    viewport.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.rect = this.canvas.getBoundingClientRect();
    if (s) ensureView(s);
    this.render(performance.now());
  }

  private requestFrame(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame((t) => {
      this.frameRequested = false;
      if (!this.disposed) this.render(t);
    });
  }

  private getChecker(): CanvasPattern {
    if (this.checker) return this.checker;
    const tile = document.createElement('canvas');
    tile.width = 16;
    tile.height = 16;
    const c = tile.getContext('2d')!;
    c.fillStyle = '#d9d9de';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#b8b9c0';
    c.fillRect(0, 0, 8, 8);
    c.fillRect(8, 8, 8, 8);
    this.checker = this.ctx.createPattern(tile, 'repeat')!;
    return this.checker;
  }

  private render(now: number): void {
    const ctx = this.ctx;
    const s = this.session;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = WORKSPACE_BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s) return;
    if (this.mode.kind === 'stroke') this.mode.stroke.flush();
    const composite = s.compositor.update();
    const v = ensureView(s);
    const m = multiply(scaling(this.dpr), viewMatrix(v));
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);

    // drop shadow + paper
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * this.dpr;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s.width, s.height);
    ctx.restore();

    const transparent = s.background.transparent || !s.background.visible;
    if (transparent) {
      const pat = this.getChecker();
      pat.setTransform(new DOMMatrix().scaleSelf(1 / v.zoom, 1 / v.zoom));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, s.width, s.height);
    }
    ctx.imageSmoothingEnabled = v.zoom < 2;
    ctx.imageSmoothingQuality = v.zoom < 1 ? 'high' : 'low';
    ctx.drawImage(composite, 0, 0);

    // brush cursor in screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawCursor(ctx, v);

    // performance bookkeeping
    if (this.lastInputTs !== null) {
      // event → composited frame (rAF timestamps can predate the event, so use the real clock)
      this.latencySamples.push(Math.max(0, performance.now() - this.lastInputTs));
      if (this.latencySamples.length > 30) this.latencySamples.shift();
      this.lastInputTs = null;
    }
    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && now - this.frameTimes[0]! > 1000) this.frameTimes.shift();
    if (now - this.lastStatusAt > 250) {
      this.lastStatusAt = now;
      const lat = this.latencySamples.length
        ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
        : null;
      useCanvasStatus.setState({
        latencyMs: lat,
        fps: this.mode.kind === 'idle' ? null : this.frameTimes.length,
      });
    }
  }

  private drawCursor(ctx: CanvasRenderingContext2D, v: ViewState): void {
    if (!this.hover || this.effectiveTool() !== 'brush') return;
    const brush = this.brushFor(null);
    const r = (brush.size * v.zoom) / 2;
    const { x, y } = this.hover;
    ctx.lineWidth = 1;
    if (r < 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.arc(x, y, r + 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r - 0.5), 0, Math.PI * 2);
    ctx.stroke();
  }

  // -------------------------------------------------------------------------
  // Tool resolution

  private effectiveTool(): 'brush' | 'pan' | 'zoom' | 'rotate' | 'eyedropper' {
    if (this.spaceHeld) return this.shiftHeld ? 'rotate' : 'pan';
    const tool = useApp.getState().tool;
    if (tool === 'brush' && this.altHeld) return 'eyedropper';
    return tool;
  }

  private brushFor(e: PointerEvent | null): BrushSettings {
    const st = useApp.getState();
    // pen tail / eraser button (buttons bit 5) always erases
    if (e && e.pointerType === 'pen' && (e.buttons & 32) !== 0) {
      return st.brushes.find((b) => b.id === st.lastEraserBrushId) ?? activeBrush(st);
    }
    return activeBrush(st);
  }

  private updateCursor(): void {
    const tool = this.effectiveTool();
    const cursor =
      this.mode.kind === 'pan'
        ? 'grabbing'
        : tool === 'pan'
          ? 'grab'
          : tool === 'zoom'
            ? this.altHeld
              ? 'zoom-out'
              : 'zoom-in'
            : tool === 'rotate'
              ? 'alias'
              : tool === 'eyedropper'
                ? 'copy'
                : 'none';
    this.canvas.style.cursor = cursor;
  }

  // -------------------------------------------------------------------------
  // Input

  private local(e: { clientX: number; clientY: number }): Vec2 {
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  private pressure(e: PointerEvent, simulated: SimulatedPressure | null): number {
    if (simulated) return simulated.next(e.clientX, e.clientY, e.timeStamp);
    return e.pressure > 0 ? e.pressure : 0.02;
  }

  private onContextMenu = (e: Event): void => e.preventDefault();

  private onPointerDown = (e: PointerEvent): void => {
    const s = this.session;
    if (!s) return;
    this.rect = this.canvas.getBoundingClientRect();
    this.canvas.focus({ preventScroll: true });
    const p = this.local(e);

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, p);
      if (this.touches.size === 2) {
        // a second finger turns any single-finger action into a navigation gesture
        if (this.mode.kind === 'stroke') this.mode.stroke.cancel();
        const [[id1, a1], [id2, a2]] = [...this.touches.entries()] as [[number, Vec2], [number, Vec2]];
        this.mode = { kind: 'gesture', startView: ensureView(s), a1, a2, ids: [id1, id2] };
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (this.mode.kind !== 'idle') return;

    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      this.mode = { kind: 'pan', pointerId: e.pointerId, last: p };
      this.updateCursor();
      return;
    }
    if (e.button !== 0 && !(e.pointerType === 'pen' && e.button === 5)) return;

    const tool = this.effectiveTool();
    const v = ensureView(s);
    switch (tool) {
      case 'pan':
        this.mode = { kind: 'pan', pointerId: e.pointerId, last: p };
        break;
      case 'rotate': {
        const c = { x: viewport.width / 2, y: viewport.height / 2 };
        this.mode = {
          kind: 'rotate',
          pointerId: e.pointerId,
          startAngle: Math.atan2(p.y - c.y, p.x - c.x),
          startView: v,
        };
        break;
      }
      case 'zoom':
        this.mode = {
          kind: 'zoom',
          pointerId: e.pointerId,
          start: p,
          startView: v,
          moved: false,
          out: e.altKey,
        };
        break;
      case 'eyedropper':
        this.mode = { kind: 'eyedropper', pointerId: e.pointerId };
        this.pickColor(p, false);
        break;
      case 'brush':
        this.beginStroke(e, p);
        break;
    }
    this.updateCursor();
  };

  private beginStroke(e: PointerEvent, p: Vec2): void {
    const s = this.session!;
    const layer = s.activeLayer;
    const app = useApp.getState();
    if (layer.locked) {
      app.notify('info', 'Ebene ist gesperrt', `„${layer.name}“ kann nicht bemalt werden.`);
      return;
    }
    if (!layer.visible) {
      app.notify('info', 'Ebene ist ausgeblendet', `Blende „${layer.name}“ ein, um darauf zu malen.`);
      return;
    }
    const brush = this.brushFor(e);
    const rgb = parseHex(app.color) ?? { r: 0, g: 0, b: 0 };
    const simulated = e.pointerType === 'pen' ? null : new SimulatedPressure();
    const stroke = new StrokeController(s, brush, rgb);
    this.mode = { kind: 'stroke', pointerId: e.pointerId, stroke, simulated };
    const c = screenToCanvas(ensureView(s), p);
    const pressure = this.pressure(e, simulated);
    stroke.begin({ x: c.x, y: c.y, pressure });
    this.lastInputTs = e.timeStamp;
    useCanvasStatus.setState({ inputType: e.pointerType, pressure });
  }

  private onPointerMove = (e: PointerEvent): void => {
    const s = this.session;
    if (!s) return;
    const p = this.local(e);
    if (e.pointerType !== 'touch' || this.mode.kind === 'idle') {
      this.hover = p;
      const c = screenToCanvas(ensureView(s), p);
      const now = performance.now();
      if (now - this.lastStatusAt > 60)
        useCanvasStatus.setState({ cursor: { x: Math.floor(c.x), y: Math.floor(c.y) } });
    }
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) this.touches.set(e.pointerId, p);

    const m = this.mode;
    switch (m.kind) {
      case 'idle':
        this.requestFrame(); // cursor outline follows the pointer
        return;
      case 'stroke': {
        if (e.pointerId !== m.pointerId) return;
        const events = e.getCoalescedEvents?.() ?? [];
        const list = events.length ? events : [e];
        const v = ensureView(s);
        let pressure = 0;
        for (const ev of list) {
          const c = screenToCanvas(v, this.local(ev));
          pressure = this.pressure(ev, m.simulated);
          m.stroke.add({ x: c.x, y: c.y, pressure });
        }
        this.lastInputTs = e.timeStamp;
        useCanvasStatus.setState({ pressure });
        return;
      }
      case 'pan': {
        if (e.pointerId !== m.pointerId) return;
        s.view = panBy(ensureView(s), p.x - m.last.x, p.y - m.last.y);
        m.last = p;
        this.lastInputTs = e.timeStamp;
        s.requestRender();
        return;
      }
      case 'rotate': {
        if (e.pointerId !== m.pointerId) return;
        const c = { x: viewport.width / 2, y: viewport.height / 2 };
        let rot = m.startView.rotation + Math.atan2(p.y - c.y, p.x - c.x) - m.startAngle;
        if (e.shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);
        s.view = rotateAt(m.startView, c, normalizeAngle(rot));
        this.lastInputTs = e.timeStamp;
        s.requestRender();
        s.notify();
        return;
      }
      case 'zoom': {
        if (e.pointerId !== m.pointerId) return;
        const dx = p.x - m.start.x;
        if (Math.abs(dx) > 3) m.moved = true;
        if (m.moved) {
          s.view = zoomAt(m.startView, m.start, m.startView.zoom * Math.exp(dx * 0.01));
          this.lastInputTs = e.timeStamp;
          s.requestRender();
          s.notify();
        }
        return;
      }
      case 'gesture': {
        const b1 = this.touches.get(m.ids[0]);
        const b2 = this.touches.get(m.ids[1]);
        if (!b1 || !b2) return;
        s.view = gestureView(m.startView, m.a1, m.a2, b1, b2);
        this.lastInputTs = e.timeStamp;
        s.requestRender();
        s.notify();
        return;
      }
      case 'eyedropper':
        if (e.pointerId === m.pointerId) this.pickColor(p, false);
        return;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    const s = this.session;
    const m = this.mode;
    if (m.kind === 'gesture') {
      if (this.touches.size === 0) this.mode = { kind: 'idle' };
      return;
    }
    if (!('pointerId' in m) || m.pointerId !== e.pointerId) return;
    if (m.kind === 'stroke') m.stroke.end();
    if (m.kind === 'zoom' && s && !m.moved) {
      const factor = m.out || e.altKey ? 0.5 : 2;
      s.view = zoomAt(ensureView(s), m.start, ensureView(s).zoom * factor);
      s.requestRender();
    }
    if (m.kind === 'eyedropper') this.pickColor(this.local(e), true);
    this.mode = { kind: 'idle' };
    if (s && m.kind !== 'stroke') s.notify();
    this.updateCursor();
    this.requestFrame();
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    const m = this.mode;
    if (m.kind === 'stroke' && m.pointerId === e.pointerId) m.stroke.end();
    if (m.kind === 'gesture' && this.touches.size > 0) return;
    if (m.kind !== 'idle' && (!('pointerId' in m) || m.pointerId === e.pointerId))
      this.mode = { kind: 'idle' };
    this.updateCursor();
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' && this.mode.kind === 'idle') {
      this.hover = null;
      useCanvasStatus.setState({ cursor: null });
      this.requestFrame();
    }
  };

  private onWheel = (e: WheelEvent): void => {
    const s = this.session;
    if (!s) return;
    e.preventDefault();
    if (this.mode.kind === 'stroke') return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = e.deltaY * unit;
    const p = this.local(e);
    const v = ensureView(s);
    if (e.shiftKey && !e.ctrlKey) {
      stepBrushSize(dy < 0 ? 1 : -1);
      this.requestFrame();
      return;
    }
    if (e.altKey) {
      s.view = rotateAt(v, p, v.rotation + (dy > 0 ? 1 : -1) * (Math.PI / 36));
    } else {
      s.view = zoomAt(v, p, v.zoom * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }
    s.requestRender();
    s.notify();
  };

  private onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    this.altHeld = e.altKey;
    this.shiftHeld = e.shiftKey;
    if (e.code === 'Space' && !typing) {
      const down = e.type === 'keydown';
      if (down && (target?.tagName === 'BUTTON' || target?.tagName === 'SELECT')) {
        // let space activate focused controls
      } else {
        e.preventDefault();
        this.spaceHeld = down;
      }
    }
    if (e.key === 'Alt') e.preventDefault(); // keep Alt from focusing the (hidden) menu bar
    if (e.key === 'Escape' && this.mode.kind === 'stroke') {
      this.mode.stroke.cancel();
      this.mode = { kind: 'idle' };
    }
    this.updateCursor();
    this.requestFrame();
  };

  private onBlur = (): void => {
    this.spaceHeld = false;
    this.altHeld = false;
    this.shiftHeld = false;
    if (this.mode.kind === 'stroke') this.mode.stroke.end();
    this.mode = { kind: 'idle' };
    this.touches.clear();
    this.updateCursor();
  };

  private cancelInteraction(): void {
    if (this.mode.kind === 'stroke') this.mode.stroke.end();
    this.mode = { kind: 'idle' };
    this.touches.clear();
  }

  private pickColor(p: Vec2, commit: boolean): void {
    const s = this.session;
    if (!s) return;
    const c = screenToCanvas(ensureView(s), p);
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
    const data = ctx2d(s.compositor.update()).getImageData(x, y, 1, 1).data;
    if ((data[3] ?? 0) < 8) return;
    const hex = rgbToHex({ r: data[0]!, g: data[1]!, b: data[2]! });
    const app = useApp.getState();
    if (commit) app.commitColor(hex);
    else app.setColor(hex);
  }

  /** Screen-space bounds of the document (used by tests and overlays). */
  documentBounds() {
    const s = this.session;
    return s ? documentScreenBounds(ensureView(s), s.width, s.height) : null;
  }
}
