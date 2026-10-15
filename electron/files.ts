import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const EXTENSIONS = {
  document: ['.cforge'],
  png: ['.png'],
  jpeg: ['.jpg', '.jpeg'],
  webp: ['.webp'],
  image: ['.png', '.jpg', '.jpeg', '.webp'],
} as const;

export const READABLE_EXTENSIONS: readonly string[] = [...EXTENSIONS.document, ...EXTENSIONS.image];

/** Largest file we read into memory (documents can be big, images are capped by the decoder anyway). */
export const MAX_READ_BYTES = 1024 * 1024 * 1024;

export function extensionOf(p: string): string {
  return path.extname(p).toLowerCase();
}

export function hasExtension(p: string, allowed: readonly string[]): boolean {
  return allowed.includes(extensionOf(p));
}

/** Normalises and checks a renderer-supplied path. Throws on anything suspicious. */
export function validatePath(p: unknown, allowed: readonly string[]): string {
  if (typeof p !== 'string' || p.length === 0 || p.length > 4096 || p.includes('\0')) {
    throw new Error('Ungültiger Dateipfad.');
  }
  if (!path.isAbsolute(p)) throw new Error('Dateipfad muss absolut sein.');
  const normalized = path.normalize(p);
  if (!hasExtension(normalized, allowed)) {
    throw new Error(`Nicht unterstützte Dateiendung „${extensionOf(normalized) || '(keine)'}“.`);
  }
  return normalized;
}

/**
 * Writes `data` to `target` atomically: the bytes go to a temporary file in the same
 * directory, are flushed to disk and the temp file is then renamed over the target.
 * If anything fails the original file stays untouched and the temp file is removed.
 */
export async function atomicWrite(target: string, data: Uint8Array): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(tmp, 'wx');
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmp, target);
  } catch (err) {
    if (handle) await handle.close().catch(() => undefined);
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function readLimited(p: string): Promise<Uint8Array> {
  const stat = await fs.stat(p);
  if (!stat.isFile()) throw new Error('Pfad ist keine Datei.');
  if (stat.size > MAX_READ_BYTES) throw new Error('Die Datei ist zu groß.');
  const buf = await fs.readFile(p);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
