/** Types shared between the Electron main/preload process and the renderer. Type-only module. */

export type OpenKind = 'document' | 'image' | 'supported';
export type SaveKind = 'document' | 'png' | 'jpeg' | 'webp';

export interface OpenedFile {
  path: string;
  name: string;
  data: Uint8Array;
}

export interface RecentEntry {
  path: string;
  name: string;
  openedAt: string;
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

export interface CforgeApi {
  readonly platform: string;
  readonly appVersion: string;
  openFile(kind: OpenKind): Promise<OpenedFile | null>;
  /** Reads a path the user previously chose, opened or that is in the recent list. */
  readFile(path: string): Promise<OpenedFile>;
  /** Shows a save dialog; returns the chosen path (which is then writable) or null. */
  chooseSavePath(kind: SaveKind, suggestedName: string): Promise<string | null>;
  /** Atomically writes a file to a path previously granted by a dialog or open. */
  writeFile(path: string, data: Uint8Array): Promise<void>;
  recentList(): Promise<RecentEntry[]>;
  recentAdd(path: string): Promise<RecentEntry[]>;
  recentRemove(path: string): Promise<RecentEntry[]>;
  confirmUnsaved(docName: string): Promise<UnsavedChoice>;
  /** Called by the renderer after it handled a close request and everything is saved/discarded. */
  quit(): void;
  onCloseRequested(cb: () => void): () => void;
  onOpenPaths(cb: (paths: string[]) => void): () => void;
  startupPaths(): Promise<string[]>;
}

export const IPC = {
  openFile: 'file:open',
  readFile: 'file:read',
  chooseSavePath: 'file:choose-save-path',
  writeFile: 'file:write',
  recentList: 'recent:list',
  recentAdd: 'recent:add',
  recentRemove: 'recent:remove',
  confirmUnsaved: 'dialog:confirm-unsaved',
  quit: 'app:quit',
  closeRequested: 'app:close-requested',
  openPaths: 'app:open-paths',
  startupPaths: 'app:startup-paths',
} as const;
