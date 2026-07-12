import { describe, it, expect } from 'vitest';
import {
  anchorHandCard, anchorOpponentHand, anchorSlot, anchorMission,
  anchorDeck, anchorDiscard, anchorScore, anchorChakra, anchorEdge,
} from '@/lib/motion/boardRegistry';
import { computeMotionMs, BASE_DURATIONS_MS, FAST_MULTIPLIER } from '@/lib/motion/speed';
import { arcPoint } from '@/lib/motion/flightLayer';
import { frameSource, vfxForLanding } from '@/lib/motion/flipbook';
import { VFX_MANIFEST } from '@/lib/motion/vfxManifest';

describe('anchor id builders', () => {
  it('produce stable unique ids', () => {
    expect(anchorHandCard(3)).toBe('hand:me:3');
    expect(anchorOpponentHand()).toBe('hand:opp');
    expect(anchorSlot(2, 'me', 'inst_9')).toBe('slot:2:me:inst_9');
    expect(anchorSlot(2, 'opp', 'inst_9')).toBe('slot:2:opp:inst_9');
    expect(anchorMission(1)).toBe('mission:1');
    expect(anchorDeck('me')).toBe('deck:me');
    expect(anchorDiscard('opp')).toBe('discard:opp');
    expect(anchorScore('me')).toBe('score:me');
    expect(anchorChakra('opp')).toBe('chakra:opp');
    expect(anchorEdge()).toBe('edge');
  });
});

describe('computeMotionMs', () => {
  it('returns 0 when animations are disabled', () => {
    expect(computeMotionMs('play', { animationsEnabled: false, fastAnimations: false })).toBe(0);
    expect(computeMotionMs('draw', { animationsEnabled: false, fastAnimations: true })).toBe(0);
  });

  it('returns the base duration normally and half in fast mode', () => {
    expect(computeMotionMs('play', { animationsEnabled: true, fastAnimations: false })).toBe(BASE_DURATIONS_MS.play);
    expect(computeMotionMs('play', { animationsEnabled: true, fastAnimations: true }))
      .toBe(Math.round(BASE_DURATIONS_MS.play * FAST_MULTIPLIER));
    expect(computeMotionMs('missionScore', { animationsEnabled: true, fastAnimations: true }))
      .toBe(Math.round(BASE_DURATIONS_MS.missionScore * FAST_MULTIPLIER));
  });

  it('every event type has a positive base duration', () => {
    for (const v of Object.values(BASE_DURATIONS_MS)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('arcPoint (flight trajectory)', () => {
  const from = { left: 100, top: 500, width: 60, height: 84 };
  const to = { left: 400, top: 200, width: 72, height: 100 };

  it('starts exactly at the source and ends exactly at the target', () => {
    expect(arcPoint(from, to, 80, 0)).toEqual({ x: 100, y: 500 });
    expect(arcPoint(from, to, 80, 1)).toEqual({ x: 400, y: 200 });
  });

  it('arcs above the straight chord at midpoint, higher with a bigger arc', () => {
    const chordMidY = (from.top + to.top) / 2;
    const mid = arcPoint(from, to, 80, 0.5);
    expect(mid.y).toBeLessThan(chordMidY);
    expect(mid.x).toBeGreaterThan(from.left);
    expect(mid.x).toBeLessThan(to.left);
    const higher = arcPoint(from, to, 200, 0.5);
    expect(higher.y).toBeLessThan(mid.y);
  });

  it('is monotonic in x for a left-to-right flight', () => {
    let prevX = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const p = arcPoint(from, to, 80, Math.min(t, 1));
      expect(p.x).toBeGreaterThanOrEqual(prevX);
      prevX = p.x;
    }
  });
});

describe('flipbook', () => {
  it('frameSource maps frames to the sheet grid', () => {
    const sheet = { cols: 6, size: 192 };
    expect(frameSource(sheet, 0)).toEqual({ sx: 0, sy: 0 });
    expect(frameSource(sheet, 5)).toEqual({ sx: 5 * 192, sy: 0 });
    expect(frameSource(sheet, 6)).toEqual({ sx: 0, sy: 192 });
    expect(frameSource(sheet, 29)).toEqual({ sx: 5 * 192, sy: 4 * 192 });
  });

  it('every manifest entry is coherent', () => {
    for (const meta of Object.values(VFX_MANIFEST)) {
      expect(meta.frames).toBeGreaterThan(0);
      expect(meta.cols).toBeGreaterThan(0);
      expect(meta.size).toBeGreaterThan(0);
      expect(meta.fps).toBe(30);
    }
    expect(Object.keys(VFX_MANIFEST).sort()).toEqual([
      'burst-legendary', 'kawarimi', 'ring-powerup', 'seal-summon', 'slash-defeat', 'victory-mission',
    ]);
  });

  it('vfxForLanding picks the right effect', () => {
    expect(vfxForLanding({ hidden: true })).toBe('kawarimi');
    expect(vfxForLanding({ hidden: true, rarity: 'L' })).toBe('kawarimi');
    for (const rarity of ['S', 'SV', 'M', 'MV', 'L']) {
      expect(vfxForLanding({ rarity })).toBe('burst-legendary');
    }
    expect(vfxForLanding({ rarity: 'C', isSummon: true })).toBe('seal-summon');
    expect(vfxForLanding({ rarity: 'R' })).toBe(null);
    expect(vfxForLanding({})).toBe(null);
  });
});
