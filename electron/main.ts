import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, type IpcMainInvokeEvent } from 'electron';
import { promises as fs, existsSync } from 'node:fs';
import * as path from 'node:path';
import { atomicWrite, EXTENSIONS, readLimited, READABLE_EXTENSIONS, validatePath } from './files';
import type { OpenedFile, OpenKind, RecentEntry, SaveKind, UnsavedChoice } from './ipc-types';

const isDev = !!process.env['VITE_DEV_SERVER_URL'];

if (process.env['CFORGE_USER_DATA']) {
  app.setPath('userData', path.resolve(process.env['CFORGE_USER_DATA']));
}

let mainWindow: BrowserWindow | null = null;
let allowClose = false;
/** Paths the user explicitly picked or opened during this session; only these may be written. */
const grantedPaths = new Set<string>();
const pendingOpenPaths: string[] = [];

const key = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
const grant = (p: string) => grantedPaths.add(key(path.normalize(p)));
const isGranted = (p: string) => grantedPaths.has(key(path.normalize(p)));

function pathsFromArgv(argv: readonly string[]): string[] {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && READABLE_EXTENSIONS.includes(path.extname(a).toLowerCase()))
    .map((a) => path.resolve(a))
    .filter((a) => existsSync(a));
}

// ---------------------------------------------------------------------------
// Recent files

const RECENT_MAX = 12;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

async function loadRecent(): Promise<RecentEntry[]> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (r): r is RecentEntry =>
          typeof r === 'object' &&
          r !== null &&
          typeof r.path === 'string' &&
          typeof r.name === 'string' &&
          typeof r.openedAt === 'string' &&
          path.isAbsolute(r.path) &&
          EXTENSIONS.document.includes(path.extname(r.path).toLowerCase() as '.cforge'),
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

async function saveRecent(list: RecentEntry[]): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await atomicWrite(recentFile(), new TextEncoder().encode(JSON.stringify(list, null, 2)));
}

async function isRecent(p: string): Promise<boolean> {
  const list = await loadRecent();
  return list.some((r) => key(path.normalize(r.path)) === key(path.normalize(p)));
}

// ---------------------------------------------------------------------------
// Dialog filters

