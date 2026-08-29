import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const upsertInventory = vi.fn();
const runCommandRaw = vi.fn();
const findManyParticipants = vi.fn();
const variantInvFindUnique = vi.fn();
const variantInvUpsert = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    boosterInventory: {
      upsert: (...a: unknown[]) => upsertInventory(...a),
    },
    tournamentParticipant: {
      findMany: (...a: unknown[]) => findManyParticipants(...a),
    },
    variantInventory: {
      findUnique: (...a: unknown[]) => variantInvFindUnique(...a),
      upsert: (...a: unknown[]) => variantInvUpsert(...a),
    },
    $runCommandRaw: (...a: unknown[]) => runCommandRaw(...a),
  },
}));

import {
  isValidPrizeCardId,
  grantWinnerPrize,
  grantParticipantReward,
  listEligibleParticipantsForReward,
  markParticipantAbsence,
  readTournamentPrizeCardId,
  acquirePrizeAwardLock,
  WINNER_BOOSTER_COUNT,
  PARTICIPANT_BOOSTER_COUNT,
  FALLBACK_XP_IF_OWNED,
  SETS_RECOMPENSES,
} from '@/lib/tournament/prizes';
import { poolDePrixDeTournoi } from '@/lib/tournament/prizePool';

describe('isValidPrizeCardId', () => {
  it('accepts the 4 whitelisted MV cards', () => {
    expect(isValidPrizeCardId('KS-107-MV')).toBe(true);
    expect(isValidPrizeCardId('KS-108-MV')).toBe(true);
    expect(isValidPrizeCardId('KS-120-MV')).toBe(true);
    expect(isValidPrizeCardId('KS-128-MV')).toBe(true);
  });

  it('rejects battlepass-reserved variants and any other cards', () => {
    expect(isValidPrizeCardId('KS-137-MV')).toBe(false);
    expect(isValidPrizeCardId('KS-133-MV')).toBe(false);
    expect(isValidPrizeCardId('KS-133_2-MV')).toBe(false);
    expect(isValidPrizeCardId('KS-108-R')).toBe(false);
    expect(isValidPrizeCardId('')).toBe(false);
    expect(isValidPrizeCardId(null)).toBe(false);
    expect(isValidPrizeCardId(undefined)).toBe(false);
    expect(isValidPrizeCardId(123)).toBe(false);
  });
});

describe('grantWinnerPrize', () => {
  beforeEach(() => {
    findUniqueUser.mockReset();
    updateUser.mockReset();
    upsertInventory.mockReset();
    variantInvFindUnique.mockReset();
    variantInvUpsert.mockReset();
    upsertInventory.mockResolvedValue({ count: WINNER_BOOSTER_COUNT });
    variantInvFindUnique.mockResolvedValue(null);
    variantInvUpsert.mockResolvedValue({ count: 1 });
  });

  it('grants boosters of both sets and draws a card when none was pinned', async () => {
    const r = await grantWinnerPrize('user-1', null);
    expect(r.boostersGranted).toBe(WINNER_BOOSTER_COUNT * SETS_RECOMPENSES.length);
    expect(poolDePrixDeTournoi(), 'chaque vainqueur repart avec une carte').toContain(r.cardUnlocked);
    expect(r.xpGrantedFallback).toBe(0);
    expect(upsertInventory, 'un lot de boosters par set').toHaveBeenCalledTimes(SETS_RECOMPENSES.length);
  });

  it('grants 3 boosters + unlocks the card when not owned', async () => {
    variantInvFindUnique.mockResolvedValue(null);
    const r = await grantWinnerPrize('user-1', 'KS-108-MV');
    expect(r.boostersGranted).toBe(WINNER_BOOSTER_COUNT * SETS_RECOMPENSES.length);
    expect(r.cardUnlocked).toBe('KS-108-MV');
    expect(r.xpGrantedFallback).toBe(0);
    expect(variantInvUpsert).toHaveBeenCalled();
  });

  it('grants 3 boosters + 200 XP fallback when card already owned', async () => {
    variantInvFindUnique.mockResolvedValue({ count: 1 });
    findUniqueUser.mockResolvedValueOnce({ battlepassXp: 0, battlepassTier: 0, infiniteBoostersGranted: 0 });
    updateUser.mockResolvedValue({});
    const r = await grantWinnerPrize('user-1', 'KS-108-MV');
    expect(r.boostersGranted).toBe(WINNER_BOOSTER_COUNT * SETS_RECOMPENSES.length);
    expect(r.cardUnlocked).toBeNull();
    expect(r.xpGrantedFallback).toBe(FALLBACK_XP_IF_OWNED);
  });

  it('draws a card from the season pool when prizeCardId is invalid', async () => {
    const r = await grantWinnerPrize('user-1', 'KS-999-XX');
    expect(r.boostersGranted).toBe(WINNER_BOOSTER_COUNT * SETS_RECOMPENSES.length);
    expect(poolDePrixDeTournoi(), 'la carte tiree vient du set de la saison').toContain(r.cardUnlocked);
    expect(r.xpGrantedFallback).toBe(0);
  });
});

describe('grantParticipantReward', () => {
  beforeEach(() => {
    upsertInventory.mockReset();
    upsertInventory.mockResolvedValue({ count: PARTICIPANT_BOOSTER_COUNT });
  });

  it('grants one booster of each set', async () => {
    const r = await grantParticipantReward('user-2');
    expect(r.boostersGranted).toBe(PARTICIPANT_BOOSTER_COUNT * SETS_RECOMPENSES.length);
    expect(upsertInventory).toHaveBeenCalledTimes(SETS_RECOMPENSES.length);
  });
});

