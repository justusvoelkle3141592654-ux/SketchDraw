import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Layers2,
  Lock,
  LockOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { BLEND_LABELS, BLEND_MODES, type BlendMode } from '../../core/blend';
import type { Layer } from '../../core/layers';
import type { DocSession } from '../../editor/DocSession';
import { runCommand, tip } from '../../editor/commands';
import type { Surface } from '../../render/surface';
import { activeSession, useApp } from '../../store/appStore';
import { ColorInput, Slider, useSessionVersion } from '../common';

/** Ticks at most every `ms` while the session's pixels change. */
function usePixelTick(s: DocSession, ms = 300): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = s.pixelVersion;
    const unsub = s.onRender(() => {
      if (timer || s.pixelVersion === last) return;
      timer = setTimeout(() => {
        timer = null;
        last = s.pixelVersion;
        setTick((t) => t + 1);
      }, ms);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [s, ms]);
  return tick;
}

function Thumb({
  layer,
  tick,
  docW,
  docH,
}: {
  layer: Layer<Surface>;
  tick: number;
  docW: number;
  docH: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(56 / docW, 40 / docH);
    c.width = Math.max(1, Math.round(docW * scale * dpr));
    c.height = Math.max(1, Math.round(docH * scale * dpr));
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(layer.surface, 0, 0, c.width, c.height);
  }, [layer, tick, docW, docH]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
}

