import { type BlendMode } from './blend';

export interface LayerProps {
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  blend: BlendMode;
}

export interface Layer<S> extends LayerProps {
  id: string;
  surface: S;
}

let idCounter = 0;
export function newLayerId(): string {
  idCounter += 1;
  return `L${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultLayerProps(name: string): LayerProps {
  return { name, visible: true, locked: false, opacity: 1, blend: 'normal' };
}

/**
 * Ordered layer list, index 0 = bottom. Generic over the pixel surface so the
 * ordering logic can be unit-tested without a DOM.
 */
export class LayerStack<S> {
  private items: Layer<S>[] = [];

  get layers(): readonly Layer<S>[] {
    return this.items;
  }

  get length(): number {
    return this.items.length;
  }

  get(id: string): Layer<S> | undefined {
    return this.items.find((l) => l.id === id);
  }

  indexOf(id: string): number {
    return this.items.findIndex((l) => l.id === id);
  }

  insert(layer: Layer<S>, index = this.items.length): void {
    if (this.get(layer.id)) throw new Error(`duplicate layer id ${layer.id}`);
    const i = Math.max(0, Math.min(this.items.length, index));
    this.items.splice(i, 0, layer);
  }

  remove(id: string): { layer: Layer<S>; index: number } | null {
    const index = this.indexOf(id);
    if (index < 0) return null;
    const [layer] = this.items.splice(index, 1);
    return { layer: layer!, index };
  }

  /** Moves a layer to `toIndex` (index in the list after removal semantics like Array.splice). */
  move(id: string, toIndex: number): boolean {
    const from = this.indexOf(id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(this.items.length - 1, toIndex));
    if (from === to) return false;
    const [layer] = this.items.splice(from, 1);
    this.items.splice(to, 0, layer!);
    return true;
  }

  /** Suggests a unique default name like "Ebene 3". */
  nextName(prefix = 'Ebene'): string {
    const used = new Set(this.items.map((l) => l.name));
    for (let n = this.items.length + 1; ; n++) {
      const name = `${prefix} ${n}`;
      if (!used.has(name)) return name;
    }
  }
}
