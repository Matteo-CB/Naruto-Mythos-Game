import { describe, it, expect } from 'vitest';
import { __ChessClockTestables } from '@/components/game/ChessClockDisplay';

const { formatRemaining, colorForRemaining, pulseAnimForRemaining, ORANGE_AT_MS, RED_AT_MS, HARD_RED_AT_MS } = __ChessClockTestables;

describe('formatRemaining', () => {
  it('formats 15 min as 15:00', () => {
    expect(formatRemaining(15 * 60_000)).toBe('15:00');
  });

  it('formats 9 min 5 s as 9:05', () => {
    expect(formatRemaining(9 * 60_000 + 5_000)).toBe('9:05');
  });

  it('formats 1 min as 1:00', () => {
    expect(formatRemaining(60_000)).toBe('1:00');
  });

  it('formats 0 as 0:00', () => {
    expect(formatRemaining(0)).toBe('0:00');
  });

  it('floors sub-second remainders', () => {
    expect(formatRemaining(59_999)).toBe('0:59');
    expect(formatRemaining(59_500)).toBe('0:59');
  });

  it('clamps negative remainder to 0:00', () => {
    expect(formatRemaining(-1000)).toBe('0:00');
  });
});

describe('colorForRemaining', () => {
  it('neutral above 60s for opponent and self', () => {
    expect(colorForRemaining(120_000, true)).toBe('#cccccc');
    expect(colorForRemaining(120_000, false)).toBe('#e0e0e0');
  });

  it('orange at 30..60s window', () => {
    expect(colorForRemaining(45_000, false)).toBe('#cc7a30');
    expect(colorForRemaining(ORANGE_AT_MS, false)).toBe('#cc7a30');
    expect(colorForRemaining(RED_AT_MS + 1, false)).toBe('#cc7a30');
  });

  it('red at 10..30s window', () => {
    expect(colorForRemaining(20_000, false)).toBe('#b33e3e');
    expect(colorForRemaining(RED_AT_MS, false)).toBe('#b33e3e');
    expect(colorForRemaining(HARD_RED_AT_MS + 1, false)).toBe('#b33e3e');
  });

  it('hard red under 10s', () => {
    expect(colorForRemaining(5_000, false)).toBe('#b33e3e');
    expect(colorForRemaining(0, false)).toBe('#b33e3e');
  });
});

describe('pulseAnimForRemaining', () => {
  it('returns null above 60s', () => {
    expect(pulseAnimForRemaining(120_000)).toBeNull();
    expect(pulseAnimForRemaining(ORANGE_AT_MS + 1)).toBeNull();
  });

  it('returns slow opacity pulse in 30..60s', () => {
    const p = pulseAnimForRemaining(45_000)!;
    expect(p).not.toBeNull();
    expect(p.animate.opacity).toBeDefined();
    expect(p.transition.duration).toBeGreaterThan(0.8);
  });

  it('returns scale+opacity pulse in 10..30s', () => {
    const p = pulseAnimForRemaining(20_000)!;
    expect(p).not.toBeNull();
    expect(p.animate.scale).toBeDefined();
    expect(p.animate.opacity).toBeDefined();
    expect(p.transition.duration).toBeLessThan(1.0);
  });

  it('returns faster pulse under 10s', () => {
    const hard = pulseAnimForRemaining(5_000)!;
    const red = pulseAnimForRemaining(20_000)!;
    expect(hard.transition.duration).toBeLessThan(red.transition.duration);
  });
});

describe('threshold constants', () => {
  it('orange threshold is 60s', () => {
    expect(ORANGE_AT_MS).toBe(60_000);
  });
  it('red threshold is 30s', () => {
    expect(RED_AT_MS).toBe(30_000);
  });
  it('hard red threshold is 10s', () => {
    expect(HARD_RED_AT_MS).toBe(10_000);
  });
});
