import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicWrite, EXTENSIONS, validatePath } from '../../electron/files';

const dir = () => mkdtempSync(path.join(tmpdir(), 'cforge-'));

describe('atomicWrite', () => {
  it('writes new files and replaces existing ones without leftovers', async () => {
    const d = dir();
    const f = path.join(d, 'a.cforge');
    await atomicWrite(f, new Uint8Array([1, 2, 3]));
    expect([...readFileSync(f)]).toEqual([1, 2, 3]);
    await atomicWrite(f, new Uint8Array([9]));
    expect([...readFileSync(f)]).toEqual([9]);
    expect(readdirSync(d)).toEqual(['a.cforge']);
  });

  it('leaves the original untouched when the write fails', async () => {
    const d = dir();
    const f = path.join(d, 'keep.png');
    writeFileSync(f, 'original');
    // renaming onto a directory fails → the original file must survive and no temp file may remain
    const target = path.join(d, 'sub.png');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(target);
    await expect(atomicWrite(target, new Uint8Array([1]))).rejects.toThrow();
    expect(readFileSync(f, 'utf8')).toBe('original');
    expect(readdirSync(d).sort()).toEqual(['keep.png', 'sub.png']);
  });
});

describe('validatePath', () => {
  const abs = path.resolve('/tmp/x/file.cforge');
  it('accepts absolute paths with allowed extensions', () => {
    expect(validatePath(abs, EXTENSIONS.document)).toBe(path.normalize(abs));
    expect(validatePath(abs.toUpperCase().replace('.CFORGE', '.cforge'), EXTENSIONS.document)).toBeTruthy();
  });

  it('rejects relative paths, wrong extensions and junk', () => {
    expect(() => validatePath('file.cforge', EXTENSIONS.document)).toThrow(/absolut/);
    expect(() => validatePath(path.resolve('/tmp/x.exe'), EXTENSIONS.document)).toThrow(/Dateiendung/);
    expect(() => validatePath(path.resolve('/tmp/x.png') + '\0', EXTENSIONS.image)).toThrow();
    expect(() => validatePath(42, EXTENSIONS.image)).toThrow();
    expect(() => validatePath('', EXTENSIONS.image)).toThrow();
  });
});
