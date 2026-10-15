/** Pixel surfaces are plain canvases at document resolution. */
export type Surface = HTMLCanvasElement;

const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

export function createSurface(width: number, height: number): Surface {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  let ctx = contexts.get(c);
  if (!ctx) {
    const created = c.getContext('2d');
    if (!created) throw new Error('Canvas 2D wird nicht unterstützt oder der Grafikspeicher ist erschöpft.');
    ctx = created;
    contexts.set(c, ctx);
  }
  return ctx;
}

export function cloneSurface(src: Surface): Surface {
  const c = createSurface(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

export function canvasToBytes(
  c: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Bild konnte nicht kodiert werden (zu groß oder nicht genug Speicher).'));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      },
      type,
      quality,
    );
  });
}

export async function bytesToBitmap(bytes: Uint8Array, mime = 'image/png'): Promise<ImageBitmap> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'default', colorSpaceConversion: 'default' });
  } catch {
    throw new Error(
      'Die Bilddaten konnten nicht gelesen werden (beschädigt oder nicht unterstütztes Format).',
    );
  }
}

export function mimeForPath(p: string): string {
  const ext = p.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}
