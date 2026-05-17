export interface HoloPalette {
  primary: string;
  secondary: string;
  glow: string;
  shimmer: string;
}

export function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  return ((Math.floor(hue) % 360) + 360) % 360;
}

export function holoFromHue(hue: number): HoloPalette {
  const h = normalizeHue(hue);
  const h2 = (h + 35) % 360;
  return {
    primary: `hsl(${h} 78% 56%)`,
    secondary: `hsl(${h2} 70% 62%)`,
    glow: `hsla(${h} 90% 60% / 0.42)`,
    shimmer: `hsla(${h2} 95% 72% / 0.55)`,
  };
}

export function holoBackgroundLayers(hue: number | null | undefined, intensity: 'subtle' | 'card' | 'banner' = 'card'): {
  baseBg: string;
  glowShadow: string;
  shimmerColor: string;
  primary: string;
  secondary: string;
} | null {
  if (hue == null) return null;
  const p = holoFromHue(hue);
  const alphaBase = intensity === 'subtle' ? 0.10 : intensity === 'card' ? 0.18 : 0.26;
  const alphaGlow = intensity === 'subtle' ? 0.22 : intensity === 'card' ? 0.34 : 0.46;
  const h = normalizeHue(hue);
  return {
    baseBg: `hsla(${h} 78% 56% / ${alphaBase})`,
    glowShadow: `0 0 24px hsla(${h} 90% 60% / ${alphaGlow}), 0 12px 32px rgba(0,0,0,0.4)`,
    shimmerColor: p.shimmer,
    primary: p.primary,
    secondary: p.secondary,
  };
}

export function randomHoloHue(): number {
  return Math.floor(Math.random() * 360);
}
