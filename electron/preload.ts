import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CforgeApi, OpenKind, SaveKind } from './ipc-types';

// Channel names are duplicated here on purpose: a sandboxed preload may only require 'electron'.
const api: CforgeApi = {
  platform: process.platform,
  appVersion:
    process.argv.find((a) => a.startsWith('--cforge-version='))?.slice('--cforge-version='.length) ?? '0.0.0',
  openFile: (kind: OpenKind) => ipcRenderer.invoke('file:open', kind),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  chooseSavePath: (kind: SaveKind, suggestedName: string) =>
    ipcRenderer.invoke('file:choose-save-path', kind, suggestedName),
  writeFile: (path: string, data: Uint8Array) => ipcRenderer.invoke('file:write', path, data),
  recentList: () => ipcRenderer.invoke('recent:list'),
  recentAdd: (path: string) => ipcRenderer.invoke('recent:add', path),
  recentRemove: (path: string) => ipcRenderer.invoke('recent:remove', path),
  confirmUnsaved: (docName: string) => ipcRenderer.invoke('dialog:confirm-unsaved', docName),
  quit: () => ipcRenderer.send('app:quit'),
  onCloseRequested: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('app:close-requested', listener);
    return () => ipcRenderer.removeListener('app:close-requested', listener);
  },
  onOpenPaths: (cb: (paths: string[]) => void) => {
    const listener = (_e: IpcRendererEvent, paths: string[]) => cb(paths);
    ipcRenderer.on('app:open-paths', listener);
    return () => ipcRenderer.removeListener('app:open-paths', listener);
  },
  startupPaths: () => ipcRenderer.invoke('app:startup-paths'),
};

contextBridge.exposeInMainWorld('cforge', api);
