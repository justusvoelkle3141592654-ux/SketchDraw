import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { bindingFor, runCommand } from './editor/commands';
import { handleQuitRequest, loadRecent, openPath } from './editor/fileOps';
import { api, hasApi } from './platform';
import { useApp } from './store/appStore';
import { ExportDialog, NewDocDialog, Notices, ShortcutsDialog } from './ui/Dialogs';
import { TopBar } from './ui/TopBar';
import { CanvasView, DocTabs, LeftToolbar, StatusBar } from './ui/Workspace';
import { BrushPanel } from './ui/panels/BrushPanel';
import { ColorPanel } from './ui/panels/ColorPanel';
import { LayerPanel } from './ui/panels/LayerPanel';

function Panel({
  title,
  children,
  initiallyOpen = true,
}: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="panel" aria-label={title}>
      <button type="button" className="panel-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        <span className="chev">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'range' && type !== 'checkbox' && type !== 'color';
  }
  return false;
}

export function App() {
  const uiHidden = useApp((s) => s.uiHidden);
  const leftHanded = useApp((s) => s.leftHanded);
  const anyDialog = useApp((s) => s.newDocOpen || s.exportOpen || s.shortcutsOpen);

  useEffect(() => {
    if (!hasApi()) {
      useApp
        .getState()
        .notify('error', 'Desktop-Bridge fehlt', 'Bitte Canvas Forge als Desktop-App starten.');
      return;
    }
    void loadRecent();
    const offClose = api().onCloseRequested(() => void handleQuitRequest());
    const offOpen = api().onOpenPaths((paths) => paths.forEach((p) => void openPath(p)));
    void api()
      .startupPaths()
      .then((paths) => paths.forEach((p) => void openPath(p)));
    return () => {
      offClose();
      offOpen();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyDialog || isTyping(e.target) || (e.repeat && !['[', ']', '+', '-'].includes(e.key))) return;
      const id = bindingFor(e);
      if (!id) return;
      // Delete inside the layer list etc. should still work; Tab only toggles focus mode on the canvas/body
      if (id === 'view.focus') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag && tag !== 'BODY' && tag !== 'CANVAS') return;
      }
      e.preventDefault();
      runCommand(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyDialog]);

  // drag & drop of files onto the window opens them
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      useApp
        .getState()
        .notify(
          'info',
          'Drag & Drop',
          'Dateien bitte über „Öffnen“ laden (Drag & Drop folgt in einem späteren Meilenstein).',
        );
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className={`app ${uiHidden ? 'ui-hidden' : ''}`}>
      <TopBar />
      <DocTabs />
      <div className={`main ${leftHanded ? 'left-handed' : ''}`}>
        <LeftToolbar />
        <CanvasView />
        <aside className="dock" aria-label="Panels">
          <Panel title="Pinsel">
            <BrushPanel />
          </Panel>
          <Panel title="Farbe">
            <ColorPanel />
          </Panel>
          <Panel title="Ebenen">
            <LayerPanel />
          </Panel>
          <Panel title="Einstellungen" initiallyOpen={false}>
            <label className="check">
              <input
                type="checkbox"
                checked={leftHanded}
                onChange={(e) => useApp.getState().setLeftHanded(e.target.checked)}
              />
              Linkshänder-Layout (Panels links, Werkzeuge rechts)
            </label>
          </Panel>
        </aside>
      </div>
      <StatusBar />
      <NewDocDialog />
      <ExportDialog />
      <ShortcutsDialog />
      <Notices />
    </div>
  );
}
