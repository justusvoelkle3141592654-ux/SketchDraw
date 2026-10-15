import {
  CFORGE_FORMAT,
  CFORGE_VERSION,
  layerFileName,
  readCforge,
  writeCforge,
  type CforgeManifest,
} from '../core/cforge';
import { History, type HistoryEntry } from '../core/history';
import { defaultLayerProps, LayerStack, newLayerId, type Layer, type LayerProps } from '../core/layers';
import { isEmptyRect, type Rect, type ViewState } from '../core/geometry';
import type { NewDocParams } from '../core/docPresets';
import {
  bytesToBitmap,
  canvasToBytes,
  cloneSurface,
  createSurface,
  ctx2d,
  type Surface,
} from '../render/surface';
import { Compositor } from '../render/compositor';
import type { ActiveStroke } from './stroke';

export interface BackgroundState {
  color: string;
  transparent: boolean;
  visible: boolean;
}

let sessionCounter = 0;

/**
 * One open document: pixel layers, history, view and file binding.
 * Structural changes call `notify()` (React re-renders); pixel changes call `pixelsChanged()`
 * (canvas re-renders and thumbnails refresh).
 */
export class DocSession {
  readonly id = `doc-${++sessionCounter}`;
  title: string;
  filePath: string | null = null;
  readonly width: number;
  readonly height: number;
  dpi: number;
  background: BackgroundState;
  readonly layers = new LayerStack<Surface>();
  activeLayerId = '';
  readonly history = new History();
  view: ViewState | null = null;
  createdAt = new Date().toISOString();
  brushId: string | null = null;
  stroke: ActiveStroke | null = null;
  readonly compositor: Compositor;

  private version = 0;
  private listeners = new Set<() => void>();
  private renderListeners = new Set<() => void>();
  /** Bumped when layer pixels change; used by thumbnails. */
  pixelVersion = 0;

  private constructor(
    title: string,
    width: number,
    height: number,
    dpi: number,
    background: BackgroundState,
  ) {
    this.title = title;
    this.width = width;
    this.height = height;
    this.dpi = dpi;
    this.background = background;
    this.compositor = new Compositor(this);
    this.history.subscribe(() => this.notify());
  }

  static create(p: NewDocParams): DocSession {
    const s = new DocSession(p.title.trim(), p.width, p.height, p.dpi, {
      color: p.background,
      transparent: p.transparent,
      visible: true,
    });
    const layer: Layer<Surface> = {
      id: newLayerId(),
      ...defaultLayerProps('Ebene 1'),
      surface: createSurface(p.width, p.height),
    };
    s.layers.insert(layer);
    s.activeLayerId = layer.id;
    return s;
  }

  static async fromCforgeBytes(
    bytes: Uint8Array,
    filePath: string | null,
    title: string,
  ): Promise<DocSession> {
    const contents = readCforge(bytes);
    const { manifest } = contents;
    const s = new DocSession(title, manifest.width, manifest.height, manifest.dpi, {
      ...manifest.background,
    });
    s.createdAt = manifest.createdAt;
    s.brushId = manifest.brush?.id ?? null;
    for (const l of manifest.layers) {
      const surface = createSurface(manifest.width, manifest.height);
      const bmp = await bytesToBitmap(contents.layerPngs.get(l.id)!);
      if (bmp.width !== manifest.width || bmp.height !== manifest.height) {
        bmp.close();
        throw new Error(`Ebene „${l.name}“ hat eine falsche Bildgröße.`);
      }
      ctx2d(surface).drawImage(bmp, 0, 0);
      bmp.close();
      s.layers.insert({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        blend: l.blend,
        surface,
      });
    }
    s.activeLayerId = manifest.activeLayerId ?? s.layers.layers.at(-1)!.id;
    s.filePath = filePath;
    s.history.markSaved();
    return s;
  }

  /** Creates a document from a decoded image (used for "open image"). */
  static fromImage(bmp: ImageBitmap, title: string): DocSession {
    const s = DocSession.create({
      title,
      width: bmp.width,
      height: bmp.height,
      dpi: 72,
      background: '#ffffff',
      transparent: true,
    });
    ctx2d(s.activeLayer.surface).drawImage(bmp, 0, 0);
    s.history.markSaved();
    return s;
  }

