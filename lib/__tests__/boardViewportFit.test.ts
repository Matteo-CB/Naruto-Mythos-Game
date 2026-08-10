import { describe, expect, it } from 'vitest';
import { computeLayout } from '@/components/game/ScaledGameRoot';
import { isCompactBoardViewport } from '@/lib/ui/viewport';

const BASE_WIDTH = 1180;

function fits(width: number, height: number) {
  const layout = computeLayout(width, height);
  return {
    ...layout,
    scaledW: BASE_WIDTH * layout.scale,
    scaledH: layout.baseHeight * layout.scale,
  };
}

describe('the board always fits the screen it is drawn on', () => {
  const SCREENS: Array<[string, number, number]> = [
    ['phone landscape, small', 667, 375],
    ['phone landscape, tall bar', 844, 390],
    ['phone landscape, wide', 926, 428],
    ['the reported screenshot', 1024, 478],
    ['just under the old mobile cutoff', 900, 499],
    ['just over the old mobile cutoff', 900, 512],
    ['tablet landscape', 1180, 820],
    ['small laptop window', 1280, 600],
    ['desktop', 1920, 1080],
    ['portrait phone', 390, 844],
  ];

  for (const [name, width, height] of SCREENS) {
    it(`${name} (${width}x${height}) never overflows`, () => {
      const layout = fits(width, height);
      expect(layout.scaledW, 'width fits').toBeLessThanOrEqual(width + 0.5);
      expect(layout.scaledH, 'height fits').toBeLessThanOrEqual(height + 0.5);
      expect(layout.scale, 'the board is actually drawn').toBeGreaterThan(0);
    });
  }

  it('a taller viewport never shrinks the board', () => {
    const short = fits(1024, 400).scale;
    const tall = fits(1024, 700).scale;
    expect(tall).toBeGreaterThanOrEqual(short);
  });

  it('the reported case is not a degenerate scale', () => {
    const layout = fits(1024, 478);
    expect(layout.scale, 'the board is readable, not microscopic').toBeGreaterThan(0.5);
    expect(layout.baseHeight).toBeGreaterThanOrEqual(520);
    expect(layout.baseHeight).toBeLessThanOrEqual(670);
  });

  it('a zero or negative viewport never produces NaN', () => {
    for (const [w, h] of [[0, 0], [-5, 400], [800, 0]]) {
      const layout = computeLayout(w, h);
      expect(Number.isFinite(layout.scale), `${w}x${h}`).toBe(true);
      expect(layout.scale).toBeGreaterThan(0);
      expect(Number.isFinite(layout.baseHeight)).toBe(true);
    }
  });

  it('the measured viewport is carried out so the frame can match it', () => {
    const layout = computeLayout(1024, 478);
    expect(layout.viewWidth).toBe(1024);
    expect(layout.viewHeight).toBe(478);
  });
});

describe('a phone always gets the compact board, never the desktop one', () => {
  const PHONES: Array<[string, number, number]> = [
    ['phone landscape', 844, 390],
    ['big phone landscape', 926, 428],
    ['the reported screenshot', 1024, 478],
    ['small tablet landscape', 1000, 640],
    ['phone portrait', 390, 844],
  ];

  for (const [name, width, height] of PHONES) {
    it(`${name} is compact on a touch screen`, () => {
      expect(isCompactBoardViewport(width, height, true), name).toBe(true);
    });
  }

  it('a short window is compact even with a mouse, the desktop board would not fit', () => {
    expect(isCompactBoardViewport(1280, 460, false)).toBe(true);
  });

  it('a real desktop keeps the desktop board', () => {
    expect(isCompactBoardViewport(1920, 1080, false)).toBe(false);
    expect(isCompactBoardViewport(1600, 900, false)).toBe(false);
  });

  it('a large touch screen with room keeps the desktop board', () => {
    expect(isCompactBoardViewport(1920, 1200, true)).toBe(false);
    expect(isCompactBoardViewport(1180, 820, true), 'a big tablet fits the full board').toBe(false);
  });

  it('an unmeasured viewport does not claim to be compact by height', () => {
    expect(isCompactBoardViewport(0, 0, false)).toBe(false);
  });
});
