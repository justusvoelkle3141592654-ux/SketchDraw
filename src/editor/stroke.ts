import { StrokeEngine, dabBounds, type Dab, type InputPoint } from '../core/brush/engine';
import type { BrushSettings } from '../core/brush/types';
import type { RGB } from '../core/color';
import { emptyRect, isEmptyRect, pixelBounds, unionRect, type Rect } from '../core/geometry';
import { createSurface, ctx2d, type Surface } from '../render/surface';
import { getGrainTile, getStamp } from '../render/stamps';
import type { DocSession } from './DocSession';

/** Reusable full-size scratch surfaces per document (allocated on first stroke). */
interface StrokeBuffers {
  raw: Surface;
  grained: Surface;
  preview: Surface;
}

const buffers = new WeakMap<DocSession, StrokeBuffers>();

function getBuffers(s: DocSession): StrokeBuffers {
  let b = buffers.get(s);
  if (!b) {
    b = {
      raw: createSurface(s.width, s.height),
      grained: createSurface(s.width, s.height),
      preview: createSurface(s.width, s.height),
    };
    buffers.set(s, b);
  }
  return b;
}

export function releaseStrokeBuffers(s: DocSession): void {
  const b = buffers.get(s);
  if (!b) return;
  for (const c of [b.raw, b.grained, b.preview]) {
    c.width = 0;
    c.height = 0;
  }
  buffers.delete(s);
}

export interface ActiveStroke {
  layerId: string;
  /** Layer pixels with the in-progress stroke applied; shown instead of the layer while drawing. */
  preview: Surface;
}

/**
 * Paints one stroke:
 *   dabs → `raw` buffer (accumulating flow) → optional paper grain → `preview` = layer ⊕ stroke·opacity
 * Only the regions touched since the last update are recomputed. On `end()` the preview region is
 * copied into the layer and recorded as one undo step.
 */
export class StrokeController {
  private readonly engine: StrokeEngine;
  private readonly bufs: StrokeBuffers;
  private total: Rect = emptyRect();
  private pending: Rect = emptyRect();
  private readonly layerId: string;
  private grainPattern: CanvasPattern | null = null;
  private finished = false;

  constructor(
    private readonly session: DocSession,
    private readonly brush: BrushSettings,
    private readonly color: RGB,
  ) {
    this.engine = new StrokeEngine(brush);
    this.bufs = getBuffers(session);
    const layer = session.activeLayer;
    this.layerId = layer.id;
    // preview starts as an exact copy of the layer
    const p = ctx2d(this.bufs.preview);
    p.save();
    p.globalCompositeOperation = 'copy';
    p.drawImage(layer.surface, 0, 0);
    p.restore();
    session.stroke = { layerId: layer.id, preview: this.bufs.preview };
    if (brush.grain > 0) {
      this.grainPattern = ctx2d(this.bufs.grained).createPattern(getGrainTile(), 'repeat');
    }
  }

  begin(p: InputPoint): void {
    this.paint(this.engine.begin(p));
  }

  add(p: InputPoint): void {
    this.paint(this.engine.add(p));
  }

  /** Applies pending dab regions to the preview. Call once per frame before rendering. */
  flush(): void {
    if (isEmptyRect(this.pending)) return;
    const r = pixelBounds(this.pending, this.session.width, this.session.height);
    this.pending = emptyRect();
    if (isEmptyRect(r)) return;
    const layer = this.session.layers.get(this.layerId);
    if (!layer) return;
    let src: Surface = this.bufs.raw;
    if (this.grainPattern) {
      const g = ctx2d(this.bufs.grained);
      g.save();
      g.clearRect(r.x, r.y, r.w, r.h);
      g.drawImage(this.bufs.raw, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = Math.min(1, this.brush.grain);
      g.fillStyle = this.grainPattern;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
      src = this.bufs.grained;
    }
    const p = ctx2d(this.bufs.preview);
    p.save();
    p.clearRect(r.x, r.y, r.w, r.h);
    p.drawImage(layer.surface, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    p.globalAlpha = Math.min(1, this.brush.opacity);
    p.globalCompositeOperation = this.brush.kind === 'erase' ? 'destination-out' : 'source-over';
    p.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    p.restore();
    this.session.pixelsChanged(r);
  }

  end(): void {
    if (this.finished) return;
    this.finished = true;
    this.paint(this.engine.end());
    this.flush();
    const s = this.session;
    const layer = s.layers.get(this.layerId);
    const r = pixelBounds(this.total, s.width, s.height);
    if (layer && !isEmptyRect(r)) {
      s.recordPixelEdit(layer, r, this.brush.kind === 'erase' ? 'Radieren' : 'Pinselstrich', (ctx) => {
        ctx.save();
        ctx.globalCompositeOperation = 'copy';
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.drawImage(this.bufs.preview, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        ctx.restore();
      });
    }
    this.cleanup(r);
  }

  cancel(): void {
    if (this.finished) return;
    this.finished = true;
    const r = pixelBounds(this.total, this.session.width, this.session.height);
    this.cleanup(r);
  }

  private cleanup(r: Rect): void {
    if (!isEmptyRect(r)) {
      ctx2d(this.bufs.raw).clearRect(r.x, r.y, r.w, r.h);
      ctx2d(this.bufs.grained).clearRect(r.x, r.y, r.w, r.h);
    }
    this.session.stroke = null;
    this.session.pixelsChanged(isEmptyRect(r) ? undefined : r);
  }

  private paint(dabs: Dab[]): void {
    if (dabs.length === 0) return;
    const ctx = ctx2d(this.bufs.raw);
    let dirty = emptyRect();
    for (const d of dabs) {
      const stamp = getStamp(this.brush.hardness, this.color, d.size);
      ctx.globalAlpha = d.alpha;
      ctx.drawImage(stamp, d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
      dirty = unionRect(dirty, dabBounds(d));
    }
    ctx.globalAlpha = 1;
    this.pending = unionRect(this.pending, dirty);
    this.total = unionRect(this.total, dirty);
    this.session.requestRender();
  }
}
