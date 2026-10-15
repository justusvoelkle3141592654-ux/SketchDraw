import type { CforgeApi } from '../electron/ipc-types';

declare global {
  interface Window {
    cforge?: CforgeApi;
  }
}

export function api(): CforgeApi {
  if (!window.cforge)
    throw new Error('Canvas Forge muss als Desktop-App gestartet werden (Electron-Bridge fehlt).');
  return window.cforge;
}

export function hasApi(): boolean {
  return !!window.cforge;
}

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
