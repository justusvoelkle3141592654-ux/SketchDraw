import { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { StrokeEngine } from '../../core/brush/engine';
import { BRUSH_LIMITS, type BrushSettings } from '../../core/brush/types';
import { getStamp } from '../../render/stamps';
import { activeBrush, useApp } from '../../store/appStore';
import { Slider } from '../common';

/** Renders a short sample stroke with a pressure ramp using the real brush engine. */
function BrushPreview({ brush }: { brush: BrushSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 120;
    const h = 26;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // scale big brushes down so the preview stays readable
    const size = Math.min(brush.size, 16);
    const preview: BrushSettings = { ...brush, size, stabilization: 0 };
    const engine = new StrokeEngine(preview);
    const pts = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return {
        x: 8 + t * (w - 16),
        y: h / 2 + Math.sin(t * Math.PI * 2) * (h / 2 - size / 2 - 2),
        pressure: Math.sin(t * Math.PI),
      };
    });
    const dabs = [...engine.begin(pts[0]!), ...pts.slice(1).flatMap((p) => engine.add(p)), ...engine.end()];
    const color = brush.kind === 'erase' ? { r: 150, g: 150, b: 160 } : { r: 40, g: 44, b: 56 };
    ctx.globalAlpha = 1;
    const layer = document.createElement('canvas');
    layer.width = c.width;
    layer.height = c.height;
    const lctx = layer.getContext('2d')!;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of dabs) {
      lctx.globalAlpha = d.alpha;
      lctx.drawImage(
        getStamp(brush.hardness, color, d.size * dpr),
        d.x - d.size / 2,
        d.y - d.size / 2,
        d.size,
        d.size,
      );
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = brush.opacity;
    ctx.drawImage(layer, 0, 0);
  }, [brush]);
  return <canvas ref={ref} aria-hidden="true" />;
}

export function BrushPanel() {
  const brushes = useApp((s) => s.brushes);
  const activeId = useApp((s) => s.activeBrushId);
  const tool = useApp((s) => s.tool);
  const brush = useApp((s) => activeBrush(s));
  const st = useApp.getState();
  const set = (patch: Partial<BrushSettings>) => st.updateBrush(brush.id, patch);
  return (
    <div>
      <div className="brush-grid" role="listbox" aria-label="Pinsel">
        {brushes.map((b) => (
          <button
            key={b.id}
            type="button"
            role="option"
            aria-selected={b.id === activeId && tool === 'brush'}
            className={`brush-btn ${b.id === activeId && tool === 'brush' ? 'active' : ''}`}
            onClick={() => st.selectBrush(b.id)}
            title={`${b.name} · ${b.category}`}
            data-brush={b.id}
          >
            <BrushPreview brush={b} />
            <span className="name">{b.name}</span>
          </button>
        ))}
      </div>
      <Slider
        label="Größe"
        value={brush.size}
        min={BRUSH_LIMITS.size.min}
        max={BRUSH_LIMITS.size.max}
        step={0.5}
        log
        unit=" px"
        onChange={(v) => set({ size: v })}
      />
      <Slider
        label="Deckkraft"
        value={brush.opacity}
        min={0.01}
        max={1}
        scale={100}
        unit=" %"
        onChange={(v) => set({ opacity: v })}
      />
      <Slider
        label="Fluss"
        value={brush.flow}
        min={0.01}
        max={1}
        scale={100}
        unit=" %"
        onChange={(v) => set({ flow: v })}
      />
      <Slider
        label="Härte"
        value={brush.hardness}
        min={0}
        max={1}
        scale={100}
        unit=" %"
        onChange={(v) => set({ hardness: v })}
      />
      <Slider
        label="Abstand"
        value={brush.spacing}
        min={BRUSH_LIMITS.spacing.min}
        max={BRUSH_LIMITS.spacing.max}
        scale={100}
        unit=" %"
        onChange={(v) => set({ spacing: v })}
      />
      <Slider
        label="Stabilisierung"
        value={brush.stabilization}
        min={0}
        max={1}
        scale={100}
        unit=" %"
        onChange={(v) => set({ stabilization: v })}
      />
      <Slider
        label="Körnung"
        value={brush.grain}
        min={0}
        max={1}
        scale={100}
        unit=" %"
        onChange={(v) => set({ grain: v })}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={brush.pressureSize}
          onChange={(e) => set({ pressureSize: e.target.checked })}
        />
        Druck steuert Größe
      </label>
      {brush.pressureSize && (
        <Slider
          label="Min. Größe"
          value={brush.minSize}
          min={0}
          max={1}
          scale={100}
          unit=" %"
          onChange={(v) => set({ minSize: v })}
        />
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={brush.pressureOpacity}
          onChange={(e) => set({ pressureOpacity: e.target.checked })}
        />
        Druck steuert Fluss
      </label>
      <Slider
        label="Druckkurve"
        value={brush.pressureCurve}
        min={-1}
        max={1}
        scale={100}
        onChange={(v) => set({ pressureCurve: v })}
      />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="icon-btn small"
          title="Pinsel auf Standard zurücksetzen"
          onClick={() => st.resetBrush(brush.id)}
        >
          <RotateCcw size={14} /> <span>Zurücksetzen</span>
        </button>
      </div>
    </div>
  );
}
