import { compositeOperation, type BlendMode } from '../core/blend';
import { isEmptyRect, pixelBounds, unionRect, type Rect } from '../core/geometry';
import { createSurface, ctx2d, type Surface } from './surface';
import type { DocSession } from '../editor/DocSession';

/**
 * Keeps a cached, flattened composite of the document and only re-composites the regions
 * that changed. The display then draws this single surface with the view transform, so a
 * pointer event never causes a full multi-layer redraw.
 */
export class Compositor {
  private cache: Surface | null = null;
  private dirty: Rect | null = null;
  private allDirty = true;

  constructor(private readonly session: DocSession) {}

  operation(blend: BlendMode): GlobalCompositeOperation {
    return compositeOperation(blend);
  }

  invalidate(rect?: Rect): void {
    if (!rect) {
      this.allDirty = true;
      return;
    }
    const r = pixelBounds(rect, this.session.width, this.session.height);
    if (!isEmptyRect(r)) this.dirty = this.dirty ? unionRect(this.dirty, r) : r;
  }

  /** Returns the up-to-date composite surface. */
  update(): Surface {
    const { width, height } = this.session;
    if (!this.cache) {
      this.cache = createSurface(width, height);
      this.allDirty = true;
    }
    const ctx = ctx2d(this.cache);
    if (this.allDirty) {
      this.compositeInto(ctx, { x: 0, y: 0, w: width, h: height });
    } else if (this.dirty) {
      this.compositeInto(ctx, this.dirty);
    }
    this.allDirty = false;
    this.dirty = null;
    return this.cache;
  }

  /**
   * Draws background + visible layers for `rect` (document coordinates) into `ctx`.
   * The context must have an identity transform in document space.
   */
  compositeInto(ctx: CanvasRenderingContext2D, rect: Rect, opts: { background?: boolean } = {}): void {
    const s = this.session;
    const { x, y, w, h } = rect;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(x, y, w, h);
    if ((opts.background ?? true) && s.background.visible && !s.background.transparent) {
      ctx.fillStyle = s.background.color;
      ctx.fillRect(x, y, w, h);
    }
    ctx.imageSmoothingEnabled = false;
    for (const layer of s.layers.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const src = s.stroke && s.stroke.layerId === layer.id ? s.stroke.preview : layer.surface;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = compositeOperation(layer.blend);
      ctx.drawImage(src, x, y, w, h, x, y, w, h);
    }
    ctx.restore();
  }

  dispose(): void {
    if (this.cache) {
      this.cache.width = 0;
      this.cache.height = 0;
    }
    this.cache = null;
  }
}
