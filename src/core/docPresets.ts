import { MAX_DOC_DIMENSION } from './cforge';

export interface DocPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  dpi: number;
}

export const DOC_PRESETS: readonly DocPreset[] = [
  { id: 'screen-hd', label: 'Bildschirm HD (1920 × 1080)', width: 1920, height: 1080, dpi: 72 },
  { id: 'screen-qhd', label: 'Bildschirm QHD (2560 × 1440)', width: 2560, height: 1440, dpi: 72 },
  { id: 'screen-4k', label: 'Bildschirm 4K (3840 × 2160)', width: 3840, height: 2160, dpi: 72 },
  { id: 'square-2k', label: 'Quadrat (2048 × 2048)', width: 2048, height: 2048, dpi: 144 },
  { id: 'a4-150', label: 'A4 · 150 DPI (1240 × 1754)', width: 1240, height: 1754, dpi: 150 },
  { id: 'a4-300', label: 'A4 · 300 DPI (2480 × 3508)', width: 2480, height: 3508, dpi: 300 },
  { id: 'a3-300', label: 'A3 · 300 DPI (3508 × 4961)', width: 3508, height: 4961, dpi: 300 },
  { id: 'storyboard', label: 'Storyboard 16:9 (1280 × 720)', width: 1280, height: 720, dpi: 72 },
];

export interface NewDocParams {
  title: string;
  width: number;
  height: number;
  dpi: number;
  background: string;
  transparent: boolean;
}

/** Bytes per full-size RGBA layer surface. */
export function layerBytes(width: number, height: number): number {
  return width * height * 4;
}

/** Above this many pixels per layer the user gets a performance warning. */
export const WARN_PIXELS = 40_000_000;

export interface DocValidation {
  errors: string[];
  warnings: string[];
}

export function validateNewDoc(p: NewDocParams): DocValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dimOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_DOC_DIMENSION;
  if (!dimOk(p.width) || !dimOk(p.height)) {
    errors.push(`Breite und Höhe müssen ganze Zahlen zwischen 1 und ${MAX_DOC_DIMENSION} px sein.`);
  }
  if (!(p.dpi >= 1 && p.dpi <= 10000)) errors.push('DPI muss zwischen 1 und 10000 liegen.');
  if (!p.title.trim()) errors.push('Bitte einen Namen angeben.');
  if (errors.length === 0 && p.width * p.height > WARN_PIXELS) {
    const mb = Math.round(layerBytes(p.width, p.height) / (1024 * 1024));
    warnings.push(
      `Sehr große Leinwand: jede Ebene belegt ca. ${mb} MB Arbeitsspeicher. Zeichnen und Speichern können langsam werden.`,
    );
  }
  return { errors, warnings };
}

/** Swaps width/height so the result has the requested orientation. */
export function orient(
  width: number,
  height: number,
  orientation: 'portrait' | 'landscape',
): { width: number; height: number } {
  const landscape = width >= height;
  if ((orientation === 'landscape') === landscape) return { width, height };
  return { width: height, height: width };
}
