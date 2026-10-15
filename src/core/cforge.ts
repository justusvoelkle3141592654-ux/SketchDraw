/**
 * Native document format `.cforge`.
 *
 * A ZIP container (stored/deflated with fflate) holding:
 *   manifest.json        – versioned document description (see CforgeManifest)
 *   layers/<id>.png      – one full-size PNG per raster layer (straight alpha)
 *   thumbnail.png        – optional flattened preview
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { isBlendMode, type BlendMode } from './blend';
import { normalizeHex } from './color';

export const CFORGE_FORMAT = 'canvas-forge-document';
export const CFORGE_VERSION = 1;
export const MAX_DOC_DIMENSION = 16384;
export const MAX_LAYERS = 256;
/** Upper bound for the total uncompressed size we are willing to unpack (zip-bomb guard). */
export const MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024;

export interface CforgeLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  file: string;
}

export interface CforgeManifest {
  format: typeof CFORGE_FORMAT;
  version: number;
  app: { name: string; version: string };
  width: number;
  height: number;
  dpi: number;
  background: { color: string; transparent: boolean; visible: boolean };
  layers: CforgeLayer[];
  activeLayerId: string | null;
  brush: { id: string } | null;
  createdAt: string;
  modifiedAt: string;
}

export class CforgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CforgeError';
  }
}

export interface CforgeContents {
  manifest: CforgeManifest;
  /** Layer id → PNG bytes */
  layerPngs: Map<string, Uint8Array>;
  thumbnail: Uint8Array | null;
}

export function layerFileName(id: string): string {
  return `layers/${id}.png`;
}

export function writeCforge(contents: CforgeContents): Uint8Array {
  const manifest = validateManifest(contents.manifest);
  const files: Zippable = {
    // manifest uncompressed-but-deflated; PNGs are already compressed → store them (level 0)
    'manifest.json': [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }],
  };
  for (const layer of manifest.layers) {
    const png = contents.layerPngs.get(layer.id);
    if (!png) throw new CforgeError(`Bilddaten für Ebene „${layer.name}“ fehlen.`);
    files[layer.file] = [png, { level: 0 }];
  }
  if (contents.thumbnail) files['thumbnail.png'] = [contents.thumbnail, { level: 0 }];
  return zipSync(files);
}

export function readCforge(bytes: Uint8Array, maxUnpacked = MAX_UNPACKED_BYTES): CforgeContents {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new CforgeError('Die Datei ist kein gültiges Canvas-Forge-Dokument (kein ZIP-Container).');
  }
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > maxUnpacked) throw new CforgeError('Das Dokument ist zu groß zum Öffnen.');
        return (
          f.name === 'manifest.json' || f.name === 'thumbnail.png' || /^layers\/[\w-]+\.png$/.test(f.name)
        );
      },
    });
  } catch (e) {
    if (e instanceof CforgeError) throw e;
    throw new CforgeError('Die Datei ist beschädigt und konnte nicht entpackt werden.');
  }
  const raw = files['manifest.json'];
  if (!raw) throw new CforgeError('Im Dokument fehlt die Beschreibung (manifest.json).');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(raw));
  } catch {
    throw new CforgeError('Die Dokumentbeschreibung ist kein gültiges JSON.');
  }
  const manifest = validateManifest(migrateManifest(parsed));
  const layerPngs = new Map<string, Uint8Array>();
  for (const layer of manifest.layers) {
    const png = files[layer.file];
    if (!png) throw new CforgeError(`Bilddaten für Ebene „${layer.name}“ fehlen in der Datei.`);
    layerPngs.set(layer.id, png);
  }
  return { manifest, layerPngs, thumbnail: files['thumbnail.png'] ?? null };
}

/** Upgrades older manifest versions to the current one. */
export function migrateManifest(input: unknown): unknown {
  if (!isObject(input)) return input;
  const version = input['version'];
  if (typeof version === 'number' && version > CFORGE_VERSION) {
    throw new CforgeError(
      `Das Dokument wurde mit einer neueren Version erstellt (Format ${version}). Bitte Canvas Forge aktualisieren.`,
    );
  }
  // Version 1 is the first public format; future migrations chain here.
  return input;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(what: string): never {
  throw new CforgeError(`Ungültige Dokumentbeschreibung: ${what}.`);
}

function isDim(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_DOC_DIMENSION;
}

export function validateManifest(input: unknown): CforgeManifest {
  if (!isObject(input)) fail('kein Objekt');
  if (input['format'] !== CFORGE_FORMAT) fail('unbekanntes Format');
  if (input['version'] !== CFORGE_VERSION) fail('nicht unterstützte Version');
  if (!isDim(input['width']) || !isDim(input['height'])) fail('ungültige Bildgröße');
  const dpi = input['dpi'];
  if (typeof dpi !== 'number' || !(dpi >= 1 && dpi <= 10000)) fail('ungültige DPI');
  const app = input['app'];
  if (!isObject(app) || typeof app['name'] !== 'string' || typeof app['version'] !== 'string')
    fail('App-Angabe');
  const bg = input['background'];
  if (!isObject(bg)) fail('Hintergrund');
  const bgColor = typeof bg['color'] === 'string' ? normalizeHex(bg['color']) : null;
  if (!bgColor || typeof bg['transparent'] !== 'boolean' || typeof bg['visible'] !== 'boolean')
    fail('Hintergrund');
  const layersRaw = input['layers'];
  if (!Array.isArray(layersRaw) || layersRaw.length < 1 || layersRaw.length > MAX_LAYERS) fail('Ebenenliste');
  const ids = new Set<string>();
  const layers: CforgeLayer[] = layersRaw.map((l, i) => {
    if (!isObject(l)) fail(`Ebene ${i + 1}`);
    const id = l['id'];
    if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id) || ids.has(id)) fail(`Ebenen-ID ${i + 1}`);
    ids.add(id);
    const opacity = l['opacity'];
    if (typeof l['name'] !== 'string' || l['name'].length > 200) fail(`Ebenenname ${i + 1}`);
    if (typeof l['visible'] !== 'boolean' || typeof l['locked'] !== 'boolean') fail(`Ebenenstatus ${i + 1}`);
    if (typeof opacity !== 'number' || !(opacity >= 0 && opacity <= 1)) fail(`Ebenendeckkraft ${i + 1}`);
    if (!isBlendMode(l['blend'])) fail(`Füllmethode ${i + 1}`);
    if (l['file'] !== layerFileName(id)) fail(`Ebenendatei ${i + 1}`);
    return {
      id,
      name: l['name'],
      visible: l['visible'],
      locked: l['locked'],
      opacity,
      blend: l['blend'],
      file: l['file'],
    };
  });
  const active = input['activeLayerId'];
  if (active !== null && (typeof active !== 'string' || !ids.has(active))) fail('aktive Ebene');
  const brush = input['brush'];
  if (brush !== null && (!isObject(brush) || typeof brush['id'] !== 'string')) fail('Pinselreferenz');
  const createdAt = input['createdAt'];
  const modifiedAt = input['modifiedAt'];
  if (typeof createdAt !== 'string' || typeof modifiedAt !== 'string') fail('Zeitstempel');
  return {
    format: CFORGE_FORMAT,
    version: CFORGE_VERSION,
    app: { name: app['name'], version: app['version'] },
    width: input['width'],
    height: input['height'],
    dpi,
    background: { color: bgColor, transparent: bg['transparent'], visible: bg['visible'] },
    layers,
    activeLayerId: active,
    brush: brush === null ? null : { id: (brush as Record<string, string>)['id']! },
    createdAt,
    modifiedAt,
  };
}
