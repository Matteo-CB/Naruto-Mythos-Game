import { describe, it, expect } from 'vitest';
import {
  computeModerationFlags, isSanctionActive, isValidSanctionDuration,
  CLEAN_FLAGS, HOUR_MS, DAY_MS, type SanctionLike,
} from '@/lib/moderation/sanctions';

const NOW = new Date('2026-07-11T12:00:00Z');

function s(type: string, opts: { expiresInMs?: number | null; revoked?: boolean } = {}): SanctionLike {
  const expiresInMs = opts.expiresInMs;
  return {
    type,
    expiresAt: expiresInMs === null || expiresInMs === undefined ? null : new Date(NOW.getTime() + expiresInMs),
    revokedAt: opts.revoked ? new Date(NOW.getTime() - 1000) : null,
  };
}

describe('isSanctionActive', () => {
  it('active while not expired, inactive after expiry', () => {
    expect(isSanctionActive(s('mute_chat', { expiresInMs: HOUR_MS }), NOW)).toBe(true);
    expect(isSanctionActive(s('mute_chat', { expiresInMs: -1 }), NOW)).toBe(false);
  });

  it('permanent sanctions never expire', () => {
    expect(isSanctionActive(s('suspension', { expiresInMs: null }), NOW)).toBe(true);
  });

  it('revoked sanctions are inactive even if not expired', () => {
    expect(isSanctionActive(s('mute_chat', { expiresInMs: HOUR_MS, revoked: true }), NOW)).toBe(false);
  });

  it('instantaneous types are never an active state', () => {
    for (const type of ['warn', 'warn_severe', 'name_reset', 'message_delete', 'elo_adjust']) {
      expect(isSanctionActive(s(type), NOW)).toBe(false);
    }
  });
});

describe('computeModerationFlags', () => {
  it('clean user has clean flags', () => {
    expect(computeModerationFlags([], NOW)).toEqual(CLEAN_FLAGS);
  });

  it('each stateful type sets its flag with its expiry', () => {
    const flags = computeModerationFlags([
      s('mute_chat', { expiresInMs: HOUR_MS }),
      s('ranked_ban', { expiresInMs: DAY_MS }),
      s('spectate_ban', { expiresInMs: null }),
    ], NOW);
    expect(flags.muted).toBe(true);
    expect(flags.mutedUntil?.getTime()).toBe(NOW.getTime() + HOUR_MS);
    expect(flags.rankedBanned).toBe(true);
    expect(flags.spectateBanned).toBe(true);
    expect(flags.spectateBannedUntil).toBe(null);
    expect(flags.suspended).toBe(false);
    expect(flags.shadowMuted).toBe(false);
  });

  it('cumulative sanctions keep the longest expiry, permanent wins', () => {
    const flags = computeModerationFlags([
      s('mute_chat', { expiresInMs: HOUR_MS }),
      s('mute_chat', { expiresInMs: DAY_MS }),
    ], NOW);
    expect(flags.mutedUntil?.getTime()).toBe(NOW.getTime() + DAY_MS);

    const flagsPerm = computeModerationFlags([
      s('mute_chat', { expiresInMs: DAY_MS }),
      s('mute_chat', { expiresInMs: null }),
    ], NOW);
    expect(flagsPerm.muted).toBe(true);
    expect(flagsPerm.mutedUntil).toBe(null);
  });

  it('expired and revoked sanctions do not pollute the flags', () => {
    const flags = computeModerationFlags([
      s('suspension', { expiresInMs: -HOUR_MS }),
      s('shadow_mute', { expiresInMs: HOUR_MS, revoked: true }),
    ], NOW);
    expect(flags).toEqual(CLEAN_FLAGS);
  });
});

describe('isValidSanctionDuration', () => {
  it('accepts only catalogued durations per type', () => {
    expect(isValidSanctionDuration('mute_chat', HOUR_MS)).toBe(true);
    expect(isValidSanctionDuration('mute_chat', null)).toBe(true);
    expect(isValidSanctionDuration('mute_chat', 2 * HOUR_MS)).toBe(false);
    expect(isValidSanctionDuration('ranked_ban', DAY_MS)).toBe(true);
    expect(isValidSanctionDuration('ranked_ban', null)).toBe(false);
    expect(isValidSanctionDuration('warn', null)).toBe(true);
    expect(isValidSanctionDuration('warn', HOUR_MS)).toBe(false);
    expect(isValidSanctionDuration('suspension', 30 * DAY_MS)).toBe(true);
    expect(isValidSanctionDuration('spectate_ban', 7 * DAY_MS)).toBe(true);
  });
});
