export type BoardSide = 'me' | 'opponent';

export interface StoredSidePalette {
  primary?: string;
  bright?: string;
}

export interface StoredBoardPalette {
  me?: StoredSidePalette;
  opponent?: StoredSidePalette;
}

export interface ResolvedSidePalette {
  primary: string;
  bright: string;
  rgb: string;
  onPrimary: string;
  tint: (alpha: number) => string;
}

export interface ResolvedBoardPalette {
  me: ResolvedSidePalette;
  opponent: ResolvedSidePalette;
}

export const DEFAULT_BOARD_PALETTE: Required<{ me: Required<StoredSidePalette>; opponent: Required<StoredSidePalette> }> = {
  me: { primary: '#c4a35a', bright: '#f0d890' },
  opponent: { primary: '#b33e3e', bright: '#ff9b9b' },
};

export const BOARD_PLATE_BACKGROUND = '#0a0a0a';

export const MIN_READABLE_CONTRAST = 3;

export const BOARD_PALETTE_MAX_JSON_LENGTH = 240;

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;

const SIDES: BoardSide[] = ['me', 'opponent'];

const SIDE_KEYS: Array<keyof StoredSidePalette> = ['primary', 'bright'];

export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  if (!HEX_PATTERN.test(raw)) return null;
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return raw;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = normalizeHexColor(hex) ?? DEFAULT_BOARD_PALETTE.me.primary;
  return {
    r: parseInt(safe.slice(1, 3), 16),
    g: parseInt(safe.slice(3, 5), 16),
    b: parseInt(safe.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgbTriple(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r},${g},${b}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  const nextL = Math.max(0, Math.min(1, l + (1 - l) * Math.max(0, Math.min(1, amount))));
  if (s === 0) {
    const v = nextL * 255;
    return rgbToHex(v, v, v);
  }
  const q = nextL < 0.5 ? nextL * (1 + s) : nextL + s - nextL * s;
  const p = 2 * nextL - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return rgbToHex(channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isLowContrastOnBoard(hex: string): boolean {
  return contrastRatio(hex, BOARD_PLATE_BACKGROUND) < MIN_READABLE_CONTRAST;
}

export function readableForegroundOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#0a0a0a' : '#f5f5f5';
}

function resolveSide(side: BoardSide, stored: StoredBoardPalette | null | undefined): ResolvedSidePalette {
  const fallback = DEFAULT_BOARD_PALETTE[side];
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>)[side] : null;
  const rawSide = raw && typeof raw === 'object' ? (raw as StoredSidePalette) : null;
  const primary = normalizeHexColor(rawSide?.primary) ?? fallback.primary;
  const explicitBright = normalizeHexColor(rawSide?.bright);
  const bright = explicitBright ?? (primary === fallback.primary ? fallback.bright : lighten(primary, 0.28));
  return {
    primary,
    bright,
    rgb: hexToRgbTriple(primary),
    onPrimary: readableForegroundOn(primary),
    tint: (alpha: number) => withAlpha(primary, alpha),
  };
}

export function resolveBoardPalette(stored: unknown): ResolvedBoardPalette {
  const safe = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as StoredBoardPalette) : null;
  return {
    me: resolveSide('me', safe),
    opponent: resolveSide('opponent', safe),
  };
}

export const DEFAULT_RESOLVED_BOARD_PALETTE: ResolvedBoardPalette = resolveBoardPalette(null);

export type BoardPaletteValidation =
  | { ok: true; value: StoredBoardPalette | null }
  | { ok: false; reason: 'shape' | 'color' | 'size' };

export function validateStoredBoardPalette(input: unknown): BoardPaletteValidation {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'shape' };

  try {
    if (JSON.stringify(input).length > BOARD_PALETTE_MAX_JSON_LENGTH) return { ok: false, reason: 'size' };
  } catch {
    return { ok: false, reason: 'shape' };
  }

  const source = input as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!SIDES.includes(key as BoardSide)) return { ok: false, reason: 'shape' };
  }

  const output: StoredBoardPalette = {};
  for (const side of SIDES) {
    const rawSide = source[side];
    if (rawSide === undefined) continue;
    if (rawSide === null) continue;
    if (typeof rawSide !== 'object' || Array.isArray(rawSide)) return { ok: false, reason: 'shape' };
    const sideSource = rawSide as Record<string, unknown>;
    for (const key of Object.keys(sideSource)) {
      if (!SIDE_KEYS.includes(key as keyof StoredSidePalette)) return { ok: false, reason: 'shape' };
    }
    const resolvedSide: StoredSidePalette = {};
    for (const key of SIDE_KEYS) {
      const raw = sideSource[key];
      if (raw === undefined || raw === null) continue;
      const normalized = normalizeHexColor(raw);
      if (!normalized) return { ok: false, reason: 'color' };
      resolvedSide[key] = normalized;
    }
    if (Object.keys(resolvedSide).length > 0) output[side] = resolvedSide;
  }

  if (Object.keys(output).length === 0) return { ok: true, value: null };
  return { ok: true, value: output };
}

export function isDefaultBoardPalette(stored: StoredBoardPalette | null | undefined): boolean {
  if (!stored) return true;
  const resolved = resolveBoardPalette(stored);
  return (
    resolved.me.primary === DEFAULT_BOARD_PALETTE.me.primary &&
    resolved.me.bright === DEFAULT_BOARD_PALETTE.me.bright &&
    resolved.opponent.primary === DEFAULT_BOARD_PALETTE.opponent.primary &&
    resolved.opponent.bright === DEFAULT_BOARD_PALETTE.opponent.bright
  );
}
