/** Undo/redo stack with an entry-count and memory budget. */

export interface HistoryEntry {
  label: string;
  /** Approximate memory held by this entry in bytes. */
  bytes: number;
  undo(): void;
  redo(): void;
  /** Called when the entry is dropped for good (evicted or cleared from the redo branch). */
  dispose?(): void;
}

interface Stored {
  id: number;
  entry: HistoryEntry;
}

export interface HistoryOptions {
  maxEntries?: number;
  maxBytes?: number;
}

export class History {
  private done: Stored[] = [];
  private undone: Stored[] = [];
  private nextId = 1;
  /** Id of the top entry at the time of the last save; 0 = empty stack. */
  private savedTop = 0;
  private savedReachable = true;
  private listeners = new Set<() => void>();
  readonly maxEntries: number;
  readonly maxBytes: number;

  constructor(opts: HistoryOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 200;
    this.maxBytes = opts.maxBytes ?? 768 * 1024 * 1024;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  get undoLabel(): string | null {
    return this.done.at(-1)?.entry.label ?? null;
  }

  get redoLabel(): string | null {
    return this.undone.at(-1)?.entry.label ?? null;
  }

  get size(): number {
    return this.done.length;
  }

  get bytes(): number {
    let n = 0;
    for (const s of this.done) n += s.entry.bytes;
    for (const s of this.undone) n += s.entry.bytes;
    return n;
  }

  /** Records an action that has already been applied. */
  push(entry: HistoryEntry): void {
    for (const s of this.undone) {
      s.entry.dispose?.();
      if (s.id === this.savedTop) this.savedReachable = false;
    }
    this.undone = [];
    this.done.push({ id: this.nextId++, entry });
    this.evict();
    this.emit();
  }

  undo(): HistoryEntry | null {
    const s = this.done.pop();
    if (!s) return null;
    s.entry.undo();
    this.undone.push(s);
    this.emit();
    return s.entry;
  }

  redo(): HistoryEntry | null {
    const s = this.undone.pop();
    if (!s) return null;
    s.entry.redo();
    this.done.push(s);
    this.emit();
    return s.entry;
  }

  clear(): void {
    for (const s of [...this.done, ...this.undone]) s.entry.dispose?.();
    this.done = [];
    this.undone = [];
    this.savedTop = 0;
    this.savedReachable = true;
    this.emit();
  }

  markSaved(): void {
    this.savedTop = this.done.at(-1)?.id ?? 0;
    this.savedReachable = true;
    this.emit();
  }

  /** True if the current state differs from the last saved state. */
  get isDirty(): boolean {
    if (!this.savedReachable) return true;
    return (this.done.at(-1)?.id ?? 0) !== this.savedTop;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private evict(): void {
    let total = this.bytes;
    while (this.done.length > 1 && (this.done.length > this.maxEntries || total > this.maxBytes)) {
      const s = this.done.shift()!;
      total -= s.entry.bytes;
      // The state *before* the evicted entry can no longer be reached; the state after it
      // becomes the new bottom of the stack (top id 0).
      if (this.savedTop === 0) this.savedReachable = false;
      else if (s.id === this.savedTop) this.savedTop = 0;
      s.entry.dispose?.();
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
