import { describe, it, expect } from 'vitest';
import { holoFromHue, normalizeHue, holoBackgroundLayers, randomHoloHue } from '../utils/holoColor';

describe('normalizeHue', () => {
  it('keeps 0..359 untouched', () => {
    expect(normalizeHue(0)).toBe(0);
    expect(normalizeHue(180)).toBe(180);
    expect(normalizeHue(359)).toBe(359);
  });

  it('wraps 360 to 0', () => {
    expect(normalizeHue(360)).toBe(0);
  });

  it('wraps 450 to 90', () => {
    expect(normalizeHue(450)).toBe(90);
  });

  it('wraps -30 to 330', () => {
    expect(normalizeHue(-30)).toBe(330);
  });

  it('wraps -360 to 0', () => {
    expect(normalizeHue(-360)).toBe(0);
  });

  it('returns 0 for NaN / Infinity', () => {
    expect(normalizeHue(NaN)).toBe(0);
    expect(normalizeHue(Infinity)).toBe(0);
    expect(normalizeHue(-Infinity)).toBe(0);
  });

  it('floors decimal hues', () => {
    expect(normalizeHue(45.7)).toBe(45);
    expect(normalizeHue(359.9)).toBe(359);
  });
});

describe('holoFromHue', () => {
  it('returns a palette with 4 string fields', () => {
    const p = holoFromHue(0);
    expect(typeof p.primary).toBe('string');
    expect(typeof p.secondary).toBe('string');
    expect(typeof p.glow).toBe('string');
    expect(typeof p.shimmer).toBe('string');
  });

  it('hue 0 (red) yields hsl 0 primary', () => {
    expect(holoFromHue(0).primary).toBe('hsl(0 78% 56%)');
    expect(holoFromHue(0).secondary).toBe('hsl(35 70% 62%)');
  });

  it('hue 120 (green) yields hsl 120 primary', () => {
    const p = holoFromHue(120);
    expect(p.primary).toBe('hsl(120 78% 56%)');
    expect(p.secondary).toBe('hsl(155 70% 62%)');
  });

  it('hue 240 (blue) yields hsl 240 primary', () => {
    const p = holoFromHue(240);
    expect(p.primary).toBe('hsl(240 78% 56%)');
    expect(p.secondary).toBe('hsl(275 70% 62%)');
  });

  it('hue 359 yields hsl 359 primary and wrapped secondary (34)', () => {
    const p = holoFromHue(359);
    expect(p.primary).toBe('hsl(359 78% 56%)');
    expect(p.secondary).toBe('hsl(34 70% 62%)');
  });

  it('hue 340 yields secondary wrapped to 15', () => {
    expect(holoFromHue(340).secondary).toBe('hsl(15 70% 62%)');
  });

  it('normalizes negative hues', () => {
    expect(holoFromHue(-30).primary).toBe('hsl(330 78% 56%)');
  });

  it('normalizes hues over 360', () => {
    expect(holoFromHue(450).primary).toBe('hsl(90 78% 56%)');
  });

  it('all returned values are valid CSS color strings', () => {
    const cases = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 359];
    for (const h of cases) {
      const p = holoFromHue(h);
      expect(p.primary).toMatch(/^hsl\(\d+(\.\d+)? \d+% \d+%\)$/);
      expect(p.secondary).toMatch(/^hsl\(\d+(\.\d+)? \d+% \d+%\)$/);
      expect(p.glow).toMatch(/^hsla\(\d+(\.\d+)? \d+% \d+% \/ 0\.\d+\)$/);
      expect(p.shimmer).toMatch(/^hsla\(\d+(\.\d+)? \d+% \d+% \/ 0\.\d+\)$/);
    }
  });
});

describe('holoBackgroundLayers', () => {
  it('returns null when hue is null', () => {
    expect(holoBackgroundLayers(null)).toBeNull();
  });

  it('returns null when hue is undefined', () => {
    expect(holoBackgroundLayers(undefined)).toBeNull();
  });

  it('returns a layered object for valid hue', () => {
    const layers = holoBackgroundLayers(180, 'card');
    expect(layers).not.toBeNull();
    expect(layers!.baseBg).toContain('hsla(180');
    expect(layers!.glowShadow).toContain('hsla(180');
    expect(layers!.glowShadow).toContain('rgba(0,0,0,0.4)');
  });

  it('intensity subtle yields lower alpha than banner', () => {
    const subtle = holoBackgroundLayers(180, 'subtle')!;
    const card = holoBackgroundLayers(180, 'card')!;
    const banner = holoBackgroundLayers(180, 'banner')!;
    const extractAlpha = (s: string) => {
      const m = s.match(/\/ (0\.\d+)\)/);
      return m ? parseFloat(m[1]) : NaN;
    };
    expect(extractAlpha(subtle.baseBg)).toBeLessThan(extractAlpha(card.baseBg));
    expect(extractAlpha(card.baseBg)).toBeLessThan(extractAlpha(banner.baseBg));
  });

  it('default intensity is card', () => {
    const a = holoBackgroundLayers(180);
    const b = holoBackgroundLayers(180, 'card');
    expect(a).toEqual(b);
  });

  it('exposes primary and secondary CSS strings', () => {
    const layers = holoBackgroundLayers(180);
    expect(layers!.primary).toBe('hsl(180 78% 56%)');
    expect(layers!.secondary).toBe('hsl(215 70% 62%)');
  });
});

describe('randomHoloHue', () => {
  it('returns an integer between 0 and 359 inclusive', () => {
    for (let i = 0; i < 200; i++) {
      const h = randomHoloHue();
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(359);
    }
  });
});
