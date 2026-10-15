import { BRUSH_LIMITS } from '../core/brush/types';
import { clamp } from '../core/geometry';
import { activeBrush, activeSession, useApp } from '../store/appStore';
import { closeActive, importImageAsLayer, openWithDialog, saveSession } from './fileOps';
import { actualPixels, fitToWindow, resetView, rotateBy, zoomStep } from './viewOps';

export interface Command {
  id: string;
  label: string;
  /** Display shortcuts, e.g. "Strg+Umschalt+S". The first one is shown in tooltips. */
  keys: string[];
  group: 'Datei' | 'Bearbeiten' | 'Ansicht' | 'Werkzeuge' | 'Ebenen' | 'Hilfe';
  run(): void;
  enabled?(): boolean;
}

const hasDoc = () => !!activeSession();

/** Steps the brush size in roughly perceptual increments. */
export function stepBrushSize(dir: 1 | -1): void {
  const st = useApp.getState();
  const b = activeBrush(st);
  const step = Math.max(1, Math.round(b.size * 0.12));
  st.updateBrush(b.id, { size: clamp(b.size + dir * step, BRUSH_LIMITS.size.min, BRUSH_LIMITS.size.max) });
}

export const COMMANDS: Command[] = [
  {
    id: 'file.new',
    label: 'Neues Dokument …',
    keys: ['Strg+N'],
    group: 'Datei',
    run: () => useApp.getState().setNewDocOpen(true),
  },
  { id: 'file.open', label: 'Öffnen …', keys: ['Strg+O'], group: 'Datei', run: () => void openWithDialog() },
  {
    id: 'file.save',
    label: 'Speichern',
    keys: ['Strg+S'],
    group: 'Datei',
    enabled: hasDoc,
    run: () => {
      const s = activeSession();
      if (s) void saveSession(s);
    },
  },
  {
    id: 'file.saveAs',
    label: 'Speichern unter …',
    keys: ['Strg+Umschalt+S'],
    group: 'Datei',
    enabled: hasDoc,
    run: () => {
      const s = activeSession();
      if (s) void saveSession(s, { saveAs: true });
    },
  },
  {
    id: 'file.export',
    label: 'Exportieren (PNG/JPEG/WebP) …',
    keys: ['Strg+Umschalt+E'],
    group: 'Datei',
    enabled: hasDoc,
    run: () => useApp.getState().setExportOpen(true),
  },
  {
    id: 'file.importLayer',
    label: 'Bild als Ebene importieren …',
    keys: ['Strg+Umschalt+I'],
    group: 'Datei',
    enabled: hasDoc,
    run: () => {
      const s = activeSession();
      if (s) void importImageAsLayer(s);
    },
  },
  {
    id: 'file.close',
    label: 'Dokument schließen',
    keys: ['Strg+W'],
    group: 'Datei',
    enabled: hasDoc,
    run: () => void closeActive(),
  },
  {
    id: 'edit.undo',
    label: 'Rückgängig',
    keys: ['Strg+Z'],
    group: 'Bearbeiten',
    enabled: () => !!activeSession()?.history.canUndo,
    run: () => {
      const s = activeSession();
      if (s && !s.stroke) s.history.undo();
    },
  },
  {
    id: 'edit.redo',
    label: 'Wiederholen',
    keys: ['Strg+Y', 'Strg+Umschalt+Z'],
    group: 'Bearbeiten',
    enabled: () => !!activeSession()?.history.canRedo,
    run: () => {
      const s = activeSession();
      if (s && !s.stroke) s.history.redo();
    },
  },
  {
    id: 'view.zoomIn',
    label: 'Vergrößern',
    keys: ['Strg++', '+'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc((s) => zoomStep(s, 1)),
  },
  {
    id: 'view.zoomOut',
    label: 'Verkleinern',
    keys: ['Strg+-', '-'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc((s) => zoomStep(s, -1)),
  },
  {
    id: 'view.fit',
    label: 'An Fenster anpassen',
    keys: ['Strg+0'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc(fitToWindow),
  },
  {
    id: 'view.actual',
    label: 'Originalgröße (100 %)',
    keys: ['Strg+1'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc(actualPixels),
  },
  {
    id: 'view.reset',
    label: 'Ansicht zurücksetzen',
    keys: ['Pos1'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc(resetView),
  },
  {
    id: 'view.rotateLeft',
    label: 'Ansicht 15° nach links drehen',
    keys: ['Umschalt+←'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc((s) => rotateBy(s, -15)),
  },
  {
    id: 'view.rotateRight',
    label: 'Ansicht 15° nach rechts drehen',
    keys: ['Umschalt+→'],
    group: 'Ansicht',
    enabled: hasDoc,
    run: () => withDoc((s) => rotateBy(s, 15)),
  },
  {
    id: 'view.focus',
    label: 'Fokus-Leinwand (Oberfläche aus/ein)',
    keys: ['Tab'],
    group: 'Ansicht',
    run: () => {
      const st = useApp.getState();
      st.setUiHidden(!st.uiHidden);
    },
  },
  {
    id: 'tool.brush',
    label: 'Pinsel',
    keys: ['B'],
    group: 'Werkzeuge',
    run: () => useApp.getState().selectBrush(useApp.getState().lastPaintBrushId),
  },
  {
    id: 'tool.eraser',
    label: 'Radierer (umschalten)',
    keys: ['E'],
    group: 'Werkzeuge',
    run: () => useApp.getState().toggleEraser(),
  },
  {
    id: 'tool.pan',
    label: 'Ansicht verschieben (Leertaste halten)',
    keys: ['H'],
    group: 'Werkzeuge',
    run: () => useApp.getState().setTool('pan'),
  },
  {
    id: 'tool.zoom',
    label: 'Zoomen (Klick/Ziehen, Alt = verkleinern)',
    keys: ['Z'],
    group: 'Werkzeuge',
    run: () => useApp.getState().setTool('zoom'),
  },
  {
    id: 'tool.rotate',
    label: 'Ansicht drehen (Umschalt+Leertaste halten)',
    keys: ['R'],
    group: 'Werkzeuge',
    run: () => useApp.getState().setTool('rotate'),
  },
  {
    id: 'tool.eyedropper',
    label: 'Pipette (Alt halten)',
    keys: ['I'],
    group: 'Werkzeuge',
    run: () => useApp.getState().setTool('eyedropper'),
  },
  {
    id: 'brush.smaller',
    label: 'Pinsel kleiner',
    keys: ['[', 'Umschalt+Mausrad'],
    group: 'Werkzeuge',
    run: () => stepBrushSize(-1),
  },
  {
    id: 'brush.bigger',
    label: 'Pinsel größer',
    keys: [']', 'Umschalt+Mausrad'],
    group: 'Werkzeuge',
    run: () => stepBrushSize(1),
  },
  {
    id: 'layer.new',
    label: 'Neue Ebene',
    keys: ['Strg+Umschalt+N'],
    group: 'Ebenen',
    enabled: hasDoc,
    run: () => withDoc((s) => s.addLayer()),
  },
  {
    id: 'layer.duplicate',
    label: 'Ebene duplizieren',
    keys: ['Strg+J'],
    group: 'Ebenen',
    enabled: hasDoc,
    run: () => withDoc((s) => s.duplicateLayer(s.activeLayerId)),
  },
  {
    id: 'layer.mergeDown',
    label: 'Nach unten zusammenfügen',
    keys: ['Strg+E'],
    group: 'Ebenen',
    enabled: () => {
      const s = activeSession();
      return !!s && s.layers.indexOf(s.activeLayerId) > 0;
    },
    run: () => withDoc((s) => s.mergeDown(s.activeLayerId)),
  },
  {
    id: 'layer.clear',
    label: 'Ebene leeren',
    keys: ['Entf'],
    group: 'Ebenen',
    enabled: hasDoc,
    run: () =>
      withDoc((s) => {
        if (s.activeLayer.locked) useApp.getState().notify('info', 'Ebene ist gesperrt', s.activeLayer.name);
        else s.clearLayer(s.activeLayerId);
      }),
  },
  {
    id: 'help.shortcuts',
    label: 'Tastenkürzel anzeigen',
    keys: ['F1'],
    group: 'Hilfe',
    run: () => useApp.getState().setShortcutsOpen(true),
  },
];

function withDoc(fn: (s: NonNullable<ReturnType<typeof activeSession>>) => unknown): void {
  const s = activeSession();
  if (s && !s.stroke) fn(s);
}

export function command(id: string): Command {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown command ${id}`);
  return c;
}

export function runCommand(id: string): void {
  const c = command(id);
  if (c.enabled && !c.enabled()) return;
  c.run();
}

/** Tooltip text "Label (Shortcut)". */
export function tip(id: string): string {
  const c = command(id);
  return c.keys[0] ? `${c.label} (${c.keys[0]})` : c.label;
}

// ---------------------------------------------------------------------------
// Keyboard

interface KeyBinding {
  id: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const KEY_NAMES: Record<string, string> = {
  '←': 'arrowleft',
  '→': 'arrowright',
  Pos1: 'home',
  Entf: 'delete',
  Tab: 'tab',
};

function parse(id: string, spec: string): KeyBinding | null {
  if (spec.includes('Mausrad')) return null;
  // "Strg++" / "+" → key "+"
  const plusKey = spec.endsWith('+');
  const parts = (plusKey ? spec.slice(0, -1) : spec).split('+').filter(Boolean);
  const key = plusKey ? '+' : parts.pop()!;
  const mods = new Set(parts);
  return {
    id,
    ctrl: mods.has('Strg'),
    shift: mods.has('Umschalt'),
    alt: mods.has('Alt'),
    key: (KEY_NAMES[key] ?? key).toLowerCase(),
  };
}

const BINDINGS: KeyBinding[] = COMMANDS.flatMap((c) =>
  c.keys.map((k) => parse(c.id, k)).filter((b): b is KeyBinding => !!b),
);

/** Characters typed via AltGr on European layouts arrive with ctrl+alt set; treat them as plain keys. */
const SYMBOL_KEYS = new Set(['[', ']', '+', '-', '=']);

export function bindingFor(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  const altGr = e.ctrlKey && e.altKey && SYMBOL_KEYS.has(key);
  const ctrl = altGr ? false : e.ctrlKey || e.metaKey;
  const alt = altGr ? false : e.altKey;
  for (const b of BINDINGS) {
    // Shift is implied for symbols like "+" on many layouts, so ignore it for symbol keys
    const shiftOk = SYMBOL_KEYS.has(b.key) ? true : b.shift === e.shiftKey;
    if (b.key === key && b.ctrl === ctrl && b.alt === alt && shiftOk) return b.id;
  }
  // Ctrl+= is the unshifted "zoom in" on US layouts
  if (ctrl && !alt && key === '=') return 'view.zoomIn';
  return null;
}
