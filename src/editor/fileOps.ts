import type { NewDocParams } from '../core/docPresets';
import { CforgeError } from '../core/cforge';
import { api, basename, stripExtension } from '../platform';
import { activeSession, useApp } from '../store/appStore';
import { bytesToBitmap, canvasToBytes, createSurface, ctx2d, mimeForPath } from '../render/surface';
import { DocSession } from './DocSession';
import { releaseStrokeBuffers } from './stroke';
import type { OpenedFile } from '../../electron/ipc-types';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

const MIME: Record<ExportFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXT: Record<ExportFormat, string> = { png: '.png', jpeg: '.jpg', webp: '.webp' };

function errorText(e: unknown): string {
  if (e instanceof CforgeError) return e.message;
  if (e instanceof Error) return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  return String(e);
}

function fail(title: string, e: unknown): void {
  console.error(title, e);
  useApp.getState().notify('error', title, errorText(e));
}

async function refreshRecent(path?: string): Promise<void> {
  try {
    const list = path ? await api().recentAdd(path) : await api().recentList();
    useApp.getState().setRecent(list);
  } catch (e) {
    console.warn('recent list unavailable', e);
  }
}

export function loadRecent(): Promise<void> {
  return refreshRecent();
}

export function newDocument(p: NewDocParams): DocSession | null {
  try {
    const s = DocSession.create(p);
    useApp.getState().addSession(s);
    return s;
  } catch (e) {
    fail('Neues Dokument konnte nicht erstellt werden', e);
    return null;
  }
}

async function openFile(file: OpenedFile): Promise<DocSession | null> {
  const st = useApp.getState();
  const existing = st.sessions.find((s) => s.filePath && samePath(s.filePath, file.path));
  if (existing) {
    st.setActive(existing.id);
    return existing;
  }
  const lower = file.path.toLowerCase();
  let s: DocSession;
  if (lower.endsWith('.cforge')) {
    s = await DocSession.fromCforgeBytes(file.data, file.path, stripExtension(file.name));
    await refreshRecent(file.path);
  } else {
    const bmp = await bytesToBitmap(file.data, mimeForPath(file.path));
    try {
      s = DocSession.fromImage(bmp, stripExtension(file.name));
    } finally {
      bmp.close();
    }
  }
  st.addSession(s);
  return s;
}

function samePath(a: string, b: string): boolean {
  return api().platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export async function openWithDialog(): Promise<void> {
  try {
    const file = await api().openFile('supported');
    if (file) await openFile(file);
  } catch (e) {
    fail('Datei konnte nicht geöffnet werden', e);
  }
}

export async function openPath(path: string): Promise<void> {
  try {
    await openFile(await api().readFile(path));
  } catch (e) {
    fail(`„${basename(path)}“ konnte nicht geöffnet werden`, e);
    if (path.toLowerCase().endsWith('.cforge')) {
      try {
        useApp.getState().setRecent(await api().recentRemove(path));
      } catch {
        /* ignore */
      }
    }
  }
}

const saving = new WeakSet<DocSession>();

/** Saves the document; returns true on success. */
export async function saveSession(s: DocSession, opts: { saveAs?: boolean } = {}): Promise<boolean> {
  if (saving.has(s)) return false;
  saving.add(s);
  try {
    let path = s.filePath;
    if (!path || opts.saveAs) {
      path = await api().chooseSavePath('document', `${s.title}.cforge`);
      if (!path) return false;
    }
    const bytes = await s.toCforgeBytes(api().appVersion);
    await api().writeFile(path, bytes);
    s.filePath = path;
    s.title = stripExtension(basename(path));
    s.history.markSaved();
    s.notify();
    await refreshRecent(path);
    useApp.getState().notify('info', 'Gespeichert', basename(path));
    return true;
  } catch (e) {
    fail('Speichern fehlgeschlagen – das Dokument ist unverändert geöffnet', e);
    return false;
  } finally {
    saving.delete(s);
  }
}

export async function exportImage(s: DocSession, format: ExportFormat, quality: number): Promise<boolean> {
  try {
    const path = await api().chooseSavePath(format, `${s.title}${EXT[format]}`);
    if (!path) return false;
    let canvas = s.renderFlattened();
    if (format === 'jpeg') {
      // JPEG has no alpha: flatten over the background colour (white if the canvas is transparent)
      const flat = createSurface(s.width, s.height);
      const ctx = ctx2d(flat);
      ctx.fillStyle = s.background.visible && !s.background.transparent ? s.background.color : '#ffffff';
      ctx.fillRect(0, 0, s.width, s.height);
      ctx.drawImage(canvas, 0, 0);
      canvas = flat;
    }
    const bytes = await canvasToBytes(canvas, MIME[format], format === 'png' ? undefined : quality);
    await api().writeFile(path, bytes);
    useApp.getState().notify('info', 'Exportiert', basename(path));
    return true;
  } catch (e) {
    fail('Export fehlgeschlagen – das Dokument wurde nicht verändert', e);
    return false;
  }
}

export async function importImageAsLayer(s: DocSession): Promise<void> {
  try {
    const file = await api().openFile('image');
    if (!file) return;
    const bmp = await bytesToBitmap(file.data, mimeForPath(file.path));
    try {
      const surface = createSurface(s.width, s.height);
      // centre the image; scale down if it is larger than the canvas
      const scale = Math.min(1, s.width / bmp.width, s.height / bmp.height);
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const ctx = ctx2d(surface);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, Math.round((s.width - w) / 2), Math.round((s.height - h) / 2), w, h);
      s.addLayer({ name: stripExtension(file.name).slice(0, 60), surface });
    } finally {
      bmp.close();
    }
  } catch (e) {
    fail('Bild konnte nicht importiert werden', e);
  }
}

/** Closes a document, asking to save unsaved changes. Returns false if the user cancelled. */
export async function closeSession(s: DocSession): Promise<boolean> {
  if (s.stroke) return false;
  if (s.isDirty) {
    useApp.getState().setActive(s.id);
    const choice = await api().confirmUnsaved(s.title);
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveSession(s))) return false;
  }
  useApp.getState().removeSession(s.id);
  s.compositor.dispose();
  releaseStrokeBuffers(s);
  s.history.clear();
  return true;
}

export async function closeActive(): Promise<void> {
  const s = activeSession();
  if (s) await closeSession(s);
}

let quitting = false;

/** Handles a window close request: confirms every unsaved document, then quits. */
export async function handleQuitRequest(): Promise<void> {
  if (quitting) return;
  quitting = true;
  try {
    for (const s of useApp.getState().sessions) {
      if (s.stroke) return;
      if (!s.isDirty) continue;
      useApp.getState().setActive(s.id);
      const choice = await api().confirmUnsaved(s.title);
      if (choice === 'cancel') return;
      if (choice === 'save' && !(await saveSession(s))) return;
    }
    api().quit();
  } finally {
    quitting = false;
  }
}
