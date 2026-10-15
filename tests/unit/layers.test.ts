import { describe, expect, it } from 'vitest';
import { defaultLayerProps, LayerStack, newLayerId, type Layer } from '../../src/core/layers';

const mk = (id: string): Layer<null> => ({ id, ...defaultLayerProps(id), surface: null });
const ids = (s: LayerStack<null>) => s.layers.map((l) => l.id);

describe('LayerStack', () => {
  it('inserts at an index (0 = bottom) and removes', () => {
    const s = new LayerStack<null>();
    s.insert(mk('a'));
    s.insert(mk('b'));
    s.insert(mk('c'), 1);
    expect(ids(s)).toEqual(['a', 'c', 'b']);
    expect(s.remove('c')).toMatchObject({ index: 1 });
    expect(s.remove('zz')).toBeNull();
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('rejects duplicate ids', () => {
    const s = new LayerStack<null>();
    s.insert(mk('a'));
    expect(() => s.insert(mk('a'))).toThrow();
  });

  it('moves layers with splice semantics and clamps the target', () => {
    const s = new LayerStack<null>();
    ['a', 'b', 'c', 'd'].forEach((id) => s.insert(mk(id)));
    expect(s.move('a', 2)).toBe(true);
    expect(ids(s)).toEqual(['b', 'c', 'a', 'd']);
    expect(s.move('d', -5)).toBe(true);
    expect(ids(s)).toEqual(['d', 'b', 'c', 'a']);
    expect(s.move('a', 99)).toBe(false); // already on top
  });

  it('suggests unused default names', () => {
    const s = new LayerStack<null>();
    s.insert({ ...mk('x'), name: 'Ebene 2' });
    expect(s.nextName()).toBe('Ebene 3');
    s.insert({ ...mk('y'), name: 'Ebene 3' });
    expect(s.nextName()).toBe('Ebene 4');
  });

  it('generates unique ids that are valid in the file format', () => {
    const set = new Set(Array.from({ length: 500 }, newLayerId));
    expect(set.size).toBe(500);
    for (const id of set) expect(id).toMatch(/^[\w-]{1,64}$/);
  });
});
