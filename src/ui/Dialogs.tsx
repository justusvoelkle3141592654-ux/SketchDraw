import { useState } from 'react';
import { X } from 'lucide-react';
import { DOC_PRESETS, orient, validateNewDoc } from '../core/docPresets';
import { COMMANDS } from '../editor/commands';
import { exportImage, newDocument, type ExportFormat } from '../editor/fileOps';
import { activeSession, useApp } from '../store/appStore';
import { ColorInput, Dialog } from './common';

let docCounter = 1;

export function NewDocDialog() {
  const open = useApp((s) => s.newDocOpen);
  const close = () => useApp.getState().setNewDocOpen(false);
  return (
    <Dialog open={open} title="Neues Dokument" onClose={close} footer={null}>
      {open && <NewDocForm onDone={close} />}
    </Dialog>
  );
}

function NewDocForm({ onDone }: { onDone(): void }) {
  const [title, setTitle] = useState(`Unbenannt ${docCounter}`);
  const [presetId, setPresetId] = useState('screen-hd');
  const [width, setWidth] = useState('1920');
  const [height, setHeight] = useState('1080');
  const [dpi, setDpi] = useState('72');
  const [bg, setBg] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);

  const w = Number(width);
  const h = Number(height);
  const params = { title, width: w, height: h, dpi: Number(dpi), background: bg, transparent };
  const { errors, warnings } = validateNewDoc(params);
  const orientation = w >= h ? 'landscape' : 'portrait';

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = DOC_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setWidth(String(p.width));
    setHeight(String(p.height));
    setDpi(String(p.dpi));
  };
  const setOrientation = (o: 'portrait' | 'landscape') => {
    const r = orient(w, h, o);
    setWidth(String(r.width));
    setHeight(String(r.height));
  };
  const create = () => {
    if (errors.length) return;
    if (newDocument(params)) {
      docCounter++;
      onDone();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <div className="form-grid">
        <label htmlFor="nd-title">Name</label>
        <input
          id="nd-title"
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <label htmlFor="nd-preset">Vorlage</label>
        <select
          id="nd-preset"
          className="select"
          value={presetId}
          onChange={(e) => applyPreset(e.target.value)}
        >
          {DOC_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Eigene Größe</option>
        </select>
        <label htmlFor="nd-w">Breite (px)</label>
        <input
          id="nd-w"
          className="text-input"
          inputMode="numeric"
          value={width}
          onChange={(e) => {
            setWidth(e.target.value);
            setPresetId('custom');
          }}
        />
        <label htmlFor="nd-h">Höhe (px)</label>
        <input
          id="nd-h"
          className="text-input"
          inputMode="numeric"
          value={height}
          onChange={(e) => {
            setHeight(e.target.value);
            setPresetId('custom');
          }}
        />
        <span>Ausrichtung</span>
        <div className="seg" role="group" aria-label="Ausrichtung">
          <button
            type="button"
            aria-pressed={orientation === 'portrait'}
            onClick={() => setOrientation('portrait')}
          >
            Hochformat
          </button>
          <button
            type="button"
            aria-pressed={orientation === 'landscape'}
            onClick={() => setOrientation('landscape')}
          >
            Querformat
          </button>
        </div>
        <label htmlFor="nd-dpi">Auflösung (DPI)</label>
        <input
          id="nd-dpi"
          className="text-input"
          inputMode="numeric"
          value={dpi}
          onChange={(e) => setDpi(e.target.value)}
        />
        <span>Hintergrund</span>
        <div className="row">
          <ColorInput
            className="color-current"
            label="Hintergrundfarbe"
            value={bg}
            disabled={transparent}
            onInput={setBg}
            onCommit={setBg}
          />
          <label className="check">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            Transparent
          </label>
        </div>
      </div>
      {Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && Number(dpi) > 0 && (
        <p className="layer-sub">
          Druckgröße: {((w / Number(dpi)) * 2.54).toFixed(1)} × {((h / Number(dpi)) * 2.54).toFixed(1)} cm
        </p>
      )}
      {errors.map((e) => (
        <p key={e} className="msg-error" role="alert">
          {e}
        </p>
      ))}
      {warnings.map((e) => (
        <p key={e} className="msg-warn">
          {e}
        </p>
      ))}
      <div className="dlg-foot" style={{ padding: '16px 0 0' }}>
        <button type="button" className="btn" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn primary" disabled={errors.length > 0}>
          Erstellen
        </button>
      </div>
    </form>
  );
}

export function ExportDialog() {
  const open = useApp((s) => s.exportOpen);
  const close = () => useApp.getState().setExportOpen(false);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState(false);
  const s = activeSession();
  const run = async () => {
    if (!s) return;
    setBusy(true);
    const ok = await exportImage(s, format, quality / 100);
    setBusy(false);
    if (ok) close();
  };
  return (
    <Dialog
      open={open}
      title="Bild exportieren"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" disabled={!s || busy} onClick={() => void run()}>
            {busy ? 'Exportiere …' : 'Exportieren …'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <span>Format</span>
        <div className="seg" role="group" aria-label="Format">
          {(['png', 'jpeg', 'webp'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        {format !== 'png' && (
          <>
            <label htmlFor="ex-q">Qualität</label>
            <div className="row">
              <input
                id="ex-q"
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ width: 40, textAlign: 'right' }}>{quality}</span>
            </div>
          </>
        )}
      </div>
      <p className="layer-sub">
        {format === 'png' && 'Verlustfrei, mit Transparenz.'}
        {format === 'jpeg' &&
          'Verlustbehaftet, ohne Transparenz (transparente Bereiche werden weiß bzw. Hintergrundfarbe).'}
        {format === 'webp' && 'Kompakt, mit Transparenz.'}
        {s && ` Größe: ${s.width} × ${s.height} px.`}
      </p>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const open = useApp((s) => s.shortcutsOpen);
  const close = () => useApp.getState().setShortcutsOpen(false);
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  return (
    <Dialog
      open={open}
      title="Tastenkürzel"
      onClose={close}
      footer={
        <button type="button" className="btn primary" onClick={close}>
          Schließen
        </button>
      }
    >
      <table className="shortcut-table">
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g} group={g} />
          ))}
          <tr>
            <th colSpan={2}>Leinwand</th>
          </tr>
          <tr>
            <td>Zoomen an Mausposition</td>
            <td>Mausrad · Zwei-Finger-Geste</td>
          </tr>
          <tr>
            <td>Ansicht drehen</td>
            <td>Alt+Mausrad · Umschalt+Leertaste+Ziehen</td>
          </tr>
          <tr>
            <td>Ansicht verschieben</td>
            <td>Leertaste+Ziehen · mittlere Maustaste</td>
          </tr>
          <tr>
            <td>Strich abbrechen</td>
            <td>Esc</td>
          </tr>
        </tbody>
      </table>
    </Dialog>
  );
}

function GroupRows({ group }: { group: string }) {
  const cmds = COMMANDS.filter((c) => c.group === group);
  return (
    <>
      <tr>
        <th colSpan={2}>{group}</th>
      </tr>
      {cmds.map((c) => (
        <tr key={c.id}>
          <td>{c.label}</td>
          <td>{c.keys.join(' · ')}</td>
        </tr>
      ))}
    </>
  );
}

export function Notices() {
  const notices = useApp((s) => s.notices);
  const dismiss = useApp((s) => s.dismissNotice);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <span className="notice-title">{n.title}</span>
          <button
            type="button"
            className="icon-btn small"
            aria-label="Meldung schließen"
            onClick={() => dismiss(n.id)}
          >
            <X size={14} />
          </button>
          {n.message && <span className="notice-msg">{n.message}</span>}
        </div>
      ))}
    </div>
  );
}
