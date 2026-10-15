import { useEffect, useRef } from 'react';
import {
  Brush,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Hand,
  Minimize,
  Pipette,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { CanvasController, useCanvasStatus } from '../editor/canvasController';
import { runCommand, tip } from '../editor/commands';
import { closeSession, openPath, openWithDialog } from '../editor/fileOps';
import { activeBrush, activeSession, useApp } from '../store/appStore';
import { BrandMark, ColorInput, useSessionVersion } from './common';

export function DocTabs() {
  const sessions = useApp((s) => s.sessions);
  const activeId = useApp((s) => s.activeId);
  const setActive = useApp((s) => s.setActive);
  if (sessions.length === 0) return <div className="tabs" />;
  return (
    <div className="tabs" role="tablist" aria-label="Geöffnete Dokumente">
      {sessions.map((s) => (
        <Tab key={s.id} id={s.id} active={s.id === activeId} onSelect={() => setActive(s.id)} />
      ))}
    </div>
  );
}

function Tab({ id, active, onSelect }: { id: string; active: boolean; onSelect(): void }) {
  const s = useApp((st) => st.sessions.find((x) => x.id === id))!;
  useSessionVersion(s);
  return (
    <div
      className={`tab ${active ? 'active' : ''}`}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={s.filePath ?? 'Noch nicht gespeichert'}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      onAuxClick={(e) => e.button === 1 && void closeSession(s)}
    >
      <span className="tab-title">{s.title}</span>
      {s.isDirty && (
        <span className="dirty" aria-label="ungespeichert">
          ●
        </span>
      )}
      <button
        type="button"
        className="icon-btn small"
        aria-label={`${s.title} schließen`}
        title="Schließen (Strg+W)"
        onClick={(e) => {
          e.stopPropagation();
          void closeSession(s);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function LeftToolbar() {
  const tool = useApp((s) => s.tool);
  const collapsed = useApp((s) => s.leftCollapsed);
  const setCollapsed = useApp((s) => s.setLeftCollapsed);
  const brushKind = useApp((s) => activeBrush(s).kind);
  const color = useApp((s) => s.color);
  if (collapsed) {
    return (
      <nav className="left collapsed" aria-label="Werkzeuge (eingeklappt)">
        <button
          type="button"
          className="collapse-handle"
          title="Werkzeugleiste ausklappen"
          aria-label="Werkzeugleiste ausklappen"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight size={14} />
        </button>
      </nav>
    );
  }
  const btn = (id: string, icon: React.ReactNode, active: boolean) => (
    <button
      type="button"
      className="icon-btn"
      title={tip(id)}
      aria-label={tip(id)}
      aria-pressed={active}
      onClick={() => runCommand(id)}
    >
      {icon}
    </button>
  );
  return (
    <nav className="left" aria-label="Werkzeuge">
      {btn('tool.brush', <Brush size={20} />, tool === 'brush' && brushKind === 'paint')}
      {btn('tool.eraser', <Eraser size={20} />, tool === 'brush' && brushKind === 'erase')}
      {btn('tool.eyedropper', <Pipette size={20} />, tool === 'eyedropper')}
      <div className="sep" style={{ width: 28, height: 1, margin: '4px 0', alignSelf: 'center' }} />
      {btn('tool.pan', <Hand size={20} />, tool === 'pan')}
      {btn('tool.zoom', <Search size={20} />, tool === 'zoom')}
      {btn('tool.rotate', <RotateCw size={20} />, tool === 'rotate')}
      <div className="spacer" />
      <ColorInput
        className="color-chip color-current"
        label="Aktuelle Farbe"
        value={color}
        onInput={(v) => useApp.getState().setColor(v)}
        onCommit={(v) => useApp.getState().commitColor(v)}
      />
      <button
        type="button"
        className="icon-btn small"
        title="Werkzeugleiste einklappen"
        aria-label="Werkzeugleiste einklappen"
        onClick={() => setCollapsed(true)}
      >
        <ChevronLeft size={14} />
      </button>
    </nav>
  );
}

export function CanvasView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const activeId = useApp((s) => s.activeId);
  const sessions = useApp((s) => s.sessions);
  const brushSize = useApp((s) => activeBrush(s).size);
  const tool = useApp((s) => s.tool);
  const uiHidden = useApp((s) => s.uiHidden);

  useEffect(() => {
    const ctrl = new CanvasController(canvasRef.current!, hostRef.current!);
    ctrlRef.current = ctrl;
    (window as unknown as { __cforgeCanvas?: CanvasController }).__cforgeCanvas = ctrl;
    return () => ctrl.dispose();
  }, []);

  useEffect(() => {
    ctrlRef.current?.setSession(sessions.find((s) => s.id === activeId) ?? null);
  }, [activeId, sessions]);

  useEffect(() => {
    ctrlRef.current?.refresh();
  }, [brushSize, tool]);

  return (
    <main className="workspace" ref={hostRef}>
      <canvas ref={canvasRef} className="view" tabIndex={0} aria-label="Zeichenfläche" data-testid="canvas" />
      {sessions.length === 0 && <Welcome />}
      {uiHidden && (
        <button
          type="button"
          className="icon-btn focus-exit"
          title="Oberfläche einblenden (Tab)"
          aria-label="Oberfläche einblenden"
          onClick={() => useApp.getState().setUiHidden(false)}
        >
          <Minimize size={18} />
        </button>
      )}
    </main>
  );
}

function Welcome() {
  const recent = useApp((s) => s.recent);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="row" style={{ gap: 12, marginBottom: 6 }}>
          <BrandMark size={36} />
          <h1>Canvas Forge</h1>
        </div>
        <p>Skizzieren, Illustrieren, Konzeptkunst. Lege ein neues Dokument an oder öffne eine Datei.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => runCommand('file.new')}>
            Neues Dokument (Strg+N)
          </button>
          <button type="button" className="btn" onClick={() => void openWithDialog()}>
            Öffnen … (Strg+O)
          </button>
        </div>
        {recent.length > 0 && (
          <>
            <div className="menu-heading" style={{ marginTop: 18 }}>
              Zuletzt geöffnet
            </div>
            <ul className="recent-list">
              {recent.slice(0, 6).map((r) => (
                <li key={r.path}>
                  <button type="button" onClick={() => void openPath(r.path)} title={r.path}>
                    {r.name}
                    <span className="recent-path">{r.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function StatusBar() {
  const status = useCanvasStatus();
  useApp((s) => s.activeId);
  const s = activeSession();
  useSessionVersion(s);
  const history = s?.history;
  return (
    <footer className="statusbar" aria-live="off">
      {s ? (
        <>
          <span>
            {s.width} × {s.height} px · {s.dpi} DPI
          </span>
          <span>{status.cursor ? `x ${status.cursor.x}  y ${status.cursor.y}` : 'x –  y –'}</span>
          <span>Ebene: {s.activeLayer.name}</span>
          <span title="Belegter Speicher der Rückgängig-Schritte">
            Verlauf: {history?.size ?? 0} Schritte · {Math.round((history?.bytes ?? 0) / 1048576)} MB
          </span>
        </>
      ) : (
        <span>Kein Dokument geöffnet</span>
      )}
      <span className="spacer" />
      {status.inputType && (
        <span title="Eingabegerät und zuletzt gemessener Druck">
          {status.inputType === 'pen' ? 'Stift' : status.inputType === 'touch' ? 'Touch' : 'Maus'}
          {status.pressure !== null ? ` · Druck ${Math.round(status.pressure * 100)} %` : ''}
          {status.inputType !== 'pen' ? ' (simuliert)' : ''}
        </span>
      )}
      <span title="Mittlere Zeit von Eingabe-Ereignis bis gezeichnetem Frame (nur Renderer, ohne Bildschirm-Latenz)">
        Latenz: {status.latencyMs !== null ? `${status.latencyMs.toFixed(1)} ms` : '–'}
        {status.fps !== null ? ` · ${status.fps} fps` : ''}
      </span>
    </footer>
  );
}
