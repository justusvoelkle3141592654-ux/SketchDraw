import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  CFORGE_FORMAT,
  CFORGE_VERSION,
  CforgeError,
  layerFileName,
  readCforge,
  writeCforge,
  type CforgeManifest,
} from '../../src/core/cforge';

function manifest(patch: Partial<CforgeManifest> = {}): CforgeManifest {
  return {
    format: CFORGE_FORMAT,
    version: CFORGE_VERSION,
    app: { name: 'Canvas Forge', version: '0.1.0' },
    width: 640,
    height: 480,
    dpi: 144,
    background: { color: '#ffffff', transparent: false, visible: true },
    layers: [
      {
        id: 'L1',
        name: 'Skizze',
        visible: true,
        locked: false,
        opacity: 0.5,
        blend: 'multiply',
        file: layerFileName('L1'),
      },
      {
        id: 'L2',
        name: 'Tusche',
        visible: false,
        locked: true,
        opacity: 1,
        blend: 'normal',
        file: layerFileName('L2'),
      },
    ],
    activeLayerId: 'L2',
    brush: { id: 'ink' },
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  };
}

const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n, n, n]);

function pack(m: unknown, files: Record<string, Uint8Array> = {}) {
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(m)), ...files });
}

describe('.cforge round trip', () => {
  it('writes and reads back manifest, layers and thumbnail', () => {
    const bytes = writeCforge({
      manifest: manifest(),
      layerPngs: new Map([
        ['L1', png(1)],
        ['L2', png(2)],
      ]),
      thumbnail: png(9),
    });
    const back = readCforge(bytes);
    expect(back.manifest).toEqual(manifest());
    expect(back.layerPngs.get('L1')).toEqual(png(1));
    expect(back.layerPngs.get('L2')).toEqual(png(2));
    expect(back.thumbnail).toEqual(png(9));
  });

  it('normalises the background colour', () => {
    const bytes = writeCforge({
      manifest: manifest({ background: { color: '#ABC', transparent: true, visible: true } }),
      layerPngs: new Map([
        ['L1', png(1)],
        ['L2', png(2)],
      ]),
      thumbnail: null,
    });
    expect(readCforge(bytes).manifest.background.color).toBe('#aabbcc');
  });

  it('refuses to write without layer data', () => {
    expect(() => writeCforge({ manifest: manifest(), layerPngs: new Map(), thumbnail: null })).toThrow(
      CforgeError,
    );
  });
});

describe('.cforge validation', () => {
  const files = { 'layers/L1.png': png(1), 'layers/L2.png': png(2) };
  const bad =
    (m: unknown, f: Record<string, Uint8Array> = files) =>
    () =>
      readCforge(pack(m, f));

  it('rejects non-zip data', () => {
    expect(() => readCforge(new Uint8Array(100))).toThrow(/kein gültiges/);
  });

  it('rejects a container without manifest', () => {
    expect(() => readCforge(zipSync({ 'x.txt': strToU8('hi') }))).toThrow(/manifest/);
  });

  it('rejects broken JSON', () => {
    expect(() => readCforge(zipSync({ 'manifest.json': strToU8('{nope') }))).toThrow(/JSON/);
  });

  it('gives a clear message for newer format versions', () => {
    expect(bad(manifest({ version: 99 }))).toThrow(/neueren Version/);
  });

  it('rejects invalid fields', () => {
    expect(bad({ ...manifest(), format: 'other' })).toThrow(CforgeError);
    expect(bad(manifest({ width: 0 }))).toThrow(/Bildgröße/);
    expect(bad(manifest({ width: 1.5 }))).toThrow(/Bildgröße/);
    expect(bad(manifest({ height: 100000 }))).toThrow(/Bildgröße/);
    expect(bad(manifest({ activeLayerId: 'nope' }))).toThrow(/aktive Ebene/);
    const layers = manifest().layers;
    expect(bad(manifest({ layers: [] }))).toThrow(/Ebenenliste/);
    expect(bad(manifest({ layers: [layers[0]!, { ...layers[0]! }] }))).toThrow(/Ebenen-ID/);
    expect(bad(manifest({ layers: [{ ...layers[0]!, blend: 'dissolve' as never }, layers[1]!] }))).toThrow(
      /Füllmethode/,
    );
    expect(bad(manifest({ layers: [{ ...layers[0]!, opacity: 2 }, layers[1]!] }))).toThrow(/deckkraft/i);
    expect(bad(manifest({ layers: [{ ...layers[0]!, file: '../evil.png' }, layers[1]!] }))).toThrow(
      /Ebenendatei/,
    );
    expect(bad(manifest({ layers: [{ ...layers[0]!, id: '../x' }, layers[1]!] }))).toThrow(/Ebenen-ID/);
  });

  it('rejects missing layer images', () => {
    expect(bad(manifest(), { 'layers/L1.png': png(1) })).toThrow(/fehlen/);
  });

  it('guards against oversized archives', () => {
    const bytes = pack(manifest(), files);
    expect(() => readCforge(bytes, 10)).toThrow(/zu groß/);
  });
});
