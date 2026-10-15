import { describe, expect, it } from 'vitest';
import { History, type HistoryEntry } from '../../src/core/history';

function counter() {
  const state = { value: 0, disposed: [] as string[] };
  const entry = (label: string, delta: number, bytes = 10): HistoryEntry => {
    state.value += delta; // already applied when pushed
    return {
      label,
      bytes,
      undo: () => (state.value -= delta),
      redo: () => (state.value += delta),
      dispose: () => state.disposed.push(label),
    };
  };
  return { state, entry };
}

describe('History', () => {
  it('undoes and redoes in order', () => {
    const { state, entry } = counter();
    const h = new History();
    h.push(entry('a', 1));
    h.push(entry('b', 10));
    expect(state.value).toBe(11);
    expect(h.undo()?.label).toBe('b');
    expect(state.value).toBe(1);
    expect(h.undo()?.label).toBe('a');
    expect(state.value).toBe(0);
    expect(h.undo()).toBeNull();
    expect(h.redo()?.label).toBe('a');
    expect(h.redo()?.label).toBe('b');
    expect(state.value).toBe(11);
    expect(h.redo()).toBeNull();
  });

  it('a new action clears and disposes the redo branch', () => {
    const { state, entry } = counter();
    const h = new History();
    h.push(entry('a', 1));
    h.push(entry('b', 2));
    h.undo();
    h.push(entry('c', 4));
    expect(h.canRedo).toBe(false);
    expect(state.disposed).toEqual(['b']);
    expect(state.value).toBe(5);
  });

  it('evicts the oldest entries beyond maxEntries', () => {
    const { state, entry } = counter();
    const h = new History({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) h.push(entry(`e${i}`, 1));
    expect(h.size).toBe(3);
    expect(state.disposed).toEqual(['e0', 'e1']);
  });

  it('evicts by memory budget but always keeps the newest entry', () => {
    const { entry } = counter();
    const h = new History({ maxBytes: 100 });
    h.push(entry('small', 1, 40));
    h.push(entry('small2', 1, 40));
    h.push(entry('huge', 1, 500));
    expect(h.size).toBe(1);
    expect(h.undoLabel).toBe('huge');
  });

  it('tracks the saved state', () => {
    const { entry } = counter();
    const h = new History();
    expect(h.isDirty).toBe(false);
    h.push(entry('a', 1));
    expect(h.isDirty).toBe(true);
    h.markSaved();
    expect(h.isDirty).toBe(false);
    h.push(entry('b', 1));
    expect(h.isDirty).toBe(true);
    h.undo();
    expect(h.isDirty).toBe(false);
    h.undo();
    expect(h.isDirty).toBe(true);
    h.redo();
    expect(h.isDirty).toBe(false);
  });

  it('is dirty forever once the saved state was discarded from the redo branch', () => {
    const { entry } = counter();
    const h = new History();
    h.push(entry('a', 1));
    h.markSaved();
    h.undo();
    h.push(entry('b', 1));
    h.undo();
    expect(h.isDirty).toBe(true);
  });

  it('keeps the saved state reachable when the saved entry itself is evicted', () => {
    const { entry } = counter();
    const h = new History({ maxEntries: 2 });
    h.push(entry('a', 1));
    h.markSaved();
    h.push(entry('b', 1));
    h.push(entry('c', 1)); // evicts a: the state after a is now the bottom of the stack
    h.undo();
    h.undo();
    expect(h.isDirty).toBe(false);
  });

  it('notifies subscribers', () => {
    const { entry } = counter();
    const h = new History();
    let calls = 0;
    const off = h.subscribe(() => calls++);
    h.push(entry('a', 1));
    h.undo();
    h.redo();
    off();
    h.undo();
    expect(calls).toBe(3);
  });
});
