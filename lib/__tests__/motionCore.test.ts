import { describe, it, expect } from 'vitest';
import {
  anchorHandCard, anchorOpponentHand, anchorSlot, anchorMission,
  anchorDeck, anchorDiscard, anchorScore, anchorChakra, anchorEdge,
} from '@/lib/motion/boardRegistry';
import { computeMotionMs, BASE_DURATIONS_MS, FAST_MULTIPLIER } from '@/lib/motion/speed';
import { arcPoint } from '@/lib/motion/flightLayer';
import { rarityTier, rarityVfxProfile, RARITY_TIERS } from '@/lib/motion/vfxgl';

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

describe('rarity VFX profiles', () => {
  it('tiers grow with rarity, every known rarity is mapped', () => {
    expect(rarityTier('C')).toBe(0);
    expect(rarityTier('UC')).toBe(0);
    expect(rarityTier('R')).toBe(1);
    expect(rarityTier('RA')).toBe(1);
    expect(rarityTier('S')).toBe(2);
    expect(rarityTier('SV')).toBe(2);
    expect(rarityTier('M')).toBe(3);
    expect(rarityTier('MV')).toBe(3);
    expect(rarityTier('L')).toBe(4);
  });

  it('unknown rarities fall back safely, V-suffixed ones rank higher', () => {
    expect(rarityTier(undefined)).toBe(1);
    expect(rarityTier('FUTURE')).toBe(1);
    expect(rarityTier('FUTUREV')).toBe(2);
  });

  it('scale, intensity and duration strictly increase across tiers', () => {
    const tiers = ['C', 'R', 'S', 'M', 'L'];
    for (let i = 1; i < tiers.length; i++) {
      const prev = rarityVfxProfile(tiers[i - 1]);
      const cur = rarityVfxProfile(tiers[i]);
      expect(cur.scale).toBeGreaterThan(prev.scale);
      expect(cur.intensity).toBeGreaterThan(prev.intensity);
      expect(cur.durationMs).toBeGreaterThanOrEqual(prev.durationMs);
    }
  });

  it('common effects stay genuinely small', () => {
    expect(rarityVfxProfile('C').scale).toBeLessThan(0.7);
    expect(rarityVfxProfile('UC').scale).toBeLessThan(0.7);
    expect(rarityVfxProfile('L').scale).toBeGreaterThan(2);
    expect(Object.keys(RARITY_TIERS).length).toBeGreaterThanOrEqual(10);
  });
});
