import { describe, it, expect } from 'vitest';
import {
  SEALED_MAX_JOIN_ATTEMPTS,
  canJoinSealedAgain,
  SEALED_BUILD_RESERVATION_MS,
  SEALED_BUILD_WINDOW_MS,
  SEALED_BUILD_SUBMIT_GRACE_MS,
  SEALED_MIN_DECK_SIZE,
  SEALED_REQUIRED_MISSIONS,
  sealedBuildDeadline,
  isSealedRegistrationExpired,
  countConfirmedOrReserved,
  checkSealedDeckAgainstPool,
  findBannedCardInSealedDeck,
} from '@/lib/tournament/sealedRegistration';

const JOINED = new Date('2026-07-25T10:00:00.000Z');
const at = (offsetMs: number) => new Date(JOINED.getTime() + offsetMs);

function pool(...entries: Array<[string, number]>): string[] {
  const out: string[] = [];
  for (const [id, count] of entries) for (let i = 0; i < count; i++) out.push(id);
  return out;
}

const validMissions = ['MSS-01', 'MSS-02', 'MSS-03'];

describe('sealed registration: the seat is reserved while you build, then released', () => {
  it('gives the player the documented 15 minute build window', () => {
    expect(SEALED_BUILD_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('holds the seat for the whole build window plus a submit grace, never less', () => {
    expect(SEALED_BUILD_RESERVATION_MS).toBe(SEALED_BUILD_WINDOW_MS + SEALED_BUILD_SUBMIT_GRACE_MS);
    expect(SEALED_BUILD_RESERVATION_MS).toBeGreaterThan(SEALED_BUILD_WINDOW_MS);
    expect(sealedBuildDeadline(JOINED)).toBe(JOINED.getTime() + SEALED_BUILD_RESERVATION_MS);
  });

  it('never releases a seat while the player still has time on their own countdown', () => {
    const reg = { joinedAt: JOINED, deckValid: false };
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_WINDOW_MS - 1))).toBe(false);
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_WINDOW_MS))).toBe(false);
  });

  it('keeps an unconfirmed seat while the reservation is still running', () => {
    const reg = { joinedAt: JOINED, deckValid: false };
    expect(isSealedRegistrationExpired(reg, at(0))).toBe(false);
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_RESERVATION_MS - 1))).toBe(false);
  });

  it('releases an unconfirmed seat once the reservation elapses', () => {
    const reg = { joinedAt: JOINED, deckValid: false };
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_RESERVATION_MS))).toBe(true);
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_RESERVATION_MS + 60_000))).toBe(true);
  });

  it('never releases a seat whose deck was confirmed, however long it has been', () => {
    const reg = { joinedAt: JOINED, deckValid: true };
    expect(isSealedRegistrationExpired(reg, at(0))).toBe(false);
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_RESERVATION_MS * 100))).toBe(false);
  });

  it('accepts an ISO string as the join time', () => {
    const reg = { joinedAt: JOINED.toISOString(), deckValid: false };
    expect(isSealedRegistrationExpired(reg, at(SEALED_BUILD_RESERVATION_MS))).toBe(true);
  });

  it('counts confirmed seats plus seats still building, and drops expired ones', () => {
    const regs = [
      { joinedAt: JOINED, deckValid: true },
      { joinedAt: JOINED, deckValid: false },
      { joinedAt: at(SEALED_BUILD_RESERVATION_MS), deckValid: false },
    ];
    expect(countConfirmedOrReserved(regs, at(0))).toBe(3);
    expect(countConfirmedOrReserved(regs, at(SEALED_BUILD_RESERVATION_MS))).toBe(2);
    expect(countConfirmedOrReserved(regs, at(SEALED_BUILD_RESERVATION_MS * 2))).toBe(1);
  });
});

describe('sealed anti-abuse: you cannot reroll your boosters by leaving and rejoining', () => {
  it('allows a first registration and one rejoin, and refuses the third attempt', () => {
    expect(SEALED_MAX_JOIN_ATTEMPTS).toBe(2);
    expect(canJoinSealedAgain(0)).toBe(true);
    expect(canJoinSealedAgain(1)).toBe(true);
    expect(canJoinSealedAgain(2)).toBe(false);
  });

  it('stays closed for every further attempt beyond the third', () => {
    for (let attempts = SEALED_MAX_JOIN_ATTEMPTS; attempts < SEALED_MAX_JOIN_ATTEMPTS + 5; attempts++) {
      expect(canJoinSealedAgain(attempts)).toBe(false);
    }
  });
});

