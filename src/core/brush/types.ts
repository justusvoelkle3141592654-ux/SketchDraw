export type BrushKind = 'paint' | 'erase';

export interface BrushSettings {
  id: string;
  name: string;
  category: string;
  kind: BrushKind;
  /** Diameter in document pixels at full pressure. */
  size: number;
  /** Diameter at zero pressure as a fraction of `size` (only if `pressureSize`). */
  minSize: number;
  /** Maximum opacity a single stroke can reach (0..1). */
  opacity: number;
  /** Alpha of each individual dab (0..1). */
  flow: number;
  /** Distance between dabs as a fraction of the current diameter. */
  spacing: number;
  /** 0 = very soft edge, 1 = hard edge. */
  hardness: number;
  /** 0 = raw input, 1 = strongest smoothing. */
  stabilization: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  /** -1 (soft) .. +1 (hard), see applyPressureCurve. */
  pressureCurve: number;
  /** Paper grain strength 0..1 (0 = none). */
  grain: number;
}

export const BRUSH_LIMITS = {
  size: { min: 1, max: 1000 },
  spacing: { min: 0.02, max: 1 },
} as const;

export const DEFAULT_BRUSHES: readonly BrushSettings[] = [
  {
    id: 'pencil',
    name: 'Bleistift',
    category: 'Skizze',
    kind: 'paint',
    size: 4,
    minSize: 0.45,
    opacity: 0.9,
    flow: 0.55,
    spacing: 0.12,
    hardness: 0.75,
    stabilization: 0.15,
    pressureSize: true,
    pressureOpacity: true,
    pressureCurve: 0,
    grain: 0.55,
  },
  {
    id: 'ink',
    name: 'Tuschestift',
    category: 'Linie',
    kind: 'paint',
    size: 6,
    minSize: 0.15,
    opacity: 1,
    flow: 1,
    spacing: 0.08,
    hardness: 0.95,
    stabilization: 0.35,
    pressureSize: true,
    pressureOpacity: false,
    pressureCurve: 0.2,
    grain: 0,
  },
  {
    id: 'airbrush-soft',
    name: 'Airbrush weich',
    category: 'Malen',
    kind: 'paint',
    size: 80,
    minSize: 1,
    opacity: 0.8,
    flow: 0.08,
    spacing: 0.08,
    hardness: 0,
    stabilization: 0.1,
    pressureSize: false,
    pressureOpacity: true,
    pressureCurve: 0,
    grain: 0,
  },
  {
    id: 'airbrush-hard',
    name: 'Airbrush hart',
    category: 'Malen',
    kind: 'paint',
    size: 30,
    minSize: 1,
    opacity: 1,
    flow: 0.25,
    spacing: 0.08,
    hardness: 0.8,
    stabilization: 0.1,
    pressureSize: false,
    pressureOpacity: true,
    pressureCurve: 0,
    grain: 0,
  },
  {
    id: 'marker',
    name: 'Marker',
    category: 'Malen',
    kind: 'paint',
    size: 22,
    minSize: 0.8,
    opacity: 0.6,
    flow: 0.9,
    spacing: 0.06,
    hardness: 0.7,
    stabilization: 0.2,
    pressureSize: true,
    pressureOpacity: false,
    pressureCurve: 0,
    grain: 0,
  },
  {
    id: 'chalk',
    name: 'Kreide',
    category: 'Textur',
    kind: 'paint',
    size: 28,
    minSize: 0.6,
    opacity: 0.95,
    flow: 0.7,
    spacing: 0.1,
    hardness: 0.6,
    stabilization: 0.1,
    pressureSize: true,
    pressureOpacity: true,
    pressureCurve: -0.2,
    grain: 0.8,
  },
  {
    id: 'eraser-hard',
    name: 'Radierer hart',
    category: 'Radierer',
    kind: 'erase',
    size: 24,
    minSize: 0.6,
    opacity: 1,
    flow: 1,
    spacing: 0.08,
    hardness: 0.9,
    stabilization: 0,
    pressureSize: true,
    pressureOpacity: false,
    pressureCurve: 0,
    grain: 0,
  },
  {
    id: 'eraser-soft',
    name: 'Radierer weich',
    category: 'Radierer',
    kind: 'erase',
    size: 70,
    minSize: 1,
    opacity: 1,
    flow: 0.15,
    spacing: 0.08,
    hardness: 0,
    stabilization: 0,
    pressureSize: false,
    pressureOpacity: true,
    pressureCurve: 0,
    grain: 0,
  },
];
