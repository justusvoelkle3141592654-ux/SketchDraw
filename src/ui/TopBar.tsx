import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Expand,
  FilePlus2,
  FolderOpen,
  Hand,
  Keyboard,
  Maximize,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scan,
  Share,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { COMMANDS, runCommand } from '../editor/commands';
import { openPath } from '../editor/fileOps';
import { resetRotation } from '../editor/viewOps';
import { activeSession, useApp } from '../store/appStore';
import { BrandMark, CommandButton, useSessionVersion } from './common';

function FileMenu() {
  const [open, setOpen] = useState(false);
  const recent = useApp((s) => s.recent);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const groups: { title: string; ids: string[] }[] = [
    {
      title: 'Datei',
      ids: [
        'file.new',
        'file.open',
        'file.save',
        'file.saveAs',
        'file.export',
        'file.importLayer',
        'file.close',
      ],
    },
    { title: 'Ebenen', ids: ['layer.new', 'layer.duplicate', 'layer.mergeDown', 'layer.clear'] },
    { title: 'Ansicht', ids: ['view.fit', 'view.actual', 'view.reset', 'view.focus'] },
  ];
  const run = (id: string) => {
    setOpen(false);
    runCommand(id);
  };
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Menü"
      >
        Menü <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {groups.map((g, gi) => (
            <div key={g.title}>
              {gi > 0 && <div className="menu-sep" />}
              <div className="menu-heading">{g.title}</div>
              {g.ids.map((id) => {
                const c = COMMANDS.find((x) => x.id === id)!;
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    disabled={c.enabled ? !c.enabled() : false}
                    onClick={() => run(id)}
                  >
                    <span>{c.label}</span>
                    <kbd>{c.keys[0]}</kbd>
                  </button>
                );
              })}
            </div>
          ))}
          {recent.length > 0 && (
            <>
              <div className="menu-sep" />
              <div className="menu-heading">Zuletzt geöffnet</div>
              {recent.slice(0, 8).map((r) => (
                <button
                  key={r.path}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  title={r.path}
                  onClick={() => {
                    setOpen(false);
                    void openPath(r.path);
                  }}
                >
                  <span>{r.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const activeId = useApp((s) => s.activeId);
  useApp((s) => s.sessions.length);
  const tool = useApp((s) => s.tool);
  const s = activeSession();
  useSessionVersion(s);
  const v = s?.view;
  const rotDeg = v ? Math.round((v.rotation * 180) / Math.PI) : 0;
  return (
    <header className="topbar" data-active={activeId ?? ''}>
      <div className="brand">
        <BrandMark />
        <span className="brand-name">Canvas Forge</span>
      </div>
      <FileMenu />
      <div className="sep" />
      <CommandButton id="file.new" icon={<FilePlus2 size={18} />} />
      <CommandButton id="file.open" icon={<FolderOpen size={18} />} />
      <CommandButton id="file.save" icon={<Save size={18} />} />
      <CommandButton id="file.export" icon={<Share size={18} />} />
      <div className="sep" />
      <CommandButton id="edit.undo" icon={<Undo2 size={18} />} />
      <CommandButton id="edit.redo" icon={<Redo2 size={18} />} />
      <div className="sep" />
      <CommandButton id="tool.pan" icon={<Hand size={18} />} active={tool === 'pan'} />
      <CommandButton id="view.zoomOut" icon={<ZoomOut size={18} />} />
      <button
        type="button"
        className="icon-btn zoom-label"
        title="Originalgröße (Strg+1)"
        disabled={!s}
        onClick={() => runCommand('view.actual')}
      >
        {v ? `${Math.round(v.zoom * 1000) / 10} %` : '–'}
      </button>
      <CommandButton id="view.zoomIn" icon={<ZoomIn size={18} />} />
      <CommandButton id="view.fit" icon={<Maximize size={18} />} />
      <CommandButton id="view.rotateLeft" icon={<RotateCcw size={18} />} />
      <button
        type="button"
        className="icon-btn zoom-label"
        title="Drehung zurücksetzen"
        disabled={!s || rotDeg === 0}
        onClick={() => s && resetRotation(s)}
      >
        {rotDeg}°
      </button>
      <CommandButton id="view.rotateRight" icon={<RotateCw size={18} />} />
      <CommandButton id="view.reset" icon={<Scan size={18} />} />
      <div className="spacer" />
      <CommandButton id="help.shortcuts" icon={<Keyboard size={18} />} />
      <CommandButton id="view.focus" icon={<Expand size={18} />} />
    </header>
  );
}