describe('listEligibleParticipantsForReward', () => {
  beforeEach(() => {
    findManyParticipants.mockReset();
    runCommandRaw.mockReset();
  });

  it('excludes the winner and marks absence forfeits', async () => {
    findManyParticipants.mockResolvedValue([
      { userId: 'winner', username: 'Winner' },
      { userId: 'normal', username: 'Normal' },
      { userId: 'absentee', username: 'Absentee' },
    ]);
    runCommandRaw.mockResolvedValue({
      cursor: {
        firstBatch: [
          { userId: { $oid: 'winner' }, absenceForfeited: false },
          { userId: { $oid: 'normal' }, absenceForfeited: false },
          { userId: { $oid: 'absentee' }, absenceForfeited: true },
        ],
      },
    });
    const r = await listEligibleParticipantsForReward('507f1f77bcf86cd799439011', 'winner');
    expect(r).toHaveLength(2);
    const normal = r.find((p) => p.userId === 'normal');
    const absentee = r.find((p) => p.userId === 'absentee');
    expect(normal?.stayedUntilEnd).toBe(true);
    expect(absentee?.stayedUntilEnd).toBe(false);
    expect(r.find((p) => p.userId === 'winner')).toBeUndefined();
  });

  it('treats missing absenceForfeited as stayed-until-end (default true)', async () => {
    findManyParticipants.mockResolvedValue([
      { userId: 'p1', username: 'P1' },
    ]);
    runCommandRaw.mockResolvedValue({ cursor: { firstBatch: [{ userId: { $oid: 'p1' } }] } });
    const r = await listEligibleParticipantsForReward('507f1f77bcf86cd799439011', null);
    expect(r[0].stayedUntilEnd).toBe(true);
  });
});

describe('acquirePrizeAwardLock', () => {
  beforeEach(() => {
    runCommandRaw.mockReset();
  });

  it('returns true when findAndModify returns a previous value (lock acquired)', async () => {
    runCommandRaw.mockResolvedValue({ value: { _id: 'something', prizeAwarded: undefined } });
    const r = await acquirePrizeAwardLock('507f1f77bcf86cd799439011');
    expect(r).toBe(true);
  });

  it('returns false when findAndModify returns null (already locked)', async () => {
    runCommandRaw.mockResolvedValue({ value: null });
    const r = await acquirePrizeAwardLock('507f1f77bcf86cd799439011');
    expect(r).toBe(false);
  });

  it('sends a $ne: true filter and $set: prizeAwarded:true update', async () => {
    runCommandRaw.mockResolvedValue({ value: { _id: 'x' } });
    await acquirePrizeAwardLock('507f1f77bcf86cd799439011');
    expect(runCommandRaw).toHaveBeenCalledWith(expect.objectContaining({
      findAndModify: 'Tournament',
      query: expect.objectContaining({ prizeAwarded: { $ne: true } }),
      update: expect.objectContaining({ $set: expect.objectContaining({ prizeAwarded: true }) }),
    }));
  });

  it('returns false on error (swallow)', async () => {
    runCommandRaw.mockRejectedValue(new Error('mongo down'));
    const r = await acquirePrizeAwardLock('any');
    expect(r).toBe(false);
  });

  it('filters on awardsPrizes so a player-created tournament can never award prizes', async () => {
    runCommandRaw.mockResolvedValue({ value: { _id: 'x' } });
    await acquirePrizeAwardLock('507f1f77bcf86cd799439011');
    expect(runCommandRaw).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ awardsPrizes: { $ne: false } }),
    }));
  });

  it('does not acquire the lock when the tournament has awardsPrizes false (no match)', async () => {
    runCommandRaw.mockResolvedValue({ value: null });
    const r = await acquirePrizeAwardLock('507f1f77bcf86cd799439011');
    expect(r).toBe(false);
  });

  it('still acquires the lock when awardsPrizes is absent (legacy admin tournaments)', async () => {
    runCommandRaw.mockResolvedValue({ value: { _id: 'legacy' } });
    const r = await acquirePrizeAwardLock('507f1f77bcf86cd799439011');
    expect(r).toBe(true);
  });
});

describe('readTournamentPrizeCardId', () => {
  beforeEach(() => {
    runCommandRaw.mockReset();
  });

  it('returns the prizeCardId from the document', async () => {
    runCommandRaw.mockResolvedValue({
      cursor: { firstBatch: [{ prizeCardId: 'KS-108-MV' }] },
    });
    const r = await readTournamentPrizeCardId('507f1f77bcf86cd799439011');
    expect(r).toBe('KS-108-MV');
  });

  it('returns null if the document is missing the field', async () => {
    runCommandRaw.mockResolvedValue({
      cursor: { firstBatch: [{}] },
    });
    const r = await readTournamentPrizeCardId('507f1f77bcf86cd799439011');
    expect(r).toBeNull();
  });

  it('returns null on error (swallow)', async () => {
    runCommandRaw.mockRejectedValue(new Error('boom'));
    const r = await readTournamentPrizeCardId('any');
    expect(r).toBeNull();
  });
});

describe('markParticipantAbsence', () => {
  beforeEach(() => {
    runCommandRaw.mockReset();
  });

  it('runs an atomic $set update via $runCommandRaw', async () => {
    runCommandRaw.mockResolvedValue({});
    await markParticipantAbsence('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012');
    expect(runCommandRaw).toHaveBeenCalledWith(expect.objectContaining({
      update: 'TournamentParticipant',
      updates: expect.arrayContaining([
        expect.objectContaining({
          u: { $set: { absenceForfeited: true } },
        }),
      ]),
    }));
  });

  it('swallows errors silently (logs only)', async () => {
    runCommandRaw.mockRejectedValue(new Error('mongo down'));
    await expect(markParticipantAbsence('a', 'b')).resolves.toBeUndefined();
  });
});
