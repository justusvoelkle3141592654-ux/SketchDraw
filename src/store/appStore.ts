import { create } from 'zustand';
import { DEFAULT_BRUSHES, type BrushSettings } from '../core/brush/types';
import { normalizeHex } from '../core/color';
import type { DocSession } from '../editor/DocSession';
import type { RecentEntry } from '../../electron/ipc-types';

export type ToolId = 'brush' | 'pan' | 'zoom' | 'rotate' | 'eyedropper';

export interface Notice {
  id: number;
  kind: 'info' | 'error';
  title: string;
  message: string;
}

interface PersistedPrefs {
  brushes: BrushSettings[];
  activeBrushId: string;
  lastPaintBrushId: string;
  lastEraserBrushId: string;
  color: string;
  recentColors: string[];
  leftCollapsed: boolean;
  leftHanded: boolean;
}

const PREFS_KEY = 'canvas-forge.prefs.v1';

function loadPrefs(): Partial<PersistedPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<PersistedPrefs>;
    // merge stored brush settings onto defaults so new fields/presets appear after updates
    if (Array.isArray(p.brushes)) {
      const stored = new Map(p.brushes.map((b) => [b.id, b]));
      p.brushes = DEFAULT_BRUSHES.map((d) => ({ ...d, ...(stored.get(d.id) ?? {}), id: d.id, kind: d.kind }));
    }
    if (typeof p.color === 'string') p.color = normalizeHex(p.color) ?? undefined;
    return p;
  } catch {
    return {};
  }
}

const prefs = loadPrefs();

export interface AppState {
  sessions: DocSession[];
  activeId: string | null;
  tool: ToolId;
  brushes: BrushSettings[];
  activeBrushId: string;
  lastPaintBrushId: string;
  lastEraserBrushId: string;
  color: string;
  recentColors: string[];
  uiHidden: boolean;
  leftCollapsed: boolean;
  leftHanded: boolean;
  newDocOpen: boolean;
  exportOpen: boolean;
  shortcutsOpen: boolean;
  recent: RecentEntry[];
  notices: Notice[];

  addSession(s: DocSession): void;
  removeSession(id: string): void;
  setActive(id: string): void;
  setTool(t: ToolId): void;
  selectBrush(id: string): void;
  toggleEraser(): void;
  updateBrush(id: string, patch: Partial<BrushSettings>): void;
  resetBrush(id: string): void;
  setColor(hex: string): void;
  commitColor(hex: string): void;
  setUiHidden(v: boolean): void;
  setLeftCollapsed(v: boolean): void;
  setLeftHanded(v: boolean): void;
  setNewDocOpen(v: boolean): void;
  setExportOpen(v: boolean): void;
  setShortcutsOpen(v: boolean): void;
  setRecent(r: RecentEntry[]): void;
  notify(kind: Notice['kind'], title: string, message: string): void;
  dismissNotice(id: number): void;
}

let noticeId = 0;

export const useApp = create<AppState>()((set, get) => ({
  sessions: [],
  activeId: null,
  tool: 'brush',
  brushes: prefs.brushes ?? DEFAULT_BRUSHES.map((b) => ({ ...b })),
  activeBrushId: prefs.activeBrushId ?? 'pencil',
  lastPaintBrushId: prefs.lastPaintBrushId ?? 'pencil',
  lastEraserBrushId: prefs.lastEraserBrushId ?? 'eraser-hard',
  color: prefs.color ?? '#1f2a44',
  recentColors: prefs.recentColors ?? [],
  uiHidden: false,
  leftCollapsed: prefs.leftCollapsed ?? false,
  leftHanded: prefs.leftHanded ?? false,
  newDocOpen: false,
  exportOpen: false,
  shortcutsOpen: false,
  recent: [],
  notices: [],

  addSession: (s) => set((st) => ({ sessions: [...st.sessions, s], activeId: s.id })),
  removeSession: (id) =>
    set((st) => {
      const idx = st.sessions.findIndex((s) => s.id === id);
      const sessions = st.sessions.filter((s) => s.id !== id);
      let activeId = st.activeId;
      if (activeId === id) activeId = sessions[Math.min(idx, sessions.length - 1)]?.id ?? null;
      return { sessions, activeId };
    }),
  setActive: (id) => set({ activeId: id }),
  setTool: (tool) => set({ tool }),
  selectBrush: (id) => {
    const b = get().brushes.find((x) => x.id === id);
    if (!b) return;
    set(
      b.kind === 'erase'
        ? { activeBrushId: id, lastEraserBrushId: id, tool: 'brush' }
        : { activeBrushId: id, lastPaintBrushId: id, tool: 'brush' },
    );
  },
  toggleEraser: () => {
    const st = get();
    const active = st.brushes.find((b) => b.id === st.activeBrushId);
    st.selectBrush(
      active?.kind === 'erase' && st.tool === 'brush' ? st.lastPaintBrushId : st.lastEraserBrushId,
    );
  },
  updateBrush: (id, patch) =>
    set((st) => ({
      brushes: st.brushes.map((b) => (b.id === id ? { ...b, ...patch, id: b.id, kind: b.kind } : b)),
    })),
  resetBrush: (id) => {
    const d = DEFAULT_BRUSHES.find((b) => b.id === id);
    if (d) set((st) => ({ brushes: st.brushes.map((b) => (b.id === id ? { ...d } : b)) }));
  },
  setColor: (hex) => {
    const c = normalizeHex(hex);
    if (c) set({ color: c });
  },
  commitColor: (hex) => {
    const c = normalizeHex(hex);
    if (!c) return;
    set((st) => ({ color: c, recentColors: [c, ...st.recentColors.filter((x) => x !== c)].slice(0, 16) }));
  },
  setUiHidden: (uiHidden) => set({ uiHidden }),
  setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
  setLeftHanded: (leftHanded) => set({ leftHanded }),
  setNewDocOpen: (newDocOpen) => set({ newDocOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setRecent: (recent) => set({ recent }),
  notify: (kind, title, message) => {
    const id = ++noticeId;
    set((st) => ({ notices: [...st.notices, { id, kind, title, message }].slice(-4) }));
    if (kind === 'info') setTimeout(() => get().dismissNotice(id), 3500);
  },
  dismissNotice: (id) => set((st) => ({ notices: st.notices.filter((n) => n.id !== id) })),
}));

export function activeSession(): DocSession | null {
  const st = useApp.getState();
  return st.sessions.find((s) => s.id === st.activeId) ?? null;
}

export function activeBrush(st: AppState = useApp.getState()): BrushSettings {
  return st.brushes.find((b) => b.id === st.activeBrushId) ?? st.brushes[0]!;
}

// persist preferences (debounced)
let persistTimer: ReturnType<typeof setTimeout> | null = null;
useApp.subscribe((st) => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const p: PersistedPrefs = {
      brushes: st.brushes,
      activeBrushId: st.activeBrushId,
      lastPaintBrushId: st.lastPaintBrushId,
      lastEraserBrushId: st.lastEraserBrushId,
      color: st.color,
      recentColors: st.recentColors,
      leftCollapsed: st.leftCollapsed,
      leftHanded: st.leftHanded,
    };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
      // storage unavailable: preferences simply are not remembered
    }
  }, 400);
});
