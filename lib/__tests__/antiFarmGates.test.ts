import { describe, it, expect } from 'vitest';
import { normalizeEmailBase } from '@/lib/auth/emailBase';
import { checkRankedGate, CASUAL_GAMES_BEFORE_RANKED } from '@/lib/auth/rankedGate';
import {
  computeRepeatOpponentMultiplier,
  REPEAT_FULL_THRESHOLD,
  REPEAT_HALF_THRESHOLD,
} from '@/lib/elo/repeatOpponent';

describe('normalizeEmailBase', () => {
  it('strips +alias and gmail dots', () => {
    expect(normalizeEmailBase('foo.bar+spam@gmail.com')).toBe('foobar@gmail.com');
    expect(normalizeEmailBase('FOO.BAR@googlemail.com')).toBe('foobar@gmail.com');
    expect(normalizeEmailBase('martin.kopciak@gmx.at')).toBe('martin.kopciak@gmx.at');
    expect(normalizeEmailBase('martin@kopciak.at')).toBe('martin@kopciak.at');
  });

  it('detects same base for + and . variants on gmail', () => {
    const a = normalizeEmailBase('john.doe@gmail.com');
    const b = normalizeEmailBase('johndoe@gmail.com');
    const c = normalizeEmailBase('john.doe+farming@gmail.com');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('keeps other domains intact (no dot/alias stripping)', () => {
    expect(normalizeEmailBase('user.name@outlook.com')).toBe('user.name@outlook.com');
    expect(normalizeEmailBase('user+x@yahoo.com')).toBe('user@yahoo.com');
  });

  it('handles empty / malformed input', () => {
    expect(normalizeEmailBase('')).toBe('');
    expect(normalizeEmailBase('no-at-symbol')).toBe('no-at-symbol');
  });
});

describe('checkRankedGate', () => {
  it('blocks unverified email', () => {
    const r = checkRankedGate({ emailVerified: false, casualGamesPlayed: 99 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('emailNotVerified');
  });

  it('blocks if not enough casual games yet', () => {
    const r = checkRankedGate({ emailVerified: true, casualGamesPlayed: 2 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('needMoreCasualGames');
    expect(r.needed).toBe(CASUAL_GAMES_BEFORE_RANKED - 2);
  });

  it('allows when email verified AND >= 5 casual games', () => {
    const r = checkRankedGate({ emailVerified: true, casualGamesPlayed: 5 });
    expect(r.allowed).toBe(true);
  });

  it('admin role bypasses everything', () => {
    const r = checkRankedGate({ emailVerified: false, casualGamesPlayed: 0, role: 'admin' });
    expect(r.allowed).toBe(true);
  });
});

describe('computeRepeatOpponentMultiplier', () => {
  it('returns full multiplier (1) for the first 0-2 games against the same opponent in 24h', () => {
    expect(computeRepeatOpponentMultiplier(0).multiplier).toBe(1);
    expect(computeRepeatOpponentMultiplier(1).multiplier).toBe(1);
    expect(computeRepeatOpponentMultiplier(2).multiplier).toBe(1);
    expect(computeRepeatOpponentMultiplier(REPEAT_FULL_THRESHOLD - 1).multiplier).toBe(1);
  });

  it('returns half multiplier at the half-threshold tier', () => {
    expect(computeRepeatOpponentMultiplier(3).multiplier).toBe(0.5);
    expect(computeRepeatOpponentMultiplier(4).multiplier).toBe(0.5);
  });

  it('returns zero at and above the cap', () => {
    expect(computeRepeatOpponentMultiplier(REPEAT_HALF_THRESHOLD).multiplier).toBe(0);
    expect(computeRepeatOpponentMultiplier(10).multiplier).toBe(0);
    expect(computeRepeatOpponentMultiplier(100).multiplier).toBe(0);
  });

  it('tier label matches the multiplier', () => {
    expect(computeRepeatOpponentMultiplier(0).tier).toBe('full');
    expect(computeRepeatOpponentMultiplier(3).tier).toBe('half');
    expect(computeRepeatOpponentMultiplier(5).tier).toBe('zero');
  });
});