const FILTERS: Record<OpenKind | SaveKind, Electron.FileFilter[]> = {
  document: [{ name: 'Canvas Forge Dokument', extensions: ['cforge'] }],
  image: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  supported: [
    { name: 'Alle unterstützten Dateien', extensions: ['cforge', 'png', 'jpg', 'jpeg', 'webp'] },
    { name: 'Canvas Forge Dokument', extensions: ['cforge'] },
    { name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
  ],
  png: [{ name: 'PNG-Bild', extensions: ['png'] }],
  jpeg: [{ name: 'JPEG-Bild', extensions: ['jpg', 'jpeg'] }],
  webp: [{ name: 'WebP-Bild', extensions: ['webp'] }],
};

const OPEN_EXT: Record<OpenKind, readonly string[]> = {
  document: EXTENSIONS.document,
  image: EXTENSIONS.image,
  supported: READABLE_EXTENSIONS,
};

const SAVE_EXT: Record<SaveKind, readonly string[]> = {
  document: EXTENSIONS.document,
  png: EXTENSIONS.png,
  jpeg: EXTENSIONS.jpeg,
  webp: EXTENSIONS.webp,
};

const ALL_WRITABLE = [...EXTENSIONS.document, ...EXTENSIONS.image];

function assertSender(e: IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  if (!mainWindow || e.sender !== mainWindow.webContents) throw new Error('Unbekannter Absender.');
}

async function toOpened(p: string): Promise<OpenedFile> {
  const data = await readLimited(p);
  grant(p);
  return { path: p, name: path.basename(p), data };
}

function registerIpc(): void {
  ipcMain.handle('file:open', async (e, kind: OpenKind) => {
    assertSender(e);
    if (!(kind in OPEN_EXT)) throw new Error('Unbekannter Dateityp.');
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Öffnen',
      properties: ['openFile'],
      filters: FILTERS[kind],
    });
    const chosen = res.filePaths[0];
    if (res.canceled || !chosen) return null;
    const p = validatePath(chosen, OPEN_EXT[kind]);
    return toOpened(p);
  });

  ipcMain.handle('file:read', async (e, rawPath: unknown) => {
    assertSender(e);
    const p = validatePath(rawPath, READABLE_EXTENSIONS);
    if (!isGranted(p) && !(await isRecent(p))) throw new Error('Kein Zugriff auf diese Datei.');
    return toOpened(p);
  });

  ipcMain.handle('file:choose-save-path', async (e, kind: SaveKind, suggestedName: unknown) => {
    assertSender(e);
    if (!(kind in SAVE_EXT)) throw new Error('Unbekannter Dateityp.');
    const name =
      typeof suggestedName === 'string' ? suggestedName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200) : '';
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: kind === 'document' ? 'Speichern unter' : 'Exportieren',
      defaultPath: path.join(app.getPath('documents'), name),
      filters: FILTERS[kind],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (res.canceled || !res.filePath) return null;
    let p = path.normalize(res.filePath);
    const exts = SAVE_EXT[kind];
    if (!exts.includes(path.extname(p).toLowerCase())) p += exts[0];
    p = validatePath(p, exts);
    grant(p);
    return p;
  });

  ipcMain.handle('file:write', async (e, rawPath: unknown, data: unknown) => {
    assertSender(e);
    const p = validatePath(rawPath, ALL_WRITABLE);
    if (!isGranted(p))
      throw new Error('Kein Schreibzugriff auf diesen Pfad. Bitte „Speichern unter“ verwenden.');
    if (!(data instanceof Uint8Array)) throw new Error('Ungültige Daten.');
    await atomicWrite(p, data);
  });

  ipcMain.handle('recent:list', async (e) => {
    assertSender(e);
    return loadRecent();
  });

  ipcMain.handle('recent:add', async (e, rawPath: unknown) => {
    assertSender(e);
    const p = validatePath(rawPath, EXTENSIONS.document);
    const list = (await loadRecent()).filter((r) => key(path.normalize(r.path)) !== key(p));
    list.unshift({ path: p, name: path.basename(p), openedAt: new Date().toISOString() });
    const trimmed = list.slice(0, RECENT_MAX);
    await saveRecent(trimmed);
    return trimmed;
  });

  ipcMain.handle('recent:remove', async (e, rawPath: unknown) => {
    assertSender(e);
    const p = validatePath(rawPath, EXTENSIONS.document);
    const list = (await loadRecent()).filter((r) => key(path.normalize(r.path)) !== key(p));
    await saveRecent(list);
    return list;
  });

  ipcMain.handle('dialog:confirm-unsaved', async (e, docName: unknown): Promise<UnsavedChoice> => {
    assertSender(e);
    const name = typeof docName === 'string' ? docName.slice(0, 200) : 'Dokument';
    const res = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Ungespeicherte Änderungen',
      message: `„${name}“ hat ungespeicherte Änderungen.`,
      detail: 'Möchtest du die Änderungen speichern, bevor das Dokument geschlossen wird?',
      buttons: ['Speichern', 'Nicht speichern', 'Abbrechen'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return (['save', 'discard', 'cancel'] as const)[res.response] ?? 'cancel';
  });

  ipcMain.on('app:quit', (e) => {
    assertSender(e);
    allowClose = true;
    mainWindow?.close();
  });

  ipcMain.handle('app:startup-paths', (e) => {
    assertSender(e);
    const paths = pendingOpenPaths.splice(0);
    paths.forEach(grant);
    return paths;
  });
}

// ---------------------------------------------------------------------------
// Window

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#17181b',
    title: 'Canvas Forge',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`--cforge-version=${app.getVersion()}`],
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('close', (e) => {
    if (allowClose || !mainWindow || mainWindow.webContents.isCrashed()) return;
    e.preventDefault();
    mainWindow.webContents.send('app:close-requested');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  pendingOpenPaths.push(...pathsFromArgv(process.argv));

  app.on('second-instance', (_e, argv) => {
    const paths = pathsFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      paths.forEach(grant);
      if (paths.length) mainWindow.webContents.send('app:open-paths', paths);
    }
  });

  void app.whenReady().then(() => {
    if (!isDev) Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    registerIpc();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