  async toCforgeBytes(appVersion: string): Promise<Uint8Array> {
    const layerPngs = new Map<string, Uint8Array>();
    for (const l of this.layers.layers) layerPngs.set(l.id, await canvasToBytes(l.surface));
    const manifest: CforgeManifest = {
      format: CFORGE_FORMAT,
      version: CFORGE_VERSION,
      app: { name: 'Canvas Forge', version: appVersion },
      width: this.width,
      height: this.height,
      dpi: this.dpi,
      background: { ...this.background },
      layers: this.layers.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        blend: l.blend,
        file: layerFileName(l.id),
      })),
      activeLayerId: this.activeLayerId,
      brush: this.brushId ? { id: this.brushId } : null,
      createdAt: this.createdAt,
      modifiedAt: new Date().toISOString(),
    };
    const thumbnail = await canvasToBytes(this.renderFlattened(256));
    return writeCforge({ manifest, layerPngs, thumbnail });
  }

  /** Flattened image of the document, optionally downscaled to fit `maxSide`. */
  renderFlattened(maxSide?: number, opts: { background?: boolean } = {}): HTMLCanvasElement {
    const scale = maxSide ? Math.min(1, maxSide / Math.max(this.width, this.height)) : 1;
    const out = createSurface(
      Math.max(1, Math.round(this.width * scale)),
      Math.max(1, Math.round(this.height * scale)),
    );
    const ctx = ctx2d(out);
    if (scale !== 1) {
      // composite at full size first so blend modes match, then downscale
      const full = createSurface(this.width, this.height);
      this.compositor.compositeInto(ctx2d(full), { x: 0, y: 0, w: this.width, h: this.height }, opts);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, 0, 0, out.width, out.height);
      full.width = 0;
      full.height = 0;
    } else {
      this.compositor.compositeInto(ctx, { x: 0, y: 0, w: this.width, h: this.height }, opts);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Change notification

  get displayName(): string {
    return this.title;
  }

  get isDirty(): boolean {
    return this.history.isDirty;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getVersion(): number {
    return this.version;
  }

  notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  onRender(fn: () => void): () => void {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  }

  requestRender(): void {
    for (const fn of this.renderListeners) fn();
  }

  /** Pixels of a layer changed in `rect` (or everywhere). */
  pixelsChanged(rect?: Rect): void {
    this.compositor.invalidate(rect);
    this.pixelVersion++;
    this.requestRender();
  }

  /** Layer structure/props changed: full recomposite + React update. */
  structureChanged(): void {
    this.compositor.invalidate();
    this.pixelVersion++;
    this.requestRender();
    this.notify();
  }

  // -------------------------------------------------------------------------
  // Layers

  get activeLayer(): Layer<Surface> {
    return this.layers.get(this.activeLayerId) ?? this.layers.layers.at(-1)!;
  }

  setActiveLayer(id: string): void {
    if (!this.layers.get(id) || this.activeLayerId === id) return;
    this.activeLayerId = id;
    this.notify();
  }

  private pushStructural(label: string, bytes: number, undo: () => void, redo: () => void): void {
    this.history.push({
      label,
      bytes,
      undo: () => {
        undo();
        this.structureChanged();
      },
      redo: () => {
        redo();
        this.structureChanged();
      },
    });
  }

  addLayer(opts: { name?: string; surface?: Surface; aboveId?: string } = {}): Layer<Surface> {
    const layer: Layer<Surface> = {
      id: newLayerId(),
      ...defaultLayerProps(opts.name ?? this.layers.nextName()),
      surface: opts.surface ?? createSurface(this.width, this.height),
    };
    const above = opts.aboveId ?? this.activeLayerId;
    const index = this.layers.indexOf(above) + 1 || this.layers.length;
    const prevActive = this.activeLayerId;
    this.layers.insert(layer, index);
    this.activeLayerId = layer.id;
    this.pushStructural(
      'Neue Ebene',
      opts.surface ? this.width * this.height * 4 : 64,
      () => {
        this.layers.remove(layer.id);
        this.activeLayerId = prevActive;
      },
      () => {
        this.layers.insert(layer, index);
        this.activeLayerId = layer.id;
      },
    );
    this.structureChanged();
    return layer;
  }

  deleteLayer(id: string): boolean {
    if (this.layers.length <= 1) return false;
    const removed = this.layers.remove(id);
    if (!removed) return false;
    const prevActive = this.activeLayerId;
    const pickActive = () => {
      if (this.activeLayerId === id || !this.layers.get(this.activeLayerId)) {
        const l = this.layers.layers[Math.max(0, removed.index - 1)] ?? this.layers.layers[0]!;
        this.activeLayerId = l.id;
      }
    };
    pickActive();
    this.pushStructural(
      'Ebene löschen',
      this.width * this.height * 4,
      () => {
        this.layers.insert(removed.layer, removed.index);
        this.activeLayerId = prevActive;
      },
      () => {
        this.layers.remove(id);
        pickActive();
      },
    );
    this.structureChanged();
    return true;
  }

  duplicateLayer(id: string): Layer<Surface> | null {
    const src = this.layers.get(id);
    if (!src) return null;
    return this.addLayer({ name: `${src.name} Kopie`, surface: cloneSurface(src.surface), aboveId: id });
  }

  moveLayer(id: string, toIndex: number): void {
    const from = this.layers.indexOf(id);
    if (from < 0 || !this.layers.move(id, toIndex)) return;
    const to = this.layers.indexOf(id);
    this.pushStructural(
      'Ebene verschieben',
      16,
      () => this.layers.move(id, from),
      () => this.layers.move(id, to),
    );
    this.structureChanged();
  }

  /** Applies props without recording history (e.g. while dragging a slider). */
  previewLayerProps(id: string, patch: Partial<LayerProps>): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    Object.assign(layer, patch);
    this.structureChanged();
  }

  /** Applies props and records one undo step from `before` to `patch`. */
  setLayerProps(
    id: string,
    patch: Partial<LayerProps>,
    before?: Partial<LayerProps>,
    label = 'Ebeneneigenschaft',
  ): void {
    const layer = this.layers.get(id);
    if (!layer) return;
    const prev: Partial<LayerProps> = before ?? pick(layer, Object.keys(patch) as (keyof LayerProps)[]);
    if (Object.keys(patch).every((k) => prev[k as keyof LayerProps] === patch[k as keyof LayerProps])) {
      Object.assign(layer, patch);
      this.structureChanged();
      return;
    }
    Object.assign(layer, patch);
    this.pushStructural(
      label,
      64,
      () => Object.assign(layer, prev),
      () => Object.assign(layer, patch),
    );
    this.structureChanged();
  }

  renameLayer(id: string, name: string): void {
    const n = name.trim().slice(0, 200);
    if (n) this.setLayerProps(id, { name: n }, undefined, 'Ebene umbenennen');
  }

  /** Merges a layer into the one below it (respecting opacity and blend mode). */
  mergeDown(id: string): boolean {
    const idx = this.layers.indexOf(id);
    if (idx <= 0) return false;
    const top = this.layers.layers[idx]!;
    const below = this.layers.layers[idx - 1]!;
    if (below.locked) return false;
    const full = { x: 0, y: 0, w: this.width, h: this.height };
    const ctx = ctx2d(below.surface);
    const before = ctx.getImageData(0, 0, this.width, this.height);
    if (top.visible) {
      ctx.save();
      ctx.globalAlpha = top.opacity;
      ctx.globalCompositeOperation = this.compositor.operation(top.blend);
      ctx.drawImage(top.surface, 0, 0);
      ctx.restore();
    }
    const after = ctx.getImageData(0, 0, this.width, this.height);
    const removed = this.layers.remove(top.id)!;
    const prevActive = this.activeLayerId;
    this.activeLayerId = below.id;
    this.pushStructural(
      'Nach unten zusammenfügen',
      before.data.length * 2,
      () => {
        ctx.putImageData(before, 0, 0);
        this.layers.insert(removed.layer, removed.index);
        this.activeLayerId = prevActive;
      },
      () => {
        ctx.putImageData(after, 0, 0);
        this.layers.remove(top.id);
        this.activeLayerId = below.id;
      },
    );
    this.pixelsChanged(full);
    this.structureChanged();
    return true;
  }

  clearLayer(id: string): void {
    const layer = this.layers.get(id);
    if (!layer || layer.locked) return;
    const rect = { x: 0, y: 0, w: this.width, h: this.height };
    this.recordPixelEdit(layer, rect, 'Ebene leeren', (ctx) => ctx.clearRect(0, 0, this.width, this.height));
  }

  /** Applies background changes without recording history (live colour picking). */
  previewBackground(patch: Partial<BackgroundState>): void {
    this.background = { ...this.background, ...patch };
    this.structureChanged();
  }

  setBackground(patch: Partial<BackgroundState>, before?: BackgroundState): void {
    const prev = before ? { ...before } : { ...this.background };
    const next = { ...this.background, ...patch };
    if (prev.color === next.color && prev.transparent === next.transparent && prev.visible === next.visible)
      return;
    this.background = next;
    this.pushStructural(
      'Hintergrund ändern',
      64,
      () => {
        this.background = prev;
      },
      () => {
        this.background = next;
      },
    );
    this.structureChanged();
  }

  // -------------------------------------------------------------------------
  // Pixel edits

  /**
   * Runs `edit` on a layer and records an undo step holding the before/after pixels of `rect`.
   * `rect` must be integer-aligned and inside the document.
   */
  recordPixelEdit(
    layer: Layer<Surface>,
    rect: Rect,
    label: string,
    edit: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    if (isEmptyRect(rect)) return;
    const ctx = ctx2d(layer.surface);
    const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    edit(ctx);
    const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    this.history.push(new PixelPatch(this, layer, rect, before, after, label));
    this.pixelsChanged(rect);
  }
}

class PixelPatch implements HistoryEntry {
  readonly bytes: number;
  constructor(
    private readonly session: DocSession,
    private readonly layer: Layer<Surface>,
    private readonly rect: Rect,
    private readonly before: ImageData,
    private readonly after: ImageData,
    readonly label: string,
  ) {
    this.bytes = before.data.length + after.data.length;
  }

  undo(): void {
    ctx2d(this.layer.surface).putImageData(this.before, this.rect.x, this.rect.y);
    this.session.pixelsChanged(this.rect);
  }

  redo(): void {
    ctx2d(this.layer.surface).putImageData(this.after, this.rect.x, this.rect.y);
    this.session.pixelsChanged(this.rect);
  }
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}