describe('sealed respects the tournament ban list', () => {
  it('finds a banned character anywhere in the deck', () => {
    expect(findBannedCardInSealedDeck(['KS-999-S'], ['KS-001-C', 'KS-999-S'], validMissions)).toBe('KS-999-S');
  });

  it('finds a banned mission too', () => {
    expect(findBannedCardInSealedDeck(['MSS-02'], ['KS-001-C'], validMissions)).toBe('MSS-02');
  });

  it('accepts a deck that avoids every banned card', () => {
    expect(findBannedCardInSealedDeck(['KS-999-S', 'MSS-09'], ['KS-001-C', 'KS-002-C'], validMissions)).toBeNull();
  });

  it('is a no-op when the tournament bans nothing', () => {
    expect(findBannedCardInSealedDeck([], ['KS-001-C'], validMissions)).toBeNull();
  });

  it('reports the first offending card so the player knows what to remove', () => {
    const found = findBannedCardInSealedDeck(['KS-001-C', 'KS-002-C'], ['KS-003-C', 'KS-001-C', 'KS-002-C'], validMissions);
    expect(found).toBe('KS-001-C');
  });
});

describe('sealed deck validation: the deck must come from your own pool', () => {
  it('exposes the documented deck size rules', () => {
    expect(SEALED_MIN_DECK_SIZE).toBe(30);
    expect(SEALED_REQUIRED_MISSIONS).toBe(3);
  });

  it('accepts a deck built entirely from the pool', () => {
    const p = pool(['KS-001-C', 30], ['KS-002-C', 10], ['MSS-01', 1], ['MSS-02', 1], ['MSS-03', 1]);
    const deck = Array(30).fill('KS-001-C');
    expect(checkSealedDeckAgainstPool(p, deck, validMissions)).toEqual({ valid: true });
  });

  it('rejects a deck with fewer than 30 characters', () => {
    const p = pool(['KS-001-C', 40]);
    const res = checkSealedDeckAgainstPool(p, Array(29).fill('KS-001-C'), validMissions);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedDeckTooSmall');
  });

  it('rejects a deck that does not have exactly 3 missions', () => {
    const p = pool(['KS-001-C', 40]);
    const deck = Array(30).fill('KS-001-C');
    expect(checkSealedDeckAgainstPool(p, deck, ['MSS-01', 'MSS-02']).errorKey).toBe('tournament.error.sealedMissionCount');
    expect(checkSealedDeckAgainstPool(p, deck, [...validMissions, 'MSS-04']).errorKey).toBe('tournament.error.sealedMissionCount');
  });

  it('rejects a card that is not in the pool at all, and names it', () => {
    const p = pool(['KS-001-C', 40]);
    const deck = [...Array(29).fill('KS-001-C'), 'KS-999-S'];
    const res = checkSealedDeckAgainstPool(p, deck, validMissions);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(res.offendingCardId).toBe('KS-999-S');
  });

  it('rejects using a pooled card MORE times than it was opened', () => {
    const p = pool(['KS-001-C', 29], ['KS-002-C', 5]);
    const deck = Array(30).fill('KS-001-C');
    const res = checkSealedDeckAgainstPool(p, deck, validMissions);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(res.offendingCardId).toBe('KS-001-C');
  });

  it('allows every copy that was actually opened, up to the exact count', () => {
    const p = pool(['KS-001-C', 20], ['KS-002-C', 10], ['MSS-01', 1], ['MSS-02', 1], ['MSS-03', 1]);
    const deck = [...Array(20).fill('KS-001-C'), ...Array(10).fill('KS-002-C')];
    expect(checkSealedDeckAgainstPool(p, deck, validMissions).valid).toBe(true);
  });

  it('rejects everything when the pool is empty', () => {
    const res = checkSealedDeckAgainstPool([], Array(30).fill('KS-001-C'), validMissions);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
  });

  it('checks the size rules before touching the pool, so an empty submission is never a pool error', () => {
    expect(checkSealedDeckAgainstPool([], [], []).errorKey).toBe('tournament.error.sealedDeckTooSmall');
  });
});