function LayerRow(props: {
  s: DocSession;
  layer: Layer<Surface>;
  index: number;
  tick: number;
  active: boolean;
  dragId: string | null;
  setDragId(id: string | null): void;
}) {
  const { s, layer, index } = props;
  const [renaming, setRenaming] = useState(false);
  const [drop, setDrop] = useState<'above' | 'below' | null>(null);
  return (
    <div
      className={`layer ${props.active ? 'active' : ''} ${layer.visible ? '' : 'hidden-layer'} ${drop ? `drop-${drop}` : ''}`}
      role="option"
      aria-selected={props.active}
      tabIndex={0}
      draggable={!renaming}
      data-layer-id={layer.id}
      onClick={() => s.setActiveLayer(layer.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') s.setActiveLayer(layer.id);
        if (e.key === 'F2') setRenaming(true);
      }}
      onDoubleClick={() => setRenaming(true)}
      onDragStart={(e) => {
        props.setDragId(layer.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', layer.id);
      }}
      onDragEnd={() => props.setDragId(null)}
      onDragOver={(e) => {
        if (!props.dragId || props.dragId === layer.id) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setDrop(e.clientY < r.top + r.height / 2 ? 'above' : 'below');
      }}
      onDragLeave={() => setDrop(null)}
      onDrop={(e) => {
        e.preventDefault();
        const id = props.dragId;
        const where = drop;
        setDrop(null);
        props.setDragId(null);
        if (!id || id === layer.id) return;
        // list is shown top→bottom; stack index 0 is the bottom layer
        const from = s.layers.indexOf(id);
        let target = where === 'above' ? index + 1 : index;
        if (from < target) target -= 1;
        s.moveLayer(id, target);
      }}
    >
      <button
        type="button"
        className="icon-btn small"
        aria-label={layer.visible ? `${layer.name} ausblenden` : `${layer.name} einblenden`}
        title={layer.visible ? 'Ausblenden' : 'Einblenden'}
        onClick={(e) => {
          e.stopPropagation();
          s.setLayerProps(layer.id, { visible: !layer.visible }, undefined, 'Sichtbarkeit');
        }}
      >
        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <Thumb layer={layer} tick={props.tick} docW={s.width} docH={s.height} />
      <div style={{ minWidth: 0 }}>
        {renaming ? (
          <input
            className="layer-rename"
            defaultValue={layer.name}
            autoFocus
            aria-label="Ebenenname"
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              s.renameLayer(layer.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <div className="layer-name" title="Doppelklick oder F2 zum Umbenennen">
            {layer.name}
          </div>
        )}
        <div className="layer-sub">
          {BLEND_LABELS[layer.blend]} · {Math.round(layer.opacity * 100)} %
        </div>
      </div>
      <button
        type="button"
        className="icon-btn small"
        aria-label={layer.locked ? `${layer.name} entsperren` : `${layer.name} sperren`}
        title={layer.locked ? 'Entsperren' : 'Sperren'}
        aria-pressed={layer.locked}
        onClick={(e) => {
          e.stopPropagation();
          s.setLayerProps(
            layer.id,
            { locked: !layer.locked },
            undefined,
            layer.locked ? 'Entsperren' : 'Sperren',
          );
        }}
      >
        {layer.locked ? <Lock size={15} /> : <LockOpen size={15} />}
      </button>
    </div>
  );
}

function BackgroundRow({ s }: { s: DocSession }) {
  const bg = s.background;
  const start = useRef<typeof bg | null>(null);
  return (
    <div className="layer bg-row" aria-label="Hintergrund">
      <button
        type="button"
        className="icon-btn small"
        aria-label={bg.visible ? 'Hintergrund ausblenden' : 'Hintergrund einblenden'}
        title={bg.visible ? 'Ausblenden' : 'Einblenden'}
        onClick={() => s.setBackground({ visible: !bg.visible })}
      >
        {bg.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <ColorInput
        className="bg-swatch color-current"
        label="Hintergrundfarbe"
        value={bg.color}
        disabled={bg.transparent}
        onInput={(v) => {
          if (!start.current) start.current = { ...bg };
          s.previewBackground({ color: v });
        }}
        onCommit={(v) => {
          const before = start.current ?? undefined;
          start.current = null;
          s.setBackground({ color: v }, before);
        }}
      />
      <div>
        <div className="layer-name">Hintergrund</div>
        <label className="layer-sub row" style={{ gap: 4 }}>
          <input
            type="checkbox"
            checked={bg.transparent}
            onChange={(e) => s.setBackground({ transparent: e.target.checked })}
          />
          transparent
        </label>
      </div>
      <span />
    </div>
  );
}

export function LayerPanel() {
  useApp((st) => st.activeId);
  const s = activeSession();
  useSessionVersion(s);
  if (!s) return <div className="layer-sub">Kein Dokument geöffnet.</div>;
  return <LayerPanelInner s={s} />;
}

function LayerPanelInner({ s }: { s: DocSession }) {
  const tick = usePixelTick(s);
  const [dragId, setDragId] = useState<string | null>(null);
  const active = s.activeLayer;
  const opacityStart = useRef<number | null>(null);
  const idx = s.layers.indexOf(active.id);
  const rows = [...s.layers.layers].map((l, i) => ({ l, i })).reverse();
  return (
    <div>
      <div className="layer-tools" role="toolbar" aria-label="Ebenenaktionen">
        <button
          type="button"
          className="icon-btn small"
          title={tip('layer.new')}
          aria-label="Neue Ebene"
          onClick={() => runCommand('layer.new')}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="icon-btn small"
          title={tip('layer.duplicate')}
          aria-label="Ebene duplizieren"
          onClick={() => runCommand('layer.duplicate')}
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          className="icon-btn small"
          title="Ebene löschen"
          aria-label="Ebene löschen"
          disabled={s.layers.length <= 1}
          onClick={() => s.deleteLayer(active.id)}
        >
          <Trash2 size={16} />
        </button>
        <button
          type="button"
          className="icon-btn small"
          title={tip('layer.mergeDown')}
          aria-label="Nach unten zusammenfügen"
          disabled={idx <= 0}
          onClick={() => runCommand('layer.mergeDown')}
        >
          <Layers2 size={16} />
        </button>
        <button
          type="button"
          className="icon-btn small"
          title={tip('file.importLayer')}
          aria-label="Bild als Ebene importieren"
          onClick={() => runCommand('file.importLayer')}
        >
          <ImagePlus size={16} />
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="icon-btn small"
          title="Ebene nach oben"
          aria-label="Ebene nach oben"
          disabled={idx >= s.layers.length - 1}
          onClick={() => s.moveLayer(active.id, idx + 1)}
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          className="icon-btn small"
          title="Ebene nach unten"
          aria-label="Ebene nach unten"
          disabled={idx <= 0}
          onClick={() => s.moveLayer(active.id, idx - 1)}
        >
          <ArrowDown size={16} />
        </button>
      </div>
      <div className="layer-props">
        <select
          className="select"
          aria-label="Füllmethode"
          title="Füllmethode"
          value={active.blend}
          onChange={(e) =>
            s.setLayerProps(active.id, { blend: e.target.value as BlendMode }, undefined, 'Füllmethode')
          }
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>
              {BLEND_LABELS[m]}
            </option>
          ))}
        </select>
        <span className="layer-sub" style={{ alignSelf: 'center', textAlign: 'right' }}>
          {active.locked ? 'gesperrt' : ''}
        </span>
      </div>
      <Slider
        label="Deckkraft"
        value={active.opacity}
        min={0}
        max={1}
        scale={100}
        unit=" %"
        onChange={(v) => {
          if (opacityStart.current === null) opacityStart.current = active.opacity;
          s.previewLayerProps(active.id, { opacity: v });
        }}
        onCommit={(v) => {
          const before = opacityStart.current ?? active.opacity;
          opacityStart.current = null;
          s.setLayerProps(active.id, { opacity: v }, { opacity: before }, 'Ebenendeckkraft');
        }}
      />
      <div className="layer-list" role="listbox" aria-label="Ebenen (oben = vorne)">
        {rows.map(({ l, i }) => (
          <LayerRow
            key={l.id}
            s={s}
            layer={l}
            index={i}
            tick={tick}
            active={l.id === active.id}
            dragId={dragId}
            setDragId={setDragId}
          />
        ))}
        <BackgroundRow s={s} />
      </div>
    </div>
  );
}
