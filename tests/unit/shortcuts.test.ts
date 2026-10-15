import { describe, expect, it } from 'vitest';
import { bindingFor, COMMANDS } from '../../src/editor/commands';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;

describe('keyboard bindings', () => {
  it('resolves common shortcuts', () => {
    expect(bindingFor(key('s', { ctrlKey: true }))).toBe('file.save');
    expect(bindingFor(key('S', { ctrlKey: true, shiftKey: true }))).toBe('file.saveAs');
    expect(bindingFor(key('z', { ctrlKey: true }))).toBe('edit.undo');
    expect(bindingFor(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('edit.redo');
    expect(bindingFor(key('y', { ctrlKey: true }))).toBe('edit.redo');
    expect(bindingFor(key('0', { ctrlKey: true }))).toBe('view.fit');
    expect(bindingFor(key('b'))).toBe('tool.brush');
    expect(bindingFor(key('Tab'))).toBe('view.focus');
    expect(bindingFor(key('Home'))).toBe('view.reset');
    expect(bindingFor(key('ArrowLeft', { shiftKey: true }))).toBe('view.rotateLeft');
  });

  it('handles symbols typed with Shift or AltGr', () => {
    expect(bindingFor(key('+', { shiftKey: true }))).toBe('view.zoomIn');
    expect(bindingFor(key('+', { ctrlKey: true }))).toBe('view.zoomIn');
    expect(bindingFor(key('=', { ctrlKey: true }))).toBe('view.zoomIn');
    // AltGr+8 on a German keyboard reports ctrl+alt
    expect(bindingFor(key('[', { ctrlKey: true, altKey: true }))).toBe('brush.smaller');
    expect(bindingFor(key(']'))).toBe('brush.bigger');
  });

  it('does not match when modifiers differ', () => {
    expect(bindingFor(key('s'))).toBeNull();
    expect(bindingFor(key('b', { ctrlKey: true }))).toBeNull();
  });

  it('has no conflicting bindings', () => {
    const seen = new Map<string, string>();
    for (const c of COMMANDS)
      for (const k of c.keys) {
        if (k.includes('Mausrad')) continue;
        expect(seen.get(k), `${k} used by ${seen.get(k)} and ${c.id}`).toBeUndefined();
        seen.set(k, c.id);
      }
  });
});
